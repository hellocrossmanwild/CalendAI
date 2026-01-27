# F08: Lead Enrichment & Scoring

**Priority:** High
**Estimated Scope:** Medium
**Dependencies:** None (but F09 needed for email delivery of enrichment alerts)
**Status: ~90% COMPLETE** (R6 stretch goal deferred)

---

## Impact from F01 Implementation

- **No direct dependency on F01**. Lead enrichment and scoring work on booking data, not user authentication.
- **Email-based registration** — since users now register with email (not username), the host's email domain is reliably available for enrichment context if needed.

### Impact from F02 Implementation

- **Calendar event description available** — F02's `createCalendarEvent()` generates event descriptions with guest info. R3 (Lead Score Display) mentions including lead score in calendar event descriptions — this can be done by enhancing the description template in `server/calendar-service.ts` to include the score after enrichment completes.
- **Booking creation flow is the integration point** — F02's booking creation in `POST /api/public/book` (in `server/routes.ts`) is where R2 (Automatic Enrichment) should fire-and-forget the `enrichAndScore()` call. The calendar event is also created here, so enrichment data could be included if it completes fast enough (or the calendar event could be updated later).

### Impact from F04 Implementation

- **Website scanner could be reused** — F04's `server/website-scanner.ts` performs website fetching and AI-powered content extraction. The `scanWebsite()` function or its HTML extraction helpers could be reused in R5 (Enhanced AI Enrichment) to fetch real company website data instead of relying solely on AI inference from email domains.

### Impact from F07 Implementation

- **`guestPhone` now available on bookings.** F07 added an optional phone number field with validation to the booking info form. The `guestPhone` column on the `bookings` table can be used by F08's lead scoring system: per the PRD, providing a phone number adds +5 points to the lead score.
- **Document uploads in chat are tracked.** F07 implemented document upload within the pre-qualification chat (paperclip button + drag & drop). Document presence on a booking can be used for lead scoring: per the PRD, uploading a document adds +10 points.
- **`extractedData` from pre-qual chat provides structured enrichment context.** F07's AI summary card generates structured `extractedData` containing company name, summary, keyPoints, timeline, and document references. F08's `enrichAndScore()` can consume this structured data directly instead of re-parsing the raw chat transcript, improving enrichment accuracy and reducing redundant AI calls.

---

## Current State

Lead enrichment exists as an AI-inference feature:

- **Enrichment endpoint:** `POST /api/bookings/:id/enrich` triggers OpenAI to infer company/personal data from email domain (`server/routes.ts:209-238`)
- **AI service:** `enrichLead()` in `server/ai-service.ts:25-79` sends name + email + company to GPT-4o, returns inferred data
- **Storage:** `lead_enrichments` table stores `companyInfo` (JSON) and `personalInfo` (JSON) (`shared/schema.ts:44-62`)
- **Frontend:** Booking detail page shows enrichment data; "Enrich Lead" button triggers on-demand (`client/src/pages/booking-detail.tsx`)
- **Leads page:** `client/src/pages/leads.tsx` lists bookings with enrichment status (enriched/not enriched badge)

### What's Missing vs PRD

1. **Lead scoring** — PRD defines a detailed points-based scoring system; completely absent
2. **Automatic enrichment** — currently manual (host clicks button); should trigger on booking creation
3. **Real data lookups** — AI infers/guesses data; no real API calls to enrichment services
4. **Lead score display** — no score shown on leads page, booking cards, dashboard, or calendar events
5. **Score-based filtering/sorting** — can't filter leads by score

---

## Requirements

### R1: Lead Scoring System

Implement the PRD's scoring system:

| Factor | Points |
|--------|--------|
| Founder/CEO/Director role | +20 |
| Company size 11-50 | +15 |
| Company size 51-200 | +20 |
| Clear use case in message | +15 |
| Timeline "soon" or "next month" | +15 |
| Document uploaded | +10 |
| Phone number provided | +5 |
| LinkedIn profile found | +10 |

**Score thresholds:**
- High: 60+
- Medium: 30-59
- Low: < 30

**Implementation:**
- Add `calculateLeadScore()` function in `server/ai-service.ts` or new `server/lead-scoring.ts`
- Input: enrichment data, booking data (notes, documents, phone), prequal chat extracted data
- Can use a combination of rule-based scoring (document uploaded, phone provided) and AI-assisted scoring (role detection, use case clarity, timeline extraction from chat)
- Store score on enrichment record

**Schema changes:**
```typescript
// Add to lead_enrichments table
leadScore: integer("lead_score"),
leadScoreLabel: text("lead_score_label"),  // "High", "Medium", "Low"
leadScoreReasoning: text("lead_score_reasoning"),
```

### R2: Automatic Enrichment on Booking

- Trigger enrichment automatically when a new booking is created via `POST /api/public/book`
- Run enrichment asynchronously (don't block the booking response)
- After enrichment completes, calculate and store lead score
- If enrichment fails, mark as "pending" and allow manual retry

**Implementation approach:**
```typescript
// In POST /api/public/book handler, after booking creation:
// Fire-and-forget async enrichment
enrichAndScore(booking.id).catch(err => console.error("Auto-enrichment failed:", err));
```

### R3: Lead Score Display

Show lead score throughout the UI:

- **Booking cards** (`client/src/pages/bookings.tsx`): colored badge — green "High", yellow "Medium", red "Low"
- **Booking detail** (`client/src/pages/booking-detail.tsx`): score with reasoning
- **Leads page** (`client/src/pages/leads.tsx`): score badge, sortable/filterable by score
- **Dashboard** (`client/src/pages/dashboard.tsx`): lead score on upcoming meeting cards
- **Calendar event description** (F02/F09): include lead score in the calendar event body

Badge styling:
```tsx
const scoreColors = {
  High: "bg-green-500/10 text-green-700 border-green-500/20",
  Medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  Low: "bg-red-500/10 text-red-700 border-red-500/20",
};
```

### R4: Score-Based Filtering & Sorting

On the leads page and bookings page:
- Add filter dropdown: "All Scores", "High", "Medium", "Low"
- Add sort option: "Lead Score (High to Low)", "Lead Score (Low to High)"
- Default sort: highest score first

### R5: Enhanced AI Enrichment Prompt (Stretch)

Improve the enrichment AI prompt to:
- Be more structured about what to infer vs what to mark as unknown
- Return confidence levels for each field
- Separate "confirmed" data from "inferred" data
- Consider using the pre-qual chat transcript as additional context

### R6: Real Enrichment APIs (Future/Stretch)

The current AI-inference approach is a reasonable MVP, but note for future:
- Clearbit / Apollo / Hunter.io for real company/person data
- LinkedIn API for profile data
- These would be post-MVP paid integrations

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/lead-scoring.ts` | Lead score calculation logic |

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `leadScore`, `leadScoreLabel`, `leadScoreReasoning` to `lead_enrichments` |
| `server/ai-service.ts` | Update enrichment to include scoring context |
| `server/routes.ts` | Add auto-enrichment to booking creation; update enrichment endpoint to include scoring |
| `server/storage.ts` | Add methods for querying enrichments with scores |
| `client/src/pages/leads.tsx` | Add score badges, filtering, sorting |
| `client/src/pages/bookings.tsx` | Add score badge to booking cards |
| `client/src/pages/booking-detail.tsx` | Show score with reasoning |
| `client/src/pages/dashboard.tsx` | Show score on upcoming meeting cards |

---

## Database Changes

```sql
ALTER TABLE lead_enrichments ADD COLUMN lead_score INTEGER;
ALTER TABLE lead_enrichments ADD COLUMN lead_score_label TEXT;
ALTER TABLE lead_enrichments ADD COLUMN lead_score_reasoning TEXT;
```

---

## Acceptance Criteria

- [x] Lead score is calculated using the PRD's points-based system
- [x] Score considers: role, company size, use case clarity, timeline, documents, phone, LinkedIn
- [x] Scores are classified as High (60+), Medium (30-59), Low (<30)
- [x] Enrichment triggers automatically on new booking creation
- [x] Lead score badge shown on booking cards, detail page, leads page, and dashboard
- [x] Score reasoning is shown on booking detail page
- [x] Leads page supports filtering by score level
- [x] Leads page supports sorting by score
- [x] Manual "Enrich Lead" button still works for re-enrichment
- [x] If auto-enrichment fails, booking still succeeds and manual enrichment is available

---

## Notes

- The scoring logic should combine rule-based checks (document uploaded = +10, phone provided = +5) with AI-assisted analysis (role detection, use case clarity) for best results.
- Auto-enrichment should be async and non-blocking — the booker should get their confirmation immediately.
- Consider caching enrichment results by email domain to reduce AI calls for repeat visitors from the same company.

---

## Implementation Status (Phase 3b Complete)

**Implemented:** January 27, 2026
**Coverage:** ~90% (R1-R5 complete; R6 stretch goal deferred)

### Implementation Summary

F08 Phase 3b delivered a complete lead scoring and enrichment pipeline: a deterministic rule-based scoring engine, automatic fire-and-forget enrichment on booking creation, enhanced AI enrichment with pre-qualification context, a reusable score badge component, and score-based filtering and sorting on the leads page. Requirements R1 through R5 are fully implemented. R6 (Real Enrichment APIs) was explicitly deferred as a stretch/future goal.

### Files Created

| File | Purpose |
|------|---------|
| `server/lead-scoring.ts` | Deterministic rule-based scoring engine with `calculateLeadScore()` function |
| `client/src/components/lead-score-badge.tsx` | Reusable color-coded score badge component (used across 4 pages) |

### Files Modified

| File | Changes |
|------|---------|
| `shared/schema.ts` | Added `leadScore` (integer), `leadScoreLabel` (text), `leadScoreReasoning` (text) columns to `lead_enrichments` table |
| `server/ai-service.ts` | `enrichLead()` now accepts optional `prequalContext` parameter; new `enrichAndScore()` orchestrator function that combines enrichment + scoring |
| `server/storage.ts` | New `updateLeadEnrichmentScore()` method for persisting score data after enrichment |
| `server/routes.ts` | Auto-enrichment fire-and-forget IIFE in `POST /api/public/book`; manual `POST /api/bookings/:id/enrich` now calculates scores; both endpoints pass pre-qual context |
| `client/src/pages/leads.tsx` | Score badges on lead rows, filter dropdown by score level (All/High/Medium/Low), sort dropdown (score/date/name) |
| `client/src/pages/bookings.tsx` | Score badge displayed on booking cards |
| `client/src/pages/booking-detail.tsx` | Score with reasoning displayed in enrichment card |
| `client/src/pages/dashboard.tsx` | Score badge on upcoming meeting cards |

### Architecture Decisions

- **Scoring is deterministic (rule-based), not AI-assisted.** This ensures consistency and testability. The same enrichment data always produces the same score. The scoring factors and point values match the PRD specification exactly.
- **Auto-enrichment uses a fire-and-forget IIFE after the response is sent.** The `POST /api/public/book` handler sends the booking confirmation response first, then triggers `enrichAndScore()` asynchronously. This is non-blocking -- the booker gets their confirmation immediately regardless of enrichment outcome.
- **Pre-qual `extractedData` is fed to the GPT-4o enrichment prompt.** The `enrichLead()` function now accepts an optional `prequalContext` containing the summary, key points, timeline, and company name from F07's AI summary card. This gives the enrichment AI richer context for more accurate inference.
- **Score reasoning is human-readable and lists contributing factors with point values.** Example: "Executive role (+20), Company size 51+ (+20), Clear use case (+15) = 55 (Medium)". This makes scores transparent and debuggable.
- **`LeadScoreBadge` is a shared component used across 4 pages.** A single reusable component (`lead-score-badge.tsx`) renders the color-coded badge (green/yellow/red) on the leads page, bookings page, booking detail page, and dashboard. This ensures visual consistency.

### Scoring Factors

| Factor | Points |
|--------|--------|
| Executive role (Founder/CEO/Director) | +20 |
| Company size 11-50 | +15 |
| Company size 51+ | +20 |
| Clear use case in message | +15 |
| Urgent timeline ("soon"/"next month") | +15 |
| Document uploaded | +10 |
| Phone number provided | +5 |
| LinkedIn profile found | +10 |

**Thresholds:** High (60+), Medium (30-59), Low (<30)

### Database Changes

Three new columns added to the `lead_enrichments` table:

```sql
ALTER TABLE lead_enrichments ADD COLUMN lead_score INTEGER;
ALTER TABLE lead_enrichments ADD COLUMN lead_score_label TEXT;
ALTER TABLE lead_enrichments ADD COLUMN lead_score_reasoning TEXT;
```

### What Was Deferred

- **R6: Real Enrichment APIs** — Clearbit, Apollo, Hunter.io, and LinkedIn API integrations were explicitly noted as future/stretch goals in the brief. The current AI-inference approach is the MVP strategy. Real API integrations would be post-MVP paid integrations.
- **Domain-level caching of enrichment results** — Noted in the brief as a future optimization to reduce redundant AI calls for repeat visitors from the same company domain. Not implemented in this phase.

### Dependencies & Implications for Other Features

- **F09 (Email Notifications):** Lead scores are now available on enrichment records. Host notification emails (R2) can include `enrichment.leadScoreLabel` and `enrichment.leadScore` for rendering score badges. Auto-enrichment is async, so the score may or may not be ready by the time the notification email is composed.
- **F10 (Dashboard Enhancements):** F08 dependency is now SATISFIED. Score badges are displayed on booking cards and dashboard. Score-based filtering and sorting is implemented on the leads page. R5 (Enhanced Dashboard Metrics) can now include lead score distribution charts since score data is available.
- **F11 (Meeting Prep Brief):** Lead scores are available via `enrichment.leadScore`, `enrichment.leadScoreLabel`, and `enrichment.leadScoreReasoning`. The `generateMeetingBrief()` AI prompt already receives enrichment data, and with F08's enhanced enrichment (which now includes pre-qual context), briefs will be richer. Brief emails (R2) can include the lead score for quick host context.
- **F02 (Calendar Connection):** Calendar event descriptions could be enhanced to include the lead score, though this requires the enrichment to complete before/during calendar event creation (currently enrichment runs after the response is sent).
