# F05: Booking Page Enhancements

**Priority:** Medium
**Estimated Scope:** Small-Medium
**Dependencies:** F04 (for branding fields), F02 (for embed widget)

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
