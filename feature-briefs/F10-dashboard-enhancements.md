# F10: Booking Management Dashboard Enhancements

**Priority:** Medium
**Estimated Scope:** Small-Medium
**Dependencies:** F08 (for lead score display) — **SATISFIED**, F12 (for reschedule functionality)

---

## Impact from F01 Implementation

- **No direct dependency on F01**. Dashboard enhancements are about booking management UI.
- **User data shape updated** — the `/api/auth/user` response now includes `emailVerified` and excludes `password`. If the dashboard displays user info, it should use the updated shape.

---

## Current State

The dashboard and booking management have basic functionality:

- **Dashboard** (`client/src/pages/dashboard.tsx`): 4 metric cards (today's meetings, total bookings, event types, enriched leads), upcoming meetings list (5), event types grid (4)
- **Bookings page** (`client/src/pages/bookings.tsx`): upcoming/past tabs, search by name/email/company, cancel with confirmation dialog, dropdown menu (view details, meeting brief, cancel)
- **Booking detail** (`client/src/pages/booking-detail.tsx`): full booking info, enrichment data, meeting brief, action buttons (enrich, generate brief)
- **API:** `GET /api/bookings` returns all bookings with details; `DELETE /api/bookings/:id` sets status to cancelled

### What's Missing vs PRD

1. **Calendar/month view** — no visual calendar showing bookings
2. **Date range filter** — no filter by date range
3. **Event type filter** — no filter by event type
4. **Reschedule from dashboard** — no reschedule capability (F12 dependency)
5. ~~**Lead score on booking cards** — not displayed (F08 dependency)~~ **DONE (F08)** — score badges on booking cards, leads page, booking detail, and dashboard
6. **Sorting options** — can't sort by date, name, or score on bookings page (note: leads page now has sorting via F08)
7. **Booking status management** — only cancel; no mark as completed, no-show tracking

---

## Requirements

### R1: Date Range Filter

Add date range picker to bookings page:
- Filter presets: "Today", "This Week", "This Month", "Next 7 Days", "Next 30 Days", "Custom Range"
- Custom range: two date pickers (from/to)
- Applied client-side on the existing data (or add query params to API for server-side filtering)
- Default: show all upcoming bookings

### R2: Event Type Filter

Add event type dropdown filter to bookings page:
- Dropdown populated from user's event types
- Options: "All Event Types", then each event type by name
- Filter applied alongside search and date range

### R3: Sorting Options

Add sort dropdown to bookings page:
- Options: "Date (Newest First)", "Date (Oldest First)", "Name (A-Z)", "Name (Z-A)"
- If F08 is complete: "Lead Score (High-Low)", "Lead Score (Low-High)"
- Default: Date (Newest First) for past, Date (Soonest First) for upcoming

### R4: Calendar Month View

Add a calendar month view as a tab alongside "Upcoming" and "Past":
- Month grid showing days with booking indicators
- Click a day to expand and see bookings for that day
- Color-coded dots by event type
- Navigation: prev/next month
- Use an existing calendar component or build with the grid pattern used in the booking page
- This can use a library like `react-day-picker` (already installed) or `@fullcalendar/react`

### R5: Enhanced Dashboard Metrics

Add more useful stats to the dashboard:
- **This week's bookings** count
- **Lead score breakdown**: pie/bar chart showing High/Medium/Low distribution (requires F08)
- **Booking trend**: simple line chart showing bookings per week over last 4 weeks (using recharts, already installed)
- **Conversion rate placeholder**: "X bookings from Y page views" (requires analytics tracking, stretch)

### R6: Booking Status Management

Extend booking status beyond "confirmed" and "cancelled":
- Add "completed" status (auto-set after meeting end time passes, or manual toggle)
- Add "no-show" status (host can mark a booking as no-show)
- Add status filter on bookings page
- Update the `deleteBooking` function to be a proper status update endpoint

Add `PATCH /api/bookings/:id/status`:
```json
{ "status": "completed" | "cancelled" | "no-show" }
```

### R7: Booking Quick Actions

On booking cards, add:
- One-click "Enrich" if not yet enriched
- One-click "Generate Brief" if no brief exists
- Quick copy of meeting link
- Quick email to booker (mailto: link)

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/pages/bookings.tsx` | Add date range filter, event type filter, sorting, calendar view tab, status management |
| `client/src/pages/dashboard.tsx` | Add charts/metrics, lead score badges |
| `client/src/pages/booking-detail.tsx` | Add status change buttons (complete, no-show), reschedule button |
| `server/routes.ts` | Add `PATCH /api/bookings/:id/status` endpoint; optionally add query params to GET bookings |
| `server/storage.ts` | Add method to update booking status |

---

## Acceptance Criteria

- [ ] Bookings page has date range filter (presets and custom range)
- [ ] Bookings page has event type filter dropdown
- [ ] Bookings page has sorting options (date, name, optionally score)
- [ ] Calendar month view tab shows bookings as colored dots on a monthly grid
- [ ] Clicking a day in calendar view shows that day's bookings
- [ ] Dashboard shows weekly booking trend chart
- [ ] Bookings can be marked as "completed" or "no-show"
- [ ] Status filter available on bookings page
- [ ] Quick actions available on booking cards (enrich, brief, copy link)

---

## Notes

- Most of this work is frontend-only, filtering and transforming the data already returned by the API.
- The calendar month view is the biggest UI piece. Consider whether to use `react-day-picker` (already installed) or a dedicated calendar component.
- Recharts is already installed for charts on the dashboard.
- Lead score display depends on F08 being complete; design the UI to gracefully handle missing scores.

---

### Impact from F08 Implementation

- **F08 dependency is now SATISFIED.** F10 listed F08 as a dependency for lead score display. F08 has implemented lead scores with a deterministic rule-based scoring engine (`server/lead-scoring.ts`), and score badges are already displayed on booking cards (`client/src/pages/bookings.tsx`) and the dashboard (`client/src/pages/dashboard.tsx`).
- **Score-based filtering and sorting is implemented on the leads page.** F08 added a filter dropdown (All/High/Medium/Low) and a sort dropdown (score/date/name) to `client/src/pages/leads.tsx`. F10's R3 (Sorting Options) can build on this pattern for the bookings page, and the "Lead Score (High-Low)" / "Lead Score (Low-High)" sort options are already feasible since score data is available on enrichment records.
- **Dashboard shows score badges on upcoming meetings.** F08 added `LeadScoreBadge` components to the upcoming meetings list on the dashboard. F10's R5 (Enhanced Dashboard Metrics) can now include lead score distribution charts (e.g., pie/bar chart showing High/Medium/Low breakdown) since `enrichment.leadScore` and `enrichment.leadScoreLabel` data is available for all enriched bookings.
- **R5 lead score breakdown chart is now feasible.** The brief specifically calls for "Lead score breakdown: pie/bar chart showing High/Medium/Low distribution (requires F08)." With F08 complete, this chart can query enrichment records and aggregate by `leadScoreLabel` to render the distribution using the already-installed Recharts library.
