# F05: Booking Page Enhancements

**Priority:** Medium
**Estimated Scope:** Small-Medium
**Dependencies:** F04 (for branding fields), F02 (for embed widget)

---

## Impact from F01 Implementation

- **Host profile data available** — F01's user model now includes `emailVerified` and the `/api/auth/user` endpoint excludes password hash. When R1 (Display Host Information) fetches host data for the booking page, the password field is already stripped from responses.
- **`updateUser()` method available** — useful when F13 adds `companyName` to the user model, which R1 needs to display on the booking page.
- **Profile image from Google OAuth** — users who sign in via Google have `profileImageUrl` set automatically, which can be displayed as the host photo on the booking page (R1).

### Impact from F02 Implementation

- **Real availability now shown** — F02 replaced the hardcoded 9am-5pm availability with `calculateAvailability()` that checks Google Calendar events and CalendAI bookings. The booking page already shows real available/unavailable slots.
- **Client timezone accepted** — F02 updated `POST /api/public/book` to accept `timezone` from the request body (`clientTimezone || "UTC"`). R3 (Timezone Detection & Display) can send the detected timezone with the booking request — the backend plumbing is ready.
- **Google Calendar events created on booking** — F02 creates a Google Calendar event with Google Meet link when a booking is confirmed. The confirmation screen (R5) can now accurately reference the calendar invite.
- **Double-booking prevented** — F02 added write-time conflict checking (HTTP 409), so the booking page should handle this error gracefully in R5.

### Impact from F04 Implementation

- **Branding fields now exist on `event_types`** — F04 added `logo`, `primaryColor`, `secondaryColor` columns. R2 (Apply Branding to Booking Page) has a minimal foundation already applied: logo replaces the calendar icon, `primaryColor` is applied to buttons and the duration badge. F05's R2 can build on this with full color scheme, background tints, and secondary color usage.
- **Location field available** — F04 added `location` to event types. The booking page can now display meeting location info (Google Meet, Zoom, phone, etc.) in the confirmation step or header.
- **Custom questions UI implemented** — The event type form now has a questions editor (F04 R3), so F07's pre-qual chat will receive properly configured questions.

---

## Current State

The public booking page at `/book/:slug` (`client/src/pages/book.tsx`) has:

- Multi-step booking wizard: calendar -> time -> info -> chat -> confirm
- Event type name, description, duration badge displayed
- Color-coded icon from event type color
- Theme toggle (dark/light mode)
- Week-view calendar navigation
- Time slot selection
- Guest info form (name, email, company, notes)
- File upload capability
- AI pre-qual chat step (if event has questions)
- Confirmation screen showing "Booking Confirmed!"

### What's Missing vs PRD

1. **Host name and photo** — not displayed anywhere on the booking page
2. **Full branding** — only event type color on the icon; no logo, brand colors applied to page
3. **Embeddable widget** — settings page references `widget.js` but no file exists
4. **Timezone display** — booker's timezone not detected or shown
5. **SEO metadata** — no meta tags, Open Graph, or structured data
6. **Misleading confirmation** — says "A confirmation email has been sent" but no email is sent

---

## Requirements

### R1: Display Host Information

- Fetch host user data along with event type on the public booking page
- Add a new API response or expand `GET /api/public/event-types/:slug` to include host info:
  ```json
  {
    ...eventType,
    "host": {
      "name": "Sarah Chen",
      "profileImageUrl": "/path/to/photo.jpg",
      "companyName": "GreenAudit Ltd"
    }
  }
  ```
- Display on booking page:
  - Host avatar/photo at the top
  - Host name (e.g., "Book a meeting with Sarah Chen")
  - Company name if available
- Requires joining `users` table when fetching public event type

### R2: Apply Branding to Booking Page

- If event type has `primaryColor`, `secondaryColor`, or `logo` fields (from F04):
  - Apply primary color to buttons, selected states, and accent elements
  - Display logo at the top of the page instead of the generic calendar icon
  - Apply secondary color to badges or highlights
- Use CSS custom properties to dynamically set brand colors:
  ```tsx
  <div style={{ '--brand-primary': eventType.primaryColor } as React.CSSProperties}>
  ```
- If no branding configured, fall back to default CalendAI theme

### R3: Timezone Detection & Display

- Detect booker's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Display timezone below the date/time selection: "Times shown in Pacific Time (PT)"
- Send booker's timezone with the booking request
- Store booker's timezone on the booking record
- Update `POST /api/public/book` to accept and store `guestTimezone`
- Add `guestTimezone` field to `bookings` table

### R4: Embeddable Widget

Create `public/widget.js` (or `client/public/widget.js`):

- Lightweight JavaScript file that can be embedded on external websites
- Reads `data-slug` attribute from the container div
- Creates an iframe or modal pointing to `/book/{slug}`
- Provides a "Book a Meeting" button that opens the booking page
- Minimal footprint (< 5KB)
- Example embed code:
  ```html
  <script src="https://calendai.com/widget.js"></script>
  <div id="calendai-widget" data-slug="discovery-call"></div>
  ```
- Widget should be responsive and work on mobile

### R5: Fix Confirmation Screen

- Remove the misleading "A confirmation email has been sent to {email}" text
- Replace with accurate messaging:
  - If email feature exists (F09): show email confirmation message
  - If not: show "Your booking is confirmed. Details have been saved." without email claim
- Add booking summary to confirmation: date, time, event type, host name
- Add "Add to Calendar" button (generates .ics file download)

### R6: SEO & Meta Tags (Stretch)

- Add dynamic meta tags for public booking pages
- Open Graph tags for social sharing:
  ```html
  <meta property="og:title" content="Book a Discovery Call with Sarah Chen" />
  <meta property="og:description" content="30-minute call to explore..." />
  ```
- This may require server-side rendering or a meta tag injection approach

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/public/widget.js` | Embeddable booking widget script |

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/pages/book.tsx` | Add host info display, branding, timezone detection, fix confirmation |
| `server/routes.ts` | Expand public event type endpoint to include host data |
| `server/storage.ts` | Add method to fetch event type with host user data |
| `shared/schema.ts` | Add `guestTimezone` to bookings table |

---

## Acceptance Criteria

- [ ] Host name and photo are displayed on the booking page header
- [ ] Event type branding (colors, logo) is applied to the booking page when configured
- [ ] Booker's timezone is detected and displayed below date/time selection
- [ ] Booker's timezone is stored on the booking record
- [ ] Embeddable `widget.js` file exists and functions on external sites
- [ ] Confirmation screen does not claim emails were sent unless email feature is live
- [ ] Confirmation screen shows booking summary (date, time, host, event type)
- [ ] "Add to Calendar" .ics download is available on confirmation

---

## Notes

- The host info expansion should be careful not to expose sensitive user data (password hash, etc.) on the public endpoint.
- The widget script should be served with appropriate CORS headers.
- Timezone detection is client-side only; don't rely on IP-based geolocation.
