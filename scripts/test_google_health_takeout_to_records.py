#!/usr/bin/env python3
"""Focused regression tests for the Google Health Takeout normalizer."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("google-health-takeout-to-records.py")
SPEC = importlib.util.spec_from_file_location("google_health_takeout_to_records", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the Takeout normalizer")
NORMALIZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


class GoogleHealthTakeoutNormalizerTest(unittest.TestCase):
    def write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value), encoding="utf-8")

    def test_new_metrics_are_bounded_deduplicated_and_keep_missing_distance_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            export = root / "Global Export Data"
            export.mkdir()
            self.write_json(export / "exercise-0.json", [
                {
                    "logId": 1,
                    "activityName": "Jogging",
                    "startTime": "05/29/26 10:00:00",
                    "duration": 1_800_000,
                    "activeDuration": 1_790_000,
                    "averageHeartRate": 160,
                    "distance": 5.5,
                    "distanceUnit": "Kilometer",
                },
                {
                    "logId": 2,
                    "activityName": "Jogging",
                    "startTime": "05/30/26 10:00:00",
                    "duration": 600_000,
                    "activeDuration": 600_000,
                    "averageHeartRate": 145,
                },
            ])
            daily_vo2 = [{
                "dateTime": "05/29/26 00:00:00",
                "value": {
                    "demographicVO2Max": 48.0,
                    "filteredDemographicVO2Max": 47.5,
                },
            }]
            self.write_json(export / "demographic_vo2_max-a.json", daily_vo2)
            self.write_json(export / "demographic_vo2_max-b.json", daily_vo2)
            run_vo2 = [{
                "dateTime": "05/29/26 10:00:00",
                "value": {"runVO2Max": 51.0, "filteredRunVO2Max": 50.5},
            }]
            self.write_json(export / "run_vo2_max-2026-05-24.json", run_vo2)
            self.write_json(export / "vo2_max-2026-05-24.json", [{
                "dateTime": "05/29/26 10:00:00",
                "value": {"vo2Max": 50.5},
            }])
            sedentary = [
                {"dateTime": "05/29/26 00:00:00", "value": "600"},
                {"dateTime": "05/30/26 00:00:00", "value": "0"},
            ]
            self.write_json(export / "sedentary_minutes-a.json", sedentary)
            self.write_json(export / "sedentary_minutes-b.json", sedentary + [{"dateTime": "08/23/26 00:00:00", "value": "1440"}])

            daily_dataset = root / "daily.csv"
            daily_dataset.write_text("date\n2026-05-29\n2026-05-30\n", encoding="utf-8")
            records, summary = NORMALIZER.build_records(root, daily_dataset, "2026-05-29", "2026-05-30")

            exercises = [item for item in records if item["data_type"] == "exercise"]
            self.assertEqual(exercises[0]["source_record_id"], "google-takeout:v1:exercise:1")
            self.assertEqual(exercises[0]["payload"]["exercise"]["metricsSummary"]["distanceMillimeters"], 5_500_000)
            self.assertNotIn("distanceMillimeters", exercises[1]["payload"]["exercise"]["metricsSummary"])

            daily_records = [item for item in records if item["data_type"] == "daily-vo2-max"]
            self.assertEqual(len(daily_records), 2 - 1)
            self.assertEqual(daily_records[0]["payload"]["dailyVo2Max"]["vo2Max"], 47.5)
            self.assertEqual(len([item for item in records if item["data_type"] == "run-vo2-max"]), 1)
            self.assertEqual(len([item for item in records if item["data_type"] == "vo2-max"]), 0)
            sedentary_records = [item for item in records if item["data_type"] == "sedentary-period"]
            self.assertEqual(len(sedentary_records), 2)
            self.assertEqual(sedentary_records[1]["payload"]["dailyRollup"]["sedentaryPeriod"]["durationSum"], "0s")
            self.assertEqual(summary["by_type"]["sedentary-period"]["records"], 2)


if __name__ == "__main__":
    unittest.main()
