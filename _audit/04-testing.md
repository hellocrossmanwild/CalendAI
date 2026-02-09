# 04 — Testing & Coverage Audit

## Executive Summary

The CalendAI test suite contains **11 test files** with **596 passing tests** in
the `server/__tests__/` directory. All tests pass. However, the suite is
fundamentally undermined by a pervasive pattern: the majority of tests assert
against **locally re-implemented logic** rather than exercising the actual
production source code. Overall statement coverage is **27.71%**, with the
critical `routes.ts` (2,500 lines, all 55 API endpoints) and `storage.ts` at
**0%** and **4.16%** respectively. There are **zero frontend tests**.

| Metric | Value |
|---|---|
| Test files | 11 |
| Total tests | 596 |
| Pass rate | 100% (596/596) |
| Overall statement coverage | 27.71% |
| Overall branch coverage | 21.70% |
| Overall function coverage | 22.00% |
| `routes.ts` coverage | 0% stmts, 0% branch, 0% funcs |
| `storage.ts` coverage | 4.16% stmts, 1.58% funcs |
| Frontend tests | 0 |
| Integration / E2E tests | 0 |
| API contract tests | 0 |

---

## 1. Test Runner Outcome

```
npm test -- --coverage
```

**Result: 11 files, 596 tests, all passing. 2.74 s total.**

Coverage report (v8 provider):

| File | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **lead-scoring.ts** | 100% | 100% | 100% | 100% |
| **email-templates.ts** | 99.2% | 85.7% | 100% | 99.2% |
| **website-scanner.ts** | 90.9% | 88.9% | 80% | 92.6% |
| **ai-service.ts** | 62.4% | 44.6% | 53.3% | 62.7% |
| **email-service.ts** | 59.3% | 41.2% | 50% | 61.5% |
| **calendar-service.ts** | 56.2% | 34.0% | 54.5% | 56.3% |
| brief-scheduler.ts | 34.3% | 7.7% | 50% | 34.3% |
| storage.ts | 4.2% | 41.2% | 1.6% | 3.5% |
| **routes.ts** | **0%** | **0%** | **0%** | **0%** |
| **index.ts** | **0%** | **0%** | **0%** | **0%** |
| db.ts | 0% | 0% | 100% | 0% |
| static.ts | 0% | 0% | 0% | 0% |
| vite.ts | 0% | 100% | 0% | 0% |

---

## 2. Systemic Quality Issue: "Mirrored Logic" Anti-Pattern

### Rating: CRITICAL

This is the single most important finding. At least **7 of 11 test files**
contain tests that **re-implement the production logic inside the test itself**
and then assert against the local copy. These tests will always pass regardless
of bugs in production code, because they never call it.

**Affected files and examples:**

| Test File | What It Does | Production Code Exercised? |
|---|---|---|
| `f10-dashboard-enhancements.test.ts` | Defines its own `canTransition()`, `getStatusDisplay()`, `isInDateRange()`, `getBookingsForDay()`, sort/filter lambdas | **No** -- routes.ts is at 0% |
| `f11-meeting-prep-brief.test.ts` | Simulates scheduler cycle with inline `for` loops, `try/catch` blocks, date arithmetic, `Map.delete()` calls -- none referencing production code | **Mostly no** -- brief-scheduler.ts at 34% only from start/stop |
| `f12-reschedule-cancel.test.ts` | Replicates conflict detection, self-exclusion, notice period, token lookup, date validation all inline | **No** -- routes.ts at 0% |
| `f13-settings-configuration.test.ts` | Defines its own `isValidEmail()`, `validatePasswordStrength()`, `isValidHexColor()`, `filterAllowedFields()`, `sanitizeTextField()` | **No** -- routes.ts at 0% |
| `f05-booking-enhancements.test.ts` (Part 3) | Copies `COMMON_TIMEZONES` array and `getTimezoneLabel()` from `book.tsx` into the test | **No** -- tests its own copy |
| `f10` (sections D-I) | All sort/filter/group logic is inline JavaScript, not imported | **No** |
| `f11` (sections B-L) | Storage query simulation, brief regeneration logic, domain extraction, document context building -- all inline | **No** |

**Concrete example** (`f10-dashboard-enhancements.test.ts`, lines 60-76):

```typescript
// Defines canTransition() INSIDE the test file
function canTransition(currentStatus: string, newStatus: string) {
  const VALID_STATUSES = ["confirmed", "completed", "cancelled", "no-show"];
  if (!VALID_STATUSES.includes(newStatus)) { ... }
  if (currentStatus === "cancelled") { ... }
  ...
}

// Then tests the local function:
it("allows transition to completed", () => {
  const result = canTransition("confirmed", "completed");
  expect(result.allowed).toBe(true);  // Always passes even if routes.ts has bugs
});
```

**Impact:** These 596 tests create a false sense of coverage. If a bug is
introduced in routes.ts (e.g., removing the cancelled-booking guard), no test
will catch it.

---

## 3. Coverage Gaps by Source File

### 3a. CRITICAL: `routes.ts` -- 0% Coverage (2,500 lines, 55 endpoints)

**Rating:** CRITICAL

This is the largest and most critical file in the backend. It contains every API
endpoint, all authentication middleware usage, all request validation, all
business logic orchestration. Zero lines are executed by any test.

**Missing tests (specific):**

- `POST /api/auth/register` -- registration with duplicate email, missing fields, weak password, SQL injection in email
- `POST /api/auth/login` -- wrong password, non-existent user, rate limit behavior, session creation
- `POST /api/auth/logout` -- session destruction, unauthenticated call
- `GET /api/auth/user` -- returns current user, unauthenticated returns 401
- `POST /api/auth/magic-link` -- valid/invalid email, token creation, duplicate request
- `POST /api/auth/forgot-password` -- email enumeration leak, token generation
- `POST /api/auth/reset-password` -- expired token, invalid token, password strength
- `PATCH /api/auth/profile` -- field whitelist enforcement, email uniqueness, XSS in name fields
- `POST /api/auth/change-password` -- OAuth user rejection, wrong current password
- `DELETE /api/auth/account` -- cascade deletion, password verification for non-OAuth
- `POST /api/event-types` -- create with valid/invalid data, slug generation, duplicate slug
- `PATCH /api/event-types/:id` -- ownership check, partial update
- `DELETE /api/event-types/:id` -- ownership check, cascade to bookings
- `POST /api/public/book` -- double-booking prevention, timezone validation, email format, required fields
- `POST /api/public/chat` -- rate limiting, input sanitization, malformed message array
- `POST /api/bookings/:id/enrich` -- ownership check, already-enriched booking
- `POST /api/bookings/:id/generate-brief` -- force regeneration, ownership check
- `PATCH /api/bookings/:id/status` -- actual transition enforcement (the test only tests a local copy)
- `GET /api/availability-rules` -- authenticated access, default rules
- `PUT /api/availability-rules` -- schema validation, invalid time ranges
- `POST /api/uploads/request-url` -- file type validation, size limits
- `GET/PATCH /api/notification-preferences` -- schema validation, authentication

### 3b. CRITICAL: `storage.ts` -- 4.16% Coverage

**Rating:** CRITICAL

The database access layer is virtually untested. Only
`getEventTypeBySlugWithHost` is tested (via mocked DB in `f05`). All other
methods (40+ methods) are untested:

- `createUser`, `getUserByEmail`, `getUserById`
- `createBooking`, `getBooking`, `getBookingsByDateRange`, `updateBooking`
- `getBookingByCancelToken`, `getBookingByRescheduleToken`
- `createEventType`, `getEventType`, `updateEventType`, `deleteEventType`
- `getAvailabilityRules`, `upsertAvailabilityRules`
- `createMeetingBrief`, `getMeetingBrief`, `deleteMeetingBrief`
- `getCalendarToken`, `upsertCalendarToken`, `deleteCalendarToken`
- `deleteUserAndData` (cascade delete)

### 3c. HIGH: `index.ts` -- 0% Coverage

**Rating:** HIGH

Server bootstrap, session configuration, middleware setup, CORS, error handling.
No tests verify that the server starts correctly or that middleware is applied.

### 3d. HIGH: `brief-scheduler.ts` -- 34% Coverage

**Rating:** HIGH

Only start/stop are tested. The core `runBriefCycle()` function -- which queries
upcoming bookings, calls AI, stores briefs, and sends emails -- is not tested
against actual production code. The tests in f11 simulate this logic inline.

### 3e. MEDIUM: `calendar-service.ts` -- 56% Coverage

**Rating:** MEDIUM

`calculateAvailability` is well-tested. Missing coverage for:
- `getGoogleAuthUrl()` -- OAuth URL generation
- `exchangeCodeForTokens()` -- token exchange
- `createCalendarEvent()` -- Google Calendar event creation
- `deleteCalendarEvent()` -- Google Calendar event deletion
- `listUserCalendars()` -- listing connected calendars
- Token refresh flow

### 3f. MEDIUM: `ai-service.ts` -- 62% Coverage

**Rating:** MEDIUM

`processEventTypeCreation` and `processPrequalChat` are tested well.
Missing coverage for:
- `generateMeetingBrief()` -- the actual AI call and response parsing
- `enrichLead()` error handling edge cases
- `suggestEventTypes()` -- onboarding event suggestions
- `analyseAvailability()` -- AI-based schedule analysis

### 3g. LOW: `db.ts`, `static.ts`, `vite.ts` -- 0% Coverage

**Rating:** LOW

Infrastructure files. `db.ts` is 14 lines (pool + Drizzle init). `static.ts` is
17 lines (static file serving). `vite.ts` is 55 lines (dev server integration).
These are hard to unit-test and are better covered by integration/E2E tests.

---

## 4. Test Quality Issues

### 4a. CRITICAL: Tests Without Real Assertions

**Rating:** CRITICAL

Many tests in `f11-meeting-prep-brief.test.ts` assert trivially true
statements:

```typescript
// Line 98-106: "handles empty results gracefully"
it("handles empty results gracefully (no bookings need briefs)", () => {
  const upcoming: any[] = [];
  expect(upcoming.length).toBe(0);
  expect(() => {
    if (upcoming.length === 0) { return; }
  }).not.toThrow();
});

// Line 136-139: "scheduler interval is set to 15 minutes"
it("scheduler interval is set to 15 minutes (900000 ms)", () => {
  const INTERVAL_MS = 15 * 60 * 1000;
  expect(INTERVAL_MS).toBe(900000);  // Tests JavaScript math, not code
});

// Line 1441-1446: "handles the 5-second delay"
it("handles the 5-second delay for enrichment completion", async () => {
  const delayMs = 5000;
  expect(delayMs).toBe(5000);  // Tests a literal number
});
```

These tests inflate the count (125 tests in f11 alone) but verify nothing about
the production system.

### 4b. HIGH: Conditional Assertion Branch in enrichAndScore Test

**Rating:** HIGH

`f08-lead-enrichment-scoring.test.ts` lines 571-579:

```typescript
it("returns null when enrichLead throws an error", async () => {
  mockCreate.mockRejectedValueOnce(new Error("OpenAI API down"));
  const result = await enrichAndScore(...);
  if (result === null) {
    expect(result).toBeNull();  // Tautology
  } else {
    expect(result.enrichment).toEqual({});
    expect(result.score.score).toBe(0);
  }
});
```

The test accepts either outcome. This is a "test that cannot fail" pattern. The
author was unsure of the expected behavior and wrote a test that passes
regardless.

### 4c. MEDIUM: Excessive OpenAI Mocking Coupling

**Rating:** MEDIUM

All AI tests use the same fragile mock pattern:

```typescript
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: class { chat = { completions: { create: mockCreate } }; },
    __mockCreate: mockCreate,
  };
});
const mockCreate = (openaiModule as any).__mockCreate;
```

This is tightly coupled to the OpenAI SDK's internal structure. If the SDK
updates its interface (e.g., v7 changes), every test file breaks. Better to mock
at the service boundary.

### 4d. MEDIUM: f05 Tests Mirror of getTimezoneLabel

**Rating:** MEDIUM

`f05-booking-enhancements.test.ts` (lines 573-665) copies the entire
`COMMON_TIMEZONES` array and `getTimezoneLabel` function from `book.tsx` into
the test file. The comment even acknowledges this:

```typescript
// The getTimezoneLabel function and COMMON_TIMEZONES data are defined in
// book.tsx but not exported. We mirror the logic here to validate the contract.
```

This means the test will always match its own copy. If `book.tsx` is changed,
the test will not detect the drift.

---

## 5. Missing Test Types

### 5a. CRITICAL: No API Integration Tests

**Rating:** CRITICAL

There are zero tests that spin up an Express app (even with a test DB or mocked
storage) and make HTTP requests to endpoints. This is the most impactful gap
because it would cover:
- Request parsing and validation
- Middleware (auth, error handling)
- Response format and status codes
- End-to-end business logic per endpoint

**Needed:** A `supertest`-based integration test suite that creates an Express app
with mocked storage and exercises each endpoint. Minimum critical paths:

1. `POST /api/auth/register` -> `POST /api/auth/login` -> `GET /api/auth/user`
2. `POST /api/event-types` -> `GET /api/public/event-types/:slug` -> `POST /api/public/book`
3. `POST /api/public/booking/cancel/:token`
4. `POST /api/public/booking/reschedule/:token`
5. Authentication guard: all protected endpoints return 401 without session

### 5b. CRITICAL: No Frontend Tests

**Rating:** CRITICAL

The client has 15 page components, 7 custom hooks, 4 lib modules, and ~40 UI
components. Zero tests exist.

**Needed at minimum:**
- `use-auth.ts` hook: login/logout flow, session check, redirect behavior
- `queryClient.ts`: error handling, retry config
- `auth-utils.ts`: token utilities
- `ics.ts`: already tested via f05 (positive), but could use RTL/jsdom tests
- `book.tsx`: booking flow, timezone selection, slot display
- `auth.tsx`: form validation, error states
- `settings.tsx`: profile update, password change

### 5c. HIGH: No E2E Tests

**Rating:** HIGH

No Playwright, Cypress, or similar E2E framework. Critical user journeys are
untested:

1. Register -> Onboard -> Create event type -> Share link -> Guest books
2. Guest receives email -> Reschedules -> Host sees updated booking
3. Guest cancels -> Host notified -> Guest can rebook
4. OAuth login -> Google Calendar connect -> Availability reflects calendar

### 5d. HIGH: No API Contract Tests

**Rating:** HIGH

No tests validate the shape/schema of API responses. If a field is renamed or
removed, nothing catches the frontend/backend contract break.

**Needed:** Zod schema or JSON schema validation on API response bodies for all
endpoints.

### 5e. MEDIUM: No Snapshot Tests for Email Templates

**Rating:** MEDIUM

Email templates are tested for content inclusion (good), but there are no
snapshot tests to catch unintended visual/structural regressions. Given that
`email-templates.ts` is at 99% coverage, adding `toMatchSnapshot()` would be
low-effort, high-value.

---

## 6. Missing Edge Case Coverage

### 6a. CRITICAL: No Input Validation Tests Against Real Endpoints

**Rating:** CRITICAL

All input validation is tested against local helper copies, not real routes.
Missing real-endpoint tests for:

- **SQL injection** in email, name, company fields (via booking, registration)
- **XSS in stored fields** -- names, company, notes (stored in DB, rendered in dashboard)
- **Oversized payloads** -- what happens with a 10MB JSON body?
- **Malformed JSON** -- sending `Content-Type: application/json` with invalid JSON
- **Missing Content-Type header** on POST endpoints
- **Empty body** on POST/PATCH endpoints
- **Integer overflow** in eventTypeId, bookingId
- **Negative duration** in event type creation
- **Zero duration** in event type creation
- **Duplicate slug** in event type creation
- **Very long slugs** (URL length limits)

### 6b. HIGH: No Concurrency Tests

**Rating:** HIGH

- **Double-booking race condition**: Two guests booking the same slot simultaneously
- **Concurrent reschedule**: Guest and host rescheduling at the same time
- **Concurrent cancellation**: Guest cancelling while host is rescheduling
- **Calendar event race**: Brief scheduler running while manual regeneration occurs

### 6c. HIGH: No Timeout/Retry Tests

**Rating:** HIGH

- OpenAI API timeout during enrichment, brief generation, prequal chat
- Google Calendar API timeout during event creation/deletion
- Database query timeout during availability calculation
- Email service (SMTP) timeout

### 6d. MEDIUM: No Boundary Value Tests for Availability

**Rating:** MEDIUM

- Exactly at `maxAdvance` day boundary
- Exactly at `minNotice` minute boundary
- DST transition day (spring forward: March; fall back: November)
- Leap year date (Feb 29)
- New Year's Eve crossing midnight across timezones
- Host in UTC+12, guest in UTC-12 (max timezone difference)

---

## 7. Security Testing Gaps

### 7a. CRITICAL: No Authentication Bypass Tests

**Rating:** CRITICAL

- No test verifies `requireAuth` middleware on protected endpoints
- No test attempts to access `/api/bookings` without a session
- No test attempts to access another user's bookings/event-types
- No test verifies session fixation protection
- No test verifies CSRF protection (if any)

**Needed tests:**

```
GET /api/bookings          -> 401 without session
GET /api/bookings/:id      -> 404 for other user's booking (not 403, to prevent enumeration)
PATCH /api/event-types/:id -> 404 for other user's event type
DELETE /api/auth/account   -> 401 without session
POST /api/bookings/:id/enrich -> 404 for other user's booking
```

### 7b. CRITICAL: No Rate Limiting Tests

**Rating:** CRITICAL

Public endpoints are unbounded:
- `POST /api/public/book` -- can flood bookings
- `POST /api/public/chat` -- can burn OpenAI credits
- `POST /api/auth/login` -- brute force password
- `POST /api/auth/magic-link` -- email bombing
- `POST /api/auth/forgot-password` -- email bombing
- `POST /api/auth/register` -- spam account creation

No tests verify any rate limiting exists or works correctly.

### 7c. HIGH: No Token Security Tests

**Rating:** HIGH

- Cancel/reschedule tokens: no test for token expiry, token reuse, brute force
- Magic link tokens: no test for expiry enforcement
- Password reset tokens: no test for single-use enforcement
- Email verification tokens: no test for expiry
- Session token: no test for httpOnly, secure, sameSite flags

### 7d. HIGH: No Authorization Boundary Tests

**Rating:** HIGH

- No test verifies a user cannot modify another user's event types
- No test verifies a user cannot view another user's bookings
- No test verifies a user cannot access another user's calendar tokens
- No test verifies IDOR (Insecure Direct Object Reference) protection

### 7e. MEDIUM: No Input Sanitization Tests Against Real Storage

**Rating:** MEDIUM

- The email template XSS tests are good (f09, f11, f12 test HTML escaping)
- But there are no tests verifying that user input stored in the database is
  properly sanitized before being rendered in the dashboard or emails
- No test for path traversal in file upload URLs
- No test for SSRF in website scanner URL (only `javascript:`, `data:`, `file:`
  are tested -- what about internal IP ranges like `http://169.254.169.254`?)

---

## 8. Infrastructure Issues

### 8a. HIGH: Test State Leaking via Module-Level Mocks

**Rating:** HIGH

Several test files mock modules at the top level (`vi.mock("../db", ...)`,
`vi.mock("../storage", ...)`) which affects all tests in the file. The mock
state can leak between tests if `beforeEach` does not perfectly reset all mock
return values. Example in `f06-date-time-selection.test.ts`:

```typescript
vi.mock("../storage", () => {
  const mockStorage = { ... };
  return { storage: mockStorage };
});
```

This singleton mock is shared across all `describe` blocks. If one test sets
`mockStorage.getEventType.mockResolvedValue(...)` and forgets to clear it, it
silently affects the next test.

### 8b. MEDIUM: Slow Test (f11 Brief Scheduler)

**Rating:** MEDIUM

`f11-meeting-prep-brief.test.ts` takes 519ms (half the total test time) due to
dynamic `vi.doMock`/`vi.doUnmock` with `await import(...)`. The
`startBriefScheduler` test alone takes 460ms.

### 8c. MEDIUM: Hardcoded Dates

**Rating:** MEDIUM

Tests use hardcoded future dates (e.g., `2026-06-01`, `2026-02-15`). While
these are far enough in the future for now, they will eventually become past
dates and some tests (e.g., minNotice/maxAdvance) may start failing. Tests
should compute dates relative to `Date.now()` or use `vi.setSystemTime()`.

### 8d. LOW: No Test Isolation for `process.env` Mutations

**Rating:** LOW

`f09-email-notifications.test.ts` deletes `process.env.SMTP_HOST` etc. in
`beforeEach`. These deletions persist for the test file but could affect other
tests if run in the same worker. Vitest runs files in separate workers by
default, so this is low risk.

---

## 9. Positive Findings

Despite the critical gaps, some tests are genuinely well-written:

1. **`lead-scoring.ts` at 100% coverage** -- `f08` tests exercise the real
   `calculateLeadScore()` function with thorough score component isolation,
   boundary thresholds, and reasoning string validation.

2. **`email-templates.ts` at 99.2% coverage** -- `f09`, `f11`, `f12` thoroughly
   test all template functions with XSS escaping, optional field omission,
   timezone formatting, and HTML structure validation.

3. **`website-scanner.ts` at 90.9% coverage** -- Tests cover dangerous URL
   rejection, protocol prepending, fetch failures, AI fallback, and relative URL
   resolution.

4. **`calendar-service.ts` calculateAvailability** -- `f06` tests timezone
   conversion, dynamic slot intervals, conflict detection with buffers,
   multiple time blocks, and cross-timezone consistency well.

5. **`ai-service.ts` processEventTypeCreation and processPrequalChat** -- `f07`
   and `ai-service.test.ts` test happy paths, error handling, null content
   fallback, and prompt construction.

6. **ICS generation** (`f05` Part 1) -- Thorough RFC 5545 compliance testing
   including CRLF, special character escaping, midnight boundary, and zero
   duration.

7. **Phone validation** (`f07` Group 1) -- Uses `it.each()` parametrized tests
   for valid/invalid phone numbers.

8. **Zod schema validation** (`f07` Group 3) -- Tests `insertBookingSchema`
   with the actual Zod schema (not a mirror).

---

## 10. Prioritized Remediation Plan

### Phase 1: Stop the Bleeding (Week 1)

| # | Priority | Action |
|---|---|---|
| 1 | CRITICAL | **Add supertest integration tests for routes.ts** -- start with auth endpoints, then public booking flow. Target: 50% route coverage. |
| 2 | CRITICAL | **Replace mirrored-logic tests** in f10, f11, f12, f13 with tests that import and call actual production functions/endpoints. |
| 3 | CRITICAL | **Add requireAuth bypass tests** -- verify every protected endpoint returns 401 without a session. |

### Phase 2: Core Safety (Weeks 2-3)

| # | Priority | Action |
|---|---|---|
| 4 | CRITICAL | **Add storage.ts integration tests** with a test database (or in-memory SQLite via Drizzle). |
| 5 | HIGH | **Add double-booking race condition test** using concurrent requests. |
| 6 | HIGH | **Add authorization boundary tests** (IDOR) -- user A cannot access user B's resources. |
| 7 | HIGH | **Add rate limiting tests** or implement rate limiting if missing. |
| 8 | HIGH | **Add token security tests** -- expiry enforcement, single-use, brute force. |

### Phase 3: Confidence (Weeks 3-4)

| # | Priority | Action |
|---|---|---|
| 9 | HIGH | **Add frontend unit tests** with Vitest + React Testing Library -- start with hooks (`use-auth`) and lib modules. |
| 10 | HIGH | **Add E2E tests** with Playwright -- cover the primary booking flow. |
| 11 | MEDIUM | **Add email template snapshot tests** for regression detection. |
| 12 | MEDIUM | **Add API contract tests** with Zod response validation. |
| 13 | MEDIUM | **Fix hardcoded dates** -- use relative dates or `vi.setSystemTime()`. |

### Phase 4: Hardening (Ongoing)

| # | Priority | Action |
|---|---|---|
| 14 | MEDIUM | **Add DST boundary tests** for availability calculation. |
| 15 | MEDIUM | **Add SSRF protection tests** for website scanner (internal IP rejection). |
| 16 | MEDIUM | **Add OpenAI timeout/retry tests**. |
| 17 | LOW | **Add CI coverage gate** -- fail build if coverage drops below threshold. |
| 18 | LOW | **Add mutation testing** (Stryker) to detect surviving mutants in "tested" code. |

---

## 11. Verdict

| Area | Rating | Summary |
|---|---|---|
| Coverage breadth | CRITICAL | 0% on routes.ts (55 endpoints), 4% on storage.ts |
| Test authenticity | CRITICAL | 7/11 files test mirrored logic, not production code |
| Security testing | CRITICAL | No auth bypass, rate limit, IDOR, or token tests |
| Integration tests | CRITICAL | None exist; no HTTP-level endpoint testing |
| Frontend tests | CRITICAL | Zero coverage on ~70 client files |
| Test correctness | HIGH | Conditional assertions, tautological tests |
| E2E tests | HIGH | None exist |
| Edge cases | HIGH | No concurrency, timeout, or boundary tests |
| Existing unit tests (where real) | GOOD | lead-scoring, email-templates, ICS, phone validation |
| Test infrastructure | MEDIUM | Mock leaking risk, hardcoded dates |

**Overall rating: CRITICAL.** The test suite provides a false sense of security.
The 596-test count and 100% pass rate mask the reality that the application's
most critical code paths (API routes, database layer, authentication) have zero
test coverage. The mirrored-logic anti-pattern means many "tests" are testing
JavaScript itself rather than the CalendAI codebase.
