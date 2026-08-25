#!/usr/bin/env python3
"""Build a small, validated Soma health-record set from the verified Fitbit Takeout."""

from __future__ import annotations

import argparse
import csv
import json
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote


FITBIT_DEVICE = "Google Fitbit Air"
PROVIDER = "google_health"


def number(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    parsed = float(value)
    return int(parsed) if parsed.is_integer() else parsed


def local_timestamp(value: str) -> str:
    if value.endswith(("Z", "+01:00", "+02:00")):
        return value
    return f"{value}+02:00"


def record(data_type: str, date: str, payload: dict[str, Any], *, source_key: str | None = None,
           start: str | None = None, end: str | None = None) -> dict[str, Any]:
    source_id = f"google-takeout:v1:{data_type}:{source_key or date}"
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, source_id)),
        "provider": PROVIDER,
        "data_type": data_type,
        "source_record_id": source_id,
        "start_time": start,
        "end_time": end,
        "civil_date": date,
        "recording_method": "TAKEOUT_VERIFIED",
        "source_device": FITBIT_DEVICE,
        "payload": {"source": {"provider": "google_takeout", "device": FITBIT_DEVICE}, **payload},
        "measured_at": end or f"{date}T12:00:00.000+02:00",
    }


def load_sleep(takeout_root: Path, start_date: str, end_date: str) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in sorted((takeout_root / "Global Export Data").glob("sleep-*.json")):
        value = json.loads(path.read_text(encoding="utf-8"))
        for row in value if isinstance(value, list) else []:
            if isinstance(row, dict) and row.get("mainSleep"):
                by_id[str(row.get("logId"))] = row

    records: list[dict[str, Any]] = []
    by_date: dict[str, dict[str, Any]] = {}
    for row in by_id.values():
        date = str(row.get("dateOfSleep", ""))
        if not start_date <= date <= end_date:
            continue
        if date in by_date:
            raise ValueError(f"Multiple primary Fitbit sleeps on {date}")
        summary = row.get("levels", {}).get("summary", {})
        stages = []
        for raw_name, output_name in (("light", "LIGHT"), ("deep", "DEEP"), ("rem", "REM"), ("wake", "AWAKE")):
            stage = summary.get(raw_name, {})
            if stage.get("minutes") is not None:
                stages.append({"type": output_name, "minutes": stage["minutes"], "count": stage.get("count")})
        asleep = number(str(row.get("minutesAsleep", "")))
        in_bed = number(str(row.get("timeInBed", "")))
        awake = number(str(row.get("minutesAwake", "")))
        if asleep is None or in_bed is None or awake is None or abs((asleep + awake) - in_bed) > 2:
            raise ValueError(f"Inconsistent Fitbit sleep totals on {date}")
        start = local_timestamp(str(row["startTime"]))
        end = local_timestamp(str(row["endTime"]))
        stage_segments = []
        for segment in row.get("levels", {}).get("data", []):
            segment_start = datetime.fromisoformat(local_timestamp(str(segment["dateTime"])))
            segment_end = segment_start + timedelta(seconds=float(segment["seconds"]))
            stage_segments.append({
                "type": str(segment["level"]).upper(),
                "startTime": segment_start.isoformat(),
                "endTime": segment_end.isoformat(),
            })
        payload = {
            "sleep": {
                "metadata": {"mainSleep": True, "processed": True},
                "summary": {
                    "minutesAsleep": asleep,
                    "minutesInSleepPeriod": in_bed,
                    "minutesAwake": awake,
                    "minutesToFallAsleep": number(str(row.get("minutesToFallAsleep", ""))),
                    "stagesSummary": stages,
                },
                "stages": stage_segments,
            }
        }
        records.append(record("sleep", date, payload, source_key=str(row["logId"]), start=start, end=end))
        by_date[date] = row
    return records, by_date


def exercise_type(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_") or "OTHER"


def load_exercises(takeout_root: Path, start_date: str, end_date: str) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in sorted((takeout_root / "Global Export Data").glob("exercise-*.json")):
        value = json.loads(path.read_text(encoding="utf-8"))
        for row in value if isinstance(value, list) else []:
            if isinstance(row, dict) and row.get("logId") is not None:
                by_id[str(row["logId"])] = row
    output = []
    for key, row in by_id.items():
        start_value = datetime.strptime(str(row["startTime"]), "%m/%d/%y %H:%M:%S")
        end_value = start_value + timedelta(milliseconds=float(row.get("duration", 0)))
        date = start_value.date().isoformat()
        if not start_date <= date <= end_date:
            continue
        start = local_timestamp(start_value.isoformat(timespec="seconds"))
        end = local_timestamp(end_value.isoformat(timespec="seconds"))
        active_zone = row.get("activeZoneMinutes", {})
        payload = {
            "exercise": {
                "displayName": row.get("activityName") or "Exercise",
                "exerciseType": exercise_type(str(row.get("activityName") or "Exercise")),
                "activeDuration": f"{float(row.get('activeDuration', 0)) / 1000}s",
                "metricsSummary": {
                    "caloriesKcal": row.get("calories"),
                    "averageHeartRateBeatsPerMinute": row.get("averageHeartRate"),
                    "steps": row.get("steps"),
                    "activeZoneMinutes": active_zone.get("totalMinutes"),
                },
            }
        }
        output.append(record("exercise", date, payload, source_key=key, start=start, end=end))
    return output


def build_records(takeout_root: Path, daily_dataset: Path, start_date: str, end_date: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    daily_rows = {row["date"]: row for row in csv.DictReader(daily_dataset.open(encoding="utf-8")) if start_date <= row["date"] <= end_date}
    sleeps, raw_sleep_by_date = load_sleep(takeout_root, start_date, end_date)
    output = list(sleeps)

    metric_builders = {
        "rhr_bpm": ("daily-resting-heart-rate", lambda v: {"dailyRestingHeartRate": {"beatsPerMinute": v}}),
        "hrv_ms": ("daily-heart-rate-variability", lambda v: {"dailyHeartRateVariability": {"averageHeartRateVariabilityMilliseconds": v}}),
        "respiratory_rate": ("daily-respiratory-rate", lambda v: {"dailyRespiratoryRate": {"averageBreathsPerMinute": v}}),
        "spo2_pct": ("daily-oxygen-saturation", lambda v: {"dailyOxygenSaturation": {"averagePercentage": v}}),
        "steps": ("steps", lambda v: {"dailyRollup": {"countSum": v}}),
        "active_zone_minutes": ("active-zone-minutes", lambda v: {"dailyRollup": {"activeZoneMinutes": v}}),
        "exercise_minutes": ("daily-exercise-summary", lambda v: {"dailyExerciseSummary": {"minutes": v}}),
    }
    for date, row in sorted(daily_rows.items()):
        if row.get("sleep_minutes", "").strip() and date not in raw_sleep_by_date:
            raise ValueError(f"Daily dataset has sleep but no canonical raw sleep on {date}")
        if date in raw_sleep_by_date:
            raw_minutes = float(raw_sleep_by_date[date]["minutesAsleep"])
            daily_minutes = float(row["sleep_minutes"])
            if abs(raw_minutes - daily_minutes) > 1:
                raise ValueError(f"Sleep normalization mismatch on {date}")
        for column, (data_type, builder) in metric_builders.items():
            value = number(row.get(column))
            if value is not None:
                output.append(record(data_type, date, builder(value)))

        nightly = number(row.get("nightly_temperature_c"))
        baseline = number(row.get("baseline_temperature_c"))
        if nightly is not None:
            temperature = {"nightlyTemperatureCelsius": nightly}
            if baseline is not None:
                temperature["baselineTemperatureCelsius"] = baseline
            output.append(record("daily-sleep-temperature-derivations", date, {"dailySleepTemperatureDerivations": temperature}))

        moderate = number(row.get("moderate_minutes"))
        vigorous = number(row.get("vigorous_minutes"))
        if moderate is not None or vigorous is not None:
            zones = []
            if moderate is not None:
                zones.append({"heartRateZone": "MODERATE", "durationMinutes": moderate})
            if vigorous is not None:
                zones.append({"heartRateZone": "VIGOROUS", "durationMinutes": vigorous})
            output.append(record("time-in-heart-rate-zone", date, {"timeInHeartRateZones": zones}))

        active_components = [number(row.get(name)) for name in ("lightly_active_minutes", "moderately_active_minutes", "very_active_minutes")]
        if any(value is not None for value in active_components):
            output.append(record("active-minutes", date, {"dailyRollup": {"activeMinutesSum": sum(value or 0 for value in active_components)}}))

    output.extend(load_exercises(takeout_root, start_date, end_date))
    identities = {(item["provider"], item["data_type"], item["source_record_id"]) for item in output}
    if len(identities) != len(output):
        raise ValueError("Duplicate normalized Takeout identities")
    by_type: dict[str, list[str]] = {}
    for item in output:
        by_type.setdefault(item["data_type"], []).append(item["civil_date"])
    summary = {
        "records": len(output),
        "start": min(item["civil_date"] for item in output),
        "end": max(item["civil_date"] for item in output),
        "by_type": {key: {"records": len(dates), "start": min(dates), "end": max(dates)} for key, dates in sorted(by_type.items())},
    }
    return output, summary


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_d1_sql(path: Path, records: list[dict[str, Any]], user_id: str) -> None:
    now = datetime.now().astimezone().isoformat()
    statements = []
    for source in records:
        row = {**source, "user_id": user_id, "created_at": now, "updated_at": now}
        identity = [[key, row[key]] for key in ("user_id", "provider", "data_type", "source_record_id")]
        row_key = quote(json.dumps(identity, ensure_ascii=False, separators=(",", ":")), safe="-_.!~*'()")
        payload = json.dumps(row, ensure_ascii=False, separators=(",", ":"))
        statements.append(
            "INSERT INTO soma_rows (table_name,row_key,user_id,json_data,created_at,updated_at) VALUES "
            f"('health_records',{sql_literal(row_key)},{sql_literal(user_id)},{sql_literal(payload)},{sql_literal(now)},{sql_literal(now)}) "
            "ON CONFLICT(table_name,row_key) DO UPDATE SET user_id=excluded.user_id,json_data=excluded.json_data,updated_at=excluded.updated_at;"
        )
    path.write_text("\n".join(statements) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--takeout-root", type=Path, required=True)
    parser.add_argument("--daily-dataset", type=Path, required=True)
    parser.add_argument("--start", default="2026-05-29")
    parser.add_argument("--end", default="2026-08-22")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--user-id")
    parser.add_argument("--sql-output", type=Path)
    args = parser.parse_args()
    records, summary = build_records(args.takeout_root, args.daily_dataset, args.start, args.end)
    args.output.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if args.sql_output:
        if not args.user_id:
            raise ValueError("--user-id is required with --sql-output")
        write_d1_sql(args.sql_output, records, args.user_id)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
