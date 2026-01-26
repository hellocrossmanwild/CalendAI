# F06: Date & Time Selection Improvements

**Priority:** Critical
**Estimated Scope:** Medium
**Dependencies:** F02 (Calendar Connection for real availability) — **SATISFIED**, F03 (Availability Rules) — **SATISFIED**

---

## Impact from F01 Implementation

- **No direct dependency on F01**. This feature is primarily about availability calculation and slot management.
- **User authentication is in place** — authenticated endpoints for host-side configuration are ready.

### Impact from F02 Implementation

F02 has satisfied several of F06's requirements. Here is what is now done:

- **R1 (Double-Booking Prevention): DONE** — `calculateAvailability()` checks both Google Calendar events and CalendAI bookings. Write-time prevention added to `POST /api/public/book` returns HTTP 409 on conflict. `getBookingsByDateRange()` storage method exists.
- **R2 (Buffer Time Enforcement): DONE** — `calculateAvailability()` applies `bufferBefore` (subtracts from slot start) and `bufferAfter` (adds to slot end) from event type configuration.
- **R6 (Slot Duration from Event Type): DONE** — `calculateAvailability()` uses `eventType.duration` for slot length, not hardcoded 30 minutes. Slot intervals are still 30 minutes.
- **Calendar integration: DONE** — `getCalendarEvents()` fetches Google Calendar events for conflict checking.
- **Client timezone accepted** — `POST /api/public/book` now accepts `timezone` from request body instead of using server timezone.

### Impact from F03 Implementation

F03 has implemented availability rules, satisfying the F03 dependency:

- **R4 (Minimum Notice Period): DONE** — `calculateAvailability()` now reads `minNotice` from the host's `availability_rules` and skips slots within the notice period. Default is 1440 minutes (24 hours).
- **R5 (Maximum Advance Booking): DONE** — `calculateAvailability()` now reads `maxAdvance` from `availability_rules` and returns empty slots for dates beyond the limit. Default is 60 days.
- **Host timezone stored** — `availability_rules.timezone` is now stored per user. Can be used for host/booker timezone conversion.
- **Configurable working hours** — `calculateAvailability()` now uses stored weekly hours instead of hardcoded 9-5, supporting multiple blocks per day and disabled days.

### Impact from F05 Implementation

F05 has implemented the **frontend portion** of timezone handling, partially satisfying R3:

- **Timezone auto-detection implemented** — `Intl.DateTimeFormat().resolvedOptions().timeZone` detects the booker's timezone on page load in `client/src/pages/book.tsx`.
- **Timezone selector UI implemented** — dropdown with 31 common timezones displayed on calendar and time steps.
- **Timezone sent with booking request** — `guestTimezone` field added to `bookings` table in `shared/schema.ts` and stored on booking creation.
- **Timezone passed to availability API** — the frontend sends the selected timezone when fetching availability slots, but the server does not yet use it for slot conversion.
- **What F05 did NOT do:** Server-side timezone conversion. The availability endpoint still generates slots in server/host timezone. Slots are not adjusted to the booker's selected timezone. The timezone selector triggers a re-fetch, but returned slots remain in host timezone.

**What remains for F06:**
- **R3 (Timezone Handling) — server-side only:** The availability endpoint needs to accept the `timezone` query param and convert slot times between host and booker timezones. The frontend work (detection, selector, display, sending timezone) is done by F05.
- **R7 (Real-Time Availability):** Periodic refresh or optimistic UI not yet implemented.
- ~~**Frontend updates:** Timezone detection/display on booking page.~~ **DONE by F05.**

---

## Current State

The availability and time selection system has been significantly improved by F02:

- **Availability API:** `GET /api/public/availability/:slug` now calls `calculateAvailability()` from `server/calendar-service.ts`, which checks Google Calendar events and CalendAI bookings against 9am-5pm working hours with buffer support
- **Slots reflect real availability** — busy periods from Google Calendar and existing CalendAI bookings are excluded
- **Buffer enforcement:** `bufferBefore` and `bufferAfter` from event types are applied when checking for conflicts
- **Double-booking prevention at write time:** `POST /api/public/book` checks for conflicts before creating a booking (HTTP 409 on conflict)
- **Past time filtering:** Slots before current time are excluded
- **Client timezone:** `POST /api/public/book` accepts `timezone` from request body (no longer uses server timezone)
- **Frontend:** Week-view calendar + time slot grid (`client/src/pages/book.tsx`)
- **No timezone conversion:** Availability still generated in server timezone, not booker's timezone
- **No minimum notice period:** Can still book any future time within the same day
- **No maximum advance booking:** Can still book arbitrarily far into the future

### What's Missing vs PRD

1. **Double-booking prevention** — ~~check existing bookings before showing slot as available~~ DONE (F02)
2. **Buffer time enforcement** — ~~apply `bufferBefore` and `bufferAfter` from event type~~ DONE (F02)
3. **Timezone detection/display** — ~~show times in booker's timezone~~ Frontend DONE (F05). Selector and display implemented.
4. **Timezone conversion** — convert between booker timezone and host timezone (server-side, still needed)
5. **Minimum notice period** — ~~configurable (default 24 hours)~~ DONE (F03)
6. **Maximum advance booking** — ~~configurable limit~~ DONE (F03)
7. **Real-time availability** — handle race conditions when two bookers view the same slot
8. **Calendar integration** — ~~check Google Calendar events (dependent on F02)~~ DONE (F02)

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

> **Frontend: DONE (implemented in F05).** Timezone auto-detection via `Intl` API, selector dropdown with 31 timezones, timezone display on calendar/time steps, timezone sent with booking request, and `guestTimezone` stored on booking record. **Backend: NOT YET DONE.** Server-side slot conversion remains.

**Backend (remaining work):**
- Accept `timezone` query parameter on availability endpoint: `GET /api/public/availability/:slug?date=...&timezone=America/New_York`
- Generate slots in the host's timezone (from availability rules or default)
- Return slots with UTC timestamps and formatted display times in the booker's timezone
- Update response format:
  ```json
  {
    "time": "2:00 PM",
    "available": true,
    "utc": "2026-01-26T19:00:00Z"
  }
  ```

**Frontend (`client/src/pages/book.tsx`) — DONE by F05:**
- ~~Detect booker's timezone on page load: `Intl.DateTimeFormat().resolvedOptions().timeZone`~~ DONE
- ~~Pass timezone to availability API~~ DONE
- ~~Display: "Times shown in Eastern Time (ET)" below the time grid~~ DONE
- ~~Optionally allow timezone override (dropdown)~~ DONE (31 timezone selector)

### R4: Minimum Notice Period

- Read from availability rules (F03) or default to 24 hours
- When generating slots, exclude any slot where `slotStartTime - now < minNoticePeriod`
- Example: If min notice is 24h and it's Monday 3pm, earliest bookable slot is Tuesday 3pm

### R5: Maximum Advance Booking

- Read from availability rules (F03) or default to 60 days
- When generating slots, exclude dates beyond `today + maxAdvanceDays`
- Frontend: disable navigation to weeks beyond the max advance date
- Show message: "Bookings available up to [date]"

### R6: Slot Duration from Event Type

> **Status: PARTIALLY DONE (implemented in F02).** `calculateAvailability()` uses `eventType.duration` for slot length. Slot start intervals are still fixed at 30 minutes (`SLOT_INTERVAL_MINUTES = 30` in `calendar-service.ts`). May need adjustment for 15-minute event types.

- Currently hardcoded to 30-minute intervals
- Use event type's `duration` field to determine slot length
- E.g., 15-minute event type shows more slots; 60-minute shows fewer
- Slots should start at regular intervals (every 15 or 30 min) regardless of duration

### R7: Real-Time Availability (Stretch)

- When a booker is viewing slots, periodically refresh availability (e.g., every 30 seconds)
- Or: use optimistic UI — if booking fails due to conflict, refresh slots and show error
- The conflict check at booking creation (R1) is the safety net here

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` | Rewrite availability endpoint with real logic; add conflict check to booking endpoint |
| `server/storage.ts` | Add `getBookingsByUserAndDateRange()` method |
| `client/src/pages/book.tsx` | Add timezone detection/display, timezone parameter to API calls, disable dates beyond max advance |

---

## Acceptance Criteria

- [x] Slots occupied by existing bookings show as unavailable (F02)
- [x] Double-booking is prevented at both display time and creation time (F02)
- [x] Buffer before/after times from event type are respected in slot generation (F02)
- [x] Booker's timezone is detected and displayed on the booking page (F05)
- [ ] Time slots are shown in the booker's local timezone (server-side conversion needed)
- [x] Minimum notice period prevents booking too close to current time (F03)
- [x] Maximum advance period prevents booking too far in the future (F03)
- [x] Event type duration determines slot length (not hardcoded 30 min) (F02)
- [ ] If a booking fails due to timing conflict, a clear error is shown
- [ ] If no slots are available on a date, a helpful message is shown

---

## Notes

- F02 is now complete. Double-booking prevention, buffer enforcement, slot duration, and calendar integration are done.
- Google Calendar event conflict checking is implemented in `calculateAvailability()`.
- With F03 complete, use stored availability rules instead of hardcoded hours.
- Timezone handling is subtle — use a library like `date-fns-tz` or handle conversions carefully with native `Intl` APIs.

---

## Dependencies & Implications from F05

- **F05 completed the frontend portion of R3 (Timezone Handling).** The booking page now auto-detects the booker's timezone, displays a timezone selector with 31 options, shows the selected timezone on calendar and time steps, and sends the timezone with the booking request. The `guestTimezone` field was added to the bookings schema.
- **F06's remaining R3 work is server-side only.** The availability endpoint (`GET /api/public/availability/:slug`) needs to accept a `timezone` query parameter and convert generated slots from the host's timezone to the booker's timezone. The frontend already sends this parameter.
- **F05's timezone selector triggers availability re-fetch.** When the booker changes their timezone in the selector, the frontend re-fetches slots. Once F06 implements server-side conversion, slots will automatically update to the correct timezone.
- **`guestTimezone` is stored on bookings.** F05 added this column to `shared/schema.ts` and stores it on booking creation. F06 or downstream features can use this field for timezone-aware communications and displays.
