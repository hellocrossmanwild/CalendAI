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

## Current State — ~95% IMPLEMENTED

Most requirements (R1-R6) are implemented. R3 timezone detection is frontend-complete but server-side timezone conversion of slots is deferred to F06.

### What Was Built

1. **Host info display (R1)** — Public API `GET /api/public/event-types/:slug` expanded to include host `firstName`, `lastName`, `profileImageUrl` via a joined user query. Host avatar (with fallback initials) and name shown on booking page header.
2. **Full branding (R2)** — `primaryColor` and `secondaryColor` applied consistently across all five booking steps (calendar, time, info, chat, confirm) using CSS custom properties (`--brand-primary`, `--brand-secondary`). Buttons, selected states, badges, and accent elements all use brand colors. Falls back to default theme when no branding is configured.
3. **Timezone detection & selector (R3)** — Auto-detected via browser `Intl.DateTimeFormat().resolvedOptions().timeZone`. Timezone selector dropdown with 31 common timezones. Selected timezone sent with booking request. Timezone label displayed on calendar and time steps. **Note:** Server does not yet convert availability slots to the guest timezone (needs F06 R3 completion).
4. **Confirmation page fix (R5)** — Removed the false "A confirmation email has been sent" claim. Now shows truthful confirmation with full booking details (date, time, event type, host name). Messaging is accurate: no email claim until F09 implements real email delivery.
5. **ICS download & Google Calendar link (R5)** — `.ics` file generation with RFC 5545 compliance in `client/src/lib/ics.ts`. Google Calendar link generation. Both download button and "Add to Google Calendar" link on the confirmation page.
6. **Embeddable widget (R4)** — `client/public/widget.js` created (<5KB). iframe-based embed using `data-slug` attribute. `postMessage` API for iframe height auto-resize and `booking-confirmed` event. `MutationObserver` for SPA support (detects dynamically added widget containers).
7. **SEO meta tags (R6)** — Dynamic `document.title` and Open Graph tags (`og:title`, `og:description`) based on event type name and host name. Tags cleaned up on component unmount.

### Known Limitations

- **Timezone selector is display-only** — the server does not yet convert availability slots to the guest's timezone. The selector triggers a re-fetch but slots are not timezone-adjusted. Full server-side conversion requires F06 R3 completion.
- **ICS start time uses browser local timezone** — consistent with current server behavior (slots are generated in server timezone).
- **No client-side email validation** — deferred to F07 implementation.
- **Static UTC offset labels in timezone dropdown** — DST shifts are not reflected in the offset labels (e.g., always shows "EST (UTC-5)" even during EDT).
- **postMessage uses `"*"` origin** — standard practice for embeddable widgets; a stricter origin policy could be added in a future security pass.
- **guestTimezone column** — added to bookings schema and stored on booking creation, but not yet used by any downstream feature.

### Files Created
| File | Purpose |
|------|---------|
| `client/public/widget.js` | Embeddable booking widget script (<5KB, iframe-based) |
| `client/src/lib/ics.ts` | ICS file generation utility (RFC 5545 compliant) |
| `server/__tests__/f05-booking-enhancements.test.ts` | Tests for F05 booking enhancements |

### Files Modified
| File | Changes |
|------|---------|
| `client/src/pages/book.tsx` | Host info display, full branding via CSS custom properties, timezone detection/selector, fixed confirmation page, ICS download, Google Calendar link, SEO meta tags |
| `server/routes.ts` | Expanded `GET /api/public/event-types/:slug` to include host user data (firstName, lastName, profileImageUrl) |
| `server/storage.ts` | Added method to fetch event type with joined host user data |
| `shared/schema.ts` | Added `guestTimezone` field to bookings table |

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

- [x] Host name and photo are displayed on the booking page header
- [x] Event type branding (colors, logo) is applied to the booking page when configured
- [x] Booker's timezone is detected and displayed below date/time selection
- [x] Booker's timezone is stored on the booking record
- [x] Embeddable `widget.js` file exists and functions on external sites
- [x] Confirmation screen does not claim emails were sent unless email feature is live
- [x] Confirmation screen shows booking summary (date, time, host, event type)
- [x] "Add to Calendar" .ics download is available on confirmation
- [ ] Server-side timezone conversion of availability slots (deferred to F06)

---

## Notes

- The host info expansion should be careful not to expose sensitive user data (password hash, etc.) on the public endpoint.
- The widget script should be served with appropriate CORS headers.
- Timezone detection is client-side only; don't rely on IP-based geolocation.

---

## Implementation Status (~95% Complete)

**Implemented in branch:** `claude/review-codebase-f45-p2bRf`

### Architecture Decisions
- **CSS custom properties for branding** — `--brand-primary` and `--brand-secondary` set on the booking page container, allowing all child elements to reference brand colors without prop drilling
- **Timezone detection via Intl API** — no external library or IP geolocation; uses `Intl.DateTimeFormat().resolvedOptions().timeZone` for reliable browser-native detection
- **31 curated timezones in selector** — covers major global zones without overwhelming users; static UTC offset labels (DST not reflected in labels)
- **ICS generation is client-side** — `client/src/lib/ics.ts` generates RFC 5545 compliant files in the browser; no server round-trip needed
- **Widget uses iframe isolation** — `widget.js` creates an iframe pointing to `/book/{slug}`, communicating via `postMessage` for height updates and booking confirmations
- **MutationObserver in widget** — supports SPA environments where the widget container is added to the DOM after `widget.js` loads
- **Confirmation page is truthful** — removed false email claim; will be updated when F09 adds real email delivery
- **Host data joined at query time** — public event type endpoint joins the users table to include host info, filtering to only safe fields (firstName, lastName, profileImageUrl)

### Dependencies & Implications for Other Features

| Feature | Implication |
|---------|------------|
| **F06 (Date & Time Selection)** | F05 added timezone detection and a timezone selector on the frontend. The selector sends the timezone to the availability API, but the server does not yet convert slots to the guest timezone. F06 R3 must implement server-side timezone conversion to make the selector fully functional. |
| **F07 (Pre-Qualification)** | The chat step now uses branded colors from F05's CSS custom properties. F07 enhancements should maintain consistency with the branded styling. No client-side email validation was added (deferred to F07). |
| **F09 (Email Notifications)** | F05 removed the false "email sent" claim from the confirmation page. When F09 implements real email delivery, the confirmation page in `book.tsx` should be updated to restore an accurate email confirmation message. |
| **F12 (Reschedule & Cancel)** | The confirmation page now has a clean design showing booking details, ICS download, and Google Calendar link. This layout can accommodate reschedule/cancel action links once F12 is implemented. |
| **F13 (Settings)** | F05 applies `primaryColor` and `secondaryColor` from event types to the booking page. When F13 adds branding settings (R6), changes to brand colors will have immediate visible impact on public booking pages. |
