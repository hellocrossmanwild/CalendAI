# F02: Calendar Connection

**Priority:** Critical
**Estimated Scope:** Large
**Status:** IMPLEMENTED
**Dependencies:** F01 (user must be authenticated) — **SATISFIED**

---

## Impact from F01 Implementation

- **F01 dependency is satisfied** — user authentication is fully implemented with email-based login, Google OAuth, magic links, and session management.
- **Google OAuth infrastructure exists** — F01 implemented Google OAuth for user login (`GET /api/auth/google` + callback). The same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars can be shared for Calendar OAuth. However, Calendar OAuth needs **separate scopes** (`calendar.readonly`, `calendar.events`) and a **separate redirect URI**, so a distinct OAuth flow is needed.
- **`updateUser()` method available** — added in F01, can be used to store calendar-related user preferences.
- **Token management patterns** — F01 established token generation (`crypto.randomBytes`) and database storage patterns that can inform calendar token refresh logic.

---

## Current State

Calendar integration is entirely stubbed:

- **Connect endpoint:** `GET /api/calendar/connect` creates a placeholder token with `"placeholder_token"` — no real OAuth flow (`server/routes.ts:292-307`)
- **Status endpoint:** `GET /api/calendar/status` checks if a token record exists (`server/routes.ts:280-290`)
- **Disconnect endpoint:** `DELETE /api/calendar/disconnect` deletes the token record (`server/routes.ts:309-316`)
- **DB schema:** `calendar_tokens` table with `accessToken`, `refreshToken`, `expiresAt`, `calendarId` fields (`shared/schema.ts:97-106`)
- **Storage:** `upsertCalendarToken()` and `deleteCalendarToken()` methods exist (`server/storage.ts:259-279`)
- **Frontend:** Settings page shows connect/disconnect UI (`client/src/pages/settings.tsx:111-168`)
- **Availability endpoint:** `GET /api/public/availability/:slug` generates hardcoded 9am-5pm, 30-min slots with no calendar awareness (`server/routes.ts:343-378`)
- **Booking creation:** `POST /api/public/book` saves booking to DB but does NOT create a Google Calendar event (`server/routes.ts:381-437`)

### What's Missing vs PRD

1. **Real Google Calendar OAuth flow** — redirect to Google, handle callback, store real tokens
2. **Read access** — fetch existing events to determine real availability
3. **Write access** — create calendar events when bookings are made
4. **Token refresh** — handle expired access tokens using refresh token
5. **Multiple calendar support** — let user choose which calendars to check
6. **Real availability calculation** — check existing events, apply buffers, prevent double-booking

---

## Requirements

### R1: Google Calendar OAuth Flow

- Add `GET /api/calendar/auth` — generates Google OAuth URL with calendar scopes and redirects user
- Add `GET /api/calendar/callback` — handles OAuth callback, exchanges code for tokens, stores in `calendar_tokens`
- Scopes needed: `https://www.googleapis.com/auth/calendar.readonly`, `https://www.googleapis.com/auth/calendar.events`
- Store `accessToken`, `refreshToken`, `expiresAt` in database
- Frontend: "Connect Google Calendar" button should open the OAuth flow (redirect or popup)
- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (can share with F01 Google OAuth), `GOOGLE_CALENDAR_REDIRECT_URI`

### R2: Token Management

- Before any Calendar API call, check if `accessToken` is expired
- If expired, use `refreshToken` to obtain new access token via Google OAuth
- Update stored tokens on refresh
- If refresh fails (token revoked), mark calendar as disconnected and notify user
- Create a helper: `getValidCalendarClient(userId)` that returns an authenticated Google Calendar API client

### R3: Read Existing Events (Availability Calculation)

- Create `server/calendar-service.ts` with functions:
  - `getCalendarEvents(userId, startDate, endDate)` — fetches events from Google Calendar
  - `calculateAvailability(userId, eventTypeId, date)` — returns available time slots
- Availability logic:
  1. Fetch events for the requested date from Google Calendar
  2. Fetch existing CalendAI bookings for that date (to prevent double-booking)
  3. Apply host's configured working hours (default 9am-5pm for now)
  4. Apply buffer times from the event type (`bufferBefore`, `bufferAfter`)
  5. Remove slots that overlap with existing events or bookings
  6. Return available slots
- Update `GET /api/public/availability/:slug` to use real availability calculation
- If calendar is not connected, fall back to checking only CalendAI bookings against default hours

### R4: Write Events on Booking

- When a booking is created via `POST /api/public/book`:
  1. Create a Google Calendar event on the host's calendar
  2. Include guest as an attendee (sends Google Calendar invite to guest email)
  3. Set event title: `"{Event Type Name} - {Guest Name}"`
  4. Set event description with booking summary, lead info, and CalendAI dashboard link
  5. Set location to Google Meet (auto-generate meet link) or configured location
  6. Store the `calendarEventId` on the booking record
- If calendar is not connected, skip calendar event creation (booking still saved to DB)

### R5: Calendar Event Updates

- When a booking is cancelled (`DELETE /api/bookings/:id`):
  - Delete the Google Calendar event using stored `calendarEventId`
- When a booking is rescheduled (future feature F12):
  - Update the Google Calendar event with new date/time

### R6: Multiple Calendar Support (Stretch)

- After OAuth, fetch list of user's calendars via `calendarList.list()`
- Let user choose which calendars to check for conflicts (settings UI)
- Store selected calendar IDs in `calendar_tokens` or a new table
- Check all selected calendars when calculating availability

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/calendar-service.ts` | Google Calendar API client, event CRUD, availability calculation |

## Files to Modify

| File | Changes |
|------|---------|
| `server/routes.ts` | Replace stub calendar routes with real OAuth flow; update availability endpoint; add calendar event creation to booking endpoint |
| `server/storage.ts` | Add method to query bookings by userId + date range for double-booking prevention |
| `shared/schema.ts` | Possibly add `selectedCalendars` field to `calendar_tokens` |
| `client/src/pages/settings.tsx` | Update calendar connect flow to handle OAuth redirect/callback |

---

## API Changes

```
GET  /api/calendar/auth          → Redirects to Google OAuth consent
GET  /api/calendar/callback      → Handles OAuth callback, stores tokens
GET  /api/calendar/status        → Returns { connected, email, calendars[] }
DELETE /api/calendar/disconnect  → Revokes tokens, removes from DB

GET  /api/public/availability/:slug?date=YYYY-MM-DD  → Returns real available slots
POST /api/public/book            → Also creates Google Calendar event
```

---

## Acceptance Criteria

- [ ] User can connect Google Calendar through a real OAuth flow
- [ ] Access and refresh tokens are securely stored in database
- [ ] Expired tokens are automatically refreshed
- [ ] Availability endpoint returns slots that exclude times with existing calendar events
- [ ] Availability endpoint prevents double-booking (excludes existing CalendAI bookings)
- [ ] Buffer times from event type are applied when calculating availability
- [ ] Booking creation creates a Google Calendar event on the host's calendar
- [ ] Calendar event includes guest as attendee (guest receives Google invite)
- [ ] Booking cancellation removes the Google Calendar event
- [ ] If calendar not connected, availability falls back to default hours minus existing bookings
- [ ] User can disconnect calendar from settings

---

## Notes

- The `google-auth-library` package is already installed in `package.json`. You may also want to install `googleapis` for the Calendar API client.
- This is one of the most critical features — without it, the platform cannot accurately show availability or create real calendar events.
- Double-booking prevention is essential even without Google Calendar — always check existing CalendAI bookings for conflicts.
- Consider timezone handling carefully: Google Calendar events have timezone-aware timestamps.
