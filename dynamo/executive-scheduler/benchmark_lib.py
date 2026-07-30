from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


class ValidationError(Exception):
    """Raised when a submitted schedule violates schema or benchmark rules."""


@dataclass(frozen=True)
class TravelLeg:
    executive: str
    departure_city: str
    departure_utc: datetime
    arrival_city: str
    arrival_utc: datetime


@dataclass(frozen=True)
class Meeting:
    meeting_id: str
    title: str
    meeting_type: str
    mandatory: bool
    mode: str
    host_city: str
    start_utc: datetime
    end_utc: datetime
    required_attendees: tuple[str, ...]
    dependencies: tuple[str, ...]
    status: str
    rsvps: dict[str, str]


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_dataset(data_dir: Path) -> dict[str, Any]:
    return {
        "email_threads": load_json(data_dir / "email_threads.json"),
        "calendar_exports": load_json(data_dir / "calendar_exports.json"),
        "travel_itineraries": load_json(data_dir / "travel_itineraries.json"),
        "executive_preferences": load_json(data_dir / "executive_preferences.json"),
        "scheduling_policies": load_json(data_dir / "scheduling_policies.json"),
    }


def _meeting_event_stream(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        *dataset["email_threads"]["records"],
        *dataset["calendar_exports"]["records"],
    ]


def _canonical_rsvps(records: list[dict[str, Any]], required_attendees: tuple[str, ...]) -> dict[str, str]:
    latest_by_attendee: dict[str, tuple[datetime, str]] = {}
    for record in records:
        if record["record_kind"] != "rsvp":
            continue
        attendee = record["attendee"]
        updated_at = parse_dt(record["updated_at"])
        prior = latest_by_attendee.get(attendee)
        if prior is None or updated_at > prior[0]:
            latest_by_attendee[attendee] = (updated_at, record["response"])
    return {
        attendee: latest_by_attendee.get(attendee, (None, "Unknown"))[1]
        for attendee in required_attendees
    }


def canonical_meetings(dataset: dict[str, Any]) -> dict[str, Meeting]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in _meeting_event_stream(dataset):
        grouped.setdefault(record["meeting_id"], []).append(record)

    meetings: dict[str, Meeting] = {}
    for meeting_id, records in grouped.items():
        sorted_records = sorted(records, key=lambda item: parse_dt(item["updated_at"]))
        meeting_state: dict[str, Any] = {}
        latest_status = "invitation"

        for record in sorted_records:
            if record["record_kind"] == "rsvp":
                continue
            latest_status = record["record_kind"]
            for key, value in record.items():
                if key in {"meeting_id", "record_kind", "updated_at"}:
                    continue
                if value is not None:
                    meeting_state[key] = value

        required_attendees = tuple(meeting_state["required_attendees"])
        meetings[meeting_id] = Meeting(
            meeting_id=meeting_id,
            title=meeting_state["title"],
            meeting_type=meeting_state["meeting_type"],
            mandatory=bool(meeting_state["mandatory"]),
            mode=meeting_state["mode"],
            host_city=meeting_state["host_city"],
            start_utc=parse_dt(meeting_state["start_utc"]),
            end_utc=parse_dt(meeting_state["end_utc"]),
            required_attendees=required_attendees,
            dependencies=tuple(meeting_state.get("dependencies", [])),
            status="cancelled" if latest_status == "cancellation" else "active",
            rsvps=_canonical_rsvps(sorted_records, required_attendees),
        )
    return meetings


def canonical_active_meetings(dataset: dict[str, Any]) -> dict[str, Meeting]:
    return {
        meeting_id: meeting
        for meeting_id, meeting in canonical_meetings(dataset).items()
        if meeting.status == "active"
    }


def travel_legs(dataset: dict[str, Any]) -> dict[str, list[TravelLeg]]:
    grouped: dict[str, list[TravelLeg]] = {}
    for itinerary in dataset["travel_itineraries"]["itineraries"]:
        executive = itinerary["executive"]
        legs = [
            TravelLeg(
                executive=executive,
                departure_city=leg["departure_city"],
                departure_utc=parse_dt(leg["departure_utc"]),
                arrival_city=leg["arrival_city"],
                arrival_utc=parse_dt(leg["arrival_utc"]),
            )
            for leg in itinerary["legs"]
        ]
        grouped[executive] = sorted(legs, key=lambda leg: leg.departure_utc)
    return grouped


def _executive_prefs(dataset: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        item["executive"]: item
        for item in dataset["executive_preferences"]["executives"]
    }


def _city_timezones(dataset: dict[str, Any]) -> dict[str, ZoneInfo]:
    return {
        city: ZoneInfo(tz_name)
        for city, tz_name in dataset["scheduling_policies"]["city_timezones"].items()
    }


def executive_location(dataset: dict[str, Any], executive: str, moment: datetime) -> tuple[str, datetime | None, bool]:
    prefs = _executive_prefs(dataset)[executive]
    current_city = prefs["home_city"]
    arrival_time: datetime | None = None
    in_transit = False

    for leg in travel_legs(dataset).get(executive, []):
        if leg.departure_utc <= moment < leg.arrival_utc:
            in_transit = True
            break
        if leg.arrival_utc <= moment:
            current_city = leg.arrival_city
            arrival_time = leg.arrival_utc

    return current_city, arrival_time, in_transit


def _local_hours_ok(
    dataset: dict[str, Any],
    executive: str,
    start_utc: datetime,
    end_utc: datetime,
) -> bool:
    prefs = _executive_prefs(dataset)[executive]
    city, _, _ = executive_location(dataset, executive, start_utc)
    tz = _city_timezones(dataset)[city]
    local_start = start_utc.astimezone(tz)
    local_end = end_utc.astimezone(tz)
    start_hour = prefs["workday_start_hour"]
    end_hour = prefs["workday_end_hour"]
    return (
        local_start.hour >= start_hour
        and (local_end.hour < end_hour or (local_end.hour == end_hour and local_end.minute == 0))
    )


def _attendee_available_for_meeting(dataset: dict[str, Any], meeting: Meeting, executive: str) -> bool:
    if meeting.rsvps[executive] != "Accepted":
        return False

    city, arrival_time, in_transit = executive_location(dataset, executive, meeting.start_utc)
    if in_transit:
        return False
    if arrival_time is not None:
        recovery_window = timedelta(hours=dataset["scheduling_policies"]["travel_recovery_hours"])
        if meeting.start_utc < arrival_time + recovery_window:
            return False
    if not _local_hours_ok(dataset, executive, meeting.start_utc, meeting.end_utc):
        return False
    if meeting.mode == "in_person" and city != meeting.host_city:
        return False
    return True


def _dependencies_satisfied(selected: dict[str, Meeting], meeting: Meeting) -> bool:
    for dependency_id in meeting.dependencies:
        dependency = selected.get(dependency_id)
        if dependency is None or dependency.end_utc > meeting.start_utc:
            return False
    return True


def _has_overlap(first: Meeting, second: Meeting) -> bool:
    return max(first.start_utc, second.start_utc) < min(first.end_utc, second.end_utc)


def _travel_idle_minutes(dataset: dict[str, Any], meeting: Meeting) -> int:
    if meeting.mode != "in_person":
        return 0
    total = 0
    recovery = timedelta(hours=dataset["scheduling_policies"]["travel_recovery_hours"])
    prefs = _executive_prefs(dataset)

    for executive in meeting.required_attendees:
        _, arrival_time, _ = executive_location(dataset, executive, meeting.start_utc)
        home_city = prefs[executive]["home_city"]
        if arrival_time is None or home_city == meeting.host_city:
            continue
        idle = meeting.start_utc - (arrival_time + recovery)
        total += max(0, int(idle.total_seconds() // 60))
    return total


def schedule_signature(meetings: list[Meeting]) -> tuple[str, ...]:
    ordered = sorted(meetings, key=lambda item: (item.start_utc, item.meeting_id))
    return tuple(meeting.meeting_id for meeting in ordered)


def is_feasible_selection(dataset: dict[str, Any], selected_ids: set[str]) -> tuple[bool, str | None]:
    meetings = canonical_active_meetings(dataset)
    selected = {meeting_id: meetings[meeting_id] for meeting_id in selected_ids}

    for meeting in selected.values():
        if not _dependencies_satisfied(selected, meeting):
            return False, f"Dependency ordering violated for {meeting.meeting_id}"
        for executive in meeting.required_attendees:
            if not _attendee_available_for_meeting(dataset, meeting, executive):
                return False, f"Required attendee unavailable for {meeting.meeting_id}"

    by_executive: dict[str, list[Meeting]] = {}
    for meeting in selected.values():
        for executive in meeting.required_attendees:
            by_executive.setdefault(executive, []).append(meeting)

    for executive_meetings in by_executive.values():
        ordered = sorted(executive_meetings, key=lambda item: (item.start_utc, item.meeting_id))
        for first, second in zip(ordered, ordered[1:]):
            if _has_overlap(first, second):
                return False, f"Overlap between {first.meeting_id} and {second.meeting_id}"

    return True, None


def _selection_metrics(dataset: dict[str, Any], selected_ids: set[str]) -> dict[str, Any]:
    meetings = canonical_active_meetings(dataset)
    selected = [meetings[meeting_id] for meeting_id in selected_ids]
    meeting_weights = dataset["scheduling_policies"]["meeting_weights"]
    mandatory_ids = {meeting_id for meeting_id, meeting in meetings.items() if meeting.mandatory}
    selected_signature = schedule_signature(selected)
    rejected_ids = sorted(set(meetings) - selected_ids)

    score = sum(meeting_weights[meeting.meeting_type] for meeting in selected)
    mandatory_selected_count = len(selected_ids & mandatory_ids)
    rejected_mandatory = len(mandatory_ids - selected_ids)
    rejected_count = len(rejected_ids)
    travel_idle = sum(_travel_idle_minutes(dataset, meeting) for meeting in selected)

    tie_break_tuple = (
        rejected_mandatory,
        rejected_count,
        travel_idle,
        selected_signature,
    )

    return {
        "score": score,
        "mandatory_selected_count": mandatory_selected_count,
        "rejected_ids": rejected_ids,
        "selected_meeting_ids": list(selected_signature),
        "travel_idle_minutes": travel_idle,
        "tie_break_tuple": tie_break_tuple,
    }


def compute_optimal_schedule(dataset: dict[str, Any]) -> dict[str, Any]:
    meetings = canonical_active_meetings(dataset)
    meeting_ids = sorted(meetings)
    feasible_metrics: list[dict[str, Any]] = []

    for mask in range(1 << len(meeting_ids)):
        selected_ids = {
            meeting_ids[index]
            for index in range(len(meeting_ids))
            if mask & (1 << index)
        }
        feasible, _ = is_feasible_selection(dataset, selected_ids)
        if feasible:
            feasible_metrics.append(_selection_metrics(dataset, selected_ids))

    if not feasible_metrics:
        raise ValidationError("No feasible schedule exists for the dataset.")

    max_mandatory = max(item["mandatory_selected_count"] for item in feasible_metrics)
    feasible_metrics = [
        item for item in feasible_metrics if item["mandatory_selected_count"] == max_mandatory
    ]

    optimal = sorted(
        feasible_metrics,
        key=lambda item: (
            -item["score"],
            item["tie_break_tuple"][0],
            item["tie_break_tuple"][1],
            item["tie_break_tuple"][2],
            item["tie_break_tuple"][3],
        ),
    )[0]

    meetings_by_id = canonical_active_meetings(dataset)
    rejected_reasons = {}
    for meeting_id in optimal["rejected_ids"]:
        meeting = meetings_by_id[meeting_id]
        feasible, reason = is_feasible_selection(
            dataset, set(optimal["selected_meeting_ids"]) | {meeting_id}
        )
        if feasible:
            rejected_reasons[meeting_id] = "Rejected only due to lower optimization priority."
        elif meeting.rsvps and any(response != "Accepted" for response in meeting.rsvps.values()):
            rejected_reasons[meeting_id] = "Required attendee was not confirmed present."
        else:
            rejected_reasons[meeting_id] = reason or "Rejected as infeasible."

    optimal["rejected_reasons"] = rejected_reasons
    return optimal


def validate_schedule_schema(artifact: Any, active_meetings: dict[str, Meeting]) -> None:
    if not isinstance(artifact, dict):
        raise ValidationError("schedule.json must be a JSON object.")
    if set(artifact) != {"selected_meeting_ids", "rejected_meetings"}:
        raise ValidationError("schedule.json must contain exactly selected_meeting_ids and rejected_meetings.")

    selected = artifact["selected_meeting_ids"]
    rejected = artifact["rejected_meetings"]

    if not isinstance(selected, list) or not all(isinstance(item, str) for item in selected):
        raise ValidationError("selected_meeting_ids must be an array of strings.")
    if len(selected) != len(set(selected)):
        raise ValidationError("selected_meeting_ids must be unique.")

    if not isinstance(rejected, list):
        raise ValidationError("rejected_meetings must be an array.")

    rejected_ids: list[str] = []
    for item in rejected:
        if not isinstance(item, dict):
            raise ValidationError("Each rejected meeting entry must be an object.")
        if set(item) != {"meeting_id", "reason"}:
            raise ValidationError("Each rejected meeting entry must contain meeting_id and reason.")
        if not isinstance(item["meeting_id"], str):
            raise ValidationError("Rejected meeting_id values must be strings.")
        if not isinstance(item["reason"], str) or not item["reason"].strip():
            raise ValidationError("Each rejected meeting reason must be a non-empty string.")
        rejected_ids.append(item["meeting_id"])

    if len(rejected_ids) != len(set(rejected_ids)):
        raise ValidationError("Rejected meetings must be unique.")

    active_ids = set(active_meetings)
    selected_ids = set(selected)
    rejected_id_set = set(rejected_ids)

    unknown_ids = (selected_ids | rejected_id_set) - active_ids
    if unknown_ids:
        raise ValidationError(f"Unknown or cancelled meeting IDs in output: {sorted(unknown_ids)}")
    if selected_ids & rejected_id_set:
        raise ValidationError("A meeting cannot be both selected and rejected.")
    if selected_ids | rejected_id_set != active_ids:
        raise ValidationError("Every canonical active meeting must appear exactly once.")

    canonical_order = [
        meeting.meeting_id
        for meeting in sorted(active_meetings.values(), key=lambda item: (item.start_utc, item.meeting_id))
        if meeting.meeting_id in selected_ids
    ]
    if selected != canonical_order:
        raise ValidationError("selected_meeting_ids must be sorted by canonical start time, then meeting ID.")

    if rejected_ids != sorted(rejected_ids):
        raise ValidationError("rejected_meetings must be sorted by meeting_id.")


def evaluate_schedule(dataset: dict[str, Any], artifact: dict[str, Any]) -> dict[str, Any]:
    meetings = canonical_active_meetings(dataset)
    selected_ids = set(artifact["selected_meeting_ids"])
    feasible, reason = is_feasible_selection(dataset, selected_ids)
    if not feasible:
        raise ValidationError(reason or "Selected meetings are infeasible.")

    metrics = _selection_metrics(dataset, selected_ids)
    reinsertable: dict[str, bool] = {}
    for rejected in artifact["rejected_meetings"]:
        meeting_id = rejected["meeting_id"]
        feasible_with_reinsert, _ = is_feasible_selection(dataset, selected_ids | {meeting_id})
        reinsertable[meeting_id] = feasible_with_reinsert

    metrics["reinsertable_rejections"] = reinsertable
    return metrics
