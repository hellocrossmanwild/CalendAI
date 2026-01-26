# F03: AI-Assisted Availability Setup

**Priority:** Medium
**Estimated Scope:** Medium
**Dependencies:** F02 (Calendar Connection must be functional to analyse calendar patterns) — **SATISFIED**

---

## Impact from F01 Implementation

- **User authentication is in place** — users can register, login, and maintain sessions. The onboarding wizard (R3) can rely on authenticated user context.
- **`emailVerified` field available** — could optionally gate onboarding behind email verification.
- **`updateUser()` storage method available** — can be used to store timezone and other user preferences set during onboarding.
- **User model now has `emailVerified` field** — schema at `shared/models/auth.ts` has been expanded; further additions (timezone, companyName) will follow in F13.

### Impact from F02 Implementation

- **F02 dependency is satisfied** — Google Calendar OAuth, token refresh, event fetching, and availability calculation are fully implemented.
- **`calculateAvailability()` exists** — `server/calendar-service.ts` already calculates available slots by checking Google Calendar events and CalendAI bookings against 9am-5pm working hours with buffer support. F03 needs to replace the hardcoded 9-5 hours with user-configurable availability rules.
- **`getCalendarEvents()` available** — F03's AI calendar analysis (R2) can use this function to fetch 2-4 weeks of events for pattern detection.
- **`getBookingsByDateRange()` in storage** — available for querying existing bookings when calculating availability.
- **Buffer enforcement implemented** — `calculateAvailability()` already applies `bufferBefore` and `bufferAfter` from event types.
- **Calendar connection UI in settings** — F03's onboarding wizard (R3, Step 1) can check calendar connection status via `GET /api/calendar/status`.

---

## Current State — IMPLEMENTED

All five requirements (R1-R5) are fully implemented.

### What Was Built

1. **Availability rules data model (R1)** — `availability_rules` table in `shared/schema.ts` with timezone, weeklyHours (JSONB), minNotice, maxAdvance, defaultBufferBefore, defaultBufferAfter. Storage CRUD in `server/storage.ts` with upsert support.
2. **AI calendar pattern analysis (R2)** — `analyseCalendarPatterns()` in `server/ai-service.ts` fetches 4 weeks of Google Calendar events and uses GPT-4o to detect working hours, recurring breaks, and suggest optimal availability settings.
3. **Onboarding wizard (R3)** — `client/src/pages/onboarding.tsx` with 4-step flow: Connect Calendar → AI Analysis → Review & Edit Availability → Confirmation. Visual weekly schedule editor with day toggles, time pickers, smart break insertion, timezone selection, and min notice / max advance configuration.
4. **Slot generation uses stored rules (R4)** — `calculateAvailability()` in `server/calendar-service.ts` now reads availability rules from storage, supports multiple time blocks per day, enforces min notice and max advance limits, and falls back to Mon-Fri 9-5 defaults when no rules exist.
5. **Settings availability section (R5)** — Availability card in `client/src/pages/settings.tsx` with inline editing per day, time picker dropdowns (24h internally), toggle days, add/remove breaks, timezone selector, min notice & max advance dropdowns, and save functionality.
6. **API endpoints** — `GET /api/availability-rules`, `PUT /api/availability-rules` (with HH:MM and range validation), `POST /api/availability-rules/analyse`.

### Files Created
- `client/src/pages/onboarding.tsx`

### Files Modified
- `shared/schema.ts` — added `availabilityRules` table, insert schema, types
- `server/storage.ts` — added `getAvailabilityRules()` and `upsertAvailabilityRules()` to interface + implementation
- `server/routes.ts` — added 3 availability-rules API endpoints with validation
- `server/ai-service.ts` — added `analyseCalendarPatterns()`, `AvailabilitySuggestions` interface, `getDefaultSuggestions()`
- `server/calendar-service.ts` — rewrote `calculateAvailability()` to use stored rules with multi-block support
- `client/src/App.tsx` — added `/onboarding` route (renders outside sidebar layout, requires auth)
- `client/src/pages/settings.tsx` — added Availability card with weekly editor

---

## Requirements

### R1: Availability Rules Data Model

Add an `availability_rules` table (or JSON field on users table):

```typescript
// Option A: New table
export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  timezone: text("timezone").notNull().default("UTC"),
  weeklyHours: jsonb("weekly_hours").$type<{
    [day: string]: { start: string; end: string }[] | null;
    // e.g. { "monday": [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }], "saturday": null }
  }>(),
  minNotice: integer("min_notice").default(1440),    // minutes (default 24h)
  maxAdvance: integer("max_advance").default(60),     // days (default 60)
  defaultBufferBefore: integer("default_buffer_before").default(0),
  defaultBufferAfter: integer("default_buffer_after").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
```

### R2: AI Calendar Analysis

Add to `server/ai-service.ts` or create `server/availability-service.ts`:

- `analyseCalendarPatterns(events[])` — takes 2-4 weeks of calendar events and returns:
  - Detected working hours per day
  - Recurring blocks (e.g., lunch, team standup)
  - Light/heavy days
  - Suggested buffer time between meetings
- Use OpenAI to interpret patterns:
  ```
  AI: "It looks like you're typically available Monday to Friday, 9am-5pm,
  with lunch blocked 12-1pm. Does this look right?"

  AI: "You seem to keep Fridays light — want me to exclude Fridays from bookings?"

  AI: "You usually have 30-minute gaps between meetings. Should I add a 15-minute
  buffer automatically?"
  ```

### R3: Onboarding Wizard (Frontend)

Create a new page/flow at `/onboarding` that users see after first signup:

**Steps:**
1. **Connect Calendar** — prompt to connect Google Calendar (uses F02)
2. **AI Analysis** — loading state while AI scans calendar ("Analysing your schedule...")
3. **Review Suggestions** — show AI-suggested availability with visual schedule editor
4. **Confirm** — save availability rules
5. **Next: Create Event Type** — segue to F04 or standard event type creation

**UI for availability editor:**
- Visual weekly grid showing Mon-Sun
- Toggle days on/off
- Set start/end times per day
- Add breaks (e.g., 12-1pm lunch)
- Set min notice period (dropdown: 1hr, 2hr, 4hr, 24hr, 48hr)
- Set max advance booking (dropdown: 2 weeks, 1 month, 2 months, 3 months)

### R4: Availability Rules Applied to Slot Generation

Update `calculateAvailability()` in `server/calendar-service.ts` (which already handles Google Calendar events, CalendAI bookings, and buffer enforcement) to:
1. Look up the host's `availability_rules` for the event type's user
2. Check if the requested date is an enabled day
3. Generate slots only within the configured hours for that day (replacing the hardcoded `WORKING_HOURS_START = 9` and `WORKING_HOURS_END = 17` constants)
4. Apply minimum notice period (e.g., can't book within 24 hours)
5. Apply maximum advance booking limit
6. Apply buffers from availability rules + event type overrides (buffer enforcement already exists)
7. Calendar event checking and double-booking prevention are already implemented by F02

### R5: Settings Integration

Add "Availability" section to settings page (`client/src/pages/settings.tsx`) or create a dedicated `/settings/availability` page:
- Same visual weekly grid editor from onboarding
- Save/update availability rules
- Show current timezone with ability to change

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/pages/onboarding.tsx` | Post-signup onboarding wizard |
| `server/availability-service.ts` | Calendar analysis + availability calculation with rules |

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `availabilityRules` table |
| `server/storage.ts` | Add CRUD for availability rules |
| `server/routes.ts` | Add availability rules API endpoints; update public availability endpoint |
| `server/ai-service.ts` | Add `analyseCalendarPatterns()` function |
| `client/src/App.tsx` | Add `/onboarding` route |
| `client/src/pages/settings.tsx` | Add availability editor section |

---

## API Endpoints

```
GET    /api/availability-rules         → Get current user's availability rules
PUT    /api/availability-rules         → Create/update availability rules
POST   /api/availability-rules/analyse → Trigger AI analysis of calendar (returns suggestions)
```

---

## Acceptance Criteria

- [x] Availability rules are stored per user (timezone, weekly hours, min notice, max advance, buffers)
- [x] After signup, user sees onboarding wizard prompting calendar connection
- [x] AI analyses connected calendar and suggests working hours
- [x] User can review and adjust AI suggestions before saving
- [x] Visual weekly schedule editor lets user set hours per day
- [x] Public availability endpoint uses stored rules instead of hardcoded 9-5
- [x] Minimum notice period is enforced (e.g., can't book within 24 hours)
- [x] Maximum advance booking is enforced
- [x] Settings page includes availability configuration section
- [x] If no availability rules set, defaults to Mon-Fri 9am-5pm

---

## Notes

- F02 (Calendar Connection) is complete — AI analysis can use `getCalendarEvents()` to fetch real calendar data for pattern detection.
- The availability rules should be the single source of truth for what hours are bookable; event type buffers are applied on top.
- Timezone is critical here — store the user's timezone and convert all slot calculations correctly.
