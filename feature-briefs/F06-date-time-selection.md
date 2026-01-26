# F06: Date & Time Selection Improvements

**Priority:** Critical
**Estimated Scope:** Medium
**Dependencies:** F02 (Calendar Connection for real availability), F03 (Availability Rules)

---

## Impact from F01 Implementation

- **No direct dependency on F01**. This feature is primarily about availability calculation and slot management.
- **User authentication is in place** — authenticated endpoints for host-side configuration are ready.

---

## Current State

The availability and time selection system is minimal:

- **Availability API:** `GET /api/public/availability/:slug` generates hardcoded 9am-5pm, 30-minute interval slots (`server/routes.ts:343-378`)
- **All slots return `available: true`** — no checking against existing bookings or calendar events
- **Past time filtering:** Slots before current time are excluded (`server/routes.ts:363-366`)
- **Frontend:** Week-view calendar + time slot grid (`client/src/pages/book.tsx:288-382`)
- **No timezone handling:** Server uses `Intl.DateTimeFormat().resolvedOptions().timeZone` (server timezone), not booker's timezone
- **No buffer enforcement:** Buffer before/after fields exist on event types but are ignored in slot generation
- **No double-booking prevention:** Multiple bookers can select and confirm the same time slot
- **No minimum notice period:** Can book any future time within the same day
- **No maximum advance booking:** Can book arbitrarily far into the future

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

- This feature can be partially implemented without F02 and F03. At minimum, double-booking prevention and buffer enforcement should be done using CalendAI's own booking data.
- With F02 complete, also check Google Calendar events for conflicts.
- With F03 complete, use stored availability rules instead of hardcoded hours.
- Timezone handling is subtle — use a library like `date-fns-tz` or handle conversions carefully with native `Intl` APIs.
