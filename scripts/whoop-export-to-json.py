#!/usr/bin/env python3
"""Normalize a WHOOP CSV export into Soma health_records JSON."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path
from statistics import median
from typing import Any


TIMEZONE_SUFFIX = {
    "UTC+01:00": "+01:00",
    "UTC+02:00": "+02:00",
    "UTCZ": "Z",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def number(value: str) -> float | None:
    return float(value) if value.strip() else None


def compact_number(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def iso_timestamp(value: str, timezone: str) -> str:
    suffix = TIMEZONE_SUFFIX.get(timezone)
    if not suffix:
        raise ValueError(f"Unsupported WHOOP timezone: {timezone}")
    return value.replace(" ", "T") + suffix


def assert_range(name: str, value: float, minimum: float, maximum: float, day: str) -> None:
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} is outside the accepted range on {day}: {value}")


def record(
    data_type: str,
    metric_date: str,
    measured_at: str,
    payload: dict[str, Any],
    *,
    start_time: str | None = None,
    end_time: str | None = None,
    recording_method: str = "DERIVED",
) -> dict[str, Any]:
    return {
        "provider": "whoop_export",
        "data_type": data_type,
        "source_record_id": f"whoop-export:v1:{data_type}:{metric_date}",
        "start_time": start_time,
        "end_time": end_time,
        "civil_date": metric_date,
        "recording_method": recording_method,
        "source_device": "WHOOP",
        "payload": {"source": {"provider": "whoop_export"}, **payload},
        "measured_at": measured_at,
    }


def normalize(export_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    physiology = read_csv(export_dir / "physiological_cycles.csv")
    sleeps = [row for row in read_csv(export_dir / "sleeps.csv") if row["Nap"].lower() == "false"]

    sleep_by_date: dict[str, dict[str, str]] = {}
    for row in sleeps:
        metric_date = row["Wake onset"][:10]
        if metric_date in sleep_by_date:
            raise ValueError(f"Multiple primary sleeps end on {metric_date}")
        sleep_by_date[metric_date] = row

    physiology_by_date: dict[str, dict[str, str]] = {}
    for row in physiology:
        if not row["Wake onset"] or not row["Resting heart rate (bpm)"]:
            continue
        metric_date = row["Wake onset"][:10]
        if metric_date in physiology_by_date:
            raise ValueError(f"Multiple physiology cycles end on {metric_date}")
        physiology_by_date[metric_date] = row

    dates = sorted(set(sleep_by_date) & set(physiology_by_date))
    if not dates:
        raise ValueError("No complete WHOOP days were found")
    if set(dates) != set(sleep_by_date) or set(dates) != set(physiology_by_date):
        raise ValueError("Sleep and physiology dates do not match")

    gap_days = 0
    for first, second in zip(dates, dates[1:]):
        gap_days += max(0, (date.fromisoformat(second) - date.fromisoformat(first)).days - 1)

    output: list[dict[str, Any]] = []
    temperatures: list[float] = []
    missing_oxygen_days = 0
    for metric_date in dates:
        sleep = sleep_by_date[metric_date]
        cycle = physiology_by_date[metric_date]
        timezone = sleep["Cycle timezone"]
        start_time = iso_timestamp(sleep["Sleep onset"], timezone)
        end_time = iso_timestamp(sleep["Wake onset"], timezone)

        asleep = number(sleep["Asleep duration (min)"])
        in_bed = number(sleep["In bed duration (min)"])
        awake = number(sleep["Awake duration (min)"])
        light = number(sleep["Light sleep duration (min)"])
        deep = number(sleep["Deep (SWS) duration (min)"])
        rem = number(sleep["REM duration (min)"])
        if None in (asleep, in_bed, awake, light, deep, rem):
            raise ValueError(f"Incomplete primary sleep on {metric_date}")
        assert asleep is not None and in_bed is not None and awake is not None
        assert light is not None and deep is not None and rem is not None
        assert_range("sleep duration", asleep, 30, 900, metric_date)
        if abs((light + deep + rem) - asleep) > 0.01 or abs((asleep + awake) - in_bed) > 0.01:
            raise ValueError(f"Inconsistent sleep totals on {metric_date}")

        output.append(record(
            "sleep",
            metric_date,
            end_time,
            {
                "sleep": {
                    "metadata": {"mainSleep": True, "processed": True},
                    "summary": {
                        "minutesAsleep": compact_number(asleep),
                        "minutesInSleepPeriod": compact_number(in_bed),
                        "minutesAwake": compact_number(awake),
                        "stagesSummary": [
                            {"type": "LIGHT", "minutes": compact_number(light)},
                            {"type": "DEEP", "minutes": compact_number(deep)},
                            {"type": "REM", "minutes": compact_number(rem)},
                            {"type": "AWAKE", "minutes": compact_number(awake)},
                        ],
                    },
                },
            },
            start_time=start_time,
            end_time=end_time,
            recording_method="PASSIVELY_MEASURED",
        ))

        rhr = number(cycle["Resting heart rate (bpm)"])
        hrv = number(cycle["Heart rate variability (ms)"])
        respiratory = number(cycle["Respiratory rate (rpm)"])
        temperature = number(cycle["Skin temp (celsius)"])
        oxygen = number(cycle["Blood oxygen %"])
        assert rhr is not None and hrv is not None and respiratory is not None and temperature is not None
        assert_range("resting heart rate", rhr, 30, 120, metric_date)
        assert_range("HRV", hrv, 5, 300, metric_date)
        assert_range("respiratory rate", respiratory, 5, 40, metric_date)
        assert_range("skin temperature", temperature, 20, 45, metric_date)

        output.extend([
            record("daily-resting-heart-rate", metric_date, end_time, {
                "dailyRestingHeartRate": {"beatsPerMinute": compact_number(rhr)},
            }),
            record("daily-heart-rate-variability", metric_date, end_time, {
                "dailyHeartRateVariability": {"averageHeartRateVariabilityMilliseconds": compact_number(hrv)},
            }),
            record("daily-respiratory-rate", metric_date, end_time, {
                "dailyRespiratoryRate": {"averageBreathsPerMinute": compact_number(respiratory)},
            }),
        ])

        if oxygen is None:
            missing_oxygen_days += 1
        else:
            assert_range("oxygen saturation", oxygen, 70, 100, metric_date)
            output.append(record("daily-oxygen-saturation", metric_date, end_time, {
                "dailyOxygenSaturation": {"averagePercentage": compact_number(oxygen)},
            }))

        baseline = median(temperatures[-30:]) if len(temperatures) >= 7 else None
        temperature_payload: dict[str, Any] = {"nightlyTemperatureCelsius": compact_number(temperature)}
        if baseline is not None:
            temperature_payload["baselineTemperatureCelsius"] = round(baseline, 3)
        output.append(record("daily-sleep-temperature-derivations", metric_date, end_time, {
            "dailySleepTemperatureDerivations": temperature_payload,
        }))
        temperatures.append(temperature)

    source_ids = {item["source_record_id"] for item in output}
    if len(source_ids) != len(output):
        raise ValueError("Duplicate normalized WHOOP source identifiers")

    summary = {
        "days": len(dates),
        "firstDate": dates[0],
        "lastDate": dates[-1],
        "gapDays": gap_days,
        "records": len(output),
        "missingOxygenDays": missing_oxygen_days,
        "temperatureBaselineDays": sum(
            1 for item in output
            if item["data_type"] == "daily-sleep-temperature-derivations"
            and "baselineTemperatureCelsius" in item["payload"]["dailySleepTemperatureDerivations"]
        ),
        "recordsByType": {
            data_type: sum(1 for item in output if item["data_type"] == data_type)
            for data_type in sorted({item["data_type"] for item in output})
        },
    }
    return output, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("export_dir", type=Path)
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    records, summary = normalize(args.export_dir)
    result: Any = summary if args.summary else records[args.offset:None if args.limit is None else args.offset + args.limit]
    print(json.dumps(result, separators=(",", ":"), ensure_ascii=True))


if __name__ == "__main__":
    main()
