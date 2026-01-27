# F11: Meeting Prep Brief Enhancements

**Priority:** Medium
**Estimated Scope:** Small-Medium
**Dependencies:** F08 (for enrichment data in briefs) — **SATISFIED**, F09 (for email delivery)

---

## Impact from F01 Implementation

- **No direct dependency on F01**. Meeting briefs are generated from booking and enrichment data.
- **Email delivery dependency** — brief email delivery (R2) depends on F09. F01 has established the email stub pattern that F09 will replace with real delivery.

---

## Current State

Meeting prep briefs have a working foundation:

- **Generation endpoint:** `POST /api/bookings/:id/generate-brief` triggers OpenAI to create a brief (`server/routes.ts:241-277`)
- **AI service:** `generateMeetingBrief()` in `server/ai-service.ts:88-158` produces summary, talking points, key context
- **Storage:** `meeting_briefs` table with `summary`, `talkingPoints`, `keyContext`, `documentAnalysis` (`shared/schema.ts:86-94`)
- **Frontend:** Booking detail page shows brief data and "Generate Brief" button (`client/src/pages/booking-detail.tsx`); Briefs page lists all bookings with briefs (`client/src/pages/briefs.tsx`)
- **Brief generation is manual** — host clicks button on each booking

### What's Missing vs PRD

1. **Automatic delivery** — should be sent 1 hour before meeting (email or in-app)
2. **Email delivery** — brief sent via email (requires F09)
3. **Push notification** — brief available via notification
4. **Similar past projects** — AI should reference similar projects/bookings from host's history
5. **Actual document analysis** — `documentAnalysis` field exists but AI doesn't process uploaded document content
6. **Auto-generation** — should generate automatically, not just on-demand
7. **Brief regeneration** — ability to refresh/regenerate a brief
8. **Comprehensive brief format** — PRD template includes company context, LinkedIn link, document summary

---

## Requirements

### R1: Automatic Brief Generation

- When a booking is created, schedule brief generation for 1 hour before the meeting start time
- Implementation options:
  - **Simple:** Periodic job (every 15 minutes) checks for upcoming bookings that need briefs
  - **Better:** Use `setTimeout` or a job queue (Bull/BullMQ) to schedule generation
- If meeting is less than 1 hour away at creation time, generate immediately
- Generate brief only if enrichment data exists (trigger enrichment first if needed)

Create `server/brief-scheduler.ts`:
```typescript
export function startBriefScheduler() {
  // Every 15 minutes, check for bookings in the next 1-2 hours
  // that don't have briefs yet, and generate them
  setInterval(async () => {
    const upcoming = await storage.getUpcomingBookingsWithoutBriefs(
      new Date(),
      addHours(new Date(), 2)
    );
    for (const booking of upcoming) {
      await generateAndStoreBrief(booking);
    }
  }, 15 * 60 * 1000);
}
```

### R2: Email Delivery of Briefs

When a brief is generated (auto or manual):
1. Check host's notification preferences (F09)
2. If enabled, send email with the full brief content
3. Email template matching the PRD format:

```
Subject: Meeting Prep: {Guest Name} - {Event Type} at {Time}

# Meeting Prep: {Guest Name}
{Date} — {Event Type}

## Who
- Name: {Guest Name}
- Role: {Role from enrichment}
- Company: {Company}
- LinkedIn: {link}
- Website: {domain}

## Company Context
{Company description from enrichment}

## What They Want
{Summary from pre-qual chat or notes}

## Key Points from Conversation
{Extracted data from pre-qual}

## Suggested Talking Points
1. {Point 1}
2. {Point 2}
3. {Point 3}

## Document Summary
{Analysis of uploaded documents}

[View full details in CalendAI]
```

### R3: Brief Regeneration

- Add a "Regenerate Brief" button on the booking detail page
- When clicked, delete existing brief and generate a new one
- This is useful when enrichment data has been updated or new context is available
- Update the API: `POST /api/bookings/:id/generate-brief` should allow regeneration if `force=true` query param is passed

### R4: Enhanced Brief with Document Analysis

- When generating a brief, if the booking has uploaded documents:
  1. Fetch document content (if text-based: PDF, docx, txt)
  2. Include a summary of the document content in the AI prompt
  3. Store the document analysis in the `documentAnalysis` field
- For MVP, support text extraction from common formats
- If document content can't be extracted, note the file names and types

### R5: Similar Bookings / Past Context (Stretch)

- When generating a brief, search for past bookings from the same company/email domain
- Include relevant past context: "Previous meeting on {date} about {topic}"
- This helps hosts who have recurring relationships
- Query: `storage.getBookingsByGuestDomain(domain)` — match on email domain

### R6: In-App Brief Notification

- When a brief is auto-generated, show an in-app notification/toast
- Add a "New Brief Available" indicator on the dashboard
- Mark briefs as "read" when viewed

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/brief-scheduler.ts` | Scheduled job to auto-generate briefs before meetings |

## Files to Modify

| File | Changes |
|------|---------|
| `server/index.ts` | Start brief scheduler on server boot |
| `server/routes.ts` | Add `force` param to brief generation; add brief email sending |
| `server/ai-service.ts` | Enhance brief prompt with document content and past booking context |
| `server/storage.ts` | Add `getUpcomingBookingsWithoutBriefs()`, `getBookingsByGuestDomain()` methods |
| `client/src/pages/booking-detail.tsx` | Add "Regenerate Brief" button |
| `client/src/pages/briefs.tsx` | Add regenerate action, read/unread indicators |

---

## Acceptance Criteria

- [ ] Briefs are automatically generated ~1 hour before scheduled meetings
- [ ] Auto-generated briefs are emailed to host (if email is configured via F09 and preference enabled)
- [ ] "Regenerate Brief" button works and replaces existing brief with fresh one
- [ ] Brief includes document analysis when documents are uploaded
- [ ] Brief email follows the PRD template format
- [ ] Brief scheduler runs reliably without blocking server startup
- [ ] Manual "Generate Brief" button continues to work for on-demand generation
- [ ] If enrichment data exists, it's included in the brief

---

## Notes

- The brief scheduler is a simple in-process interval for MVP. For production, consider a proper job queue.
- Document content extraction is non-trivial for PDFs/docx. For MVP, you can include just the file names and types, or use a simple PDF text extraction library.
- Email delivery depends on F09 being complete. If not, generate and store briefs but skip email.

---

## Impact from F06 Implementation

- **Timezone context (validated `guestTimezone`) is available on booking records.** F06 implemented `isValidTimezone()` and stores the validated IANA timezone on each booking. Meeting briefs can include the guest's local timezone for context (e.g., "Guest is in America/New_York — it will be 9:00 AM their time").
- **UTC timestamps allow accurate time display in prep emails.** F06 added UTC ISO timestamps to availability responses and `startTimeUTC` to the booking endpoint. Brief generation and brief emails (R2) can use these UTC timestamps to render accurate meeting times in any timezone, avoiding ambiguity.
- **Brief generation can reference the guest's local time.** With the validated `guestTimezone` and UTC booking times from F06, the AI prompt for `generateMeetingBrief()` can include the guest's local meeting time as context, helping the host prepare for timezone-aware conversations (e.g., "Note: This is an early morning call for your guest").

### Impact from F08 Implementation

- **Lead scores are now available for inclusion in meeting briefs.** F08 added `enrichment.leadScore` (integer), `enrichment.leadScoreLabel` ("High"/"Medium"/"Low"), and `enrichment.leadScoreReasoning` (human-readable factor breakdown with point values) to the `lead_enrichments` table. The `generateMeetingBrief()` AI prompt in `server/ai-service.ts` already receives enrichment data, so it can now incorporate the lead score and reasoning as additional context for generating more targeted talking points.
- **Enhanced enrichment data provides richer brief context.** F08's `enrichLead()` function now accepts an optional `prequalContext` containing the summary, key points, timeline, and company name from F07's AI summary card. This means the enrichment data passed to `generateMeetingBrief()` is richer than before -- the AI has more context about the guest's needs, timeline, and company, resulting in more relevant and actionable meeting briefs.
- **Brief emails (R2) can include the lead score for quick host context.** When F09 email delivery is implemented and F11's R2 (Email Delivery of Briefs) is built, the brief email template can include the lead score label and numeric score at the top of the email (e.g., "Lead Score: High (75)"). This gives the host an immediate sense of lead quality before reading the full brief.
- **F08 dependency is now SATISFIED.** F11 listed F08 as a dependency for enrichment data in briefs. With F08 complete, the enrichment pipeline includes scoring, enhanced AI inference with pre-qual context, and auto-enrichment on booking creation -- all of which feed into richer meeting prep briefs.

---

## Implementation Status (Complete)

All requirements implemented:

- [x] R1: Automatic brief generation ~1 hour before scheduled meetings via `server/brief-scheduler.ts`
- [x] R2: Email delivery of briefs via `meetingPrepBriefEmail()` template in `server/email-templates.ts`
- [x] R3: "Regenerate Brief" button on booking detail page with `force=true` API support
- [x] R4: Document analysis — document metadata included in AI prompt, `documentAnalysis` field populated
- [x] R5: Similar bookings context via `getBookingsByGuestDomain()` storage method
- [x] R6: In-app notifications — read/unread tracking with `readAt` field, unread badge in sidebar

### Files Created
| File | Purpose |
|------|---------|
| `server/brief-scheduler.ts` | 15-minute interval scheduler for automatic brief generation |
| `server/__tests__/f11-meeting-prep-brief.test.ts` | 108 test cases covering all F11 requirements |

### Files Modified
| File | Changes |
|------|---------|
| `server/index.ts` | Starts brief scheduler on boot |
| `server/routes.ts` | `force=true` param on generate-brief, brief read tracking endpoints, unread count endpoint |
| `server/ai-service.ts` | Documents parameter added to `generateMeetingBrief()` |
| `server/storage.ts` | 5 new methods: `getUpcomingBookingsWithoutBriefs`, `getBookingsByGuestDomain`, `deleteMeetingBrief`, `markBriefAsRead`, `getUnreadBriefsCount` |
| `server/email-templates.ts` | `meetingPrepBriefEmail()` template with full PRD format |
| `shared/schema.ts` | `readAt` timestamp added to `meeting_briefs` table |
| `client/src/pages/booking-detail.tsx` | Regenerate button, document analysis display, auto-mark-as-read, guest timezone |
| `client/src/pages/briefs.tsx` | Regenerate action, read/unread visual indicators |
| `client/src/components/AppSidebar.tsx` | Unread briefs count badge |

### Acceptance Criteria
- [x] Briefs are automatically generated ~1 hour before scheduled meetings
- [x] Auto-generated briefs are emailed to host (if email is configured via F09 and preference enabled)
- [x] "Regenerate Brief" button works and replaces existing brief with fresh one
- [x] Brief includes document analysis when documents are uploaded
- [x] Brief email follows the PRD template format
- [x] Brief scheduler runs reliably without blocking server startup
- [x] Manual "Generate Brief" button continues to work for on-demand generation
- [x] If enrichment data exists, it's included in the brief

### Security Notes
- Scheduler has race condition guard (`cycleRunning` flag) to prevent duplicate generation
- All endpoints require authentication and verify booking ownership
- Document analysis uses metadata only (no file content access)
- Email template escapes all user-provided strings via `escapeHtml()`
