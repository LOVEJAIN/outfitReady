Coordinate the schedules of three executives based on the raw files in `/app`:

- `email_threads.json`
- `calendar_exports.json`
- `travel_itineraries.json`
- `executive_preferences.json`
- `scheduling_policies.json`

Write your final answer to `/app/schedule.json` as UTF-8 encoded JSON.

The raw data intentionally contains duplicate invitations, cancellations, re-issued invitations, conflicting timestamps, missing RSVP responses, and contradictory location clues.

Apply these reconciliation rules exactly when rebuilding the canonical meeting state:

1. newest timestamp wins
2. explicit cancellation overrides invitation
3. re-issued invitation overrides cancellation
4. duplicate meeting IDs merge
5. missing RSVP = `Unknown`
6. travel itinerary overrides inferred location

Optimize the final schedule using the meeting weights in `scheduling_policies.json`.

Hard constraints:

1. no overlapping meetings
2. timezone compatibility
3. 12-hour travel recovery
4. mandatory meetings may be rejected only when infeasible
5. dependency ordering
6. required attendees present

Tie breakers, in order:

1. fewer rejected mandatory meetings
2. fewer rejected meetings
3. smaller travel idle time
4. lexicographically smallest schedule

Your `/app/schedule.json` must satisfy all of the following:

1. It is a JSON object with exactly two top-level keys: `selected_meeting_ids` and `rejected_meetings`.
2. `selected_meeting_ids` is an array of unique meeting IDs sorted by canonical start time, then by meeting ID.
3. `rejected_meetings` is an array of objects sorted by `meeting_id`. Each object must contain:
   - `meeting_id`: a canonical meeting ID
   - `reason`: a non-empty string
4. Every canonical active meeting appears exactly once, either in `selected_meeting_ids` or in `rejected_meetings`.
5. Cancelled meetings must not appear in the output.
