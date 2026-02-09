# Performance Audit Report

**Project:** CalendAI
**Date:** 2026-02-09
**Auditor:** Performance Engineer (automated audit)
**Scope:** Full codebase -- server, client, shared, build configuration

---

## Severity Legend

| Rating | Meaning |
|--------|---------|
| :red_circle: CRITICAL | Causes outages, data loss, or >1 s latency under normal load |
| :orange_circle: HIGH | Measurable user-facing degradation; should fix before scaling |
| :yellow_circle: MEDIUM | Noticeable under moderate load or large data sets |
| :blue_circle: LOW | Minor inefficiency; optimise when convenient |

---

## 1. Database

### 1.1 :red_circle: CRITICAL -- N+1 Query Storm in `getBookingsWithDetails`

**File:** `server/storage.ts:296-315`

`getBookingsWithDetails()` fetches all bookings for a user, then issues **3 additional queries per booking** (eventType, enrichment, brief) inside a `Promise.all(userBookings.map(...))` loop.

For a user with 100 bookings this fires **301 queries** (1 + 3*100). This endpoint is called on **every page load** of Dashboard, Bookings, Leads, and Briefs.

```ts
// storage.ts:299-311
const bookingsWithDetails = await Promise.all(
  userBookings.map(async (booking) => {
    const [eventType] = await db.select().from(eventTypes)...
    const [enrichment] = await db.select().from(leadEnrichments)...
    const [brief] = await db.select().from(meetingBriefs)...
    ...
  })
);
```

**Impact:** Linear query growth per booking; database connection exhaustion under load.
**Fix:** Replace with JOINs or use Drizzle's `with` (relations query) to fetch all data in 1-4 queries.

---

### 1.2 :red_circle: CRITICAL -- N+1 Query in `getBookingWithDetails` (single booking)

**File:** `server/storage.ts:276-294`

Fetches a single booking then fires **5 sequential queries** for related tables (eventType, enrichment, prequalResponse, documents, brief). Called on booking detail view and during brief generation.

```ts
// storage.ts:280-284
const [eventType] = await db.select().from(eventTypes)...
const [enrichment] = await db.select().from(leadEnrichments)...
const [prequalResponse] = await db.select().from(prequalResponses)...
const docs = await db.select().from(documents)...
const [brief] = await db.select().from(meetingBriefs)...
```

**Impact:** 6 round trips per booking detail request.
**Fix:** Use a single query with JOINs or a Drizzle relational query.

---

### 1.3 :red_circle: CRITICAL -- N+1 Query in `deleteUserAndData`

**File:** `server/storage.ts:166-203`

Iterates over every booking and issues **4 DELETE queries per booking** inside a loop:

```ts
// storage.ts:173-178
for (const bookingId of bookingIds) {
  await db.delete(meetingBriefs).where(eq(meetingBriefs.bookingId, bookingId));
  await db.delete(leadEnrichments).where(eq(leadEnrichments.bookingId, bookingId));
  await db.delete(prequalResponses).where(eq(prequalResponses.bookingId, bookingId));
  await db.delete(documents).where(eq(documents.bookingId, bookingId));
}
```

**Impact:** For a user with N bookings, this fires 4*N + 6 DELETE queries. A user with 200 bookings triggers ~806 queries.
**Fix:** Use batch `DELETE ... WHERE booking_id IN (...)` or rely on `ON DELETE CASCADE` foreign keys already defined in the schema.

---

### 1.4 :orange_circle: HIGH -- Missing Database Indexes on Frequently Queried Columns

**Files:** `shared/schema.ts:10-28`, `shared/schema.ts:31-49`, `shared/models/auth.ts:17-42`

No explicit indexes are defined on:

| Table | Column(s) | Query Pattern |
|-------|-----------|---------------|
| `event_types` | `user_id` | `getEventTypes(userId)` -- full table scan per user |
| `event_types` | `slug` | `getEventTypeBySlug(slug)` -- used on every public booking page load |
| `bookings` | `user_id` | `getBookings(userId)`, `getBookingsWithDetails(userId)` |
| `bookings` | `user_id, start_time, status` | `getBookingsByDateRange()` -- availability calculation |
| `bookings` | `status, start_time` | `getUpcomingBookingsWithoutBriefs()` -- scheduler query every 15 min |
| `bookings` | `guest_email` | `getBookingsByGuestDomain()` -- LIKE query without index |
| `lead_enrichments` | `booking_id` | Every enrichment lookup |
| `meeting_briefs` | `booking_id` | Every brief lookup |
| `prequal_responses` | `booking_id` | Every prequal lookup |
| `documents` | `booking_id` | Every documents lookup |
| `users` | `email` | Login, registration, magic link -- unique constraint provides this |

The `unique()` constraints on `rescheduleToken` and `cancelToken` implicitly create indexes, and `users.email` has a unique constraint. But the high-traffic columns above have no indexes at all.

**Impact:** Full table scans on every API request. Degrades as data grows.
**Fix:** Add composite and single-column indexes using Drizzle's `index()` helper.

---

### 1.5 :orange_circle: HIGH -- Unbounded Query: All Bookings Fetched Without Pagination

**File:** `server/storage.ts:267-269`

```ts
async getBookings(userId: string): Promise<Booking[]> {
  return db.select().from(bookings).where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.startTime));
}
```

And `getBookingsWithDetails` at line 296 similarly fetches ALL bookings. No `LIMIT` or pagination is applied. The `/api/bookings` endpoint (routes.ts:661-669) returns the entire history.

**Impact:** Response size and processing time grow without bound as users accumulate bookings. A user with 1000 bookings loads all 1000 + 3000 sub-queries.
**Fix:** Add server-side pagination (cursor or offset-based) and `LIMIT` clauses.

---

### 1.6 :orange_circle: HIGH -- Unread Briefs Count Uses `SELECT *` Then `.length`

**File:** `server/storage.ts:463-475`

```ts
async getUnreadBriefsCount(userId: string): Promise<number> {
  const result = await db
    .select()
    .from(meetingBriefs)
    .innerJoin(bookings, eq(meetingBriefs.bookingId, bookings.id))
    .where(and(eq(bookings.userId, userId), sql`...IS NULL`));
  return result.length;
}
```

Fetches all matching rows (full `SELECT *` with JOIN) only to return `result.length`.

**Impact:** Transfers entire row data over the wire for a simple count. Wasteful memory and bandwidth.
**Fix:** Use `SELECT COUNT(*)` or Drizzle's `count()` aggregate.

---

### 1.7 :orange_circle: HIGH -- `NOT IN` Subquery in Scheduler Query

**File:** `server/storage.ts:341`

```ts
sql`${bookings.id} NOT IN (SELECT booking_id FROM meeting_briefs)`
```

`NOT IN` with a subquery is known to perform poorly on large tables and has NULL-safety issues. This runs every 15 minutes via the brief scheduler.

**Impact:** Degrades as `meeting_briefs` table grows.
**Fix:** Use `NOT EXISTS` or a `LEFT JOIN ... WHERE ... IS NULL` pattern.

---

### 1.8 :yellow_circle: MEDIUM -- No Connection Pool Sizing Configuration

**File:** `server/db.ts:13`

```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

The `pg` Pool uses its default max of **10 connections**. Given the N+1 patterns above, 10 connections can be quickly exhausted during concurrent requests.

**Impact:** Connection starvation under moderate concurrent load.
**Fix:** Configure `max`, `idleTimeoutMillis`, and `connectionTimeoutMillis` explicitly.

---

### 1.9 :yellow_circle: MEDIUM -- LIKE Query Without Index for Guest Domain Search

**File:** `server/storage.ts:347-358`

```ts
sql`${bookings.guestEmail} LIKE ${'%@' + domain}`
```

Leading-wildcard LIKE patterns (`%@domain`) cannot use B-tree indexes and always trigger full table scans.

**Impact:** Slow for large bookings tables. Called during brief generation.
**Fix:** Add a materialised `guest_domain` column with an index, or use a GIN trigram index.

---

## 2. Memory

### 2.1 :orange_circle: HIGH -- Full Dataset Loading on Multiple Frontend Pages

**Files:**
- `client/src/pages/dashboard.tsx:33-35` -- fetches ALL bookings for metric cards
- `client/src/pages/bookings.tsx:121-123` -- fetches ALL bookings
- `client/src/pages/leads.tsx:27-29` -- fetches ALL bookings
- `client/src/pages/briefs.tsx` -- fetches ALL bookings, filters client-side

All four pages fetch the **same** `/api/bookings` endpoint that returns every booking with full details (enrichment, eventType, brief). For a user with 500 bookings, this is a multi-MB JSON payload parsed into memory on each page.

The Briefs page then discards most of this data:
```ts
// briefs.tsx (client-side filtering)
const bookingsWithBriefs = bookings?.filter((b) => b.brief) || [];
```

**Impact:** Excessive browser memory usage and slow JSON parsing on every navigation.
**Fix:** Create dedicated API endpoints (e.g., `/api/dashboard/stats`, `/api/briefs`) that return only needed data. Add pagination.

---

### 2.2 :yellow_circle: MEDIUM -- Request Logging Captures Entire JSON Response Body

**File:** `server/index.ts:88-112`

```ts
// index.ts:93-96
const originalResJson = res.json;
res.json = function (bodyJson, ...args) {
  capturedJsonResponse = bodyJson;  // <-- retains reference to full response
  return originalResJson.apply(res, [bodyJson, ...args]);
};
```

Then at line 104: `JSON.stringify(capturedJsonResponse)` serialises the entire response body a second time for logging.

**Impact:** Doubles memory allocation for every JSON API response. For large `/api/bookings` payloads (hundreds of bookings), this is significant.
**Fix:** Log only the first N characters, or log a summary (status + content-length). Avoid `JSON.stringify` on large payloads.

---

### 2.3 :yellow_circle: MEDIUM -- `COMMON_TIMEZONES` Array Duplicated in `book.tsx` and `settings.tsx`

**Files:** `client/src/pages/book.tsx:84-116`, `client/src/pages/settings.tsx` (similar constant)

A ~30-element timezone array is defined as a module-level constant in at least two separate page components. While the memory impact is small, it contributes to bundle size duplication.

**Impact:** Minor memory and bundle-size waste.
**Fix:** Extract to a shared utility module.

---

## 3. Network

### 3.1 :red_circle: CRITICAL -- No HTTP Response Compression

**File:** `server/index.ts` (entire file, 1-159)

There is no `compression` middleware. All JSON responses are sent uncompressed. The `/api/bookings` endpoint can return 100KB+ of JSON that would compress to ~15KB with gzip.

**Impact:** 5-7x larger payloads over the wire, significantly slower on mobile networks.
**Fix:** Add `compression()` middleware (e.g., `npm install compression`).

---

### 3.2 :orange_circle: HIGH -- Every Request Hits the Database for User Lookup

**File:** `server/index.ts:63-75`

```ts
// Auth middleware - set req.user from session
app.use(async (req, _res, next) => {
  if (req.session.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      ...
```

Every single HTTP request (including static assets served in production) triggers a `SELECT * FROM users WHERE id = ...` query. With 100 requests/second, that is 100 user lookups/second.

**Impact:** Unnecessary database load on every request, including non-API routes.
**Fix:** Cache user data in the session store, or add a short-lived in-memory LRU cache for user lookups. Only run middleware on `/api/*` routes.

---

### 3.3 :orange_circle: HIGH -- Redundant Data Fetching Across Pages

**Files:** `client/src/pages/dashboard.tsx:33-39`, `client/src/pages/bookings.tsx:121-127`, `client/src/pages/leads.tsx:27-29`

Dashboard, Bookings, and Leads all fetch both `/api/bookings` and `/api/event-types` independently. React Query's `staleTime: Infinity` (queryClient.ts:50) helps with caching across navigations within a session, but on first load all three endpoints fire simultaneously.

Settings page fires 4 separate queries: `/api/calendar/status`, `/api/event-types`, `/api/availability-rules`, `/api/notification-preferences`.

**Impact:** Multiple unnecessary API calls on initial page load.
**Fix:** Prefetch common queries at app shell level. Consider combining related endpoints.

---

### 3.4 :orange_circle: HIGH -- AI API Calls Have No Caching

**Files:** `server/ai-service.ts:82-98` (enrichLead), `server/ai-service.ts:167-183` (generateMeetingBrief), `server/ai-service.ts:259-283` (analyseCalendarPatterns), `server/website-scanner.ts:214-253` (scanWebsite GPT call)

Every call to `enrichLead`, `generateMeetingBrief`, `analyseCalendarPatterns`, and `scanWebsite` makes a fresh OpenAI API call. There is no caching of results.

- `scanWebsite` is called when users enter a URL during onboarding or AI event creation. The same URL could be scanned multiple times.
- `enrichLead` could be called repeatedly for the same guest email if the user clicks "Enrich" again (though a check exists for existing enrichment at the route level).

**Impact:** Unnecessary API costs and latency (GPT-4o calls take 2-8 seconds each).
**Fix:** Cache AI results keyed by inputs (e.g., email domain for enrichment, URL for website scanning). Use a TTL-based cache.

---

### 3.5 :yellow_circle: MEDIUM -- `staleTime: Infinity` Prevents Data Freshness

**File:** `client/src/lib/queryClient.ts:50`

```ts
staleTime: Infinity,
```

All queries are configured to **never** go stale automatically. Data only refreshes on explicit invalidation or page reload.

**Impact:** Users may see outdated data (e.g., a new booking made by a guest won't appear until the host manually refreshes or navigates away and back). Combined with `refetchOnWindowFocus: false`, tab switching doesn't trigger re-fetches either.
**Fix:** Use a finite `staleTime` (e.g., 30-60 seconds for bookings) and enable `refetchOnWindowFocus: true` for key queries.

---

### 3.6 :yellow_circle: MEDIUM -- Website Scanner Fetches Full HTML Without Size Limit

**File:** `server/website-scanner.ts:146-179`

```ts
const response = await fetch(validatedUrl, { ... });
html = await response.text();
```

Fetches the entire HTML response with no size limit. A malicious or bloated page could return 50MB+ of HTML, consuming server memory.

**Impact:** Potential memory exhaustion from a single request.
**Fix:** Use streaming with a size limit (e.g., read only the first 512KB).

---

### 3.7 :blue_circle: LOW -- No `Cache-Control` Headers on API Responses

**File:** `server/routes.ts` (all endpoints)

No API endpoint sets `Cache-Control` headers. Browsers and CDNs cannot cache any response.

**Impact:** Missed opportunity for client-side caching of rarely-changing data like event types and availability rules.
**Fix:** Add `Cache-Control: private, max-age=60` for appropriate GET endpoints.

---

## 4. Frontend

### 4.1 :orange_circle: HIGH -- No Code Splitting / Lazy Loading

**File:** `client/src/App.tsx:1-30` (imports section)

All 13 page components are eagerly imported:

```ts
import DashboardPage from "@/pages/dashboard";
import EventTypesPage from "@/pages/event-types";
import BookingsPage from "@/pages/bookings";
import BookingDetailPage from "@/pages/booking-detail";
import LeadsPage from "@/pages/leads";
import BriefsPage from "@/pages/briefs";
import SettingsPage from "@/pages/settings";
import BookPage from "@/pages/book";
import CancelBookingPage from "@/pages/cancel-booking";
import RescheduleBookingPage from "@/pages/reschedule-booking";
import OnboardingPage from "@/pages/onboarding";
import OnboardingWizardPage from "@/pages/onboarding-wizard";
import EventTypeAICreatePage from "@/pages/event-type-ai-create";
```

Every page, including admin-only Settings (1362 lines) and the large BookPage (1362 lines), is bundled into the initial JavaScript payload.

**Impact:** Larger initial bundle, slower time-to-interactive (especially on mobile). The public booking page (`/book/:slug`) loads all admin pages even though guests never use them.
**Fix:** Use `React.lazy()` with `Suspense` for route-level code splitting. At minimum, split authenticated pages from public pages.

---

### 4.2 :orange_circle: HIGH -- Monolithic Settings Component (~1362 Lines)

**File:** `client/src/pages/settings.tsx` (full file, 1-1362)

A single component with:
- ~20 `useState` hooks
- 4 separate `useQuery` calls
- Multiple `useMutation` calls
- No `useMemo` or `useCallback` for expensive computations
- All tabs (Profile, Availability, Calendar, Notifications, Branding, Account) rendered in one component

**Impact:** The entire component re-renders on every state change. Any keystroke in any form field triggers a full re-render of all tabs and their data.
**Fix:** Split into sub-components per tab. Memoize expensive computations. Use `useCallback` for event handlers.

---

### 4.3 :orange_circle: HIGH -- Heavy Library Imports (recharts, framer-motion)

**File:** `client/src/pages/dashboard.tsx:11-22`

```ts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
```

`recharts` (~200KB minified) is imported eagerly on the dashboard. Combined with `framer-motion` (listed in package.json:64), these are large libraries loaded upfront.

**Impact:** Significant bundle size increase. Charts are only used on the dashboard.
**Fix:** Lazy-load recharts and framer-motion. Use dynamic `import()` for chart components.

---

### 4.4 :yellow_circle: MEDIUM -- Dashboard Computes Analytics on Every Render

**File:** `client/src/pages/dashboard.tsx:41-88`

Multiple array operations (`.filter()`, `.sort()`, `.slice()`, `isWithinInterval()`) are performed on the full bookings array on every render without `useMemo`:

```ts
const upcomingBookings = bookings
  ?.filter((b) => new Date(b.startTime) > new Date() && b.status === "confirmed")
  .sort(...)
  .slice(0, 5) || [];

const todayBookings = bookings?.filter(...) || [];
const bookingTrendData = (() => { ... for loop with 4 iterations, each filtering all bookings })();
const leadScoreData = (() => { ... forEach over all bookings })();
```

**Impact:** Redundant computation on every re-render. With 500 bookings, multiple passes create unnecessary work.
**Fix:** Wrap computed values in `useMemo`.

---

### 4.5 :yellow_circle: MEDIUM -- `getBookingsForDay` Called for Every Calendar Day Without Memoization

**File:** `client/src/pages/bookings.tsx:368-371`

```ts
const getBookingsForDay = (day: Date): BookingWithDetails[] => {
  if (!bookings) return [];
  return bookings.filter((b) => isSameDay(new Date(b.startTime), day));
};
```

This is called in the render loop for each calendar grid cell (~35-42 cells). Each call filters the entire bookings array.

**Impact:** 35-42 full array scans on every render of the calendar view.
**Fix:** Pre-compute a `Map<dateString, BookingWithDetails[]>` in `useMemo` and look up by key.

---

### 4.6 :yellow_circle: MEDIUM -- Book Page Has Excessive MutationObserver + ResizeObserver

**File:** `client/src/pages/book.tsx:220-258`

When embedded in an iframe, the book page sets up both a `ResizeObserver` on `document.documentElement` and a `MutationObserver` on `document.body` with `{ childList: true, subtree: true, attributes: true }`, plus a fallback `setInterval` every 500ms.

The `MutationObserver` with `subtree: true` and `attributes: true` fires on **every DOM change anywhere in the page**, each time triggering `requestAnimationFrame(sendHeight)`.

**Impact:** Excessive observer callbacks during any DOM activity (typing, animations, etc.).
**Fix:** Use only `ResizeObserver` (sufficient for height changes). Remove the MutationObserver or limit its scope.

---

### 4.7 :blue_circle: LOW -- No Image Optimization

**Files:** `client/src/pages/book.tsx:809`, `client/src/pages/event-types.tsx:140`

Images (logos, profile images) are rendered as raw `<img>` tags with no lazy loading, no `srcset`, no size constraints:

```tsx
<img src={eventType.logo} alt="" className="h-10 w-10 object-contain" />
```

**Impact:** Potentially large images loaded eagerly on initial page paint.
**Fix:** Add `loading="lazy"`, use `srcset` for responsive images, and consider a CDN with image resizing.

---

## 5. Backend

### 5.1 :orange_circle: HIGH -- Synchronous `bcrypt.hash` Blocks the Event Loop

**Files:** `server/routes.ts:88` (register), `server/routes.ts:133` (login), `server/routes.ts:378` (reset password), `server/routes.ts:537` (change password)

`bcrypt.hash(password, 10)` and `bcrypt.compare(password, hash)` are the async versions, which is correct. However, the bcrypt library with cost factor 10 still takes ~100ms per operation. Under concurrent login/registration requests, this accumulates.

**Impact:** Moderate -- async bcrypt is acceptable for most loads, but worth noting for high-traffic scenarios.
**Fix:** Consider reducing to cost factor 8 for login (compare), or offloading to a worker thread for registration.

---

### 5.2 :orange_circle: HIGH -- Brief Scheduler Processes Bookings Sequentially

**File:** `server/brief-scheduler.ts:167-175`

```ts
for (const booking of upcoming) {
  try {
    await generateAndDeliverBrief(booking);
  } catch (err) { ... }
}
```

Each brief generation involves an OpenAI API call (2-8 seconds) plus multiple DB queries. With 10 upcoming bookings, this takes 20-80 seconds sequentially.

**Impact:** If many briefs need generation at once, the 15-minute cycle may not complete before the next cycle starts (the `cycleRunning` guard prevents overlap, but means briefs are delayed).
**Fix:** Process briefs in parallel with a concurrency limiter (e.g., `p-limit` which is already a dependency).

---

### 5.3 :orange_circle: HIGH -- `generateAndDeliverBrief` Makes 6+ Sequential DB Calls

**File:** `server/brief-scheduler.ts:32-139`

A single brief generation involves:
1. `getBookingWithDetails(booking.id)` -- 6 queries (see 1.2)
2. `getDocuments(booking.id)` -- 1 query (redundant, already fetched in step 1)
3. `getBookingsByGuestDomain(...)` -- 1 query
4. OpenAI API call
5. `createMeetingBrief(...)` -- 1 query
6. `getNotificationPreferences(...)` -- 1 query
7. `getUser(...)` -- 1 query
8. `getAvailabilityRules(...)` -- 1 query
9. `sendEmail(...)` -- 1 network call

Total: ~13 DB queries + 1 AI API call + 1 email per booking.

**Impact:** Multiplied by N bookings in the scheduler loop, this creates heavy DB and API load.
**Fix:** Batch-fetch related data for all upcoming bookings before entering the loop.

---

### 5.4 :yellow_circle: MEDIUM -- Fire-and-Forget Async Functions Can Swallow Errors

**Files:** `server/routes.ts:711-754`, `server/routes.ts:827-848`, `server/routes.ts:857-883`, `server/routes.ts:1047-1086`, `server/routes.ts:2037-2058`

Multiple IIFEs (Immediately Invoked Function Expressions) run after `res.json()` to send emails and update calendar events:

```ts
res.json({ success: true });
(async () => {
  try { ... } catch (err) { console.error(...); }
})();
```

While the try/catch prevents unhandled rejections, there is no tracking or retry mechanism. Failed emails are silently lost.

**Impact:** Silent email delivery failures. No observability.
**Fix:** Add a lightweight job queue (even in-memory) with retry logic and failure tracking.

---

### 5.5 :yellow_circle: MEDIUM -- No Rate Limiting on Public Endpoints

**Files:** `server/routes.ts` -- `/api/public/book`, `/api/public/chat`, `/api/auth/register`, `/api/auth/login`, `/api/auth/magic-link`, `/api/auth/forgot-password`, `/api/onboarding/scan-website`

No rate limiting middleware is present. Public endpoints are vulnerable to:
- Brute-force login attempts
- Booking spam
- AI API cost abuse via repeated chat/enrichment/scan requests

**Impact:** Denial of service and cost escalation.
**Fix:** Add rate limiting middleware (e.g., `express-rate-limit`) on public and auth endpoints.

---

### 5.6 :blue_circle: LOW -- `ObjectStorageService` Instantiated at Module Level

**File:** `server/routes.ts:16`

```ts
const objectStorageService = new ObjectStorageService();
```

Created eagerly when routes module loads, even if file uploads are never used.

**Impact:** Minor -- allocates resources on startup.
**Fix:** Lazy-initialise on first upload request.

---

## 6. Caching

### 6.1 :red_circle: CRITICAL -- No Server-Side Caching Layer

**Files:** All of `server/storage.ts`, `server/routes.ts`

There is **zero** server-side caching. Every API request hits the database directly. Frequently-accessed data like:

- User profile (fetched on every request via auth middleware)
- Availability rules (fetched on every booking page load)
- Event types (fetched on dashboard, bookings, leads, settings)
- Notification preferences (fetched during email sending)

... are all queried from PostgreSQL on every access.

**Impact:** Unnecessary database load. Availability rules and event types change rarely but are queried constantly.
**Fix:** Add an in-memory cache (e.g., `node-cache` or a simple `Map` with TTL) for:
- User lookups (TTL: 60s)
- Event types per user (TTL: 60s, invalidate on write)
- Availability rules per user (TTL: 60s, invalidate on write)

---

### 6.2 :orange_circle: HIGH -- No Cache for Availability Calculation Results

**File:** `server/calendar-service.ts` (called from routes.ts for `/api/public/availability/:slug`)

Availability calculation involves:
1. Fetching event type
2. Fetching availability rules
3. Fetching calendar tokens
4. Calling Google Calendar API for busy times
5. Computing available slots

This is called **every time a guest selects a date** on the booking page. Multiple guests booking the same event type will trigger identical calculations.

**Impact:** Redundant Google Calendar API calls and computation for the same date/event type.
**Fix:** Cache availability results per event-type + date with a short TTL (30-60 seconds).

---

### 6.3 :yellow_circle: MEDIUM -- No Cache Invalidation Strategy

The `staleTime: Infinity` in React Query means the client cache is only invalidated via explicit `queryClient.invalidateQueries()` calls after mutations. If a second browser tab makes changes, the first tab will never see updates.

**Impact:** Stale data across tabs/devices.
**Fix:** Use WebSocket or polling for critical queries (bookings), or reduce `staleTime`.

---

### 6.4 :yellow_circle: MEDIUM -- Stampede Risk on Cache Invalidation

**Files:** `client/src/pages/bookings.tsx:134`, `client/src/pages/bookings.tsx:146`, `client/src/pages/bookings.tsx:160`, `client/src/pages/bookings.tsx:173`, `client/src/pages/bookings.tsx:187`

The bookings page has 5 mutations, each of which calls `queryClient.invalidateQueries({ queryKey: ["/api/bookings"] })`. If multiple mutations succeed quickly, this could trigger multiple simultaneous refetches of the heavy `/api/bookings` endpoint.

**Impact:** Redundant network requests after rapid user actions.
**Fix:** Debounce invalidation or use `queryClient.invalidateQueries` with `{ refetchType: 'none' }` and manually control the refetch.

---

## 7. Build & Bundle

### 7.1 :orange_circle: HIGH -- No Vite Build Optimisation (Manual Chunks, Tree-Shaking Hints)

**File:** `vite.config.ts:1-40`

The Vite config has no `build.rollupOptions.output.manualChunks` configuration. All vendor libraries (React, recharts, framer-motion, Radix UI, date-fns, react-query) are bundled together.

```ts
build: {
  outDir: path.resolve(import.meta.dirname, "dist/public"),
  emptyOutDir: true,
  // No manualChunks, no chunk size limits
},
```

**Impact:** Single large vendor chunk. Browser cannot cache vendor code separately from app code.
**Fix:** Configure manual chunks to split vendors:
```ts
manualChunks: {
  vendor: ['react', 'react-dom'],
  charts: ['recharts'],
  ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', ...],
}
```

---

### 7.2 :orange_circle: HIGH -- Large Dependency Footprint

**File:** `package.json:16-94`

The project has **~80 dependencies** in `dependencies`. Notable large packages that may be partially or wholly unnecessary:

| Package | Approx Size | Usage |
|---------|------------|-------|
| `recharts` | ~200KB min | Dashboard charts only |
| `framer-motion` | ~150KB min | Animation (unclear usage) |
| `googleapis` | ~500KB min | Calendar integration |
| `@uppy/*` (4 packages) | ~200KB min | File upload (could use native) |
| `react-icons` | ~100KB min (depends on import style) | Icons (lucide-react already imported) |
| `embla-carousel-react` | ~30KB min | Unclear if used |
| 25+ `@radix-ui/*` packages | ~5-10KB each | Not all may be used |

**Impact:** Large initial bundle. `googleapis` is a server dependency but shouldn't affect client bundle if tree-shaken correctly. However, `recharts`, `framer-motion`, and `react-icons` are client-side.
**Fix:** Audit actual usage. Remove unused packages. Replace `react-icons` with `lucide-react` (already used). Consider lighter alternatives for recharts.

---

### 7.3 :yellow_circle: MEDIUM -- No Production Build Minification Verification

**File:** `package.json:9`

```json
"start": "NODE_ENV=production node dist/index.cjs"
```

The build script uses `tsx script/build.ts` but there's no evidence of CSS purging or advanced minification settings in the Vite config.

**Impact:** Potentially larger-than-necessary production bundles.
**Fix:** Verify build output sizes. Add `build.reportCompressedSize: true` to Vite config for visibility.

---

### 7.4 :blue_circle: LOW -- Dev-Only Dependencies Installed in Production

**File:** `package.json:96-128`

Items like `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `autoprefixer`, `postcss` are in devDependencies (correct), but `memorystore` (line 70) and `passport`/`passport-local` (lines 77-78) are in production dependencies despite not appearing to be used in the codebase.

**Impact:** Larger `node_modules`, slower installs.
**Fix:** Remove unused dependencies.

---

## Summary

### Issue Count by Severity

| Severity | Count |
|----------|-------|
| :red_circle: CRITICAL | 5 |
| :orange_circle: HIGH | 16 |
| :yellow_circle: MEDIUM | 12 |
| :blue_circle: LOW | 4 |
| **Total** | **37** |

### Top 5 Highest-Impact Fixes (Effort vs Impact)

| Priority | Issue | Expected Impact |
|----------|-------|-----------------|
| 1 | Add DB indexes (1.4) | 10-100x faster queries; 1 hour to implement |
| 2 | Fix N+1 in `getBookingsWithDetails` (1.1) | Reduce 300+ queries to 4; immediate latency win |
| 3 | Add compression middleware (3.1) | 5-7x smaller responses; 5 minutes to implement |
| 4 | Add React.lazy code splitting (4.1) | 40-60% smaller initial JS bundle; 30 minutes |
| 5 | Add server-side caching for user/rules (6.1) | 50%+ reduction in DB queries; 2 hours |
