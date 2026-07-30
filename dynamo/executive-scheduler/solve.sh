#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$TASK_DIR/app}"
OUTPUT_DIR="${OUTPUT_DIR:-$TASK_DIR/.work}"
SCHEDULE_PATH="${SCHEDULE_PATH:-$OUTPUT_DIR/schedule.json}"

mkdir -p "$OUTPUT_DIR"

export DATA_DIR OUTPUT_DIR SCHEDULE_PATH

PYTHONPATH="$TASK_DIR${PYTHONPATH:+:$PYTHONPATH}" \
python3 - <<'PY'
import json
import os
from pathlib import Path

from benchmark_lib import compute_optimal_schedule, load_dataset

data_dir = Path(os.environ["DATA_DIR"])
schedule_path = Path(os.environ["SCHEDULE_PATH"])

dataset = load_dataset(data_dir)
optimal = compute_optimal_schedule(dataset)

artifact = {
    "selected_meeting_ids": optimal["selected_meeting_ids"],
    "rejected_meetings": [
        {"meeting_id": meeting_id, "reason": reason}
        for meeting_id, reason in optimal["rejected_reasons"].items()
    ],
}

schedule_path.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {schedule_path}")
PY
