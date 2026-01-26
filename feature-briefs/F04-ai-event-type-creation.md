# F04: AI-Assisted Event Type Creation

**Priority:** Medium
**Estimated Scope:** Medium
**Dependencies:** None (but benefits from F02 for branding extraction)

---

## Impact from F01 Implementation

- **No direct dependency on F01**, but users are now authenticated via email which means the AI conversation (R1) can reference the host's email domain for website scanning suggestions.
- **User model expanded** — `emailVerified` field added. When F13 adds `companyName` and `websiteUrl` to the user model, AI event type creation can pre-populate these.

### Impact from F02 Implementation

- **Google Meet auto-generation is now available** — F02's `createCalendarEvent()` in `server/calendar-service.ts` automatically provisions Google Meet links via `conferenceData.createRequest`. R4 (Location/Meeting Link Configuration) can leverage this: when location is set to "Google Meet", the calendar event creation already handles it.
- **Calendar connection check available** — `GET /api/calendar/status` returns whether Google Calendar is connected, which can inform the AI conversation (e.g., "I see you have Google Calendar connected — shall I set up Google Meet links automatically?").

---

## Current State

Event type creation is a traditional CRUD form:

- **Form page:** `client/src/pages/event-type-form.tsx` — standard fields: name, slug, description, duration, buffer before/after, color, active toggle
- **API:** `POST /api/event-types` creates event type with validated data (`server/routes.ts:118-137`)
- **Schema:** `event_types` table has `questions` JSON field but the form UI provides no way to add/edit questions (`shared/schema.ts:10-24`)
- **No AI involvement** in event type creation
- **No website scanning** or branding extraction
- **No conversational flow** — purely form-based

### What's Missing vs PRD

1. **Conversational AI-guided setup** — AI asks questions one at a time instead of a form
2. **Website scanning** — AI scans host's website to extract branding (logo, colors)
3. **AI-generated descriptions** — AI suggests event descriptions based on website content
4. **Custom questions UI** — ability to add/edit pre-qualification questions per event type
5. **Location/meeting link configuration** — where the meeting happens (Google Meet, Zoom, phone, in-person)
6. **Branding fields** — logo, primary color, secondary color per event type

---

## Requirements

### R1: Conversational Event Type Creation

Create a new page or modal at `/event-types/new/ai` with a chat-based interface:

**AI Conversation Flow:**
```
AI: "What kind of meeting is this? (e.g., Discovery call, intro chat, consultation)"
User: "Discovery call"

AI: "Got it. How long should it be?"
User: "30 minutes"

AI: "What's your website? I'll grab your branding."
User: "hellocrossman.com"

AI: [Scans website]
AI: "Here's a suggested description based on your site:
'A 30-minute call to explore whether we're a fit...'
I've pulled your logo and brand colours too. Want to preview?"
```

**Implementation:**
- Add `POST /api/ai/create-event-type` — processes conversational messages, returns structured event type data
- Add to `server/ai-service.ts`: `processEventTypeCreation(messages, websiteUrl?)` function
- AI should progressively extract: name, duration, description, location preference
- AI should signal when it has enough info to create the event type
- Frontend: chat UI similar to pre-qual chat, but for host setup

### R2: Website Scanning & Branding Extraction

Add `POST /api/ai/scan-website`:

- Input: `{ url: string }`
- Process:
  1. Fetch the website HTML (use `fetch` or a headless browser)
  2. Extract: page title, meta description, body text summary
  3. Extract visual branding: favicon/logo URL, primary colours from CSS/meta themes
  4. Send extracted content to OpenAI for structured summary
- Output:
  ```json
  {
    "businessName": "HelloCrossman",
    "description": "Digital product studio specialising in...",
    "suggestedEventDescription": "A 30-minute call to explore...",
    "branding": {
      "logoUrl": "https://example.com/logo.png",
      "primaryColor": "#6366f1",
      "secondaryColor": "#f59e0b"
    }
  }
  ```
- Use the extracted data to pre-fill event type fields

### R3: Custom Questions Configuration

Update the event type form to include a questions editor:

- Add a "Pre-Qualification Questions" section to `event-type-form.tsx`
- UI: sortable list of question text fields with add/remove buttons
- Questions are stored in the existing `questions` JSON array on `event_types`
- These questions are passed to the AI pre-qual chat (F07) when bookers use the booking page
- Default suggestions: "What are you looking to build/discuss?", "What's your timeline?"

### R4: Location/Meeting Link Configuration

Add `location` field to event types:

- Options: Google Meet (auto-generate), Zoom (paste link), Phone call, In-person (address), Custom URL
- Store as `location` text field on `event_types` table
- For Google Meet: auto-generate link when calendar event is created (requires F02)
- Display location info on booking page and in calendar events

### R5: Branding Fields on Event Types

Extend `event_types` schema:

```typescript
// Add to event_types table
logo: text("logo"),                    // URL to uploaded logo
primaryColor: text("primary_color"),   // hex color
secondaryColor: text("secondary_color"), // hex color
```

- Use on the public booking page (`/book/:slug`) to style the page
- Allow upload via settings or during AI-assisted creation

### R6: Keep Traditional Form

- Keep the existing form at `/event-types/new` as an alternative ("Manual Setup")
- Add a toggle or two entry points: "Create with AI" vs "Create Manually"
- Add the missing fields (questions, location) to the manual form too

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/pages/event-type-ai-create.tsx` | Conversational AI event creation page |
| `server/website-scanner.ts` | Website fetch + content extraction logic |

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `location`, `logo`, `primaryColor`, `secondaryColor` to `event_types` |
| `server/ai-service.ts` | Add `processEventTypeCreation()` and `scanWebsite()` functions |
| `server/routes.ts` | Add `/api/ai/create-event-type` and `/api/ai/scan-website` endpoints |
| `client/src/pages/event-type-form.tsx` | Add questions editor, location selector, branding fields |
| `client/src/pages/event-types.tsx` | Add "Create with AI" button alongside existing "New Event Type" |
| `client/src/App.tsx` | Add route for AI creation page |
| `client/src/pages/book.tsx` | Apply branding from event type (logo, colors) to booking page |

---

## Acceptance Criteria

- [ ] User can create an event type through conversational AI chat
- [ ] AI asks about meeting type, duration, website, and suggests description
- [ ] Website scanning extracts business name, description, and brand colors
- [ ] Extracted branding is applied to the event type
- [ ] Custom pre-qualification questions can be added/edited/removed in the event type form
- [ ] Location/meeting type can be configured per event type
- [ ] Traditional form still works with all new fields available
- [ ] Public booking page reflects event type branding (colors, logo)
- [ ] User can choose between "Create with AI" and "Create Manually"

---

## Notes

- Website scanning requires server-side HTTP fetch. Be mindful of timeouts and error handling for unreachable sites.
- The AI conversation should be flexible — if the user provides multiple pieces of info in one message, the AI should handle it gracefully.
- Consider rate limiting the website scanning endpoint.
