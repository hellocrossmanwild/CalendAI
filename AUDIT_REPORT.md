# CalendAI PRD Audit Report

**Date:** January 26, 2026
**Auditor:** Claude (automated audit)
**Scope:** Full feature-by-feature comparison of the CalendAI codebase against the v1.0 PRD

---

## Executive Summary

The CalendAI codebase implements a solid foundation covering the structural skeleton of most PRD features, but has significant gaps in several critical areas. The core booking flow works end-to-end (date selection -> time selection -> info capture -> AI chat -> confirmation), and AI features (enrichment, meeting briefs, pre-qual chat) are functional. However, key MVP requirements around authentication methods, real calendar integration, email notifications, lead scoring, reschedule/cancel flows, and the AI-assisted onboarding experience are missing or stubbed.

**Overall PRD Coverage: ~45-50%** of MVP requirements are implemented.

---

## Feature-by-Feature Audit

### F1: User Authentication

| Requirement | Status | Notes |
|---|---|---|
| Email/password authentication | PARTIAL | Uses username/password, not email/password as specified. Registration requires `username` field, not `email`. |
| Google OAuth | MISSING | No Google OAuth implementation. The `google-auth-library` and `openid-client` packages are installed but unused for user auth. |
| Magic link option | MISSING | No magic link authentication flow exists. |
| Password reset flow | MISSING | No forgot password or reset password endpoint or UI. |
| Session management | IMPLEMENTED | PostgreSQL-backed sessions via `connect-pg-simple`, 7-day expiry, secure cookies in production. |
| Email verification | MISSING | No email verification flow after signup. |

**Gap Summary:** Auth is username/password only. Three of the five specified auth methods (Google OAuth, magic link, password reset) are not implemented. The signup form collects `username` rather than `email` as the primary identifier, which contradicts the PRD's email-based authentication model.

**Files:** `server/routes.ts:24-92`, `server/index.ts:44-74`, `client/src/pages/auth.tsx`

---

### F2: Calendar Connection

| Requirement | Status | Notes |
|---|---|---|
| Google Calendar OAuth integration | STUBBED | `/api/calendar/connect` creates a placeholder token with `"placeholder_token"` — no real OAuth flow. |
| Read access (fetch events) | MISSING | No API calls to Google Calendar API to read events. |
| Write access (create events) | MISSING | No calendar event creation on booking. |
| Keep availability in sync | MISSING | No sync mechanism; availability is hardcoded 9am-5pm. |
| Handle multiple calendars | MISSING | Only `"primary"` calendar ID stored. |
| Respect existing events as busy | MISSING | Availability endpoint ignores actual calendar events. |

**Gap Summary:** Calendar integration is entirely stubbed. The database schema for `calendar_tokens` exists, and the UI shows connect/disconnect buttons, but no real Google OAuth flow or Calendar API calls are made. This is one of the most critical gaps — availability is hardcoded to 9am-5pm, 30-minute intervals, with no awareness of existing events.

**Files:** `server/routes.ts:279-316`, `server/routes.ts:343-378`

---

### F3: AI-Assisted Availability Setup

| Requirement | Status | Notes |
|---|---|---|
| Analyse existing calendar patterns | MISSING | No calendar analysis logic. |
| Detect typical working hours | MISSING | No pattern detection. |
| Suggest buffer times | MISSING | No AI-driven suggestions. |
| Allow manual override | PARTIAL | Users can set buffer times manually on event types, but no AI-driven availability setup wizard exists. |

**Gap Summary:** This feature is entirely missing. There is no onboarding step where AI scans the connected calendar and suggests availability. The PRD envisions a conversational setup flow ("It looks like you're typically available Monday to Friday, 9am-5pm...") — none of this exists.

**Files:** N/A — no corresponding code.

---

### F4: AI-Assisted Event Type Creation

| Requirement | Status | Notes |
|---|---|---|
| Conversational setup | MISSING | Event type creation is a standard form (`event-type-form.tsx`), not conversational. |
| AI asks questions one at a time | MISSING | No conversational AI flow for event creation. |
| AI suggests descriptions from website scan | MISSING | No website scanning capability. |
| AI pulls branding (logo, colours) from website | MISSING | No website branding extraction. |
| Support multiple event types | IMPLEMENTED | Multiple event types per user supported. |

**Gap Summary:** Event type creation is a traditional CRUD form with fields for name, slug, description, duration, buffers, color, and active toggle. The PRD envisions a conversational AI experience where the AI guides the user through setup, scans their website for branding and descriptions, and auto-generates content. None of this AI-assisted creation exists.

**Files:** `client/src/pages/event-type-form.tsx`

---

### F5: Booking Page Generation

| Requirement | Status | Notes |
|---|---|---|
| Hosted page at /book/[slug] | IMPLEMENTED | Public booking page at `/book/:slug`. |
| Embeddable widget | PARTIAL | Settings page shows embed code snippet, but no actual `widget.js` file exists. |
| Mobile responsive | IMPLEMENTED | Responsive layout with grid adjustments. |
| Branded with host's colours/logo | PARTIAL | Event type color is used for the icon background, but no host logo, profile photo, or full branding applied. |
| Host name and photo | MISSING | Booking page shows event type name but not the host's name or photo. |
| SEO-friendly | NOT VERIFIED | No evidence of meta tags, Open Graph, or SSR for the booking page. |

**Gap Summary:** The booking page structure is implemented but missing several PRD elements: host name/photo display, full brand customization, and the embeddable widget is referenced in settings but no `widget.js` file exists to serve.

**Files:** `client/src/pages/book.tsx`

---

### F6: Date & Time Selection

| Requirement | Status | Notes |
|---|---|---|
| Calendar UI with available dates | IMPLEMENTED | Week-view calendar with prev/next navigation. |
| Time slots based on availability | PARTIAL | Hardcoded 9am-5pm, 30-min slots. Not based on actual calendar or configured availability. |
| Timezone detection and display | PARTIAL | Server uses `Intl.DateTimeFormat().resolvedOptions().timeZone` (server timezone, not booker's). Booker's timezone is not detected or displayed. |
| Timezone conversion | MISSING | No timezone conversion logic. |
| Real-time availability (no double-booking) | MISSING | No check against existing bookings — multiple people could book the same slot. |
| Buffer time enforcement | MISSING | Buffer before/after is stored on event types but not applied when generating available slots. |
| Minimum notice period | MISSING | Past times are filtered out, but no configurable minimum notice period (e.g., 24-hour advance). |
| Maximum days in advance | MISSING | No limit on how far ahead someone can book. |

**Gap Summary:** The date/time selection UI works but the underlying availability logic is simplistic. Critical gaps: no double-booking prevention, no buffer enforcement, no timezone handling for bookers, no real calendar integration, and no configurable notice/advance periods.

**Files:** `server/routes.ts:343-378`, `client/src/pages/book.tsx:107-380`

---

### F7: Conversational Pre-Qualification

| Requirement | Status | Notes |
|---|---|---|
| Chat interface | IMPLEMENTED | Chat UI with message bubbles, send button, scroll area. |
| AI asks questions based on config | IMPLEMENTED | AI receives configured questions from event type and uses them in conversation. |
| Text responses | IMPLEMENTED | Users can type responses. |
| Document upload (drag & drop in chat) | PARTIAL | File upload exists in the info step, not within the chat interface itself. No drag & drop — uses file input click. |
| Validate required info (name, email) | PARTIAL | Name and email are captured in the info step before chat, not validated by the AI within the conversation flow. |
| Phone number with validation | MISSING | No phone number field anywhere in the booking flow. |
| AI summarises responses | PARTIAL | AI can extract data, but no explicit summary shown to booker before confirming. |
| Customisable questions per event type | PARTIAL | `questions` field exists on event types schema but the event type form UI has no way to add/edit questions. |

**Gap Summary:** The core chat flow works — AI processes messages conversationally and can signal completion. However, the PRD envisions the chat collecting name and email (currently collected via form before chat), document upload happening within the chat interface, phone number collection, and a summary before confirming. The event type form also lacks UI for configuring custom questions, so this field can only be set via API.

**Files:** `client/src/pages/book.tsx:470-537`, `server/routes.ts:440-461`, `server/ai-service.ts:166-224`

---

### F8: Lead Enrichment

| Requirement | Status | Notes |
|---|---|---|
| Trigger on email capture | MISSING | Enrichment is manual — host must click "Enrich Lead" button on the booking detail page. |
| Fetch company information | IMPLEMENTED | AI infers company info from email domain. |
| Fetch LinkedIn profile | PARTIAL | AI generates a probable LinkedIn URL — not a real API lookup. |
| Fetch website summary | PARTIAL | AI infers website from domain — not a real web scrape. |
| Calculate lead score | MISSING | No lead scoring calculation. The PRD defines a detailed scoring system (points for role, company size, timeline, etc.) — none of this exists. |
| Store enrichment data | IMPLEMENTED | `lead_enrichments` table stores company and personal info. |

**Gap Summary:** Enrichment exists but is AI-inference-based rather than real data lookups. The AI guesses company info and LinkedIn profiles from the email domain rather than calling actual enrichment APIs. Lead scoring — a key PRD feature with a detailed points system — is completely absent. The leads page (`leads.tsx`) does not display any lead score.

**Files:** `server/routes.ts:209-238`, `server/ai-service.ts:25-79`, `client/src/pages/leads.tsx`

---

### F9: Booking Confirmation

| Requirement | Status | Notes |
|---|---|---|
| Create calendar event on host's calendar | MISSING | No Google Calendar event creation. `calendarEventId` field exists on bookings but is never populated. |
| Create calendar event for booker | MISSING | No calendar invite sent to booker. |
| Send confirmation email to booker | MISSING | Confirmation page says "A confirmation email has been sent" but no email sending logic exists anywhere in the codebase. |
| Send notification to host | MISSING | No email or notification sent to host on new booking. |
| Generate unique booking ID | IMPLEMENTED | Auto-increment `id` in database. |
| Store booking record | IMPLEMENTED | Booking stored in `bookings` table. |
| Reschedule/cancel links in email | MISSING | No reschedule/cancel links (no emails sent). |

**Gap Summary:** This is a major gap. The booking is saved to the database and the user sees a confirmation screen, but no emails are sent to either party, no calendar events are created, and no reschedule/cancel links are generated. The confirmation page misleadingly states "A confirmation email has been sent to {email}" when no email infrastructure exists.

**Files:** `server/routes.ts:381-437`, `client/src/pages/book.tsx:225-244`

---

### F10: Booking Management Dashboard

| Requirement | Status | Notes |
|---|---|---|
| List of upcoming bookings | IMPLEMENTED | Dashboard shows next 5 upcoming bookings; bookings page has full list with tabs. |
| List of past bookings | IMPLEMENTED | "Past" tab on bookings page. |
| Booking detail view | IMPLEMENTED | Full detail page with enrichment and brief data. |
| Reschedule functionality | MISSING | No reschedule capability from dashboard or detail page. |
| Cancel functionality | IMPLEMENTED | Cancel from bookings list with confirmation dialog. Sets status to "cancelled". |
| Filter by date range | MISSING | No date range filter. |
| Filter by event type | MISSING | No event type filter. |
| Search by name/email | IMPLEMENTED | Search across name, email, and company. |
| Calendar view | MISSING | No month/calendar view of bookings. |

**Gap Summary:** The dashboard and bookings pages cover basic listing and viewing. Missing: reschedule capability, date range filtering, event type filtering, and the calendar month view specified in the PRD.

**Files:** `client/src/pages/dashboard.tsx`, `client/src/pages/bookings.tsx`, `client/src/pages/booking-detail.tsx`

---

### F11: Meeting Prep Brief

| Requirement | Status | Notes |
|---|---|---|
| Generate prep brief | IMPLEMENTED | AI generates summary, talking points, and key context. |
| Send via email before meeting | MISSING | No email delivery of briefs. |
| Auto-generate 1 hour before meeting | MISSING | No scheduled/cron job for automatic brief generation. |
| Include suggested talking points | IMPLEMENTED | AI generates talking points array. |
| Include similar past projects | MISSING | No similar project matching. |
| Document analysis in brief | PARTIAL | `documentAnalysis` field exists in schema but AI prompt doesn't process actual document content. |
| Show in dashboard | IMPLEMENTED | Briefs page shows briefs with search. |

**Gap Summary:** On-demand brief generation works via the AI, but automatic delivery (email 1 hour before, push notifications) and more sophisticated features (similar project matching, actual document content analysis) are missing.

**Files:** `server/routes.ts:241-277`, `server/ai-service.ts:88-158`, `client/src/pages/briefs.tsx`, `client/src/pages/booking-detail.tsx`

---

### F12: Reschedule & Cancel

| Requirement | Status | Notes |
|---|---|---|
| Reschedule link in confirmation email | MISSING | No emails sent, no reschedule links. |
| Cancel link in confirmation email | MISSING | No emails sent, no cancel links. |
| Minimum notice period (configurable) | MISSING | No notice period enforcement. |
| Update calendar events on change | MISSING | No calendar integration. |
| Reschedule flow for bookers | MISSING | No public reschedule page. |
| Cancel flow for bookers | MISSING | No public cancellation page. Cancellation only available to host from dashboard. |
| Send notifications to both parties | MISSING | No notification system. |
| Cancellation reason capture | MISSING | No reason field on cancellation. |
| Host cancellation flow | PARTIAL | Host can cancel from bookings list, but no apology email to booker. |

**Gap Summary:** Reschedule is completely missing. Cancellation exists only as a host action from the dashboard — bookers have no way to cancel or reschedule their own bookings. No public-facing reschedule/cancel pages exist, and no notifications are sent on cancellation.

**Files:** `server/routes.ts:193-206`, `client/src/pages/bookings.tsx`

---

### F13: Settings & Configuration

| Requirement | Status | Notes |
|---|---|---|
| Profile settings (name, email, photo, timezone) | PARTIAL | Shows name, email, and avatar but no editing capability. |
| Company name / website URL | MISSING | Not in user model or settings UI. |
| Timezone setting | MISSING | No timezone selector in settings. |
| Connected calendars | IMPLEMENTED | Calendar connect/disconnect in settings. |
| Availability rules | MISSING | No availability configuration UI. |
| Buffer time defaults | MISSING | Only configurable per event type, not as defaults. |
| Minimum notice / max days in advance | MISSING | No global scheduling configuration. |
| Notification settings | MISSING | No notification preferences. |
| Event type management in settings | PARTIAL | Separate `/event-types` page exists but not integrated into settings. |
| Branding settings (logo, colours) | MISSING | No branding configuration. Colors only on event types. |
| Booking links | IMPLEMENTED | Shows booking URL and embed code with copy buttons. |

**Gap Summary:** Settings page is minimal — shows profile (read-only), calendar connection status, and booking links. Missing: profile editing, timezone selection, company info, availability rules, notification preferences, branding configuration, and scheduling defaults.

**Files:** `client/src/pages/settings.tsx`

---

## Data Model Audit

| PRD Model | DB Table | Status | Missing Fields |
|---|---|---|---|
| User | `users` | PARTIAL | Missing: `timezone`, `companyName`, `websiteUrl` |
| Event Type | `event_types` | PARTIAL | Missing: `location` (Google Meet/Zoom/phone), `minNotice`, `maxAdvance`, `availabilityRules`, branding fields (`logo`, `primaryColor`, `secondaryColor`) |
| Booking | `bookings` | PARTIAL | Missing: `guestPhone`, `rescheduleToken`, `cancelToken`, `leadScore` |
| Lead Enrichment | `lead_enrichments` | PARTIAL | Missing: `leadScore`, `leadScoreReasoning` (PRD specifies detailed scoring) |
| Pre-qual Response | `prequal_responses` | IMPLEMENTED | Schema matches PRD. |
| Document | `documents` | IMPLEMENTED | Schema matches PRD. |
| Meeting Brief | `meeting_briefs` | IMPLEMENTED | Schema matches PRD. |
| Calendar Token | `calendar_tokens` | IMPLEMENTED | Schema matches PRD (though not used for real OAuth). |

---

## Cross-Cutting Concerns

### Email / Notifications
**Status: NOT IMPLEMENTED**

No email sending infrastructure exists anywhere in the codebase. The PRD specifies:
- Confirmation emails to bookers
- Notification emails to hosts on new bookings
- Meeting prep briefs emailed 1 hour before meetings
- Reschedule/cancel notification emails
- Daily digest option

No email service (SendGrid, Postmark, SES, etc.) is configured or referenced.

### Timezone Handling
**Status: MINIMAL**

The server stores timezone on bookings using `Intl.DateTimeFormat().resolvedOptions().timeZone`, which captures the **server's** timezone, not the booker's. No timezone detection, selection, or conversion exists for the booker experience.

### Security
**Status: BASIC**

- Password hashing with bcrypt (10 rounds) -- adequate
- Session-based auth with PostgreSQL store -- good
- No rate limiting on any endpoints (especially concerning on public booking/chat endpoints)
- No CORS configuration
- Hardcoded session secret fallback (`"calendai-secret-key"`) is insecure
- No input sanitization beyond Zod schema validation
- File upload endpoint (`/api/uploads/request-url`) is not auth-gated -- anyone can request upload URLs
- No CAPTCHA or bot protection on public booking endpoints

### Error Handling
**Status: BASIC**

- Try/catch blocks on all API routes
- Generic error messages returned to client
- Console.error logging but no structured logging service
- No error tracking (Sentry, etc.)

---

## Summary Scorecard

| Feature | PRD Priority | Implementation Status | Coverage |
|---|---|---|---|
| **F1:** User Authentication | MVP | Partial | ~30% |
| **F2:** Calendar Connection | MVP | Stubbed | ~10% |
| **F3:** AI Availability Setup | MVP | Missing | 0% |
| **F4:** AI Event Type Creation | MVP | Missing (traditional form instead) | ~15% |
| **F5:** Booking Page Generation | MVP | Partial | ~55% |
| **F6:** Date & Time Selection | MVP | Partial | ~35% |
| **F7:** Conversational Pre-Qual | MVP | Partial | ~50% |
| **F8:** Lead Enrichment | MVP | Partial | ~40% |
| **F9:** Booking Confirmation | MVP | Partial (no emails/calendar) | ~25% |
| **F10:** Booking Dashboard | MVP | Partial | ~55% |
| **F11:** Meeting Prep Brief | MVP | Partial | ~45% |
| **F12:** Reschedule & Cancel | MVP | Minimal (host cancel only) | ~15% |
| **F13:** Settings & Config | MVP | Minimal | ~20% |
| **Email Notifications** | MVP | Missing | 0% |
| **Timezone Handling** | MVP | Minimal | ~10% |
| **Lead Scoring** | MVP | Missing | 0% |

---

## Top Priority Gaps (Ranked by Impact)

1. **No email notifications** — The confirmation page claims emails are sent, but no email infrastructure exists. This is table-stakes for a booking platform.

2. **Calendar integration is stubbed** — Without real Google Calendar OAuth, availability is fictional (hardcoded 9am-5pm) and double-booking is possible.

3. **No double-booking prevention** — The availability endpoint returns all slots as available regardless of existing bookings. Multiple people can book the same slot.

4. **No reschedule/cancel for bookers** — Bookers receive no links to manage their booking. Only hosts can cancel from the dashboard.

5. **No lead scoring** — The PRD defines a detailed scoring system that is core to the value proposition. The leads page shows no scores.

6. **Auth only supports username/password** — Google OAuth, magic links, and password reset are all missing.

7. **No AI-assisted onboarding** — The core differentiator (AI-guided setup with website scanning, branding extraction, conversational event creation) is entirely absent.

8. **No timezone handling** — Server timezone is stored, not the booker's. No timezone detection or conversion.

9. **Event type form lacks question configuration** — The `questions` field exists in the schema but the UI provides no way to add/edit custom pre-qual questions.

10. **Missing host info on booking page** — Host name, photo, and full branding are not shown on the public booking page.
