# F09: Email Notifications & Booking Confirmation

**Priority:** Critical
**Estimated Scope:** Large
**Dependencies:** None (but enables F01 magic link/password reset, F11 brief delivery, F12 reschedule/cancel links)

---

## Current State

There is **zero email infrastructure** in the codebase:

- No email service configured (no SendGrid, Postmark, SES, Nodemailer, etc.)
- No email templates
- No email sending functions
- The confirmation page at `client/src/pages/book.tsx:239` misleadingly says "A confirmation email has been sent to {email}" — this is false
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

Update `client/src/pages/book.tsx` confirmation step:
- Only show "A confirmation email has been sent" if email sending is configured
- Show booking reference number
- Show "Check your spam folder if you don't see it" note
- Include all booking details in the confirmation view

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
