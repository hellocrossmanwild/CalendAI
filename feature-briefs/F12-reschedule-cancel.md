# F12: Reschedule & Cancel

**Priority:** High
**Estimated Scope:** Medium-Large
**Dependencies:** F06 (availability for rescheduling), F09 (email notifications with reschedule/cancel links), F02 (calendar event updates)

---

## Impact from F01 Implementation

- **Token-based access pattern established by F01** — F01 created three token tables (`password_reset_tokens`, `magic_link_tokens`, `email_verification_tokens`) using a consistent pattern: generate token → store with expiry → verify → mark used. **R1 (Booking Tokens)** can follow the exact same pattern for `rescheduleToken` and `cancelToken`.
- **`generateToken()` utility available** — `crypto.randomBytes(32).toString("hex")` in `server/routes.ts` can be reused or extracted into a shared utility.
- **`sendEmail()` stub ready** — notification emails for reschedule/cancel (R2–R4) can use the existing stub, which F09 will later replace with real delivery.
- **Storage pattern for token CRUD** — `createToken()`, `getToken()`, `markTokenUsed()` methods in `server/storage.ts` demonstrate the pattern for booking token management.

---

## Current State

Cancellation is minimal and reschedule is absent:

- **Host cancel:** `DELETE /api/bookings/:id` sets booking status to "cancelled" (`server/routes.ts:193-206`, `server/storage.ts:197-199`)
- **Frontend:** Cancel button with confirmation dialog on bookings page (`client/src/pages/bookings.tsx`)
- **No booker-facing cancel** — bookers have no way to cancel their own booking
- **No reschedule at all** — no endpoint, UI, or flow for rescheduling
- **No notification** — cancellation doesn't notify anyone
- **No reschedule/cancel tokens** — no links for bookers to manage bookings
- **No cancellation reason** — reason is not captured
- **No minimum notice** — can cancel at any time

### What's Missing vs PRD

1. **Booker reschedule flow** — public page where booker can pick a new time
2. **Booker cancel flow** — public page where booker can cancel with optional reason
3. **Reschedule/cancel links** — unique tokens in confirmation emails
4. **Host reschedule** — host can reschedule from dashboard
5. **Minimum notice period** — configurable cancellation/reschedule deadline
6. **Notification to both parties** — emails on reschedule and cancel
7. **Calendar event updates** — update/remove Google Calendar events
8. **Cancellation reason** — optional field

---

## Requirements

### R1: Booking Tokens for Booker Access

Add to bookings table (also covered in F09):
```typescript
rescheduleToken: text("reschedule_token"),
cancelToken: text("cancel_token"),
```

- Generate unique tokens (UUID v4) on booking creation
- These allow unauthenticated access to manage a specific booking
- Tokens should be included in confirmation emails

### R2: Public Cancel Page

Create `client/src/pages/cancel-booking.tsx` at route `/booking/cancel/:token`:

**Flow:**
1. Load booking data using cancel token: `GET /api/public/booking/cancel/:token`
2. Display booking details: date, time, event type, host name
3. Show optional "Reason for cancellation" textarea
4. "Confirm Cancellation" button
5. Minimum notice warning: if within notice period, show warning but still allow
6. On confirm: `POST /api/public/booking/cancel/:token` with optional reason
7. Show confirmation: "Your booking has been cancelled"

**Backend:**
```
GET  /api/public/booking/cancel/:token  → Returns booking info (limited fields)
POST /api/public/booking/cancel/:token  → { reason?: string } → Cancels booking
```

**Cancellation logic:**
1. Verify token and find booking
2. Check booking isn't already cancelled
3. Set status to "cancelled"
4. Store cancellation reason
5. Free up the time slot (availability returns to pool)
6. Send notification email to host (async)
7. Send confirmation email to booker (async)
8. Remove/cancel Google Calendar event if created (F02)

### R3: Public Reschedule Page

Create `client/src/pages/reschedule-booking.tsx` at route `/booking/reschedule/:token`:

**Flow:**
1. Load booking data using reschedule token: `GET /api/public/booking/reschedule/:token`
2. Display current booking details
3. Show calendar + time picker (reuse components from booking page)
4. Booker selects new date/time
5. "Confirm Reschedule" button
6. On confirm: `POST /api/public/booking/reschedule/:token` with new date/time
7. Show confirmation: "Your booking has been rescheduled to {new date/time}"

**Backend:**
```
GET  /api/public/booking/reschedule/:token          → Returns booking + event type info
GET  /api/public/booking/reschedule/:token/availability?date=... → Available slots
POST /api/public/booking/reschedule/:token          → { date, time } → Reschedules
```

**Reschedule logic:**
1. Verify token and find booking
2. Check new time is available (same availability logic as F06)
3. Prevent rescheduling to the same time
4. Update booking's `startTime` and `endTime`
5. Send notification emails to both parties (async)
6. Update Google Calendar event if created (F02)

### R4: Host Reschedule from Dashboard

Add reschedule option to booking management:
- "Reschedule" button in booking dropdown menu and detail page
- Opens a modal/dialog with calendar + time picker
- Uses the same availability logic
- Sends different emails (host-initiated reschedule vs booker-initiated)

Host-initiated reschedule email to booker:
```
Subject: Your booking with {Host Name} has been rescheduled

Hi {Guest Name},

{Host Name} has rescheduled your {Event Type} from {Old Date/Time} to {New Date/Time}.

New Details:
Date: {New Date}
Time: {New Time} ({Timezone})
Location: {Meeting Link}

If this doesn't work for you:
[Reschedule to a different time] | [Cancel booking]
```

### R5: Cancellation Reason

- Add `cancellationReason` text field to bookings table
- Capture on both booker cancel (optional textarea) and host cancel (optional in dialog)
- Display reason on booking detail page
- Include reason in notification emails

### R6: Minimum Notice Period Enforcement

- Read notice period from availability rules (F03) or default to 24 hours
- When reschedule/cancel is within notice period:
  - Show warning: "This booking is within the minimum notice period of {X hours}"
  - Allow anyway (soft enforcement) — don't block the action
  - Include note in notification email to other party

### R7: Edge Cases

- **Cancel already cancelled booking** → Show "This booking has already been cancelled"
- **Reschedule to same time** → Show error "Please select a different time"
- **No availability for reschedule** → Show message "No available times found. You can cancel this booking instead."
- **Reschedule past booking** → Show "This booking has already passed"
- **Invalid/expired token** → Show "This link is no longer valid"

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/pages/cancel-booking.tsx` | Public cancel page for bookers |
| `client/src/pages/reschedule-booking.tsx` | Public reschedule page for bookers |

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `rescheduleToken`, `cancelToken`, `cancellationReason` to bookings |
| `server/routes.ts` | Add public cancel/reschedule endpoints; update booking creation to generate tokens |
| `server/storage.ts` | Add `getBookingByToken()`, `rescheduleBooking()` methods |
| `client/src/App.tsx` | Add routes for `/booking/cancel/:token` and `/booking/reschedule/:token` |
| `client/src/pages/bookings.tsx` | Add "Reschedule" option to booking dropdown |
| `client/src/pages/booking-detail.tsx` | Add reschedule button, show cancellation reason |

---

## Database Changes

```sql
ALTER TABLE bookings ADD COLUMN reschedule_token TEXT;
ALTER TABLE bookings ADD COLUMN cancel_token TEXT;
ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT;
```

---

## Acceptance Criteria

- [ ] Unique reschedule and cancel tokens generated for each booking
- [ ] Booker can cancel via public cancel page using token link
- [ ] Optional cancellation reason is captured and stored
- [ ] Booker can reschedule via public reschedule page using token link
- [ ] Reschedule page shows available times using real availability logic
- [ ] Host can reschedule from the dashboard via modal
- [ ] Both parties are notified by email on reschedule and cancel (requires F09)
- [ ] Google Calendar events are updated/removed on reschedule/cancel (requires F02)
- [ ] Minimum notice period warning is shown when applicable
- [ ] Cancelled booking's time slot becomes available again
- [ ] Edge cases handled: already cancelled, same time, past booking, invalid token

---

## Notes

- The token-based access pattern is similar to how most booking platforms handle it (Calendly sends unique links in emails).
- Reschedule/cancel pages should be styled consistently with the booking page but don't require authentication.
- If F09 (email) is not yet complete, the tokens can still be generated and the pages can still work — just without email delivery of the links. You could show the links on the confirmation page instead.
- Consider adding a simple audit log of reschedule/cancel actions for the host to see in the booking detail.
