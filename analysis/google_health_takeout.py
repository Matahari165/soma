from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from scipy import stats
from statsmodels.stats.multitest import multipletests


MINIMUM_COMPUTABLE_PAIRS = 6


@dataclass(frozen=True)
class RelationSpec:
    grain: str
    predictor: str
    outcome: str
    label: str
    outcome_unit: str


LABELS = {
    "bedtime_hour": "Heure du coucher",
    "sleep_minutes": "Durée du sommeil",
    "deep_sleep_minutes": "Sommeil profond",
    "rem_sleep_minutes": "Sommeil paradoxal",
    "sleep_efficiency": "Efficacité du sommeil",
    "sleep_score": "Score de sommeil",
    "steps": "Pas",
    "vigorous_minutes": "Minutes intenses",
    "active_zone_minutes": "Minutes de zone active",
    "cardio_load": "Charge cardio",
    "exercise_minutes": "Minutes d’exercice",
    "run_count": "Nombre de courses",
    "rhr_bpm": "Fréquence cardiaque au repos",
    "hrv_ms": "Variabilité cardiaque",
    "respiratory_rate": "Fréquence respiratoire",
    "spo2_pct": "SpO₂ moyenne",
    "temperature_delta_c": "Écart de température nocturne",
    "readiness_score": "Récupération",
    "steps_prev1": "Pas la veille",
    "vigorous_minutes_prev1": "Minutes intenses la veille",
    "cardio_load_prev1": "Charge cardio la veille",
    "exercise_minutes_prev1": "Exercice la veille",
    "run_count_7d": "Courses sur 7 jours",
    "vigorous_minutes_7d": "Minutes intenses sur 7 jours",
    "exercise_minutes_7d": "Exercice sur 7 jours",
    "steps_mean_7d": "Pas moyens sur 7 jours",
    "week_run_count": "Courses dans la semaine",
    "week_vigorous_minutes": "Minutes intenses dans la semaine",
    "week_exercise_minutes": "Exercice dans la semaine",
    "week_steps_mean": "Pas moyens dans la semaine",
    "week_rhr_mean": "Fréquence au repos moyenne",
    "week_hrv_mean": "Variabilité cardiaque moyenne",
    "week_sleep_mean": "Sommeil moyen",
}


def _read_json_files(files: Iterable[Path]) -> list[dict]:
    rows: list[dict] = []
    for path in sorted(files):
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle)
        if isinstance(value, list):
            rows.extend(row for row in value if isinstance(row, dict))
    return rows


def _daily_csv(
    root: Path,
    filename: str,
    value_columns: dict[str, str],
    *,
    source: str | None = None,
) -> pd.DataFrame:
    frame = pd.read_csv(root / "Physical Activity_GoogleData" / filename)
    if source is not None and "data source" in frame:
        frame = frame.loc[frame["data source"] == source].copy()
    frame["date"] = pd.to_datetime(frame["timestamp"], errors="coerce", format="mixed", utc=True).dt.normalize().dt.tz_localize(None)
    selected = ["date", *value_columns]
    frame = frame[selected].rename(columns=value_columns)
    for column in value_columns.values():
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame.dropna(subset=["date"]).groupby("date", as_index=False).last()


def load_daily_biometrics(root: Path) -> pd.DataFrame:
    frames = [
        _daily_csv(root, "daily_resting_heart_rate.csv", {"beats per minute": "rhr_bpm"}, source="Google Health App"),
        _daily_csv(root, "daily_heart_rate_variability.csv", {"average heart rate variability milliseconds": "hrv_ms"}, source="Google Health App"),
        _daily_csv(root, "daily_respiratory_rate.csv", {"breaths per minute": "respiratory_rate"}, source="Google Health App"),
        _daily_csv(root, "daily_oxygen_saturation.csv", {"average percentage": "spo2_pct"}, source="Google Fitbit Air"),
        _daily_csv(
            root,
            "daily_sleep_temperature_derivations.csv",
            {
                "nightly temperature celsius": "nightly_temperature_c",
                "baseline temperature celsius": "baseline_temperature_c",
            },
            source="Google Health App",
        ),
        _daily_csv(root, "daily_readiness.csv", {"score": "readiness_score"}, source="Google Health App"),
    ]
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame, on="date", how="outer")
    merged["temperature_delta_c"] = merged["nightly_temperature_c"] - merged["baseline_temperature_c"]
    return merged.sort_values("date")


def _local_clock_hour(value: object) -> float:
    if not isinstance(value, str):
        return math.nan
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return math.nan
    hour = moment.hour + moment.minute / 60 + moment.second / 3600
    return hour + 24 if hour < 12 else hour


def _sleep_stage_minutes(levels: object, stage: str) -> float:
    if not isinstance(levels, dict):
        return math.nan
    summary = levels.get("summary")
    if not isinstance(summary, dict):
        return math.nan
    row = summary.get(stage)
    if not isinstance(row, dict):
        return math.nan
    value = row.get("minutes")
    return float(value) if isinstance(value, (int, float)) else math.nan


def load_sleep(root: Path) -> pd.DataFrame:
    export = root / "Global Export Data"
    rows = _read_json_files(export.glob("sleep-*.json"))
    frame = pd.DataFrame(rows)
    if frame.empty:
        return pd.DataFrame(columns=["date"])
    frame = frame.drop_duplicates("logId", keep="last")
    frame = frame.loc[frame["mainSleep"].fillna(False)].copy()
    frame["date"] = pd.to_datetime(frame["dateOfSleep"], errors="coerce").dt.normalize()
    frame["bedtime_hour"] = frame["startTime"].map(_local_clock_hour)
    frame["sleep_minutes"] = pd.to_numeric(frame["minutesAsleep"], errors="coerce")
    frame["sleep_efficiency"] = pd.to_numeric(frame["efficiency"], errors="coerce")
    frame["deep_sleep_minutes"] = frame["levels"].map(lambda value: _sleep_stage_minutes(value, "deep"))
    frame["rem_sleep_minutes"] = frame["levels"].map(lambda value: _sleep_stage_minutes(value, "rem"))
    frame["wake_minutes"] = frame["levels"].map(lambda value: _sleep_stage_minutes(value, "wake"))

    scores = pd.read_csv(root / "Sleep Score" / "sleep_score.csv")
    scores["logId"] = pd.to_numeric(scores["sleep_log_entry_id"], errors="coerce")
    scores["sleep_score"] = pd.to_numeric(scores["overall_score"], errors="coerce")
    scores = scores[["logId", "sleep_score"]].drop_duplicates("logId", keep="last")
    frame = frame.merge(scores, on="logId", how="left")

    columns = [
        "date",
        "bedtime_hour",
        "sleep_minutes",
        "sleep_efficiency",
        "deep_sleep_minutes",
        "rem_sleep_minutes",
        "wake_minutes",
        "sleep_score",
    ]
    return frame.sort_values(["date", "sleep_minutes"]).drop_duplicates("date", keep="last")[columns]


def _global_series(root: Path, prefix: str, output_name: str, *, aggregate: str = "sum") -> pd.DataFrame:
    rows = _read_json_files((root / "Global Export Data").glob(f"{prefix}-*.json"))
    frame = pd.DataFrame(rows)
    if frame.empty:
        return pd.DataFrame(columns=["date", output_name])
    frame["date"] = pd.to_datetime(frame["dateTime"], errors="coerce", format="mixed").dt.normalize()
    frame[output_name] = pd.to_numeric(frame["value"], errors="coerce")
    frame = frame.dropna(subset=["date", output_name])
    grouped = frame.groupby("date", as_index=False)[output_name]
    return grouped.sum() if aggregate == "sum" else grouped.last()


def load_activity(root: Path) -> pd.DataFrame:
    frames = [
        _global_series(root, "steps", "steps"),
        _global_series(root, "very_active_minutes", "very_active_minutes"),
        _global_series(root, "moderately_active_minutes", "moderately_active_minutes"),
        _global_series(root, "lightly_active_minutes", "lightly_active_minutes"),
    ]
    merged = frames[0]
    for frame in frames[1:]:
        merged = merged.merge(frame, on="date", how="outer")

    activity_root = root / "Physical Activity_GoogleData"
    zone_files = sorted(activity_root.glob("time_in_heart_rate_zone_*.csv"))
    if zone_files:
        zones = pd.concat([pd.read_csv(path) for path in zone_files], ignore_index=True)
        zones["date"] = pd.to_datetime(zones["timestamp"], errors="coerce", format="mixed", utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
        counts = zones.groupby(["date", "heart rate zone type"]).size().unstack(fill_value=0)
        for name in ["LIGHT", "MODERATE", "VIGOROUS", "PEAK"]:
            if name not in counts:
                counts[name] = 0
        counts["vigorous_minutes"] = counts["VIGOROUS"] + counts["PEAK"]
        counts["moderate_minutes"] = counts["MODERATE"]
        counts = counts.reset_index()[["date", "vigorous_minutes", "moderate_minutes"]]
        merged = merged.merge(counts, on="date", how="outer")

    azm_files = sorted(activity_root.glob("active_zone_minutes_*.csv"))
    if azm_files:
        zones = pd.concat([pd.read_csv(path) for path in azm_files], ignore_index=True)
        zones["date"] = pd.to_datetime(zones["timestamp"], errors="coerce", format="mixed", utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
        zones["total minutes"] = pd.to_numeric(zones["total minutes"], errors="coerce")
        azm = zones.groupby("date", as_index=False)["total minutes"].sum().rename(columns={"total minutes": "active_zone_minutes"})
        merged = merged.merge(azm, on="date", how="outer")

    load_files = sorted(activity_root.glob("cardio_load_*.csv"))
    if load_files:
        cardio = pd.concat([pd.read_csv(path) for path in load_files], ignore_index=True)
        cardio["date"] = pd.to_datetime(cardio["timestamp"], errors="coerce", format="mixed", utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
        cardio["total"] = pd.to_numeric(cardio["total"], errors="coerce")
        cardio = cardio.groupby("date", as_index=False)["total"].sum().rename(columns={"total": "cardio_load"})
        merged = merged.merge(cardio, on="date", how="outer")

    exercise_rows = _read_json_files((root / "Global Export Data").glob("exercise-*.json"))
    exercise = pd.DataFrame(exercise_rows)
    if not exercise.empty:
        exercise = exercise.drop_duplicates("logId", keep="last")
        exercise["date"] = pd.to_datetime(exercise["startTime"], errors="coerce", format="mixed", utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
        exercise["exercise_minutes"] = pd.to_numeric(exercise["activeDuration"], errors="coerce") / 60_000
        names = exercise["activityName"].fillna("").str.lower()
        exercise["run_count"] = names.str.contains(r"jogging|course|running", regex=True).astype(int)
        daily_exercise = exercise.groupby("date", as_index=False).agg(
            exercise_count=("logId", "count"),
            exercise_minutes=("exercise_minutes", "sum"),
            run_count=("run_count", "sum"),
        )
        merged = merged.merge(daily_exercise, on="date", how="outer")

    observed = merged["steps"].notna()
    for column in ["exercise_count", "exercise_minutes", "run_count"]:
        if column in merged:
            merged.loc[observed & merged[column].isna(), column] = 0
    return merged.sort_values("date")


def build_daily_dataset(root: Path) -> pd.DataFrame:
    sleep = load_sleep(root)
    biometrics = load_daily_biometrics(root)
    activity = load_activity(root)
    activity_anchor = activity.loc[activity["steps"].notna(), ["date"]]
    dates = pd.concat([sleep[["date"]], biometrics[["date"]], activity_anchor], ignore_index=True).dropna().drop_duplicates()
    start = dates["date"].min()
    end = dates["date"].max()
    daily = pd.DataFrame({"date": pd.date_range(start, end, freq="D")})
    for frame in [sleep, biometrics, activity]:
        daily = daily.merge(frame, on="date", how="left")

    for column in ["steps", "vigorous_minutes", "active_zone_minutes", "cardio_load", "exercise_minutes"]:
        if column in daily:
            daily[f"{column}_prev1"] = daily[column].shift(1)

    if "run_count" in daily:
        daily["run_count_7d"] = daily["run_count"].shift(1).rolling(7, min_periods=5).sum()
    if "vigorous_minutes" in daily:
        daily["vigorous_minutes_7d"] = daily["vigorous_minutes"].shift(1).rolling(7, min_periods=5).sum()
    if "exercise_minutes" in daily:
        daily["exercise_minutes_7d"] = daily["exercise_minutes"].shift(1).rolling(7, min_periods=5).sum()
    if "steps" in daily:
        daily["steps_mean_7d"] = daily["steps"].shift(1).rolling(7, min_periods=5).mean()
    return daily


def build_weekly_dataset(daily: pd.DataFrame) -> pd.DataFrame:
    frame = daily.copy()
    frame["week"] = frame["date"].dt.to_period("W-SUN").dt.start_time
    grouped = frame.groupby("week")
    weekly = grouped.agg(
        observed_days=("steps", "count"),
        week_run_count=("run_count", "sum"),
        week_vigorous_minutes=("vigorous_minutes", "sum"),
        week_exercise_minutes=("exercise_minutes", "sum"),
        week_steps_mean=("steps", "mean"),
        week_rhr_mean=("rhr_bpm", "mean"),
        week_hrv_mean=("hrv_ms", "mean"),
        week_sleep_mean=("sleep_minutes", "mean"),
    ).reset_index()
    return weekly.loc[weekly["observed_days"] >= 5].copy()


def _effective_sample_size(x: np.ndarray, y: np.ndarray) -> float:
    n = len(x)
    if n < 5:
        return float(n)
    ranked_x = stats.rankdata(x)
    ranked_y = stats.rankdata(y)
    autocorr_x = np.corrcoef(ranked_x[:-1], ranked_x[1:])[0, 1]
    autocorr_y = np.corrcoef(ranked_y[:-1], ranked_y[1:])[0, 1]
    if not np.isfinite(autocorr_x) or not np.isfinite(autocorr_y):
        return float(n)
    product = float(autocorr_x * autocorr_y)
    denominator = 1 + product
    estimate = n if denominator <= 0 else n * (1 - product) / denominator
    return float(np.clip(estimate, 4, n))


def _confidence_interval(coefficient: float, effective_n: float) -> tuple[float, float]:
    if effective_n <= 3 or abs(coefficient) >= 0.999999:
        return (-1.0, 1.0) if abs(coefficient) < 0.999999 else (coefficient, coefficient)
    z = np.arctanh(np.clip(coefficient, -0.999999, 0.999999))
    margin = stats.norm.ppf(0.975) / math.sqrt(effective_n - 3)
    return float(np.tanh(z - margin)), float(np.tanh(z + margin))


def _adjusted_p_value(coefficient: float, effective_n: float) -> float:
    if effective_n <= 2 or abs(coefficient) >= 1:
        return 0.0 if abs(coefficient) >= 1 else 1.0
    statistic = coefficient * math.sqrt((effective_n - 2) / max(1e-12, 1 - coefficient * coefficient))
    return float(2 * stats.t.sf(abs(statistic), df=max(1, effective_n - 2)))


def _effect_thirds(x: np.ndarray, y: np.ndarray) -> float:
    order = np.argsort(x)
    size = max(2, len(order) // 3)
    return float(np.mean(y[order[-size:]]) - np.mean(y[order[:size]]))


def calculate_relation(frame: pd.DataFrame, spec: RelationSpec) -> dict:
    paired = frame[[spec.predictor, spec.outcome]].replace([np.inf, -np.inf], np.nan).dropna()
    n = len(paired)
    base = {
        **asdict(spec),
        "predictor_label": LABELS[spec.predictor],
        "outcome_label": LABELS[spec.outcome],
        "n": n,
        "effective_n": float(n),
        "rho": math.nan,
        "p_value": 1.0,
        "ci_low": -1.0,
        "ci_high": 1.0,
        "effect": math.nan,
    }
    if n < MINIMUM_COMPUTABLE_PAIRS:
        return base
    x = paired[spec.predictor].to_numpy(dtype=float)
    y = paired[spec.outcome].to_numpy(dtype=float)
    if np.unique(x).size < 2 or np.unique(y).size < 2:
        return base
    coefficient = float(stats.spearmanr(x, y).statistic)
    effective_n = _effective_sample_size(x, y)
    low, high = _confidence_interval(coefficient, effective_n)
    return {
        **base,
        "effective_n": effective_n,
        "rho": coefficient,
        "p_value": _adjusted_p_value(coefficient, effective_n),
        "ci_low": low,
        "ci_high": high,
        "effect": _effect_thirds(x, y),
    }


def relation_specs() -> list[RelationSpec]:
    specs = [
        RelationSpec("jour", "bedtime_hour", "sleep_minutes", "Coucher → durée du sommeil", "min"),
        RelationSpec("jour", "bedtime_hour", "deep_sleep_minutes", "Coucher → sommeil profond", "min"),
        RelationSpec("jour", "bedtime_hour", "sleep_efficiency", "Coucher → efficacité du sommeil", "pts"),
        RelationSpec("jour", "bedtime_hour", "rhr_bpm", "Coucher → fréquence au repos", "bpm"),
        RelationSpec("jour", "bedtime_hour", "hrv_ms", "Coucher → variabilité cardiaque", "ms"),
        RelationSpec("jour", "sleep_minutes", "rhr_bpm", "Sommeil → fréquence au repos", "bpm"),
        RelationSpec("jour", "sleep_minutes", "hrv_ms", "Sommeil → variabilité cardiaque", "ms"),
        RelationSpec("jour", "deep_sleep_minutes", "rhr_bpm", "Sommeil profond → fréquence au repos", "bpm"),
        RelationSpec("jour", "deep_sleep_minutes", "hrv_ms", "Sommeil profond → variabilité cardiaque", "ms"),
        RelationSpec("jour", "steps_prev1", "sleep_minutes", "Pas la veille → sommeil", "min"),
        RelationSpec("jour", "steps_prev1", "deep_sleep_minutes", "Pas la veille → sommeil profond", "min"),
        RelationSpec("jour", "steps_prev1", "rhr_bpm", "Pas la veille → fréquence au repos", "bpm"),
        RelationSpec("jour", "steps_prev1", "hrv_ms", "Pas la veille → variabilité cardiaque", "ms"),
        RelationSpec("jour", "vigorous_minutes_prev1", "sleep_minutes", "Effort intense la veille → sommeil", "min"),
        RelationSpec("jour", "vigorous_minutes_prev1", "deep_sleep_minutes", "Effort intense la veille → sommeil profond", "min"),
        RelationSpec("jour", "vigorous_minutes_prev1", "rhr_bpm", "Effort intense la veille → fréquence au repos", "bpm"),
        RelationSpec("jour", "vigorous_minutes_prev1", "hrv_ms", "Effort intense la veille → variabilité cardiaque", "ms"),
        RelationSpec("jour", "cardio_load_prev1", "sleep_minutes", "Charge cardio la veille → sommeil", "min"),
        RelationSpec("jour", "cardio_load_prev1", "rhr_bpm", "Charge cardio la veille → fréquence au repos", "bpm"),
        RelationSpec("jour", "cardio_load_prev1", "hrv_ms", "Charge cardio la veille → variabilité cardiaque", "ms"),
        RelationSpec("jour", "exercise_minutes_prev1", "sleep_minutes", "Exercice la veille → sommeil", "min"),
        RelationSpec("jour", "exercise_minutes_prev1", "rhr_bpm", "Exercice la veille → fréquence au repos", "bpm"),
        RelationSpec("jour", "exercise_minutes_prev1", "hrv_ms", "Exercice la veille → variabilité cardiaque", "ms"),
        RelationSpec("jour", "run_count_7d", "rhr_bpm", "Courses sur 7 jours → fréquence au repos", "bpm"),
        RelationSpec("jour", "run_count_7d", "hrv_ms", "Courses sur 7 jours → variabilité cardiaque", "ms"),
        RelationSpec("jour", "vigorous_minutes_7d", "rhr_bpm", "Effort intense sur 7 jours → fréquence au repos", "bpm"),
        RelationSpec("jour", "vigorous_minutes_7d", "hrv_ms", "Effort intense sur 7 jours → variabilité cardiaque", "ms"),
        RelationSpec("jour", "exercise_minutes_7d", "rhr_bpm", "Exercice sur 7 jours → fréquence au repos", "bpm"),
        RelationSpec("jour", "steps_mean_7d", "rhr_bpm", "Pas moyens sur 7 jours → fréquence au repos", "bpm"),
        RelationSpec("semaine", "week_run_count", "week_rhr_mean", "Courses hebdomadaires → fréquence au repos", "bpm"),
        RelationSpec("semaine", "week_run_count", "week_hrv_mean", "Courses hebdomadaires → variabilité cardiaque", "ms"),
        RelationSpec("semaine", "week_vigorous_minutes", "week_rhr_mean", "Effort intense hebdomadaire → fréquence au repos", "bpm"),
        RelationSpec("semaine", "week_vigorous_minutes", "week_sleep_mean", "Effort intense hebdomadaire → sommeil", "min"),
        RelationSpec("semaine", "week_exercise_minutes", "week_rhr_mean", "Exercice hebdomadaire → fréquence au repos", "bpm"),
        RelationSpec("semaine", "week_steps_mean", "week_rhr_mean", "Pas hebdomadaires → fréquence au repos", "bpm"),
    ]
    return specs


def calculate_relations(daily: pd.DataFrame, weekly: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for spec in relation_specs():
        rows.append(calculate_relation(daily if spec.grain == "jour" else weekly, spec))
    relations = pd.DataFrame(rows)
    calculable = relations["rho"].notna()
    relations["q_value"] = 1.0
    if calculable.any():
        relations.loc[calculable, "q_value"] = multipletests(relations.loc[calculable, "p_value"], method="fdr_bh")[1]
    interval_width = relations["ci_high"] - relations["ci_low"]
    precision = (1 - interval_width / 2).clip(0, 1)
    sample_weight = np.log1p(relations["effective_n"]) / math.log(31)
    relations["relevance"] = (
        relations["rho"].abs().fillna(0)
        * precision
        * sample_weight.clip(0, 1)
        * (1 - relations["q_value"].clip(0, 1))
    )
    return relations.sort_values(["relevance", "effective_n"], ascending=False).reset_index(drop=True)


def coverage_table(daily: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "sleep_minutes",
        "bedtime_hour",
        "deep_sleep_minutes",
        "sleep_score",
        "rhr_bpm",
        "hrv_ms",
        "respiratory_rate",
        "spo2_pct",
        "temperature_delta_c",
        "readiness_score",
        "steps",
        "vigorous_minutes",
        "active_zone_minutes",
        "cardio_load",
        "exercise_minutes",
    ]
    rows = []
    for column in columns:
        available = daily.loc[daily[column].notna(), ["date", column]]
        if available.empty:
            rows.append({"metric": column, "label": LABELS.get(column, column), "days": 0, "start": None, "end": None, "coverage": 0})
            continue
        start = available["date"].min()
        end = available["date"].max()
        span = max(1, (end - start).days + 1)
        rows.append({
            "metric": column,
            "label": LABELS.get(column, column),
            "days": len(available),
            "start": start.date().isoformat(),
            "end": end.date().isoformat(),
            "coverage": len(available) / span,
        })
    return pd.DataFrame(rows).sort_values(["days", "metric"], ascending=[False, True]).reset_index(drop=True)


def quality_findings(root: Path, daily: pd.DataFrame) -> list[dict]:
    glucose_files = sorted((root / "Biometrics").glob("Glucose *.csv"))
    glucose_rows = 0
    for path in glucose_files:
        try:
            glucose_rows += len(pd.read_csv(path))
        except pd.errors.EmptyDataError:
            pass

    invalid_rhr = _read_json_files((root / "Global Export Data").glob("resting_heart_rate-*.json"))
    invalid_dates = pd.to_datetime([row.get("dateTime") for row in invalid_rhr], errors="coerce", format="mixed")
    invalid_values = pd.to_numeric([row.get("value", {}).get("value") if isinstance(row.get("value"), dict) else None for row in invalid_rhr], errors="coerce")
    future_rows = int((invalid_dates > pd.Timestamp("2026-08-22")).sum())
    zero_rows = int((invalid_values == 0).sum())
    return [
        {
            "severity": "important",
            "finding": "Le fichier Global Export Data de fréquence au repos n’est pas utilisable.",
            "detail": f"{len(invalid_rhr)} lignes, dont {future_rows} datées après l’export et {zero_rows} valeurs nulles. L’analyse utilise daily_resting_heart_rate.csv filtré sur Google Health App.",
        },
        {
            "severity": "information",
            "finding": "Les fichiers glucose ne contiennent aucune mesure.",
            "detail": f"{len(glucose_files)} fichiers mensuels et {glucose_rows} ligne de données.",
        },
        {
            "severity": "information",
            "finding": "Plusieurs séries existent en double.",
            "detail": "Sommeil, fréquence cardiaque, SpO₂, température et activité apparaissent dans plusieurs dossiers. Une source canonique a été choisie pour chaque métrique avant les calculs.",
        },
        {
            "severity": "information",
            "finding": "La fenêtre Fitbit exploitable est courte mais dense.",
            "detail": f"{int(daily['steps'].notna().sum())} jours avec pas et {int(daily['hrv_ms'].notna().sum())} jours avec variabilité cardiaque.",
        },
    ]


def bedtime_sensitivity(daily: pd.DataFrame) -> list[dict]:
    frame = daily[["date", "bedtime_hour", "sleep_minutes"]].dropna().copy()
    frame["weekend"] = frame["date"].dt.dayofweek >= 5
    groups = [
        ("Première moitié", frame.iloc[: len(frame) // 2]),
        ("Seconde moitié", frame.iloc[len(frame) // 2 :]),
        ("Jours de semaine", frame.loc[~frame["weekend"]]),
        ("Week-end", frame.loc[frame["weekend"]]),
    ]
    rows = []
    for label, group in groups:
        coefficient = float(stats.spearmanr(group["bedtime_hour"], group["sleep_minutes"]).statistic)
        lower = group["bedtime_hour"].quantile(1 / 3)
        upper = group["bedtime_hour"].quantile(2 / 3)
        effect = (
            group.loc[group["bedtime_hour"] >= upper, "sleep_minutes"].mean()
            - group.loc[group["bedtime_hour"] <= lower, "sleep_minutes"].mean()
        )
        rows.append({"segment": label, "n": len(group), "rho": coefficient, "effect_minutes": float(effect)})
    return rows


def _json_safe(value: object) -> object:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return str(value)


def _relation_identifier(row: pd.Series) -> str:
    raw = f"{row['grain']}|{row['predictor']}|{row['outcome']}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


def save_figures(coverage: pd.DataFrame, relations: pd.DataFrame, output_dir: Path) -> None:
    sns.set_theme(style="whitegrid", context="notebook")

    top_coverage = coverage.sort_values("days").tail(12)
    fig, axis = plt.subplots(figsize=(9, 6))
    axis.barh(top_coverage["label"], top_coverage["days"], color="#315f4b")
    axis.set_xlabel("Jours disponibles")
    axis.set_ylabel("")
    axis.set_title("Couverture des principales séries")
    fig.tight_layout()
    fig.savefig(output_dir / "coverage.png", dpi=150)
    plt.close(fig)

    top = relations.loc[relations["rho"].notna()].head(12).sort_values("rho")
    fig, axis = plt.subplots(figsize=(10, 7))
    colors = ["#356f93" if value > 0 else "#a65b3d" for value in top["rho"]]
    axis.barh(top["label"], top["rho"], color=colors)
    axis.axvline(0, color="#202522", linewidth=0.8)
    axis.set_xlim(-1, 1)
    axis.set_xlabel("Coefficient de Spearman")
    axis.set_ylabel("")
    axis.set_title("Relations les mieux étayées")
    fig.tight_layout()
    fig.savefig(output_dir / "top-relations.png", dpi=150)
    plt.close(fig)


def run_analysis(root: Path, output_dir: Path) -> dict:
    if not root.exists():
        raise FileNotFoundError(f"Export introuvable : {root}")
    output_dir.mkdir(parents=True, exist_ok=True)

    daily = build_daily_dataset(root)
    weekly = build_weekly_dataset(daily)
    coverage = coverage_table(daily)
    relations = calculate_relations(daily, weekly)
    quality = quality_findings(root, daily)
    bedtime_checks = bedtime_sensitivity(daily)
    relations["relation_id"] = relations.apply(_relation_identifier, axis=1)

    daily.to_csv(output_dir / "daily_merged.csv", index=False)
    weekly.to_csv(output_dir / "weekly_merged.csv", index=False)
    coverage.to_csv(output_dir / "coverage.csv", index=False)
    relations.to_csv(output_dir / "relations.csv", index=False)
    save_figures(coverage, relations, output_dir)

    top = relations.loc[relations["rho"].notna()].head(12)
    summary = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "root_label": "Google Health Takeout",
        "daily_start": daily["date"].min().date().isoformat(),
        "daily_end": daily["date"].max().date().isoformat(),
        "fitbit_days": int(daily["steps"].notna().sum()),
        "sleep_days": int(daily["sleep_minutes"].notna().sum()),
        "hrv_days": int(daily["hrv_ms"].notna().sum()),
        "complete_weeks": int(len(weekly)),
        "tests_calculated": int(relations["rho"].notna().sum()),
        "quality_findings": quality,
        "bedtime_sensitivity": bedtime_checks,
        "coverage": coverage.to_dict(orient="records"),
        "top_relations": top.to_dict(orient="records"),
        "method": {
            "minimum_pairs": MINIMUM_COMPUTABLE_PAIRS,
            "coefficient": "Spearman",
            "sample_size": "Taille effective réduite lorsque les séries sont autocorrélées",
            "uncertainty": "Intervalle à 95 % via transformation de Fisher et taille effective",
            "multiple_tests": "Benjamini-Hochberg FDR",
            "missing_values": "Exclusion paire par paire; aucune valeur absente transformée en zéro",
        },
    }
    with (output_dir / "summary.json").open("w", encoding="utf-8") as handle:
        json.dump(_json_safe(summary), handle, ensure_ascii=False, indent=2)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    summary = run_analysis(args.root, args.output)
    print(json.dumps({
        "daily_start": summary["daily_start"],
        "daily_end": summary["daily_end"],
        "fitbit_days": summary["fitbit_days"],
        "sleep_days": summary["sleep_days"],
        "hrv_days": summary["hrv_days"],
        "complete_weeks": summary["complete_weeks"],
        "tests_calculated": summary["tests_calculated"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
