# Code Quality & Maintainability Audit -- CalendAI

**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-09
**Scope**: Every TypeScript/TSX source file in `server/`, `client/src/`, `shared/`

---

## Severity Legend

| Rating | Meaning |
|--------|---------|
| :red_circle: CRITICAL | Actively causes bugs, data loss, or security issues in production |
| :orange_circle: HIGH | Significant maintainability or correctness risk; blocks scaling |
| :yellow_circle: MEDIUM | Code smell that increases cognitive load and defect probability |
| :blue_circle: LOW | Style / convention issue; fix when touching the file |

---

## Executive Summary

CalendAI is a ~34K-line TypeScript scheduling platform. The product functionality is solid, but the codebase has grown organically with several structural problems that will compound as the team scales. The three headline findings are:

1. **Two "god" files** -- `server/routes.ts` (2,500 lines, ~55 endpoints) and `client/src/pages/settings.tsx` (1,362 lines, 20+ useState hooks) -- concentrate far too much logic in single files, making them nearly impossible to review, test, or refactor safely.
2. **Pervasive fire-and-forget async patterns** -- at least 9 unmonitored `(async () => { ... })()` blocks in routes.ts send emails, enrich leads, and create calendar events after the HTTP response. Failures are silently logged with no retry, alerting, or observability.
3. **Incomplete type safety** -- `req.user` is typed as `any` globally, `extractedData` is cast to `Record<string, any>` in 5+ locations, and the `User` type on the client is missing server-side fields, forcing `(user as any)` casts throughout settings.tsx.

Total findings: **8 CRITICAL, 14 HIGH, 18 MEDIUM, 12 LOW** across 8 audit categories.

---

## 1. Architecture

### :red_circle: ARC-01 -- God file: `server/routes.ts` (~2,500 lines)

**File**: `server/routes.ts:1-2500`

A single `registerRoutes()` function contains all 55 API endpoints -- auth (16), CRUD (12), AI (4), calendar (5), onboarding (5), public booking (8), and more. Business logic (validation, email composition, calendar sync, enrichment orchestration) is inlined directly in route handlers rather than extracted into service modules.

**Impact**: Any change to one endpoint risks merge conflicts with every other endpoint. Testing individual routes requires importing the entire file. New contributors cannot find code by feature.

**Recommendation**: Split into domain-specific route modules (e.g., `routes/auth.ts`, `routes/bookings.ts`, `routes/calendar.ts`, `routes/public.ts`, `routes/onboarding.ts`) and extract business logic into service classes.

---

### :red_circle: ARC-02 -- God component: `client/src/pages/settings.tsx` (1,362 lines)

**File**: `client/src/pages/settings.tsx:1-1362`

One component manages profile editing, password change, branding, availability scheduling, calendar integration, notification preferences, booking links, event type toggling, and account deletion. It holds 20+ `useState` hooks (lines 156-274), 9 mutations, 4 queries, and 6+ `useEffect` hooks.

**Impact**: Impossible to test individual sections in isolation. Any state change re-renders the entire page. Cognitive load for maintainers is extreme.

**Recommendation**: Extract into sub-components (e.g., `ProfileSection`, `AvailabilitySection`, `BrandingSection`, `SecuritySection`, `DangerZoneSection`) each with their own state, or use a form library like react-hook-form with a resolver.

---

### :orange_circle: ARC-03 -- Missing service layer between routes and storage

**File**: `server/routes.ts` (throughout)

Route handlers contain inline business logic: booking creation (lines 2174-2476, ~300 lines), reschedule (lines 762-888, ~126 lines), cancellation (lines 684-758, ~74 lines). Validation, authorization, orchestration, and side-effects are mixed in the same function.

**Impact**: Logic duplication -- the booking creation flow and the public reschedule flow share similar double-booking checks, calendar sync, and email patterns but are implemented independently. Bugs fixed in one place may not be fixed in the other.

---

### :orange_circle: ARC-04 -- Duplicated default-availability literals

**Files**:
- `server/routes.ts:1207-1223` (availability-rules GET handler)
- `server/routes.ts:1313-1331` (analysis fallback)
- `shared/schema.ts:113-123` (Drizzle default)
- `client/src/pages/settings.tsx:131-141` (`getDefaultWeeklyHours`)
- `client/src/pages/onboarding.tsx:178-188` (`getDefaultSchedule`)

The same Mon-Fri 9-5 availability defaults are hardcoded in at least 5 places. If the default changes, all 5 must be updated.

**Recommendation**: Define a single `DEFAULT_WEEKLY_HOURS` constant in `shared/` and import everywhere.

---

### :yellow_circle: ARC-05 -- Dynamic imports used to avoid circular dependencies

**File**: `server/routes.ts:1298-1299`

```typescript
const { analyseCalendarPatterns } = await import("./ai-service");
const { getCalendarEvents } = await import("./calendar-service");
```

Dynamic imports at runtime to work around module graph issues indicate the dependency structure needs refactoring. The comment on line 1297 acknowledges this: `// Import dynamically to avoid circular deps`.

---

### :yellow_circle: ARC-06 -- Shared types defined locally instead of in shared/

**Files**:
- `client/src/pages/settings.tsx:23-45` (`TimeBlock`, `WeeklyHours`, `AvailabilityRules`)
- `client/src/pages/onboarding.tsx:36-54` (`TimeBlock`, `DaySchedule`, `WeekSchedule`, `AnalysisSuggestions`)

These types mirror server-side structures but are defined independently, creating divergence risk.

---

### :blue_circle: ARC-07 -- `shared/models/chat.ts` appears unused by the main app

**File**: `shared/models/chat.ts:1-34`

Defines `conversations` and `messages` tables with proper foreign keys and Zod schemas, but no route or storage method references these tables. This appears to be leftover from a Replit integration.

---

## 2. Code Smells

### :red_circle: CS-01 -- Fire-and-forget async IIFEs (9+ instances)

**File**: `server/routes.ts`

| Location | Purpose |
|----------|---------|
| Lines 711-754 | Send cancellation emails (host-initiated delete) |
| Lines 827-848 | Create new calendar event after host reschedule |
| Lines 858-883 | Send host-reschedule notification to booker |
| Lines 1047-1086 | Send meeting brief email |
| Lines 1823-1867 | Send cancellation emails (booker-initiated cancel) |
| Lines 2037-2058 | Create calendar event after public reschedule |
| Lines 2061-2069 | Delete meeting brief after reschedule |
| Lines 2074-2125 | Send reschedule emails |
| Lines 2301-2363 | Send booking confirmation/host notification emails |
| Lines 2366-2415 | Auto-enrich and score new booking |
| Lines 2421-2470 | Generate immediate meeting brief |

Each block follows the pattern:
```typescript
(async () => {
  try { /* critical side-effect */ }
  catch (err) { console.error(...); }
})();
```

**Impact**: No retry. No alerting. No observability. If email sending fails (SMTP down), the user never gets a confirmation. If enrichment fails, no brief is generated. If calendar creation fails, the booking has no calendar link. The response has already been sent, so the client sees success.

**Recommendation**: Introduce a lightweight job queue (e.g., BullMQ, pg-boss, or even a simple in-process retry queue) so failed side-effects can be retried and monitored.

---

### :orange_circle: CS-02 -- Magic numbers throughout booking flow

**File**: `server/routes.ts`

| Line | Value | Meaning |
|------|-------|---------|
| 2210 | `365 * 24 * 60 * 60 * 1000` | Max booking window (1 year in ms) |
| 1977 | `365 * 24 * 60 * 60 * 1000` | Same, duplicated |
| 2420 | `60 * 60 * 1000` | 1 hour in ms (brief generation threshold) |
| 2424 | `5000` | Delay in ms before generating brief |
| 88 | `10` | bcrypt salt rounds |
| 98 | `24 * 60 * 60 * 1000` | Email verification token expiry (24h) |
| 271 | `15 * 60 * 1000` | Magic link expiry (15 min) |
| 343 | `60 * 60 * 1000` | Password reset token expiry (1h) |

**Recommendation**: Extract into named constants (e.g., `MAX_BOOKING_WINDOW_MS`, `BRIEF_GENERATION_THRESHOLD_MS`, `BCRYPT_ROUNDS`).

---

### :orange_circle: CS-03 -- Duplicated double-booking prevention logic

**Files**:
- `server/routes.ts:2217-2228` (public booking creation)
- `server/routes.ts:799-810` (host-initiated reschedule)
- `server/routes.ts:1994-2007` (public reschedule)

The conflict-detection algorithm is repeated 3 times with minor variations (e.g., whether to exclude the current booking). Extract into a shared utility like `hasScheduleConflict(userId, startTime, endTime, excludeBookingId?)`.

---

### :orange_circle: CS-04 -- Duplicated hostName derivation pattern

**File**: `server/routes.ts` -- at least 10 instances of:
```typescript
const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
```

Lines: 716, 861, 1065, 1759, 1828, 1882, 2077, 2305, 2488, and more.

**Recommendation**: Extract into a utility: `function getDisplayName(user: User | null, fallback = "Host"): string`.

---

### :yellow_circle: CS-05 -- Duplicated timezone helper functions

**Files**:
- `client/src/pages/settings.tsx:143-149` (`detectTimezone`)
- `client/src/pages/onboarding.tsx:213-219` (`detectTimezone`)
- `client/src/pages/onboarding.tsx:86-98` (`generateTimeOptions`)
- `client/src/pages/settings.tsx:106-119` (`generateTimeOptions`)

Identical utility functions duplicated across page files.

---

### :yellow_circle: CS-06 -- `deleteUserAndData` performs N+1 deletes without a transaction

**File**: `server/storage.ts:166-199`

```typescript
for (const bookingId of bookingIds) {
  await db.delete(meetingBriefs).where(eq(meetingBriefs.bookingId, bookingId));
  await db.delete(leadEnrichments).where(eq(leadEnrichments.bookingId, bookingId));
  // ... 2 more per booking
}
```

Each booking runs 4 sequential DELETE queries. For a user with 100 bookings, that is 400+ queries. The entire cascade is not wrapped in a transaction, so a failure mid-way leaves orphaned data.

**Recommendation**: Use cascading foreign keys (already defined in schema) and a single `DELETE FROM users WHERE id = $1` in a transaction, or at minimum use `WHERE bookingId IN (...)` bulk deletes.

---

### :yellow_circle: CS-07 -- Deep nesting in booking creation handler

**File**: `server/routes.ts:2174-2476`

The `POST /api/public/book` handler is ~300 lines with nesting up to 4 levels deep (try > if > for > if). The fire-and-forget blocks add implicit nesting via closures over `req`, `booking`, and `eventType`.

---

### :yellow_circle: CS-08 -- `parseInt(req.params.id)` repeated without validation

**File**: `server/routes.ts` -- at least 15 instances:
```typescript
const eventType = await storage.getEventType(parseInt(req.params.id));
```

Lines: 598, 632, 637, 648, 652, 673, 686, 764, 893, 926, 995, 1098, and more.

If `req.params.id` is not a valid number, `parseInt` returns `NaN`, which is passed to database queries. Should validate with something like `Number.isFinite(parseInt(id))` or use a param-parsing middleware.

---

### :blue_circle: CS-09 -- Hardcoded industry templates in route handler

**File**: `server/routes.ts:1446-1502`

A ~55-line `industryTemplates` constant map is defined inside a route handler. Move to a configuration file or shared constant.

---

### :blue_circle: CS-10 -- Commented-out code / stale references

**File**: `shared/models/auth.ts:5`
```typescript
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
```
Replit Auth is no longer used (the app uses custom email/password + Google OAuth). This comment is misleading.

---

## 3. Naming

### :yellow_circle: NAM-01 -- Inconsistent naming for the same concept

- `guestTimezone` vs `clientTimezone` vs `validatedTimezone` vs `timezone` -- used interchangeably for the guest's timezone in booking flows
- `eventTypeSlug` (body param) vs `slug` (URL param) vs `req.params.slug`
- `extractedData` vs `prequalData` vs `prequalResponse` -- three names for prequal chat results

**Files**: `server/routes.ts:2176, 2236-2238, 2288, 2337, 2370`

---

### :yellow_circle: NAM-02 -- British/American spelling inconsistency

- `analyseCalendarPatterns` (British) in `server/ai-service.ts`
- `analyse` in route path `/api/availability-rules/analyse`
- `analyze` not used but would be expected in American English codebase

This is cosmetic but can confuse autocomplete and grep searches.

---

### :blue_circle: NAM-03 -- Generic variable names in complex logic

**File**: `server/routes.ts:2194-2196`
```typescript
const [hours, minutes] = time.replace(/ [AP]M/, "").split(":").map(Number);
const isPM = time.includes("PM");
const adjustedHours = isPM && hours !== 12 ? hours + 12 : (hours === 12 && !isPM ? 0 : hours);
```

Variable `time` is ambiguous. This is a 12h-to-24h conversion that deserves to be a named utility function (like the ones in `onboarding.tsx`).

---

## 4. Type Safety

### :red_circle: TS-01 -- `req.user` globally typed as `any`

**File**: `server/index.ts:26-32`

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
```

Every access to `req.user` throughout routes.ts bypasses type checking. Properties like `req.user.id`, `req.user.email`, `req.user!.firstName` are used without any compile-time validation.

**Recommendation**: Change to `user?: User` (from shared schema) to get full type safety on all user property accesses.

---

### :red_circle: TS-02 -- `extractedData` cast to `Record<string, any>` (5+ locations)

**File**: `server/routes.ts`

```typescript
const extracted = prequalResp?.extractedData as Record<string, any> | null;  // line 2337
const extractedData = prequalResponse?.extractedData as Record<string, any> | null;  // lines 938, 2370
```

Then accessed with further unsafe casts:
```typescript
extractedData.summary as string | undefined  // line 2378
extractedData.keyPoints as string[] | undefined  // line 2379
```

The `PrequalResponse.extractedData` is typed as `Record<string, string>` in the schema, but the code treats it as containing nested arrays and objects. Either the schema type is wrong or the code is making invalid assumptions.

---

### :orange_circle: TS-03 -- `(user as any)` casts in settings.tsx (6 instances)

**File**: `client/src/pages/settings.tsx:385-390`

```typescript
setProfileCompanyName((user as any).companyName || "");
setProfileWebsiteUrl((user as any).websiteUrl || "");
setProfileTimezone((user as any).timezone || detectTimezone());
setBrandingLogo((user as any).defaultLogo || "");
setBrandingPrimaryColor((user as any).defaultPrimaryColor || "");
setBrandingSecondaryColor((user as any).defaultSecondaryColor || "");
```

The `useAuth` hook returns a `User` type that is missing the fields added to the schema (companyName, websiteUrl, timezone, defaultLogo, etc.). Rather than updating the User type, the developer cast to `any`.

**Recommendation**: Ensure the `User` type exported from `shared/models/auth.ts` includes all columns, and that the auth hook exposes the complete type.

---

### :orange_circle: TS-04 -- `(req.session as any)` casts

**File**: `server/routes.ts` -- lines 106, 138, 253, 317, 1128, 1144, 1150, 1154

The session type is augmented in `server/index.ts:20-24` to include `userId`, but `calendarOAuthState` is not declared. Hence `(req.session as any).calendarOAuthState` is used repeatedly.

**Recommendation**: Add `calendarOAuthState?: string` to the `SessionData` declaration.

---

### :orange_circle: TS-05 -- `getBookingWithDetails` returns `any`

**File**: `server/storage.ts:71-72`

```typescript
getBookingWithDetails(id: number): Promise<any>;
getBookingsWithDetails(userId: string): Promise<any[]>;
```

Two of the most-used storage methods return untyped data. Every consumer must guess the shape. The type `BookingWithDetails` is already defined in `shared/schema.ts:299-305` but is not used.

---

### :orange_circle: TS-06 -- `profileUpdateMutation` typed as `Record<string, any>`

**File**: `client/src/pages/settings.tsx:297`

```typescript
mutationFn: async (data: Record<string, any>) => {
```

Loses all type safety for profile update payloads. Should use a union type or the specific profile update fields.

---

### :yellow_circle: TS-07 -- `(d: any)` in document mapping

**File**: `server/routes.ts:2454`

```typescript
docs.map((d: any) => ({ name: d.name, contentType: d.contentType || "unknown", size: d.size || 0 })),
```

The `Document` type is fully defined in schema. This `any` cast is unnecessary.

---

### :yellow_circle: TS-08 -- `queryClient.getQueryFn` nullability not reflected in types

**File**: `client/src/lib/queryClient.ts:27-42`

```typescript
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T>
```

When `on401` is `"returnNull"`, the function returns `null`, but the return type is `T` (not `T | null`). Consumers may not handle the null case.

---

### :blue_circle: TS-09 -- Google OAuth token response not fully typed

**File**: `server/routes.ts:216`

```typescript
const tokens = await tokenResponse.json() as { access_token: string };
```

The Google token response also includes `refresh_token`, `expires_in`, `token_type`, and `id_token`, but only `access_token` is typed. If any of the other fields are used later, there is no compile-time check.

---

## 5. Error Handling

### :red_circle: TS-EH-01 -- Response sent before fire-and-forget failures

**File**: `server/routes.ts:2298` then `2301-2363`

```typescript
res.status(201).json({ ...booking, calendarEventId: ... });  // Response sent

// Fire-and-forget: send confirmation emails
(async () => { ... })();  // If this fails, client already has 201
```

The client receives a success response but the user might never get their confirmation email. The host might never be notified. There is no mechanism to detect or retry these failures.

---

### :orange_circle: EH-02 -- Swallowed errors in catch blocks

**File**: `server/routes.ts:102-104`

```typescript
sendEmail({ to: email, ...verifyEmail }).catch(err =>
  console.error("Failed to send verification email:", err)
);
```

This pattern appears 15+ times. Email failures are logged but never surfaced to users or monitoring systems.

---

### :orange_circle: EH-03 -- Calendar status silently returns `connected: false` on error

**File**: `server/routes.ts:1187-1189`

```typescript
} catch (error) {
  res.json({ connected: false });
}
```

If the calendar API call throws due to a network error (not a token expiration), the user sees "not connected" even though they are. The error is not logged.

---

### :yellow_circle: EH-04 -- No error boundary on the React client

**File**: `client/src/App.tsx`

The app does not implement a React error boundary. An unhandled exception in any component will crash the entire SPA with a white screen.

---

### :yellow_circle: EH-05 -- Generic error messages hide root cause

**File**: `server/routes.ts:2474`

```typescript
res.status(400).json({ error: "Failed to create booking" });
```

A 400 status is returned for all errors in the booking creation catch block, even if the actual error was a 500 (database failure, AI service timeout, etc.). The generic message provides no debugging context.

---

### :blue_circle: EH-06 -- `error` parameter unused in several catch blocks

**File**: `server/routes.ts:1187, 1197`

```typescript
} catch (error) {
  res.json({ connected: false });
}
// and
} catch (error) {
  res.status(500).json({ error: "Failed to disconnect calendar" });
}
```

The caught `error` is not logged, making debugging difficult.

---

## 6. Organization

### :orange_circle: ORG-01 -- Helper functions defined inside route registration

**File**: `server/routes.ts:19-56`

`validatePasswordStrength`, `isValidEmail`, `generateToken`, `getBaseUrl`, and `requireAuth` are defined at the top of `routes.ts`. These are general-purpose utilities that should live in dedicated utility modules (e.g., `server/utils/validation.ts`, `server/middleware/auth.ts`).

---

### :orange_circle: ORG-02 -- Upload endpoint missing auth

**File**: `server/routes.ts:1701`

```typescript
app.post("/api/uploads/request-url", async (req, res) => {
```

This endpoint does not use `requireAuth`. Anyone can request a presigned upload URL without authentication.

---

### :yellow_circle: ORG-03 -- Schema split across two files with re-exports

**Files**:
- `shared/schema.ts` (main schema, 306 lines)
- `shared/models/auth.ts` (auth tables, 125 lines)
- `shared/models/chat.ts` (chat tables, 34 lines, possibly unused)

The split is not by domain but seemingly by creation time. `shared/schema.ts` re-exports both via `export *`. Consider either consolidating into one file or splitting by actual domain (auth, scheduling, AI).

---

### :yellow_circle: ORG-04 -- Client components not co-located with their features

Custom components like `ObjectUploader.tsx`, `lead-score-badge.tsx`, and `password-strength-indicator.tsx` are in a flat `components/` directory alongside ~40 shadcn/ui components in `components/ui/`. Feature-specific components should be co-located with their pages or placed in a `components/features/` directory.

---

### :blue_circle: ORG-05 -- No barrel exports in client directories

Each page imports components with long relative paths. Barrel `index.ts` files in `components/`, `hooks/`, and `lib/` directories would simplify imports.

---

## 7. Comments & Documentation

### :yellow_circle: DOC-01 -- Outdated Replit Auth reference

**File**: `shared/models/auth.ts:4-5`

```typescript
// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
```

The app no longer uses Replit Auth. This comment is actively misleading and may prevent legitimate schema refactoring.

---

### :yellow_circle: DOC-02 -- Feature-brief references without context

**File**: `server/routes.ts` (throughout)

Comments like `// F09 R4`, `// F13 R1`, `// F12 R5`, `// F10 R6`, `// F04` reference feature-brief documents but provide no inline summary of what the requirement is. A developer without access to the feature-brief directory cannot understand the code intent.

---

### :yellow_circle: DOC-03 -- Side-effect comments in use-toast.ts

**File**: `client/src/hooks/use-toast.ts:94`

```typescript
// ! Side effects ! - This could be extracted into a dismissToast() action,
// but I'll keep it here for simplicity
```

This is a standard shadcn/ui file, so the comment is from the library. However, the `TOAST_REMOVE_DELAY` on line 9 is set to `1000000` (16+ minutes), which seems unintentionally high -- likely a copy-paste from the shadcn template.

---

### :blue_circle: DOC-04 -- No JSDoc on public storage interface methods

**File**: `server/storage.ts:37-120`

The `IStorage` interface defines 40+ methods with no documentation. Method names are descriptive but parameters like `data: Partial<InsertBooking>` give no indication of which fields are required for different operations.

---

## 8. Async Patterns

### :red_circle: ASYNC-01 -- Race condition in immediate brief generation

**File**: `server/routes.ts:2421-2470`

```typescript
if (msUntilStart < 60 * 60 * 1000) {
  (async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));  // line 2424
    // ... generate brief
  })();
}
```

The code uses a hardcoded 5-second delay hoping enrichment completes first. If enrichment takes longer than 5 seconds (e.g., slow OpenAI API), the brief is generated without enrichment data. If the server restarts during the 5-second window, the brief is never generated.

---

### :red_circle: ASYNC-02 -- Calendar event creation can leave stale IDs

**File**: `server/routes.ts:2030-2058`

During public reschedule:
1. Old calendar event is deleted (fire-and-forget with `.catch`)
2. New calendar event is created (fire-and-forget IIFE)
3. New event ID is stored in booking

If step 2 fails after step 1 succeeds, the booking's `calendarEventId` still points to the deleted event. The booking has no calendar representation and no way to detect this.

---

### :orange_circle: ASYNC-03 -- `req` object captured in closures after response

**File**: `server/routes.ts:2307, 2353, 2396, etc.`

Fire-and-forget IIFEs capture `req` to call `getBaseUrl(req)`. After `res.json()` is called, Express may recycle or modify the `req` object. In practice, the current Express version keeps `req` alive in the closure, but this is a fragile assumption that could break with framework upgrades.

**Recommendation**: Compute `baseUrl` before sending the response, and pass it as a local variable to the async block.

---

### :orange_circle: ASYNC-04 -- No concurrency control on AI operations

**File**: `server/routes.ts:2366-2415`

Every booking creation triggers an AI enrichment call to OpenAI. Under load (e.g., 50 simultaneous bookings), this spawns 50 concurrent OpenAI requests without any rate limiting or concurrency cap. This could exhaust API rate limits or cause cascading timeouts.

---

### :yellow_circle: ASYNC-05 -- `staleTime: Infinity` prevents data freshness

**File**: `client/src/lib/queryClient.ts:50`

```typescript
staleTime: Infinity,
```

Combined with `refetchOnWindowFocus: false` and `refetchInterval: false`, data fetched once is never automatically refreshed. If a user creates a booking in another tab, the bookings list in the first tab remains stale until a manual invalidation. The sidebar unread-briefs badge is the only query with a `refetchInterval` (60s).

---

### :yellow_circle: ASYNC-06 -- `useEffect` with `[state]` dependency causes re-subscribe on every render

**File**: `client/src/hooks/use-toast.ts:174-182`

```typescript
React.useEffect(() => {
  listeners.push(setState);
  return () => {
    const index = listeners.indexOf(setState);
    if (index > -1) { listeners.splice(index, 1); }
  };
}, [state]);  // <-- depends on `state`
```

The effect unsubscribes and re-subscribes every time `state` changes (i.e., on every toast). The dependency should be `[]` (empty) since `setState` is stable. This is a shadcn/ui library file, but it could cause subtle ordering issues with multiple listeners.

---

### :blue_circle: ASYNC-07 -- Sequential document saves in booking creation

**File**: `server/routes.ts:2269-2277`

```typescript
for (const doc of documents) {
  await storage.createDocument({...});
}
```

Documents are saved one at a time. For bookings with multiple documents, these could be parallelized with `Promise.all`.

---

---

## Summary by File

| File | Findings | Worst Severity |
|------|----------|----------------|
| `server/routes.ts` | ARC-01, ARC-03, CS-01, CS-02, CS-03, CS-04, CS-07, CS-08, CS-09, NAM-01, NAM-03, TS-02, TS-04, TS-07, TS-09, EH-01, EH-02, EH-03, EH-05, EH-06, ORG-01, ORG-02, DOC-02, ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, ASYNC-07 | :red_circle: CRITICAL |
| `client/src/pages/settings.tsx` | ARC-02, ARC-06, CS-05, TS-03, TS-06 | :red_circle: CRITICAL |
| `server/index.ts` | TS-01 | :red_circle: CRITICAL |
| `server/storage.ts` | CS-06, TS-05, DOC-04 | :orange_circle: HIGH |
| `shared/schema.ts` | ARC-04 (partial), ORG-03 | :yellow_circle: MEDIUM |
| `shared/models/auth.ts` | ARC-07, CS-10, DOC-01 | :yellow_circle: MEDIUM |
| `client/src/pages/onboarding.tsx` | ARC-04 (partial), ARC-06, CS-05 | :yellow_circle: MEDIUM |
| `client/src/lib/queryClient.ts` | TS-08, ASYNC-05 | :yellow_circle: MEDIUM |
| `client/src/hooks/use-toast.ts` | DOC-03, ASYNC-06 | :yellow_circle: MEDIUM |
| `client/src/App.tsx` | EH-04 | :yellow_circle: MEDIUM |
| `client/src/pages/event-types.tsx` | (clean) | -- |
| `client/src/pages/event-type-ai-create.tsx` | (clean) | -- |
| `client/src/hooks/use-upload.ts` | (clean, well-documented) | -- |
| `client/src/lib/ics.ts` | (clean, good RFC compliance) | -- |
| `client/src/components/ThemeProvider.tsx` | (clean) | -- |
| `client/src/components/AppSidebar.tsx` | (clean) | -- |
| `client/src/pages/not-found.tsx` | (clean) | -- |

---

## Recommended Remediation Priority

### Phase 1 -- Critical (1-2 sprints)
1. **TS-01**: Type `req.user` as `User` in the global declaration
2. **ARC-01**: Begin splitting `routes.ts` into domain modules; start with `routes/auth.ts` and `routes/public.ts`
3. **CS-01**: Introduce a background job mechanism for fire-and-forget work (email, enrichment, calendar sync)
4. **ORG-02**: Add `requireAuth` to the upload endpoint

### Phase 2 -- High (2-4 sprints)
5. **ARC-02**: Decompose `settings.tsx` into sub-components
6. **TS-02, TS-03**: Fix `any` casts by updating types and interfaces
7. **TS-05**: Type `getBookingWithDetails` return as `BookingWithDetails`
8. **CS-06**: Wrap `deleteUserAndData` in a transaction and use bulk deletes
9. **ARC-04**: Consolidate default-availability constants into shared module
10. **CS-03**: Extract `hasScheduleConflict()` utility

### Phase 3 -- Medium/Low (ongoing)
11. **EH-04**: Add React error boundary
12. **CS-02, CS-04, CS-05**: Extract constants, utilities, and deduplicate helper functions
13. **DOC-01, DOC-02**: Update stale comments
14. **ASYNC-05**: Evaluate staleTime strategy per query
15. **ARC-06, ORG-03**: Consolidate shared types and schema organization
