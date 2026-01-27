# F06: Date & Time Selection Improvements

**Priority:** Critical
**Estimated Scope:** Medium
**Dependencies:** F02 (Calendar Connection for real availability) — **SATISFIED**, F03 (Availability Rules) — **SATISFIED**
**Status: COMPLETE**

---

## F06 Implementation Summary

F06 completed the remaining server-side timezone conversion, dynamic slot intervals, and optimistic conflict handling that prior features (F02, F03, F05) had left unfinished. Here is what F06 built:

### Server-side timezone conversion (R3)
- `calculateAvailability()` in `server/calendar-service.ts` now accepts a `guestTimezone` parameter.
- Host working hours are interpreted in the host's timezone using native `Intl.DateTimeFormat` APIs (no external library).
- Slots are generated using `wallClockToUTC()` to correctly convert host wall-clock times to UTC instants.
- Display times are formatted in the guest's timezone using `formatTimeInTimezone()`.
- Falls back to host timezone when no guest timezone is provided, or when the guest timezone is invalid.
- Response format includes a `utc` field: `{ time: "2:00 PM", available: true, utc: "2026-01-26T19:00:00Z" }`.
- `isValidTimezone()` validates IANA timezone strings via `Intl.DateTimeFormat`.
- The availability route validates the `timezone` query param and returns HTTP 400 for invalid values.
- The availability route validates the `date` query param and returns HTTP 400 for unparseable dates.

### Dynamic slot intervals (R6)
- Replaced the hardcoded `SLOT_INTERVAL_MINUTES = 30` with `Math.min(duration, 30)`.
- 15-minute events now generate 15-minute intervals; 30+ minute events keep 30-minute intervals.

### Optimistic conflict handling (R7)
- The frontend detects HTTP 409 conflict responses specifically.
- A targeted error message is shown: "This slot was just booked. Please select another time."
- The availability cache is auto-invalidated and the user is sent back to the time selection step.
- Periodic polling was intentionally not implemented (marginal benefit relative to cost).

### Security hardening
- `startTimeUTC` parameter added to the booking endpoint for timezone-safe booking.
- The booking endpoint validates: valid date, not in the past, within a 365-day window.
- Guest timezone is sanitized via `isValidTimezone()` before database storage.
- The date query param is validated with an HTTP 400 error for malformed input.

### Frontend updates
- `TimeSlot` interface updated with `utc` field.
- `selectedTimeUTC` state stored alongside display time.
- Booking request sends `startTimeUTC` for accurate UTC-based booking.
- Confirmation page uses the UTC timestamp for ICS generation (no more fragile time parsing).
- HTTP 409 conflict error handler with auto-refresh and step navigation.

### Test suite
- 21 new tests in `server/__tests__/f06-date-time-selection.test.ts`.
- Timezone conversion accuracy (UTC host with Tokyo and New York guest display).
- Dynamic slot intervals (15, 30, 45, 60-minute durations).
- Conflict detection with timezone.
- Buffer times across timezone boundaries.
- Edge cases (disabled days, invalid timezones, multiple time blocks).
- Response shape validation (utc field format, monotonic timestamps).

---

## Impact from F01 Implementation

- **No direct dependency on F01**. This feature is primarily about availability calculation and slot management.
- **User authentication is in place** — authenticated endpoints for host-side configuration are ready.

### Impact from F02 Implementation

F02 has satisfied several of F06's requirements. Here is what is now done:

- **R1 (Double-Booking Prevention): DONE** — `calculateAvailability()` in `server/calendar-service.ts` checks CalendAI bookings and Google Calendar events. Write-time prevention added to `POST /api/public/book` returns HTTP 409 on conflict. `getBookingsByDateRange()` storage method exists.
- **R2 (Buffer Time Enforcement): DONE** — `calculateAvailability()` applies `bufferBefore` (subtracts from slot start) and `bufferAfter` (adds to slot end) from event type configuration.
- **R6 (Slot Duration from Event Type): DONE** — `calculateAvailability()` uses `eventType.duration` for slot length, not hardcoded 30 minutes. Slot intervals are now dynamic (see F06 implementation).
- **Calendar integration: DONE** — `getCalendarEvents()` fetches Google Calendar events for conflict checking.
- **Client timezone accepted** — `POST /api/public/book` now accepts `timezone` from request body instead of using server timezone.

### Impact from F03 Implementation

F03 has implemented availability rules, satisfying the F03 dependency:

- **R4 (Minimum Notice Period): DONE** — `calculateAvailability()` now reads `minNotice` from the host's `availability_rules` and skips slots within the notice period. Default is 1440 minutes (24 hours).
- **R5 (Maximum Advance Booking): DONE** — `calculateAvailability()` now reads `maxAdvance` from `availability_rules` and returns empty slots for dates beyond the limit. Default is 60 days.
- **Host timezone stored** — `availability_rules.timezone` is now stored per user. Used by F06 for host/booker timezone conversion.
- **Configurable working hours** — `calculateAvailability()` now uses stored weekly hours instead of hardcoded 9-5, supporting multiple blocks per day and disabled days.

### Impact from F05 Implementation

F05 has implemented the **frontend portion** of timezone handling, completing the client side of R3:

- **Timezone auto-detection implemented** — `Intl.DateTimeFormat().resolvedOptions().timeZone` detects the booker's timezone on page load in `client/src/pages/book.tsx`.
- **Timezone selector UI implemented** — dropdown with 31 common timezones displayed on calendar and time steps.
- **Timezone sent with booking request** — `guestTimezone` field added to `bookings` table in `shared/schema.ts` and stored on booking creation.
- **Timezone passed to availability API** — the frontend sends the selected timezone when fetching availability slots. F06 now uses it for server-side slot conversion.

---

## Current State

All F06 requirements are now complete. The availability and time selection system includes:

- **Availability API:** `GET /api/public/availability/:slug` calls `calculateAvailability()` from `server/calendar-service.ts`, which checks Google Calendar events and CalendAI bookings against configurable working hours with buffer support.
- **Timezone-aware slot generation:** Working hours are interpreted in the host's timezone. Slots are returned with display times in the guest's timezone and UTC timestamps for precise booking.
- **Response format:** Each slot includes `time` (display string in guest timezone), `available` (boolean), and `utc` (ISO 8601 UTC timestamp).
- **Dynamic slot intervals:** Slot intervals use `Math.min(duration, 30)`, so 15-minute events produce 15-minute intervals.
- **Buffer enforcement:** `bufferBefore` and `bufferAfter` from event types are applied when checking for conflicts.
- **Double-booking prevention at write time:** `POST /api/public/book` checks for conflicts before creating a booking (HTTP 409 on conflict).
- **Optimistic conflict handling:** Frontend detects 409 responses, shows a targeted error message, invalidates the cache, and navigates back to time selection.
- **Past time filtering:** Slots before current time are excluded.
- **Input validation:** Availability endpoint validates both `date` and `timezone` query params, returning HTTP 400 for invalid values. Booking endpoint validates date, past/future bounds, and sanitizes timezone before storage.
- **Frontend:** Week-view calendar + time slot grid (`client/src/pages/book.tsx`) with timezone selector, UTC timestamp state, and conflict-aware error handling.

### What's Missing vs PRD

1. **Double-booking prevention** — DONE (F02, with F06 conflict UI)
2. **Buffer time enforcement** — DONE (F02)
3. **Timezone detection/display** — DONE (F05 frontend + F06 backend)
4. **Timezone conversion** — DONE (F06 server-side conversion)
5. **Minimum notice period** — DONE (F03)
6. **Maximum advance booking** — DONE (F03)
7. **Real-time availability** — DONE (F06 optimistic conflict handling with 409 detection and auto-refresh)
8. **Calendar integration** — DONE (F02)

All items are complete.

---

## Requirements

### R1: Double-Booking Prevention (Backend)

> **Status: DONE (implemented in F02).** `calculateAvailability()` in `server/calendar-service.ts` checks CalendAI bookings and Google Calendar events. `POST /api/public/book` includes write-time conflict check returning HTTP 409. `getBookingsByDateRange()` exists in storage.

This is the highest priority item and can be done independently of F02/F03.

Update `GET /api/public/availability/:slug`:
1. Query existing CalendAI bookings for the requested date + event type owner
2. For each potential time slot, check if it overlaps with any existing booking (including buffers)
3. Mark overlapping slots as `available: false`
4. Add database method: `getBookingsByUserAndDateRange(userId, startDate, endDate)`

```typescript
// In storage.ts
async getBookingsByUserAndDateRange(userId: string, start: Date, end: Date): Promise<Booking[]> {
  return db.select().from(bookings)
    .where(and(
      eq(bookings.userId, userId),
      eq(bookings.status, "confirmed"),
      gte(bookings.startTime, start),
      lte(bookings.endTime, end)
    ));
}
```

Also add a check at booking creation time (`POST /api/public/book`):
- Before creating the booking, verify the slot is still available
- If not, return 409 Conflict with message "This time slot is no longer available"

### R2: Buffer Time Enforcement

> **Status: DONE (implemented in F02).** `calculateAvailability()` applies `bufferBefore` (subtracts from slot start) and `bufferAfter` (adds to slot end) from event type configuration when checking for overlaps.

When generating available slots:
1. Load the event type's `bufferBefore` and `bufferAfter` values
2. For each existing booking, expand the "busy" window:
   - Busy from: `booking.startTime - bufferBefore`
   - Busy until: `booking.endTime + bufferAfter`
3. A slot is unavailable if it would fall within any expanded busy window
4. Also ensure buffers between newly generated slots:
   - If slot duration + bufferAfter would overlap with the next booking's bufferBefore, mark unavailable

### R3: Timezone Handling

> **Status: DONE.** Frontend implemented in F05 (auto-detection, selector, display, timezone sent with requests, `guestTimezone` stored). Backend implemented in F06 (server-side slot conversion using native `Intl` APIs).

**Backend (F06 implementation):**
- `calculateAvailability()` accepts `guestTimezone` parameter.
- Working hours are interpreted in the host's timezone using `wallClockToUTC()`.
- Slot display times are formatted in the guest's timezone using `formatTimeInTimezone()`.
- Falls back to the host's timezone when guest timezone is missing or invalid.
- `isValidTimezone()` validates IANA timezone strings via `Intl.DateTimeFormat`.
- Availability route validates `timezone` and `date` query params (HTTP 400 on invalid).
- Response format includes `utc` field:
  ```json
  {
    "time": "2:00 PM",
    "available": true,
    "utc": "2026-01-26T19:00:00Z"
  }
  ```

**Frontend (`client/src/pages/book.tsx`) — DONE by F05 + F06:**
- ~~Detect booker's timezone on page load: `Intl.DateTimeFormat().resolvedOptions().timeZone`~~ DONE (F05)
- ~~Pass timezone to availability API~~ DONE (F05)
- ~~Display: "Times shown in Eastern Time (ET)" below the time grid~~ DONE (F05)
- ~~Optionally allow timezone override (dropdown)~~ DONE (F05, 31 timezone selector)
- ~~Store `selectedTimeUTC` and send `startTimeUTC` with booking~~ DONE (F06)
- ~~Use UTC timestamp for ICS generation on confirmation~~ DONE (F06)

### R4: Minimum Notice Period

> **Status: DONE (implemented in F03).**

- Read from availability rules (F03) or default to 24 hours
- When generating slots, exclude any slot where `slotStartTime - now < minNoticePeriod`
- Example: If min notice is 24h and it's Monday 3pm, earliest bookable slot is Tuesday 3pm

### R5: Maximum Advance Booking

> **Status: DONE (implemented in F03).**

- Read from availability rules (F03) or default to 60 days
- When generating slots, exclude dates beyond `today + maxAdvanceDays`
- Frontend: disable navigation to weeks beyond the max advance date
- Show message: "Bookings available up to [date]"

### R6: Slot Duration from Event Type

> **Status: DONE (F02 slot duration + F06 dynamic intervals).** `calculateAvailability()` uses `eventType.duration` for slot length. Slot start intervals now use `Math.min(duration, 30)` — 15-minute events get 15-minute intervals, 30+ minute events keep the standard 30-minute grid.

- ~~Currently hardcoded to 30-minute intervals~~ Fixed in F06
- Use event type's `duration` field to determine slot length
- E.g., 15-minute event type shows more slots; 60-minute shows fewer
- Slots start at regular intervals (every 15 or 30 min) depending on duration

### R7: Real-Time Availability (Stretch)

> **Status: DONE (F06 — practical approach).** Optimistic conflict handling implemented. Periodic polling was intentionally not implemented (marginal benefit vs cost).

- ~~When a booker is viewing slots, periodically refresh availability (e.g., every 30 seconds)~~ Not implemented (cost vs benefit)
- Use optimistic UI — if booking fails due to conflict, refresh slots and show error: DONE
  - Frontend detects HTTP 409 conflict responses specifically
  - Shows targeted error: "This slot was just booked. Please select another time."
  - Auto-invalidates availability cache and navigates user back to time selection
- The conflict check at booking creation (R1) is the safety net here: DONE

---

## Security Notes

F06 added several input validation and sanitization measures:

| Validation | Location | Behavior |
|---|---|---|
| Timezone query param | `GET /api/public/availability/:slug` | `isValidTimezone()` check; HTTP 400 if invalid IANA string |
| Date query param | `GET /api/public/availability/:slug` | `isNaN(date.getTime())` check; HTTP 400 if unparseable |
| `startTimeUTC` body param | `POST /api/public/book` | Parsed and validated: must be a valid date, not in the past, within 365-day window |
| Guest timezone on booking | `POST /api/public/book` | Sanitized via `isValidTimezone()` before DB storage; falls back to `"UTC"` |
| `isValidTimezone()` | `server/calendar-service.ts` | Rejects SQL injection, XSS payloads, and arbitrary strings — only valid IANA identifiers pass |

---

## Known Pre-existing Issues

1. **TOCTOU race condition on booking creation.** The double-booking check in `POST /api/public/book` reads existing bookings and then creates a new one in separate operations. Two concurrent requests for the same slot could both pass the conflict check. Mitigation: the HTTP 409 conflict response and frontend retry flow reduce the practical impact, but a database-level unique constraint or transaction-based lock would eliminate the race entirely.

2. **`postMessage` wildcard origin.** The frontend uses `window.opener.postMessage(...)` with a `"*"` target origin during the Google OAuth callback flow. This allows any window to receive the message. A production deployment should restrict the target origin to the application's own domain.

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/calendar-service.ts` | Added `isValidTimezone()`, `wallClockToUTC()`, `formatTimeInTimezone()`, `getUTCDateParts()`; updated `calculateAvailability()` with `guestTimezone` param, timezone-aware slot generation, `utc` field in response, dynamic `slotInterval` via `Math.min(duration, 30)` |
| `server/routes.ts` | Availability endpoint: added `timezone` and `date` query param validation (HTTP 400). Booking endpoint: added `startTimeUTC` body param handling, date/past/future validation, timezone sanitization via `isValidTimezone()` |
| `client/src/pages/book.tsx` | Added `utc` to `TimeSlot` interface, `selectedTimeUTC` state, `startTimeUTC` in booking request body, HTTP 409 conflict detection with auto-refresh and step navigation, UTC-based ICS generation on confirmation page |
| `server/__tests__/f06-date-time-selection.test.ts` | New file: 21 tests covering timezone conversion, dynamic intervals, conflict detection, buffer enforcement, edge cases, and response shape validation |

---

## Acceptance Criteria

- [x] Slots occupied by existing bookings show as unavailable (F02)
- [x] Double-booking is prevented at both display time and creation time (F02)
- [x] Buffer before/after times from event type are respected in slot generation (F02)
- [x] Booker's timezone is detected and displayed on the booking page (F05)
- [x] Time slots are shown in the booker's local timezone (F06 server-side conversion)
- [x] Minimum notice period prevents booking too close to current time (F03)
- [x] Maximum advance period prevents booking too far in the future (F03)
- [x] Event type duration determines slot length (not hardcoded 30 min) (F02 + F06 dynamic intervals)
- [x] If a booking fails due to timing conflict, a clear error is shown (F06 optimistic conflict handling)
- [x] If no slots are available on a date, a helpful message is shown

---

## Dependencies & Implications for Downstream Features

F06's implementation provides infrastructure that downstream features can build on:

- **F07 (Notifications & Reminders):** The `utc` field on every slot and `startTimeUTC` on bookings gives downstream notification systems precise UTC timestamps. The validated `guestTimezone` stored on each booking enables timezone-aware email/SMS formatting (e.g., "Your meeting is at 2:00 PM EST").

- **F09 (Team Scheduling):** The timezone-aware availability engine already separates host timezone (for working-hour interpretation) from guest timezone (for display). Team scheduling can reuse this pattern — each team member's host timezone is resolved independently, and the guest still sees slots in their own timezone.

- **F11 (Analytics & Reporting):** All bookings now carry validated UTC timestamps and guest timezones. Reports can accurately aggregate across time zones and display metrics in any timezone.

- **F12 (Recurring Events):** UTC-based slot timestamps and the `wallClockToUTC()` helper make it straightforward to generate recurring series that correctly account for DST transitions across the host's timezone.

- **F13 (Internationalization):** `formatTimeInTimezone()` already uses `Intl.DateTimeFormat` with configurable locale. Extending to non-English locales requires only changing the locale parameter from `"en-US"` to the user's preferred locale.

---

## Notes

- All F06 requirements are complete. R3 (timezone conversion), R6 (dynamic intervals), and R7 (optimistic conflict handling) are done.
- Timezone handling uses only native `Intl` APIs — no external library (e.g., `date-fns-tz`) was needed.
- The `wallClockToUTC()` helper correctly handles DST transitions by computing the UTC offset via `Intl.DateTimeFormat.formatToParts()`.
- F02 established the core availability engine. F03 added configurable rules. F05 built the frontend timezone UX. F06 closed the loop with server-side conversion and hardening.
