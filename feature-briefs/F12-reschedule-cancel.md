# F12: Reschedule & Cancel

**Priority:** High
**Estimated Scope:** Medium-Large
**Dependencies:** F06 (availability for rescheduling), F09 (email notifications with reschedule/cancel links), F02 (calendar event updates) — **SATISFIED**

---

## Impact from F01 Implementation

- **Token-based access pattern established by F01** — F01 created three token tables (`password_reset_tokens`, `magic_link_tokens`, `email_verification_tokens`) using a consistent pattern: generate token → store with expiry → verify → mark used. **R1 (Booking Tokens)** can follow the exact same pattern for `rescheduleToken` and `cancelToken`.
- **`generateToken()` utility available** — `crypto.randomBytes(32).toString("hex")` in `server/routes.ts` can be reused or extracted into a shared utility.
- **`sendEmail()` stub ready** — notification emails for reschedule/cancel (R2–R4) can use the existing stub, which F09 will later replace with real delivery.
- **Storage pattern for token CRUD** — `createToken()`, `getToken()`, `markTokenUsed()` methods in `server/storage.ts` demonstrate the pattern for booking token management.

### Impact from F05 Implementation

- **Confirmation page redesigned** — F05 replaced the misleading confirmation page with a clean design showing booking details (date, time, event type, host name), ICS file download, and Google Calendar link. This layout can accommodate reschedule/cancel action links once F12 is implemented.
- **Branding applied to booking page** — F05 applies `primaryColor` and `secondaryColor` consistently across all booking steps via CSS custom properties. The public cancel and reschedule pages (R2, R3) should use the same branded styling for visual consistency.
- **Host info available on public API** — F05 expanded `GET /api/public/event-types/:slug` to include host firstName, lastName, and profileImageUrl. The public reschedule and cancel pages can display host info without additional API changes.
- **`guestTimezone` stored on bookings** — F05 added this field. Reschedule and cancel pages can display times in the booker's original timezone.

### Impact from F02 Implementation

- **F02 dependency is satisfied** — Google Calendar event CRUD is fully implemented.
- **`deleteCalendarEvent()` available and wired in** — F02 already calls `deleteCalendarEvent()` in the `DELETE /api/bookings/:id` route when a booking has a `calendarEventId`. R2 (Public Cancel Page) can use the same function for booker-initiated cancellation.
- **`createCalendarEvent()` available for reschedule** — R3 (Reschedule) can implement reschedule as: delete old event + create new event with updated times, or future work could add an `updateCalendarEvent()` function.
- **`calculateAvailability()` available** — R3's reschedule flow needs to show available slots, which is already implemented via `calculateAvailability()` in `server/calendar-service.ts`.
- **`calendarEventId` stored on bookings** — F02 stores the Google Calendar event ID on the booking record, so reschedule/cancel operations can reference it.
- **Write-time double-booking prevention** — F02 added conflict checking at booking creation time (HTTP 409). Reschedule should use the same check before confirming the new time.

---

## Current State

Cancellation is minimal and reschedule is absent:

- **Host cancel:** `DELETE /api/bookings/:id` sets booking status to "cancelled" and deletes the Google Calendar event if one exists (`server/routes.ts`)
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
7. **Calendar event updates** — deletion is implemented (F02); reschedule updates (delete + recreate) still needed
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

- [x] Unique reschedule and cancel tokens generated for each booking
- [x] Booker can cancel via public cancel page using token link
- [x] Optional cancellation reason is captured and stored
- [x] Booker can reschedule via public reschedule page using token link
- [x] Reschedule page shows available times using real availability logic
- [x] Host can reschedule from the dashboard via modal
- [x] Both parties are notified by email on reschedule and cancel
- [x] Google Calendar events are updated/removed on reschedule/cancel
- [x] Minimum notice period warning is shown when applicable
- [x] Cancelled booking's time slot becomes available again
- [x] Edge cases handled: already cancelled, same time, past booking, invalid token

## Implementation Notes (Post-Implementation)

**Files Created:**
| File | Lines | Purpose |
|------|-------|---------|
| `client/src/pages/cancel-booking.tsx` | ~491 | Public cancel page with branded styling, reason textarea, edge case states |
| `client/src/pages/reschedule-booking.tsx` | ~791 | Public reschedule page with date/time picker, availability fetch, 409 handling |

**Files Modified:**
| File | Changes |
|------|---------|
| `shared/schema.ts` | Added `cancellationReason` text field to bookings table |
| `server/routes.ts` | Added POST cancel, POST reschedule, GET reschedule availability, POST host reschedule endpoints; enhanced GET cancel/reschedule with full event type + host data; updated DELETE to capture cancellationReason |
| `server/email-templates.ts` | Added 3 reschedule templates; enhanced `cancellationEmailToHost` with `withinNoticePeriod` |
| `client/src/App.tsx` | Added routes for `/booking/cancel/:token` and `/booking/reschedule/:token` |
| `client/src/pages/book.tsx` | Added reschedule/cancel links on confirmation page, stored booking response tokens |
| `client/src/pages/bookings.tsx` | Added reschedule modal, cancel reason dialog, reschedule mutation |
| `client/src/pages/booking-detail.tsx` | Added reschedule button + dialog, cancellation reason display |

**New API Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/public/booking/cancel/:token` | Public (token) | Booker cancels booking |
| POST | `/api/public/booking/reschedule/:token` | Public (token) | Booker reschedules booking |
| GET | `/api/public/booking/reschedule/:token/availability` | Public (token) | Available slots for reschedule |
| POST | `/api/bookings/:id/reschedule` | Authenticated | Host reschedules booking |

**Cross-Feature Integrations:**
- **F02 (Calendar):** Delete old + create new Google Calendar event on reschedule
- **F06 (Availability):** Reuses `calculateAvailability()` and `startTimeUTC` pattern, 409 conflict handling
- **F09 (Email):** 3 new reschedule email templates, enhanced cancellation template with notice period
- **F11 (Brief):** Meeting brief deleted on reschedule via `storage.deleteMeetingBrief()`

---

## Notes

- The token-based access pattern is similar to how most booking platforms handle it (Calendly sends unique links in emails).
- Reschedule/cancel pages should be styled consistently with the booking page but don't require authentication.
- If F09 (email) is not yet complete, the tokens can still be generated and the pages can still work — just without email delivery of the links. You could show the links on the confirmation page instead.
- Consider adding a simple audit log of reschedule/cancel actions for the host to see in the booking detail.

---

## Dependencies & Implications from F05

- **Confirmation page is ready for reschedule/cancel links.** F05 redesigned the confirmation page with a clean layout showing booking details, ICS download, and Google Calendar link. Reschedule and cancel links can be added to this page once F12 generates booking tokens. The existing layout has space for action buttons.
- **Branded styling available.** F05 applies CSS custom properties (`--brand-primary`, `--brand-secondary`) across all booking steps. The public cancel page (`/booking/cancel/:token`) and reschedule page (`/booking/reschedule/:token`) should use the same CSS custom property pattern for visual consistency with the booking page.
- **Host info already on public API.** F05 expanded the public event type endpoint to include host data. Cancel and reschedule pages can display host name and avatar without additional backend work.
- **`guestTimezone` available on booking records.** F05 stores the guest's timezone on the booking. Cancel/reschedule confirmation messages and emails can display times in the booker's timezone.

### Impact from F06 Implementation

- **The availability API now returns UTC timestamps and supports timezone conversion.** F06 enhanced `calculateAvailability()` with server-side timezone conversion using native `Intl.DateTimeFormat`. The availability response includes `utc` ISO timestamps alongside display times. The reschedule flow (R3) can reuse `calculateAvailability()` with the guest's timezone to show correctly localized available slots.
- **`startTimeUTC` in booking endpoint enables timezone-safe rescheduling.** F06 added a `startTimeUTC` parameter to the booking endpoint for unambiguous time handling. The reschedule endpoint (`POST /api/public/booking/reschedule/:token`) should accept `startTimeUTC` in the same way, ensuring rescheduled bookings are timezone-safe.
- **Booking endpoint validation pattern should be reused.** F06 added server-side validation for bookings: valid date, not in past, and within a 365-day window. The reschedule endpoint should apply the same validation rules to the new time slot.
- **409 conflict handling pattern (optimistic UI) from F06 should be reused for reschedule conflicts.** F06 established the HTTP 409 conflict response for double-booking prevention at write time. The reschedule flow should use the same pattern — attempt the reschedule optimistically and handle 409 responses gracefully in the UI (e.g., "This slot was just taken, please choose another time").
- **Dynamic slot intervals available.** F06 implemented `Math.min(duration, 30)` for slot interval calculation. The reschedule availability view will automatically benefit from this, showing appropriately spaced time slots based on event duration.

---

## Impact from F11 Implementation

- **When a booking is rescheduled, the existing meeting brief should be regenerated.** F11 added `force=true` support to `POST /api/bookings/:id/generate-brief` and a `deleteMeetingBrief(bookingId)` storage method. After rescheduling a booking, call the brief generation endpoint with `force=true` to generate a fresh brief with updated time context.
- **The brief scheduler will also detect rescheduled bookings.** If a rescheduled booking falls within the 1-2 hour window and doesn't have a brief, the scheduler will auto-generate one. However, if the original brief wasn't deleted, the scheduler won't regenerate it. F12 should explicitly delete or regenerate the brief during the reschedule flow.
- **Cancelled bookings are excluded from automatic brief generation.** The brief scheduler only queries `confirmed` status bookings, so cancelled bookings are never auto-briefed.
- **Brief read status (`readAt`) should be reset on reschedule.** If a brief is regenerated for a rescheduled booking, it will have a new `readAt: null`, correctly appearing as unread.
