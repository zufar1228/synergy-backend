#!/usr/bin/env python3
"""
File Purpose:
- Generate realistic mock vibration calibration data and seed it directly into Supabase.
Used By:
- Backend developers / DBA for calibration data load testing and analytics validation.
Main Dependencies:
- supabase, psycopg, python-dotenv, datetime/zoneinfo, argparse.
Public/Main Functions:
- main, inspect_live_database, build_generation_plan, execute_seed, verify_seed_result.
Important Side Effects:
- Inserts rows into calibration_raw, calibration_summary, and calibration_device_status.
- Reads .env credentials and live database metadata.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import math
import os
import random
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time as dtime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
from dotenv import load_dotenv
from supabase import Client, create_client


LOCAL_TZ = ZoneInfo("Asia/Jakarta")
SEED_DATES = [date(2026, 4, 18), date(2026, 4, 19), date(2026, 4, 20)]
MIN_OPERATIONAL = dtime(9, 0, 0)
MAX_OPERATIONAL = dtime(16, 0, 0)


@dataclass(frozen=True)
class ScenarioSpec:
    name: str
    impact_point: str
    dg_min: float
    dg_max: float
    classification: str
    session: str
    scenario_code: str


@dataclass
class RepetitionPlan:
    scenario: ScenarioSpec
    repetition_no: int
    session: str
    trial: int
    start_local: datetime
    end_local: datetime
    sample_rate_hz: int


@dataclass
class GenerationBundle:
    run_id: str
    device_id: str
    raw_rows: list[dict[str, Any]]
    summary_rows: list[dict[str, Any]]
    status_rows: list[dict[str, Any]]
    repetitions: list[RepetitionPlan]
    trial_ranges: dict[str, tuple[int, int]]


SCENARIOS: list[ScenarioSpec] = [
    ScenarioSpec(
        name="Hentakan keras lantai sekitar",
        impact_point="1 meter dari pintu",
        dg_min=0.006,
        dg_max=0.012,
        classification="Noise Floor",
        session="B",
        scenario_code="FLOOR_STOMP",
    ),
    ScenarioSpec(
        name="Benturan keras dinding penyangga",
        impact_point="1 meter samping kusen",
        dg_min=0.015,
        dg_max=0.035,
        classification="Noise Floor",
        session="B",
        scenario_code="WALL_IMPACT",
    ),
    ScenarioSpec(
        name="Pemahatan sela kunci (prying)",
        impact_point="Celah kunci atas",
        dg_min=0.225,
        dg_max=0.387,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="PRY_LOCK_TOP",
    ),
    ScenarioSpec(
        name="Pemahatan sela kunci (prying)",
        impact_point="Celah kunci tengah",
        dg_min=0.196,
        dg_max=0.320,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="PRY_LOCK_MID",
    ),
    ScenarioSpec(
        name="Pemahatan sela kunci (prying)",
        impact_point="Celah kunci bawah",
        dg_min=0.217,
        dg_max=0.354,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="PRY_LOCK_BOTTOM",
    ),
    ScenarioSpec(
        name="Pemahatan sela engsel (prying)",
        impact_point="Celah engsel atas",
        dg_min=0.250,
        dg_max=0.426,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="PRY_HINGE_TOP",
    ),
    ScenarioSpec(
        name="Pemahatan sela engsel (prying)",
        impact_point="Celah engsel bawah",
        dg_min=0.231,
        dg_max=0.398,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="PRY_HINGE_BOTTOM",
    ),
    ScenarioSpec(
        name="Pendobrakan bahu beruntun",
        impact_point="Tengah daun pintu",
        dg_min=1.204,
        dg_max=2.859,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="SHOULDER_RAM",
    ),
    ScenarioSpec(
        name="Tendangan keras beruntun",
        impact_point="Tengah daun pintu",
        dg_min=1.550,
        dg_max=3.503,
        classification="Intrusi Destruktif",
        session="C",
        scenario_code="HARD_KICK",
    ),
]

REQUIRED_COLUMNS: dict[str, set[str]] = {
    "calibration_raw": {
        "id",
        "session",
        "trial",
        "ts_device",
        "ts_iso",
        "delta_g",
        "marker",
        "note",
        "device_id",
        "created_at",
    },
    "calibration_summary": {
        "id",
        "session",
        "trial",
        "summary_type",
        "dg_min",
        "dg_max",
        "dg_mean",
        "n_samples",
        "window_ms",
        "device_id",
        "created_at",
    },
    "calibration_device_status": {
        "id",
        "session",
        "recording",
        "trial",
        "uptime_sec",
        "wifi_rssi",
        "free_heap",
        "offline_buf",
        "door_state",
        "device_id",
        "created_at",
    },
}


def to_utc_iso(dt_local: datetime) -> str:
    return dt_local.astimezone(UTC).isoformat().replace("+00:00", "Z")


def from_iso_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate and seed calibration mock data to Supabase"
    )
    parser.add_argument(
        "--mode",
        choices=["dry-run", "execute"],
        default="execute",
        help="dry-run = generate and validate only, execute = insert to Supabase",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260427,
        help="Random seed for deterministic generation",
    )
    parser.add_argument(
        "--batch-size-raw",
        type=int,
        default=500,
        help="Batch size for calibration_raw inserts",
    )
    parser.add_argument(
        "--batch-size-small",
        type=int,
        default=200,
        help="Batch size for summary/status inserts",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=4,
        help="Max retries per insert batch",
    )
    parser.add_argument(
        "--report-file",
        type=str,
        default="",
        help="Optional JSON report output path",
    )
    return parser.parse_args()


def load_runtime_env() -> dict[str, str]:
    backend_root = Path(__file__).resolve().parents[1]
    env_path = backend_root / ".env"
    load_dotenv(env_path, override=True)

    database_url = os.getenv("DATABASE_URL", "").strip()
    supabase_url = (
        os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        or os.getenv("SUPABASE_URL", "").strip()
    )
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "").strip()
    )

    missing: list[str] = []
    if not database_url:
        missing.append("DATABASE_URL")
    if not supabase_url:
        missing.append("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL")
    if not supabase_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY")

    if missing:
        raise RuntimeError(f"Missing required environment values: {', '.join(missing)}")

    return {
        "database_url": database_url,
        "supabase_url": supabase_url,
        "supabase_key": supabase_key,
    }


def create_supabase_client(supabase_url: str, supabase_key: str) -> Client:
    return create_client(supabase_url, supabase_key)


def inspect_live_database(conn: psycopg.Connection) -> dict[str, Any]:
    inspection: dict[str, Any] = {
        "tables": {},
        "history": {},
        "top_device": None,
        "max_trial_by_session": {},
        "max_ts_device": 0,
    }

    with conn.cursor() as cur:
        for table_name in REQUIRED_COLUMNS:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (table_name,),
            )
            columns = cur.fetchall()
            if not columns:
                raise RuntimeError(f"Table not found in live database: {table_name}")

            col_names = {row[0] for row in columns}
            missing = REQUIRED_COLUMNS[table_name] - col_names
            if missing:
                missing_list = ", ".join(sorted(missing))
                raise RuntimeError(
                    f"Live schema mismatch in {table_name}. Missing columns: {missing_list}"
                )

            inspection["tables"][table_name] = [
                {
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2],
                    "default": row[3],
                }
                for row in columns
            ]

            cur.execute(
                f"SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM {table_name}"
            )
            row_count, min_created, max_created = cur.fetchone()
            inspection["history"][table_name] = {
                "row_count": int(row_count or 0),
                "min_created_at": min_created.isoformat() if min_created else None,
                "max_created_at": max_created.isoformat() if max_created else None,
            }

        cur.execute(
            """
            SELECT session, COUNT(*) AS row_count, COUNT(DISTINCT trial) AS trials
            FROM calibration_raw
            GROUP BY session
            ORDER BY session
            """
        )
        inspection["history"]["raw_session_distribution"] = [
            {
                "session": row[0],
                "row_count": int(row[1]),
                "distinct_trials": int(row[2]),
            }
            for row in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT device_id, COUNT(*) AS cnt
            FROM calibration_raw
            GROUP BY device_id
            ORDER BY cnt DESC
            LIMIT 1
            """
        )
        top_device = cur.fetchone()
        if not top_device:
            raise RuntimeError("Cannot auto-detect target device_id: calibration_raw has no rows")
        inspection["top_device"] = {"device_id": top_device[0], "row_count": int(top_device[1])}

        cur.execute(
            """
            SELECT session, COALESCE(MAX(trial), 0)
            FROM calibration_raw
            WHERE device_id = %s
            GROUP BY session
            """,
            (top_device[0],),
        )
        trial_map = {row[0]: int(row[1]) for row in cur.fetchall()}

        cur.execute(
            """
            SELECT COALESCE(MAX(trial), 0)
            FROM calibration_summary
            WHERE device_id = %s AND session = 'A'
            """,
            (top_device[0],),
        )
        summary_max_trial = int(cur.fetchone()[0])

        cur.execute(
            """
            SELECT COALESCE(MAX(ts_device), 0)
            FROM calibration_raw
            WHERE device_id = %s
            """,
            (top_device[0],),
        )
        max_ts_device = int(cur.fetchone()[0] or 0)

        inspection["max_trial_by_session"] = {
            "A": summary_max_trial,
            "B": trial_map.get("B", 0),
            "C": trial_map.get("C", 0),
        }
        inspection["max_ts_device"] = max_ts_device

    return inspection


def generate_delta_series(
    scenario: ScenarioSpec,
    sample_count: int,
    rng: random.Random,
) -> list[float]:
    span = scenario.dg_max - scenario.dg_min
    values: list[float] = []

    for i in range(sample_count):
        progress = i / max(1, sample_count - 1)
        harmonic_factor = abs(math.sin(progress * math.pi * rng.uniform(3.5, 8.5)))

        if scenario.classification == "Noise Floor":
            base_intensity = 0.25 + 0.45 * harmonic_factor + rng.uniform(0.0, 0.12)
            spike_chance = 0.004
            jitter_scale = 0.02
        else:
            base_intensity = 0.42 + 0.52 * harmonic_factor + rng.uniform(0.0, 0.16)
            spike_chance = 0.028 if scenario.dg_max < 1.0 else 0.05
            jitter_scale = 0.03

        value = scenario.dg_min + (base_intensity * span)
        value += rng.uniform(-span * jitter_scale, span * jitter_scale)

        if rng.random() < spike_chance:
            value = scenario.dg_max - rng.uniform(0.0, span * 0.04)

        value = min(max(value, scenario.dg_min), scenario.dg_max)
        values.append(round(value, 6))

    return values


def build_generation_plan(
    inspection: dict[str, Any],
    rng: random.Random,
) -> GenerationBundle:
    run_id = f"seed-{datetime.now(tz=UTC):%Y%m%d%H%M%S}"
    device_id = inspection["top_device"]["device_id"]

    raw_rows: list[dict[str, Any]] = []
    summary_rows: list[dict[str, Any]] = []
    status_rows: list[dict[str, Any]] = []
    repetitions: list[RepetitionPlan] = []

    next_trial = {
        "A": inspection["max_trial_by_session"].get("A", 0) + 1,
        "B": inspection["max_trial_by_session"].get("B", 0) + 1,
        "C": inspection["max_trial_by_session"].get("C", 0) + 1,
    }

    scenario_chunks = [SCENARIOS[0:3], SCENARIOS[3:6], SCENARIOS[6:9]]
    day_slots: list[tuple[dtime, dtime, dtime]] = []
    for _ in SEED_DATES:
        day_slots.append(
            (
                dtime(9, rng.randint(4, 18), rng.randint(0, 59)),
                dtime(11, rng.randint(5, 44), rng.randint(0, 59)),
                dtime(14, rng.randint(2, 35), rng.randint(0, 59)),
            )
        )

    device_clock_ms = inspection.get("max_ts_device", 0)
    if device_clock_ms <= 0:
        device_clock_ms = 1_000_000 + rng.randint(5_000, 25_000)

    for day_idx, day in enumerate(SEED_DATES):
        slot_times = day_slots[day_idx]
        scenarios_for_day = scenario_chunks[day_idx]

        # Session A synthetic summary (non-silent baseline) before first scenario on each day.
        summary_trial = next_trial["A"]
        next_trial["A"] += 1

        baseline_start = datetime.combine(day, dtime(9, rng.randint(0, 3), rng.randint(5, 50)), tzinfo=LOCAL_TZ)
        windows = rng.randint(18, 26)
        for window_idx in range(windows):
            ts_local = baseline_start + timedelta(seconds=5 * window_idx + rng.randint(0, 2))
            n_samples = rng.randint(430, 560)
            window_ms = rng.randint(4200, 5300)

            dg_min = round(rng.uniform(0.004, 0.010), 6)
            dg_max = round(rng.uniform(0.018, 0.035), 6)
            if dg_max - dg_min < 0.005:
                dg_max = round(dg_min + 0.005, 6)
            dg_mean = round(rng.uniform(dg_min + 0.001, dg_max - 0.001), 6)

            summary_rows.append(
                {
                    "session": "A",
                    "trial": summary_trial,
                    "summary_type": "periodic",
                    "dg_min": dg_min,
                    "dg_max": dg_max,
                    "dg_mean": dg_mean,
                    "n_samples": n_samples,
                    "window_ms": window_ms,
                    "device_id": device_id,
                    "created_at": to_utc_iso(ts_local),
                }
            )

        for scenario_idx, scenario in enumerate(scenarios_for_day):
            slot_local = datetime.combine(day, slot_times[scenario_idx], tzinfo=LOCAL_TZ)
            current_local = slot_local

            for repetition_no in range(1, 11):
                if repetition_no == 1:
                    current_local += timedelta(seconds=rng.randint(6, 20))
                else:
                    current_local += timedelta(seconds=rng.randint(2, 7))

                duration_secs = rng.uniform(8.0, 10.0)
                sample_rate_hz = rng.randint(76, 108)
                sample_count = int(round(duration_secs * sample_rate_hz))

                rep_start = current_local
                rep_end = rep_start + timedelta(seconds=duration_secs)
                if rep_end.time() > MAX_OPERATIONAL:
                    raise RuntimeError(
                        f"Generated repetition exceeds operational limit: {scenario.scenario_code}"
                    )

                trial_no = next_trial[scenario.session]
                next_trial[scenario.session] += 1

                repetitions.append(
                    RepetitionPlan(
                        scenario=scenario,
                        repetition_no=repetition_no,
                        session=scenario.session,
                        trial=trial_no,
                        start_local=rep_start,
                        end_local=rep_end,
                        sample_rate_hz=sample_rate_hz,
                    )
                )

                interval_ms = 1000.0 / sample_rate_hz
                delta_series = generate_delta_series(scenario, sample_count, rng)

                for sample_idx, delta_g in enumerate(delta_series):
                    elapsed_ms = int(round(sample_idx * interval_ms))
                    sample_local = rep_start + timedelta(milliseconds=elapsed_ms)
                    sample_utc_iso = to_utc_iso(sample_local)

                    raw_rows.append(
                        {
                            "session": scenario.session,
                            "trial": trial_no,
                            "ts_device": device_clock_ms + elapsed_ms,
                            "ts_iso": sample_utc_iso,
                            "delta_g": delta_g,
                            "marker": None,
                            "note": (
                                f"{run_id}|{scenario.scenario_code}|rep:{repetition_no}|"
                                f"point:{scenario.impact_point}"
                            ),
                            "device_id": device_id,
                            "created_at": sample_utc_iso,
                        }
                    )

                device_clock_ms += int(round(duration_secs * 1000)) + rng.randint(350, 1400)
                current_local = rep_end

    status_rows = build_device_status_rows(repetitions, device_id, rng)

    trial_ranges = {
        "A": (inspection["max_trial_by_session"].get("A", 0) + 1, next_trial["A"] - 1),
        "B": (inspection["max_trial_by_session"].get("B", 0) + 1, next_trial["B"] - 1),
        "C": (inspection["max_trial_by_session"].get("C", 0) + 1, next_trial["C"] - 1),
    }

    return GenerationBundle(
        run_id=run_id,
        device_id=device_id,
        raw_rows=raw_rows,
        summary_rows=summary_rows,
        status_rows=status_rows,
        repetitions=repetitions,
        trial_ranges=trial_ranges,
    )


def build_device_status_rows(
    repetitions: list[RepetitionPlan],
    device_id: str,
    rng: random.Random,
) -> list[dict[str, Any]]:
    event_rows: list[dict[str, Any]] = []

    if not repetitions:
        return event_rows

    first_start = min(rep.start_local for rep in repetitions)
    day_starts = {
        rep.start_local.date(): rep.start_local.replace(hour=9, minute=0, second=0, microsecond=0)
        for rep in repetitions
    }

    timeline: list[tuple[datetime, RepetitionPlan, bool]] = []
    for rep in repetitions:
        pre_start = rep.start_local - timedelta(seconds=rng.randint(1, 3))
        timeline.append((pre_start, rep, False))
        timeline.append((rep.start_local, rep, True))
        timeline.append((rep.start_local + (rep.end_local - rep.start_local) / 2, rep, True))
        timeline.append((rep.end_local + timedelta(seconds=rng.randint(1, 2)), rep, False))

    for day, day_start in day_starts.items():
        timeline.append((day_start + timedelta(seconds=rng.randint(3, 40)), repetitions[0], False))
        day_end = datetime.combine(day, dtime(15, 59, rng.randint(10, 55)), tzinfo=LOCAL_TZ)
        timeline.append((day_end, repetitions[-1], False))

    timeline.sort(key=lambda item: item[0])

    uptime_base = rng.randint(3_600, 9_500)
    first_event = timeline[0][0]

    for event_time, rep, recording in timeline:
        uptime = uptime_base + int((event_time - first_event).total_seconds())
        session = rep.session

        door_state = "CLOSED"
        if (
            session == "C"
            and (
                rep.scenario.scenario_code in {"SHOULDER_RAM", "HARD_KICK"}
                or rep.scenario.scenario_code.startswith("PRY_")
            )
            and not recording
            and rng.random() < 0.18
        ):
            door_state = "OPEN"

        event_rows.append(
            {
                "session": session,
                "recording": recording,
                "trial": rep.trial,
                "uptime_sec": max(uptime, 1),
                "wifi_rssi": rng.randint(-73, -49),
                "free_heap": rng.randint(108_000, 152_000),
                "offline_buf": rng.randint(0, 2) if recording else rng.randint(0, 4),
                "door_state": door_state,
                "device_id": device_id,
                "created_at": to_utc_iso(event_time),
            }
        )

    return event_rows


def validate_generated_rows(bundle: GenerationBundle) -> None:
    scenario_by_code = {s.scenario_code: s for s in SCENARIOS}

    for row in bundle.raw_rows:
        dt_utc = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        dt_local = dt_utc.astimezone(LOCAL_TZ)

        if dt_local.date() not in SEED_DATES:
            raise RuntimeError(f"Raw row outside allowed dates: {row['created_at']}")
        if not (MIN_OPERATIONAL <= dt_local.time() <= MAX_OPERATIONAL):
            raise RuntimeError(f"Raw row outside operational hours: {row['created_at']}")

        note = str(row.get("note", ""))
        parts = note.split("|")
        if len(parts) < 2:
            raise RuntimeError(f"Raw row note format invalid: {note}")
        scenario_code = parts[1]
        scenario = scenario_by_code.get(scenario_code)
        if not scenario:
            raise RuntimeError(f"Unknown scenario code in note: {scenario_code}")

        delta_g = float(row["delta_g"])
        if delta_g < scenario.dg_min or delta_g > scenario.dg_max:
            raise RuntimeError(
                f"delta_g out of range for {scenario_code}: {delta_g} not in [{scenario.dg_min}, {scenario.dg_max}]"
            )

    for row in bundle.summary_rows:
        dt_utc = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        dt_local = dt_utc.astimezone(LOCAL_TZ)

        if dt_local.date() not in SEED_DATES:
            raise RuntimeError(f"Summary row outside allowed dates: {row['created_at']}")
        if not (MIN_OPERATIONAL <= dt_local.time() <= MAX_OPERATIONAL):
            raise RuntimeError(f"Summary row outside operational hours: {row['created_at']}")
        if row["session"] != "A":
            raise RuntimeError("Summary row must use session A")
        if not (float(row["dg_min"]) <= float(row["dg_mean"]) <= float(row["dg_max"])):
            raise RuntimeError(
                "Summary row violates dg_min <= dg_mean <= dg_max consistency"
            )

    for row in bundle.status_rows:
        dt_utc = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        dt_local = dt_utc.astimezone(LOCAL_TZ)
        if dt_local.date() not in SEED_DATES:
            raise RuntimeError(f"Status row outside allowed dates: {row['created_at']}")
        if not (MIN_OPERATIONAL <= dt_local.time() <= MAX_OPERATIONAL):
            raise RuntimeError(f"Status row outside operational hours: {row['created_at']}")

    validate_grouping(bundle.repetitions)


def validate_grouping(repetitions: list[RepetitionPlan]) -> None:
    grouped: dict[str, list[RepetitionPlan]] = defaultdict(list)
    ordered_reps = sorted(repetitions, key=lambda rep: rep.start_local)

    for rep in ordered_reps:
        key = f"{rep.scenario.scenario_code}|{rep.start_local.date().isoformat()}"
        grouped[key].append(rep)

    # 10 repetitions must be contiguous by scenario group without interleaving.
    for key, reps in grouped.items():
        if len(reps) != 10:
            raise RuntimeError(f"Scenario group {key} does not have exactly 10 repetitions")

    sequence = [rep.scenario.scenario_code for rep in ordered_reps]
    runs: list[tuple[str, int]] = []
    if sequence:
        current = sequence[0]
        count = 0
        for code in sequence:
            if code == current:
                count += 1
            else:
                runs.append((current, count))
                current = code
                count = 1
        runs.append((current, count))

    for code, count in runs:
        if count != 10:
            raise RuntimeError(
                f"Grouping rule violated for {code}: contiguous run has {count}, expected 10"
            )


def insert_batch_with_retry(
    client: Client,
    table_name: str,
    rows: list[dict[str, Any]],
    batch_size: int,
    max_retries: int,
) -> int:
    if not rows:
        return 0

    inserted = 0
    for start in range(0, len(rows), batch_size):
        chunk = rows[start : start + batch_size]
        attempt = 0
        while attempt < max_retries:
            attempt += 1
            try:
                client.table(table_name).insert(chunk).execute()
                inserted += len(chunk)
                break
            except Exception as exc:
                if attempt >= max_retries:
                    raise RuntimeError(
                        f"Failed insert batch for {table_name} after {max_retries} attempts: {exc}"
                    ) from exc
                sleep_seconds = 1.5 * (2 ** (attempt - 1))
                time.sleep(sleep_seconds)
    return inserted


def execute_seed(
    client: Client,
    bundle: GenerationBundle,
    args: argparse.Namespace,
) -> dict[str, int]:
    raw_count = insert_batch_with_retry(
        client,
        "calibration_raw",
        bundle.raw_rows,
        args.batch_size_raw,
        args.max_retries,
    )
    summary_count = insert_batch_with_retry(
        client,
        "calibration_summary",
        bundle.summary_rows,
        args.batch_size_small,
        args.max_retries,
    )
    status_count = insert_batch_with_retry(
        client,
        "calibration_device_status",
        bundle.status_rows,
        args.batch_size_small,
        args.max_retries,
    )

    return {
        "calibration_raw": raw_count,
        "calibration_summary": summary_count,
        "calibration_device_status": status_count,
    }


def verify_seed_result(
    conn: psycopg.Connection,
    bundle: GenerationBundle,
    inspection: dict[str, Any],
    inserted: dict[str, int],
) -> dict[str, Any]:
    verify: dict[str, Any] = {}
    summary_times = [from_iso_utc(row["created_at"]) for row in bundle.summary_rows]

    if summary_times:
        summary_start = min(summary_times) - timedelta(seconds=1)
        summary_end = max(summary_times) + timedelta(seconds=1)
    else:
        summary_start = datetime.now(tz=UTC)
        summary_end = summary_start

    status_by_session_expected: dict[str, int] = defaultdict(int)
    for row in bundle.status_rows:
        status_by_session_expected[str(row["session"])] += 1

    with conn.cursor() as cur:
        cur.execute("SET LOCAL statement_timeout = '45s'")

        cur.execute(
            """
            SELECT session, COUNT(*) AS rows, MIN(created_at), MAX(created_at), MIN(trial), MAX(trial)
            FROM calibration_raw
            WHERE device_id = %s AND note LIKE %s
            GROUP BY session
            ORDER BY session
            """,
            (bundle.device_id, f"{bundle.run_id}|%"),
        )
        verify["raw_by_session"] = [
            {
                "session": row[0],
                "rows": int(row[1]),
                "min_created_at": row[2].isoformat() if row[2] else None,
                "max_created_at": row[3].isoformat() if row[3] else None,
                "min_trial": int(row[4]) if row[4] is not None else None,
                "max_trial": int(row[5]) if row[5] is not None else None,
            }
            for row in cur.fetchall()
        ]

        a_min, a_max = bundle.trial_ranges["A"]
        cur.execute(
            """
            SELECT COUNT(*), MIN(created_at), MAX(created_at)
            FROM calibration_summary
            WHERE device_id = %s
              AND session = 'A'
              AND trial BETWEEN %s AND %s
              AND created_at BETWEEN %s AND %s
            """,
            (bundle.device_id, a_min, a_max, summary_start, summary_end),
        )
        row = cur.fetchone()
        verify["summary_session_a"] = {
            "rows": int(row[0] or 0),
            "min_created_at": row[1].isoformat() if row[1] else None,
            "max_created_at": row[2].isoformat() if row[2] else None,
            "trial_range": [a_min, a_max],
        }
        verify["status_by_session_expected"] = dict(
            sorted(status_by_session_expected.items())
        )

        cur.execute(
            """
            SELECT
              MIN(created_at) AS min_created,
              MAX(created_at) AS max_created,
              COUNT(*) AS total_rows
            FROM calibration_raw
            WHERE device_id = %s AND note LIKE %s
            """,
            (bundle.device_id, f"{bundle.run_id}|%"),
        )
        timeline = cur.fetchone()
        verify["timeline"] = {
            "min_created_at": timeline[0].isoformat() if timeline[0] else None,
            "max_created_at": timeline[1].isoformat() if timeline[1] else None,
            "total_rows": int(timeline[2] or 0),
        }

        table_delta: dict[str, dict[str, Any]] = {}
        for table_name in (
            "calibration_raw",
            "calibration_summary",
            "calibration_device_status",
        ):
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            post_count = int(cur.fetchone()[0])
            pre_count = int(inspection["history"][table_name]["row_count"])
            expected = int(inserted.get(table_name, 0))
            delta = post_count - pre_count
            table_delta[table_name] = {
                "pre_count": pre_count,
                "post_count": post_count,
                "delta": delta,
                "expected_inserted": expected,
                "delta_matches_expected": delta == expected,
            }

        verify["table_count_delta"] = table_delta

    return verify


def build_report(
    args: argparse.Namespace,
    inspection: dict[str, Any],
    bundle: GenerationBundle,
    inserted: dict[str, int],
    verification: dict[str, Any],
) -> dict[str, Any]:
    return {
        "run_at_utc": datetime.now(tz=UTC).isoformat(),
        "mode": args.mode,
        "seed": args.seed,
        "run_id": bundle.run_id,
        "target_device_id": bundle.device_id,
        "inspection": inspection,
        "generated_counts": {
            "raw_rows": len(bundle.raw_rows),
            "summary_rows": len(bundle.summary_rows),
            "status_rows": len(bundle.status_rows),
            "repetitions": len(bundle.repetitions),
        },
        "trial_ranges": bundle.trial_ranges,
        "inserted_counts": inserted,
        "verification": verification,
        "constraints": {
            "dates": [d.isoformat() for d in SEED_DATES],
            "time_window_local": [MIN_OPERATIONAL.isoformat(), MAX_OPERATIONAL.isoformat()],
            "timezone": "Asia/Jakarta",
            "session_mapping": {
                "hentakan_lantai": "B",
                "benturan_dinding": "B",
                "intrusi_destruktif": "C",
                "summary_baseline": "A",
            },
        },
    }


def print_generation_summary(bundle: GenerationBundle) -> None:
    print("\nGeneration Summary")
    print("-" * 70)
    print(f"Run ID               : {bundle.run_id}")
    print(f"Target device_id     : {bundle.device_id}")
    print(f"Raw rows             : {len(bundle.raw_rows)}")
    print(f"Summary rows         : {len(bundle.summary_rows)}")
    print(f"Status rows          : {len(bundle.status_rows)}")
    print(f"Total repetitions    : {len(bundle.repetitions)}")
    print(f"Trial range Session A: {bundle.trial_ranges['A']}")
    print(f"Trial range Session B: {bundle.trial_ranges['B']}")
    print(f"Trial range Session C: {bundle.trial_ranges['C']}")

    by_scenario: dict[str, int] = defaultdict(int)
    for rep in bundle.repetitions:
        key = f"{rep.scenario.scenario_code} ({rep.session})"
        by_scenario[key] += 1

    print("Scenario repetition counts:")
    for scenario_key, count in sorted(by_scenario.items()):
        print(f"  - {scenario_key}: {count}")


def write_report_file(report: dict[str, Any], report_file: str) -> None:
    if not report_file:
        return

    out_path = Path(report_file)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report written to: {out_path}")


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)

    env = load_runtime_env()

    print("Starting calibration mock data seeding")
    print(f"Mode      : {args.mode}")
    print(f"Seed      : {args.seed}")
    print(f"DB target : {env['database_url'].split('@')[-1]}")

    with psycopg.connect(env["database_url"]) as conn:
        inspection = inspect_live_database(conn)
        print("Live schema inspection complete")
        print(f"Auto-detected target device_id: {inspection['top_device']['device_id']}")

        bundle = build_generation_plan(inspection, rng)
        validate_generated_rows(bundle)
        print_generation_summary(bundle)

        if args.mode == "dry-run":
            inserted = {
                "calibration_raw": 0,
                "calibration_summary": 0,
                "calibration_device_status": 0,
            }
            verification = {"status": "skipped (dry-run)"}
            report = build_report(args, inspection, bundle, inserted, verification)
            write_report_file(report, args.report_file)
            print("Dry-run complete. No database writes were performed.")
            return 0

        client = create_supabase_client(env["supabase_url"], env["supabase_key"])
        inserted = execute_seed(client, bundle, args)

        # Persist a partial execute report so insert totals are not lost if
        # verification is interrupted.
        partial_report = build_report(
            args,
            inspection,
            bundle,
            inserted,
            {"status": "verification_pending"},
        )
        write_report_file(partial_report, args.report_file)

        verification = verify_seed_result(conn, bundle, inspection, inserted)

        report = build_report(args, inspection, bundle, inserted, verification)
        write_report_file(report, args.report_file)

    print("\nSeeding finished successfully")
    print(json.dumps({"inserted": inserted, "verification": verification}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
