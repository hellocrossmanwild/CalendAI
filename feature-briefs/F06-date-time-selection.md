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

**What remains for F06:**
- **R3 (Timezone Handling):** Full timezone conversion between host and booker timezones. Availability endpoint needs `timezone` query param. Display timezone on booking page.
- **R7 (Real-Time Availability):** Periodic refresh or optimistic UI not yet implemented.
- **Frontend updates:** Timezone detection/display on booking page.

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

1. **Double-booking prevention** — check existing bookings before showing slot as available
2. **Buffer time enforcement** — apply `bufferBefore` and `bufferAfter` from event type
3. **Timezone detection/display** — show times in booker's timezone
4. **Timezone conversion** — convert between booker timezone and host timezone
5. **Minimum notice period** — configurable (default 24 hours)
6. **Maximum advance booking** — configurable limit
7. **Real-time availability** — handle race conditions when two bookers view the same slot
8. **Calendar integration** — check Google Calendar events (dependent on F02)

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

**Backend:**
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

**Frontend (`client/src/pages/book.tsx`):**
- Detect booker's timezone on page load: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Pass timezone to availability API
- Display: "Times shown in Eastern Time (ET)" below the time grid
- Optionally allow timezone override (dropdown)

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

- [ ] Slots occupied by existing bookings show as unavailable
- [ ] Double-booking is prevented at both display time and creation time
- [ ] Buffer before/after times from event type are respected in slot generation
- [ ] Booker's timezone is detected and displayed on the booking page
- [ ] Time slots are shown in the booker's local timezone
- [ ] Minimum notice period prevents booking too close to current time
- [ ] Maximum advance period prevents booking too far in the future
- [ ] Event type duration determines slot length (not hardcoded 30 min)
- [ ] If a booking fails due to timing conflict, a clear error is shown
- [ ] If no slots are available on a date, a helpful message is shown

---

## Notes

- F02 is now complete. Double-booking prevention, buffer enforcement, slot duration, and calendar integration are done.
- Google Calendar event conflict checking is implemented in `calculateAvailability()`.
- With F03 complete, use stored availability rules instead of hardcoded hours.
- Timezone handling is subtle — use a library like `date-fns-tz` or handle conversions carefully with native `Intl` APIs.
