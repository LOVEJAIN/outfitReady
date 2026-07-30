#!/usr/bin/env bash
set -euo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$TASK_DIR/app}"
OUTPUT_DIR="${OUTPUT_DIR:-$TASK_DIR/.work}"
SCHEDULE_PATH="${SCHEDULE_PATH:-$OUTPUT_DIR/schedule.json}"

if [[ ! -f "$SCHEDULE_PATH" ]]; then
  DATA_DIR="$DATA_DIR" OUTPUT_DIR="$OUTPUT_DIR" SCHEDULE_PATH="$SCHEDULE_PATH" "$TASK_DIR/solve.sh"
fi

DATA_DIR="$DATA_DIR" SCHEDULE_PATH="$SCHEDULE_PATH" "$TASK_DIR/verifier"
