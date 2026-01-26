# F07: Conversational Pre-Qualification Enhancements

**Priority:** Medium
**Estimated Scope:** Small-Medium
**Dependencies:** F04 (for custom questions UI)

---

## Impact from F01 Implementation

- **No direct dependency on F01**. The pre-qual chat is a public-facing feature that doesn't require authentication.
- **Email validation utility available** — F01 added `isValidEmail()` in `server/routes.ts` which could be reused if AI conversation needs to validate email format (R4 stretch goal of collecting name/email conversationally).

### Impact from F04 Implementation

- **Custom questions UI now exists** — F04 R3 added a full questions editor to the event type form (add/edit/remove/reorder). R5 (Custom Questions Reminder) is now fully addressed: questions are configurable via the form UI and passed to the AI pre-qual chat.
- **Questions field already works end-to-end** — Event types with questions trigger the chat step on the booking page, and `processPrequalChat()` uses them in the AI prompt. F04 provided the missing UI to actually configure these questions.

### Impact from F05 Implementation

- **Chat step now uses branded colors** — F05 applied `primaryColor` and `secondaryColor` from event types to all booking steps, including the chat step, via CSS custom properties (`--brand-primary`, `--brand-secondary`). Chat bubbles, buttons, and accent elements reflect the host's brand. F07 enhancements should maintain consistency with this branded styling.
- **Client-side email validation deferred to F07** — F05 did not add client-side email validation on the info form. If F07 adds phone validation (R1), email validation should be added at the same time for consistency.
- **Host info available** — F05 expanded the public API to include host name and avatar. The chat AI greeting could reference the host by name (e.g., "A few quick questions so Sarah can prep for your call").

---

## Current State

The pre-qualification chat has a working foundation:

- **AI chat endpoint:** `POST /api/public/chat` processes conversational messages via OpenAI (`server/routes.ts:440-461`)
- **AI service:** `processPrequalChat()` in `server/ai-service.ts:166-224` manages conversation flow, uses configured questions
- **Frontend chat UI:** `client/src/pages/book.tsx:470-537` — chat bubbles, text input, loading state, skip button
- **Flow:** Info form (name, email) -> chat step (if event has questions) -> booking
- **Questions field:** `questions` JSON array on `event_types` schema (`shared/schema.ts:21`) but no UI to configure
- **Data storage:** Chat history saved to `prequal_responses` table on booking

### What's Missing vs PRD

1. **Phone number field** — PRD requires optional phone with validation
2. **Document upload within chat** — currently only in info form step, not in chat interface
3. **Custom questions UI** — no way to add/edit questions on event type form (covered in F04 but needed here too)
4. **AI conversation collecting name/email** — PRD shows AI asking for name & email conversationally; currently collected via form
5. **Summary before confirming** — AI should summarise responses before the booker confirms
6. **Email format validation in AI** — AI should validate email format during conversation
7. **Phone format validation** — AI should validate phone if provided

---

## Requirements

### R1: Phone Number Field

- Add optional phone number field to the booking info form (`client/src/pages/book.tsx` info step)
- Add `guestPhone` field to `bookings` table in `shared/schema.ts`
- Validate phone format on frontend (basic pattern: allows +, digits, spaces, hyphens)
- Pass phone number to the booking API
- Display phone on booking detail page

### R2: Document Upload in Chat Interface

- Add a file attachment button (paperclip icon) in the chat input area
- When user uploads a file during chat:
  1. Upload to object storage (same flow as info step)
  2. Show uploaded file as a chat message bubble (document badge)
  3. AI acknowledges the upload: "Thanks! I've noted the document."
  4. File is included in the booking's documents list
- Allow drag & drop onto the chat area

### R3: AI Summary Before Confirming

- After the AI signals `complete: true`, instead of immediately booking:
  1. Show a summary card below the chat:
     ```
     Here's what we've got:
     - Name: Sarah Chen
     - Email: sarah@greenaudit.co.uk
     - Company: GreenAudit Ltd
     - Looking to: Turn audit process into self-service tool
     - Timeline: Next month
     - Document: ESG_Audit_Process.pdf
     ```
  2. Ask: "Does this look right?" with "Confirm Booking" and "Edit" buttons
  3. "Edit" returns to the info form step
  4. "Confirm Booking" proceeds to book

- The summary data comes from `extractedData` returned by the AI

### R4: Enhanced AI Conversation Flow (Optional Stretch)

Per the PRD, the AI could collect name and email conversationally instead of via form:

```
AI: "Hey! Before we book, a few quick questions so [Host] can prep."
AI: "What's your name?"
User: "Sarah Chen"
AI: "Nice to meet you, Sarah. What's your email?"
...
```

This is a larger change to the flow architecture:
- Would require the chat step to come before the info step
- AI would need to extract and validate name/email from conversation
- Info form would become optional (pre-filled from chat data)
- **Recommendation:** Keep current form-first flow for MVP reliability, add this as a future option

### R5: Custom Questions Reminder

While the questions UI is covered in F04, ensure:
- The AI correctly receives and uses custom questions from the event type
- If no custom questions configured, AI asks general qualifying questions
- Questions are displayed in the event type management UI (read-only at minimum)

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `guestPhone` to bookings table |
| `server/routes.ts` | Accept and store `guestPhone` in booking creation |
| `server/ai-service.ts` | Update prompt to include summary generation; handle document mentions |
| `client/src/pages/book.tsx` | Add phone field to info form; add file upload to chat; add summary card before confirm |
| `client/src/pages/booking-detail.tsx` | Display phone number if present |
| `client/src/pages/bookings.tsx` | Display phone in booking cards if present |

---

## Database Changes

```sql
ALTER TABLE bookings ADD COLUMN guest_phone TEXT;
```

---

## Acceptance Criteria

- [ ] Optional phone number field with validation in booking info form
- [ ] Phone number stored on booking record and displayed in dashboard
- [ ] File upload button available within the chat interface
- [ ] Uploaded documents shown as chat bubbles and included in booking
- [ ] AI presents a summary of collected information before final booking
- [ ] Booker can review and confirm or go back to edit from summary
- [ ] AI uses custom questions from event type configuration
- [ ] If no custom questions, AI asks general qualifying questions
- [ ] Chat handles gracefully if AI service is unavailable

---

## Notes

- The document upload within chat reuses the same upload infrastructure (presigned URLs to object storage).
- The summary step is important for booker confidence — they should see what the host will receive before confirming.
- Phone validation should be lenient (international formats vary widely). A basic regex like `/^\+?[\d\s\-()]+$/` is sufficient.

---

## Dependencies & Implications from F05

- **Chat step is already branded.** F05 applies CSS custom properties (`--brand-primary`, `--brand-secondary`) to all booking steps, including the chat step. F07 UI enhancements (file upload button, summary card, phone field) should use these custom properties to maintain visual consistency with the branded booking page.
- **Client-side email validation is needed.** F05 explicitly deferred client-side email validation. When F07 adds phone validation (R1), email validation should be implemented alongside it on the info form in `client/src/pages/book.tsx`.
- **Host name available for AI personalization.** F05 expanded the public event type API to include host firstName and lastName. The pre-qual AI prompt could reference the host name for a more personal greeting (e.g., "A few quick questions so Sarah can prepare for your call").
