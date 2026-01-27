# F09: Email Notifications & Booking Confirmation

**Priority:** Critical
**Estimated Scope:** Large
**Dependencies:** None (but enables F01 magic link/password reset, F11 brief delivery, F12 reschedule/cancel links)

---

## Impact from F01 Implementation

**F01 is now the most important consumer of F09.** Three F01 features are currently stubbed to `console.log`, waiting for real email delivery:

1. **Magic link authentication** (`POST /api/auth/magic-link`) — sends login link email
2. **Password reset** (`POST /api/auth/forgot-password`) — sends reset link email
3. **Email verification** (on registration + `POST /api/auth/resend-verification`) — sends verification email

### What F09 needs to wire up for F01:

The stub function is in `server/routes.ts`:
```typescript
function sendEmail(to: string, subject: string, body: string): void {
  console.log(`\n========== EMAIL (stub) ==========`);
  // ... logs to console
}
```

**F09 should:**
1. Create `server/email-service.ts` with a real `sendEmail()` function
2. Replace the stub in `server/routes.ts` with an import from the email service
3. The existing call sites already pass `to`, `subject`, and `body` — they just need real delivery

### Token infrastructure is ready:

F01 established a token-based verification pattern (generate token → store in DB → send link → verify token → mark used). This exact pattern can be reused for F09's booking tokens (R3: reschedule/cancel tokens in confirmation emails).

### Patterns to reuse from F01:
- `generateToken()` — `crypto.randomBytes(32).toString("hex")` in `server/routes.ts`
- Token table schema — `password_reset_tokens`, `magic_link_tokens`, `email_verification_tokens` in `shared/models/auth.ts`
- Expiry + used flag verification pattern

### Impact from F02 Implementation

- **Booking creation now creates calendar events** — F02's `POST /api/public/book` handler creates a Google Calendar event and stores `calendarEventId`. R4 (Send Confirmation Emails) should include the Google Meet link from the calendar event in the confirmation email to the booker.
- **Calendar invite sent automatically** — F02 adds the guest as an attendee on the Google Calendar event, which means Google itself sends a calendar invitation email. The booker confirmation email (R2) should reference this: "A calendar invite has also been sent to your email."
- **`sendEmail()` stub still in place** — F02 did not modify the email stub. F09 still needs to replace it with real email delivery.
- **Booking deletion triggers calendar cleanup** — F02's booking deletion route removes the Google Calendar event. R4's cancellation emails should be sent from the same code path.

### Impact from F05 Implementation

- **False "email sent" claim removed** — F05 removed the misleading "A confirmation email has been sent to {email}" text from the booking confirmation page in `client/src/pages/book.tsx`. The confirmation page now shows truthful messaging with booking details (date, time, event type, host name), an ICS file download button, and a Google Calendar link.
- **When F09 implements real email delivery, the confirmation page should be updated** — restore an email confirmation message (e.g., "A confirmation email has been sent to {email}") in the confirmation step of `book.tsx`. The F05 confirmation layout is clean and ready for this addition.
- **R5 is partially addressed by F05** — F05 fixed the misleading text and added booking summary details. F09's R5 work is reduced to adding the "email sent" message once email delivery is functional, and optionally adding "Check your spam folder" guidance.
- **ICS download and Google Calendar link on confirmation** — F05 added these to the confirmation page, reducing the need for email-only calendar attachment. However, confirmation emails should still include calendar details for bookers who navigate away.

---

## Current State

There is **zero email infrastructure** in the codebase (F01 auth emails are stubbed to console):

- No email service configured (no SendGrid, Postmark, SES, Nodemailer, etc.)
- No email templates
- No email sending functions
- ~~The confirmation page at `client/src/pages/book.tsx` misleadingly says "A confirmation email has been sent to {email}" — this is false~~ **FIXED by F05** — the false claim has been removed; confirmation page now shows truthful booking details with ICS download and Google Calendar link
- No notification to hosts on new bookings
- No meeting reminders
- No reschedule/cancel links in any emails

### What's Missing vs PRD

1. **Confirmation email to booker** — date, time, meeting link, reschedule/cancel links
2. **Notification email to host** — new booking alert with lead score and summary
3. **Meeting prep brief email** — sent 1 hour before meeting (F11 integration)
4. **Reschedule/cancel confirmation emails** — to both parties (F12 integration)
5. **Email infrastructure** — service, templates, delivery tracking

---

## Requirements

### R1: Email Service Setup

Choose and configure an email provider. Options:
- **Nodemailer + SMTP** (simplest for dev/MVP)
- **SendGrid** (free tier: 100 emails/day)
- **Postmark** (best deliverability)
- **AWS SES** (cheapest at scale)

Create `server/email-service.ts`:

```typescript
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;  // plain text fallback
}

export async function sendEmail(options: EmailOptions): Promise<boolean>;
```

Environment variables:
```
EMAIL_PROVIDER=smtp|sendgrid|postmark
EMAIL_FROM="CalendAI <noreply@calendai.com>"
EMAIL_API_KEY=xxx  // or SMTP credentials
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx
```

### R2: Email Templates

Create `server/email-templates/` directory with HTML email templates:

**Confirmation Email (to booker):**
```
Subject: Confirmed: {Event Type Name} with {Host Name}

Hi {Guest Name},

Your call is booked!

Date: {Date}
Time: {Time} ({Timezone})
Location: {Google Meet link / Location}

What to expect:
- {Host Name} will reach out via the Google Meet link at the scheduled time
- A calendar invite has been sent

Need to reschedule?
[Reschedule link] | [Cancel link]

See you soon!
```

**Host Notification Email (to host):**
```
Subject: New booking: {Guest Name} - {Event Type Name}

Hi {Host Name},

You have a new booking!

Date: {Date} at {Time}
Guest: {Guest Name}
Company: {Company Name}

Lead Score: {Score} {Star Rating}

Summary:
{Pre-qual summary or notes}

[View full details in CalendAI]
```

**Cancellation Email (to booker):**
```
Subject: Booking Cancelled: {Event Type Name} with {Host Name}

Your booking on {Date} at {Time} has been cancelled.

Want to rebook?
[Book again link]
```

**Cancellation Email (to host):**
```
Subject: Booking Cancelled: {Guest Name} - {Event Type Name}

{Guest Name} has cancelled their {Event Type Name} on {Date} at {Time}.

Reason: {Reason if provided}
```

### R3: Booking Token System (for reschedule/cancel links)

- Generate unique tokens for each booking that allow bookers to manage without authentication
- Add fields to bookings table:
  ```typescript
  rescheduleToken: text("reschedule_token"),
  cancelToken: text("cancel_token"),
  ```
- Generate tokens on booking creation (UUID or crypto.randomBytes)
- Reschedule link: `{baseUrl}/booking/reschedule/{rescheduleToken}`
- Cancel link: `{baseUrl}/booking/cancel/{cancelToken}`
- Tokens are single-use-per-action and should be verified on use

### R4: Send Confirmation Emails on Booking

Update `POST /api/public/book` in `server/routes.ts`:

After booking creation:
1. Send confirmation email to booker with date, time, meeting link, reschedule/cancel links
2. Send notification email to host with guest info, lead score, summary, dashboard link
3. Email sending should be async (don't block booking response)

```typescript
// After booking creation in routes.ts
sendBookingConfirmationEmail(booking, eventType, host).catch(err =>
  console.error("Failed to send confirmation email:", err)
);
sendHostNotificationEmail(booking, eventType, host).catch(err =>
  console.error("Failed to send host notification:", err)
);
```

### R5: Fix Confirmation Page

> **Status: PARTIALLY DONE (fixed by F05).** F05 removed the false "email sent" claim and added booking summary details (date, time, event type, host name), ICS file download, and Google Calendar link to the confirmation page. **Remaining work:** Once F09 implements real email delivery, add an accurate "A confirmation email has been sent to {email}" message and "Check your spam folder" note.

Update `client/src/pages/book.tsx` confirmation step:
- ~~Only show "A confirmation email has been sent" if email sending is configured~~ Misleading text removed by F05
- Show booking reference number
- Show "Check your spam folder if you don't see it" note (add when email is live)
- ~~Include all booking details in the confirmation view~~ DONE by F05
- **NEW:** When F09 email delivery is functional, add "A confirmation email has been sent to {email}" message back to the confirmation step

### R6: Email Notification Preferences (Settings)

Add to settings page:
- Toggle: "Email me when a new booking is made" (default: on)
- Toggle: "Send meeting prep briefs by email" (default: on)
- Toggle: "Daily digest of upcoming meetings" (default: off)

Store preferences in a new `notification_preferences` table or JSON field on users.

### R7: Meeting Reminder Emails (Stretch)

- Send reminder email to booker 24 hours before meeting
- Send reminder email to booker 1 hour before meeting
- This requires a scheduled job / cron system
- Can use a simple `setInterval` check or a proper job queue (Bull, Agenda)

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/email-service.ts` | Email sending abstraction layer |
| `server/email-templates.ts` | HTML email template functions |
| `server/email-templates/` | Directory for HTML template files (optional, can be inline) |

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `rescheduleToken`, `cancelToken` to bookings; add notification preferences |
| `server/routes.ts` | Send emails on booking creation, cancellation; generate tokens |
| `server/storage.ts` | Add method to find booking by token |
| `client/src/pages/book.tsx` | Fix confirmation page messaging |
| `client/src/pages/settings.tsx` | Add notification preferences section |
| `package.json` | Add email package (e.g., `nodemailer` or `@sendgrid/mail`) |

---

## Database Changes

```sql
ALTER TABLE bookings ADD COLUMN reschedule_token TEXT;
ALTER TABLE bookings ADD COLUMN cancel_token TEXT;

CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  new_booking_email BOOLEAN DEFAULT true,
  meeting_brief_email BOOLEAN DEFAULT true,
  daily_digest BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Acceptance Criteria

- [ ] Email service is configured and can send emails
- [ ] Booker receives confirmation email with date, time, and meeting link
- [ ] Confirmation email includes reschedule and cancel links
- [ ] Host receives notification email with guest info and lead score
- [ ] Emails are sent asynchronously (don't block booking response)
- [ ] Booking confirmation page accurately reflects whether email was sent
- [ ] Reschedule/cancel tokens are generated and stored per booking
- [ ] Email templates are well-formatted HTML with plain text fallbacks
- [ ] Notification preferences are configurable in settings
- [ ] If email sending fails, booking still succeeds

---

## Notes

- This is a foundational feature that many others depend on (F01 auth emails, F11 brief delivery, F12 reschedule/cancel). Build the email service abstraction first, then wire up specific email types.
- For local development, consider using a service like Mailtrap or just logging email content to console.
- Email templates should be responsive and work across major email clients (Gmail, Outlook, Apple Mail).
- Consider using a template library like `mjml` for responsive email HTML, or keep templates simple with inline CSS.

---

## Dependencies & Implications from F05

- **F05 removed the false "email sent" claim from the confirmation page.** The booking confirmation step in `client/src/pages/book.tsx` no longer claims an email was sent. When F09 implements real email delivery, the confirmation page should be updated to add an accurate "A confirmation email has been sent to {email}" message.
- **Confirmation page now shows booking details.** F05 added date, time, event type, host name, ICS download, and Google Calendar link to the confirmation page. F09's R5 scope is reduced to adding the email-related messaging once delivery is functional.
- **`guestTimezone` is now stored on bookings.** F05 added this field. Email templates can use it to format times in the booker's timezone (e.g., "Your call is on Monday at 2:00 PM EST").
- **Host info available on public API.** F05 expanded the public event type endpoint to include host firstName, lastName, and profileImageUrl. Email templates can reference host data for personalization.

### Impact from F06 Implementation

- **Guest timezone (`guestTimezone`) is now a validated IANA timezone stored on bookings.** F06 implemented `isValidTimezone()` to validate timezone strings before storage. Email templates can reliably use this field for timezone-aware time formatting in confirmation and reminder emails (e.g., using `Intl.DateTimeFormat` with the stored timezone to render "Monday, Feb 3 at 2:00 PM EST").
- **UTC timestamps are available for accurate scheduling.** F06's availability API now returns `utc` ISO timestamps alongside display times, and the booking endpoint accepts `startTimeUTC`. Email templates should use these UTC timestamps as the source of truth and format them into the recipient's timezone for display.
- **Server-side timezone conversion pattern established.** F06 uses native `Intl.DateTimeFormat` for timezone conversion in `calculateAvailability()`. The email template rendering logic can reuse this same approach to format meeting times in both the host's and guest's timezones within a single email (e.g., "2:00 PM EST / 11:00 AM PST").

### Impact from F08 Implementation

- **Lead scores are now available on enrichment records.** F08 added `leadScore` (integer), `leadScoreLabel` ("High"/"Medium"/"Low"), and `leadScoreReasoning` (human-readable factor breakdown) to the `lead_enrichments` table. Host notification emails (R2) can include the lead score badge and reasoning to give hosts immediate context about lead quality.
- **`enrichment.leadScoreLabel` and `enrichment.leadScore` are available for email template rendering.** The host notification email template (R2) can render a color-coded score indicator (e.g., "Lead Score: High (75)") and optionally include the reasoning string (e.g., "Executive role (+20), Company size 51+ (+20), Clear use case (+15)").
- **Auto-enrichment runs after booking creation, but is async.** F08's auto-enrichment fires as a non-blocking IIFE after the booking response is sent in `POST /api/public/book`. By the time the host notification email is composed, the enrichment and score may already be available -- but since enrichment is async, it might not be ready immediately. F09 should either: (a) include the score if available at email-send time, or (b) send the notification email after a brief delay to allow enrichment to complete, or (c) send without score and let the host check the dashboard for score details.

---

## Impact from F11 Implementation

- **F11 added `meetingPrepBriefEmail()` template to `server/email-templates.ts`.** This is the 6th email template in the system, following the existing patterns (escapeHtml, wrapHtml, formatDateTime). It sends a comprehensive meeting prep brief to the host including guest info, enrichment data, lead score, talking points, key context, and document analysis.
- **Brief emails respect the `meetingBriefEmail` notification preference.** Both the brief scheduler and manual brief generation check `notification_preferences.meetingBriefEmail` before sending. If the preference is `false`, email is skipped but the brief is still generated and stored.
