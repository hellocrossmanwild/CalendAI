# Production Readiness Audit — CalendAI

**Auditor role**: SRE Lead
**Date**: 2026-02-09
**Scope**: Full-stack review of server bootstrap, routing, database, background jobs, email, build pipeline, configuration, and operational posture.
**Codebase**: ~34,618 LOC TypeScript/TSX, Express 5, PostgreSQL (Drizzle ORM), React 18 SPA.

---

## Executive Summary

CalendAI is a feature-rich scheduling platform with solid application-level logic (input validation, double-booking prevention, token-based auth flows). However, it lacks virtually all operational infrastructure required for production reliability. There is no health endpoint, no graceful shutdown, no structured logging, no rate limiting, no Dockerfile, no CI/CD pipeline, no database migration history, no backup strategy, and no API documentation. The codebase was built for rapid feature delivery on Replit and would require significant hardening before being run as a production service with SLA expectations.

**Overall verdict**: NOT PRODUCTION READY. Approximately 28 findings across 7 audit categories, including 8 critical and 9 high-severity issues.

---

## 1. Observability

### 1.1 No Structured Logging
| Severity | Finding |
|----------|---------|
| CRITICAL | All logging uses `console.log` / `console.error` with human-readable string formatting. No structured JSON output. No log levels (debug/info/warn/error/fatal). No ability to filter, query, or alert on log data in any log aggregation system (Datadog, CloudWatch, ELK, etc.). |

**Evidence** (`server/index.ts:77-86`):
```typescript
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
```
This uses locale-dependent time formatting (varies by server locale), has no log level, and outputs unstructured strings.

**Impact**: Impossible to set up alerting, impossible to query logs during an incident, impossible to correlate requests across services.

### 1.2 No Request/Correlation IDs
| Severity | Finding |
|----------|---------|
| HIGH | No `x-request-id` header generation or propagation. No correlation ID middleware. Fire-and-forget async operations (email, enrichment, calendar sync) cannot be traced back to the originating request. |

**Evidence**: The request logging middleware (`server/index.ts:88-112`) logs `method path status duration` but generates no request ID. The approximately 15 fire-and-forget `(async () => { ... })()` blocks in `server/routes.ts` have no correlation back to the parent request.

### 1.3 No Health Endpoint
| Severity | Finding |
|----------|---------|
| CRITICAL | No `/health`, `/ready`, or `/live` endpoint exists. Load balancers, orchestrators (Kubernetes, ECS), and uptime monitors have no way to determine if the service is healthy or if the database connection is alive. |

**Evidence**: Grep for `health|readiness|liveness|/health|/ready` returned zero matches in server code.

### 1.4 No Metrics or Alerting
| Severity | Finding |
|----------|---------|
| HIGH | No Prometheus metrics, no StatsD, no OpenTelemetry instrumentation. No tracking of request latency percentiles, error rates, database query times, queue depths, or scheduler cycle durations. |

### 1.5 Response Body Logging in Production
| Severity | Finding |
|----------|---------|
| MEDIUM | The request logger captures and logs the full JSON response body for every API call. This will log sensitive data (user objects, tokens, session data) to stdout in production. |

**Evidence** (`server/index.ts:94-108`):
```typescript
const originalResJson = res.json;
res.json = function (bodyJson, ...args) {
  capturedJsonResponse = bodyJson;
  return originalResJson.apply(res, [bodyJson, ...args]);
};
// ...
logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
```

---

## 2. Error Recovery

### 2.1 No Graceful Shutdown
| Severity | Finding |
|----------|---------|
| CRITICAL | No `SIGTERM` or `SIGINT` handler. When the process is terminated (deploy, scale-down, restart), in-flight HTTP requests are dropped, the database connection pool is not drained, the brief scheduler interval is not cleared, and fire-and-forget async operations are abandoned mid-execution. |

**Evidence**: Grep for `SIGTERM|SIGINT|graceful|shutdown` returned zero matches in application code. The `stopBriefScheduler()` function exists in `server/brief-scheduler.ts:204-210` but is never called.

**Impact**: Data corruption risk. A booking creation that has responded 201 but whose fire-and-forget email/enrichment/calendar operations are mid-flight will be silently dropped. Database connections may leak.

### 2.2 No Circuit Breakers for External Services
| Severity | Finding |
|----------|---------|
| HIGH | The application makes synchronous calls to OpenAI, Google Calendar API, Google OAuth, and SMTP without circuit breakers. If any external service is down or slow, requests will hang until timeout (default Node.js socket timeout, potentially minutes). |

**Evidence**: `server/ai-service.ts`, `server/calendar-service.ts`, and `server/email-service.ts` all make direct API calls with no timeout, retry, or circuit breaker wrapping. The `p-retry` package is listed in `package.json` dependencies but only used in `server/replit_integrations/batch/utils.ts`, never in core application code.

### 2.3 No Retry with Backoff on Critical Operations
| Severity | Finding |
|----------|---------|
| MEDIUM | Email delivery, calendar event creation, and AI enrichment are all fire-and-forget with `.catch(err => console.error(...))`. A transient failure means permanent data loss (e.g., booking confirmation email never sent, calendar event never created). |

**Evidence** (`server/routes.ts:2326-2328`):
```typescript
sendEmail({ to: email, ...confirmTpl }).catch(err =>
  console.error("Failed to send booking confirmation:", err)
);
```

### 2.4 No Dead Letter Queue / Failed Job Tracking
| Severity | Finding |
|----------|---------|
| MEDIUM | Failed background operations (emails, enrichments, brief generation) are logged to console and then permanently lost. There is no retry queue, no failed job table, and no way to re-process failures. |

### 2.5 deleteUserAndData Not Transactional
| Severity | Finding |
|----------|---------|
| HIGH | The account deletion method performs approximately 10 sequential `DELETE` statements across multiple tables without a database transaction. A failure partway through leaves the user in a partially deleted state with orphaned records. |

**Evidence** (`server/storage.ts:166-196`):
```typescript
async deleteUserAndData(userId: string): Promise<void> {
  const userBookings = await db.select(...)...;
  // ~10 sequential DELETE operations, no transaction wrapper
  for (const bookingId of bookingIds) {
    await db.delete(meetingBriefs)...;
    await db.delete(leadEnrichments)...;
    // ... etc
  }
}
```

---

## 3. Configuration

### 3.1 Hardcoded Session Secret Fallback
| Severity | Finding |
|----------|---------|
| CRITICAL | `SESSION_SECRET` falls back to the hardcoded string `"calendai-secret-key"` when the env var is not set. This is visible in the public source code. Any attacker can forge session cookies. |

**Evidence** (`server/index.ts:52`):
```typescript
secret: process.env.SESSION_SECRET || "calendai-secret-key",
```

### 3.2 Missing .env.example
| Severity | Finding |
|----------|---------|
| MEDIUM | No `.env.example` or `.env.template` file exists. The codebase references at least 15 distinct environment variables across multiple files. A new developer or operator has no reference for what needs to be configured. |

**Environment variables found across the codebase** (non-exhaustive):
- `DATABASE_URL` (validated at startup -- good)
- `SESSION_SECRET` (hardcoded fallback -- bad)
- `PORT` (defaults to 5000)
- `NODE_ENV`
- `BASE_URL`
- `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

### 3.3 No Startup Validation for Critical Env Vars
| Severity | Finding |
|----------|---------|
| HIGH | Only `DATABASE_URL` is validated at startup (`server/db.ts:7-10`). All other critical variables (`SESSION_SECRET`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, SMTP credentials) silently fall back to defaults or undefined, leading to runtime failures that are difficult to diagnose. The OpenAI client initializes with `process.env.AI_INTEGRATIONS_OPENAI_API_KEY` which may be undefined, causing opaque errors on first AI call rather than a clear startup failure. |

### 3.4 No JSON Body Size Limit
| Severity | Finding |
|----------|---------|
| MEDIUM | `express.json()` is called without a `limit` option (`server/index.ts:35`). Express 5 defaults to 100KB, which is reasonable, but the Replit audio integration sets `50mb` (`server/replit_integrations/audio/routes.ts:6`). The main parser should have an explicit limit for defense-in-depth. |

### 3.5 Database Pool Not Configured
| Severity | Finding |
|----------|---------|
| MEDIUM | The PostgreSQL connection pool (`server/db.ts:13`) is created with only `connectionString` and no explicit `max`, `min`, `idleTimeoutMillis`, or `connectionTimeoutMillis` settings. The default `pg` pool max is 10 connections, which may be insufficient under load, and there is no connection timeout to fail fast. |

---

## 4. Deployment

### 4.1 No Dockerfile
| Severity | Finding |
|----------|---------|
| CRITICAL | No `Dockerfile` or `docker-compose.yml` exists. The application can only be deployed on Replit. There is no portable, reproducible build artifact. Moving to any other hosting platform (AWS, GCP, Railway, Fly.io) requires creating the entire container infrastructure from scratch. |

### 4.2 No CI/CD Pipeline
| Severity | Finding |
|----------|---------|
| CRITICAL | No `.github/workflows/`, no `Jenkinsfile`, no `gitlab-ci.yml`, no CI/CD configuration of any kind. There is no automated test gate, no lint check, no type check, no build verification before deployment. Code goes directly from commit to production. |

### 4.3 No Database Migration Strategy
| Severity | Finding |
|----------|---------|
| HIGH | The `drizzle.config.ts` outputs to `./migrations` but no migrations directory exists. The `package.json` script `db:push` uses `drizzle-kit push` which directly mutates the database schema without versioned migration files. There is no migration history, no ability to roll back schema changes, and no way to audit what schema changes were made when. |

**Evidence**:
```json
"db:push": "drizzle-kit push"
```
Glob for `**/migrations/**` returned no results.

### 4.4 No Rollback Plan
| Severity | Finding |
|----------|---------|
| MEDIUM | No blue/green deployment, no canary, no feature flags. With `drizzle-kit push` mutating the database schema in-place, rolling back a deployment that included schema changes is impossible without manual intervention. |

### 4.5 No Linter or Formatter
| Severity | Finding |
|----------|---------|
| LOW | No ESLint, Prettier, or Biome configuration. Only `tsc` type-checking via `npm run check`. Code style consistency depends entirely on developer discipline. |

---

## 5. Scalability

### 5.1 In-Process Scheduler (Single Point of Failure)
| Severity | Finding |
|----------|---------|
| HIGH | The brief scheduler (`server/brief-scheduler.ts`) runs as a `setInterval` inside the Node.js process. If two instances are running (horizontal scaling), both will attempt to generate briefs for the same bookings simultaneously, causing duplicate briefs, duplicate emails, and wasted OpenAI API credits. There is no distributed lock, no leader election, and no deduplication. |

**Evidence** (`server/brief-scheduler.ts:198`):
```typescript
intervalHandle = setInterval(runBriefCycle, INTERVAL_MS);
```

### 5.2 No Async Job Queue
| Severity | Finding |
|----------|---------|
| HIGH | All background work (email sending, AI enrichment, calendar sync, brief generation) is performed in fire-and-forget `(async () => { ... })()` blocks within the HTTP request handler. These operations consume the Node.js event loop, are not bounded by concurrency limits, cannot be retried on failure, and are lost on process termination. A proper job queue (BullMQ, pg-boss, Temporal) is needed. |

### 5.3 Session Store Scaling
| Severity | Finding |
|----------|---------|
| LOW | Sessions are stored in PostgreSQL via `connect-pg-simple`, which is adequate for moderate scale but adds read load to the primary database on every authenticated request (the auth middleware fetches the full user object per request via `storage.getUser(req.session.userId)`). At scale, this should use a caching layer or Redis-backed session store. |

### 5.4 Monolithic Route File
| Severity | Finding |
|----------|---------|
| LOW | All 55 API endpoints (~2,509 lines) are in a single `server/routes.ts` file. While not a production blocker, this impedes parallel development, makes code review difficult, and increases merge conflict frequency. |

### 5.5 No Rate Limiting
| Severity | Finding |
|----------|---------|
| CRITICAL | No rate limiting middleware on any endpoint. Public endpoints (`/api/public/book`, `/api/public/chat`, `/api/auth/login`, `/api/auth/register`, `/api/auth/magic-link`, `/api/auth/forgot-password`) are vulnerable to brute-force attacks, credential stuffing, and resource exhaustion. The OpenAI-backed chat endpoint (`/api/public/chat`) can be called unlimited times, generating unbounded API costs. |

**Evidence**: `express-rate-limit` appears in the build script's allowlist (`script/build.ts:17`) suggesting it was considered, but grep for `rateLimit|rate.?limit|throttle` in server code shows it is not imported or used anywhere in the application.

### 5.6 No CORS, Helmet, or Security Headers
| Severity | Finding |
|----------|---------|
| HIGH | No CORS middleware, no `helmet` for security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, etc.), and no CSRF protection. The session cookie lacks `sameSite` configuration. |

---

## 6. Data Integrity

### 6.1 No Backup Strategy
| Severity | Finding |
|----------|---------|
| CRITICAL | No database backup scripts, no pg_dump automation, no point-in-time recovery configuration, no backup verification process. Data loss from accidental deletion, corruption, or failed schema push is unrecoverable. |

### 6.2 Hard Deletes Without Soft Delete
| Severity | Finding |
|----------|---------|
| MEDIUM | User account deletion (`deleteUserAndData`) performs hard `DELETE` across all tables. Event type deletion is a hard delete. Meeting brief deletion is a hard delete. There is no soft-delete pattern, no `deleted_at` column, and no ability to recover accidentally deleted data. The one exception is booking "deletion" which correctly sets `status: "cancelled"` rather than deleting the row. |

### 6.3 No Idempotency Keys on Booking Creation
| Severity | Finding |
|----------|---------|
| MEDIUM | The `POST /api/public/book` endpoint has double-booking prevention (time-slot conflict check) but no idempotency key. If a client retries a failed request (network timeout, 502 from load balancer), a duplicate booking can be created. The onboarding completion endpoint has a partial idempotency check (`onboardingCompletedAt`) but booking creation does not. |

### 6.4 No Audit Trail
| Severity | Finding |
|----------|---------|
| MEDIUM | No audit log table. No tracking of who changed what and when for sensitive operations (booking status changes, cancellations, reschedules, account deletions, password changes). The feature brief `F12-reschedule-cancel.md` explicitly calls out "Consider adding a simple audit log" but it was never implemented. |

### 6.5 Expired Tokens Not Cleaned Up
| Severity | Finding |
|----------|---------|
| LOW | Password reset tokens, magic link tokens, and email verification tokens are marked `used=true` after consumption but are never deleted. Expired-but-unused tokens accumulate indefinitely. There is no cleanup job or TTL-based expiry. |

---

## 7. Documentation

### 7.1 No API Documentation
| Severity | Finding |
|----------|---------|
| MEDIUM | No Swagger/OpenAPI spec, no Postman collection, no API documentation of any kind. The 55 endpoints are only documented in the codebase map (`_audit/00-codebase-map.md`) which is an audit artifact, not a developer-facing API reference. |

### 7.2 No Incident Runbook
| Severity | Finding |
|----------|---------|
| MEDIUM | No runbook for common incidents (database connection failures, OpenAI API outages, SMTP delivery failures, high error rates, scheduler stalls). With no health checks and no structured logging, diagnosing production issues requires SSH access and reading unstructured console output. |

### 7.3 No Architecture Decision Records
| Severity | Finding |
|----------|---------|
| LOW | No ADR directory. Key decisions (why Drizzle over Prisma, why `drizzle-kit push` over migrations, why in-process scheduler over job queue, why pg sessions over Redis) are undocumented. The `feature-briefs/` directory contains 13 feature specs, which is good, but these are feature requirements, not architecture decisions. |

### 7.4 No Changelog
| Severity | Finding |
|----------|---------|
| LOW | No project-level `CHANGELOG.md`. Combined with no CI/CD and no tagged releases, there is no way to determine what changed between deployments. |

### 7.5 No Onboarding Guide
| Severity | Finding |
|----------|---------|
| LOW | No `CONTRIBUTING.md` or developer setup guide. Combined with the missing `.env.example`, a new developer has to reverse-engineer the setup process from the codebase. |

---

## Summary Table

| # | Category | Finding | Severity | File(s) |
|---|----------|---------|----------|---------|
| 1 | Observability | No structured logging | CRITICAL | `server/index.ts` |
| 2 | Observability | No request/correlation IDs | HIGH | `server/index.ts` |
| 3 | Observability | No health endpoint | CRITICAL | `server/routes.ts` |
| 4 | Observability | No metrics or alerting | HIGH | (absent) |
| 5 | Observability | Response body logged in production | MEDIUM | `server/index.ts:94-108` |
| 6 | Error Recovery | No graceful shutdown | CRITICAL | `server/index.ts` |
| 7 | Error Recovery | No circuit breakers | HIGH | `server/ai-service.ts`, `server/calendar-service.ts` |
| 8 | Error Recovery | No retry with backoff | MEDIUM | `server/routes.ts`, `server/email-service.ts` |
| 9 | Error Recovery | No dead letter queue | MEDIUM | (absent) |
| 10 | Error Recovery | deleteUserAndData not transactional | HIGH | `server/storage.ts:166-196` |
| 11 | Configuration | Hardcoded session secret fallback | CRITICAL | `server/index.ts:52` |
| 12 | Configuration | Missing .env.example | MEDIUM | (absent) |
| 13 | Configuration | No startup validation for critical env vars | HIGH | `server/index.ts`, `server/ai-service.ts` |
| 14 | Configuration | No explicit JSON body size limit | MEDIUM | `server/index.ts:35` |
| 15 | Configuration | Database pool not configured | MEDIUM | `server/db.ts:13` |
| 16 | Deployment | No Dockerfile | CRITICAL | (absent) |
| 17 | Deployment | No CI/CD pipeline | CRITICAL | (absent) |
| 18 | Deployment | No database migration strategy | HIGH | `drizzle.config.ts`, `package.json` |
| 19 | Deployment | No rollback plan | MEDIUM | (absent) |
| 20 | Deployment | No linter or formatter | LOW | (absent) |
| 21 | Scalability | In-process scheduler (no distributed lock) | HIGH | `server/brief-scheduler.ts` |
| 22 | Scalability | No async job queue | HIGH | `server/routes.ts` |
| 23 | Scalability | Session store on primary DB | LOW | `server/index.ts:47-48` |
| 24 | Scalability | Monolithic route file | LOW | `server/routes.ts` |
| 25 | Scalability | No rate limiting | CRITICAL | `server/routes.ts`, `server/index.ts` |
| 26 | Scalability | No CORS/Helmet/security headers | HIGH | `server/index.ts` |
| 27 | Data Integrity | No backup strategy | CRITICAL | (absent) |
| 28 | Data Integrity | Hard deletes, no soft delete | MEDIUM | `server/storage.ts` |
| 29 | Data Integrity | No idempotency keys on booking | MEDIUM | `server/routes.ts:2174` |
| 30 | Data Integrity | No audit trail | MEDIUM | (absent) |
| 31 | Data Integrity | Expired tokens never cleaned up | LOW | `shared/models/auth.ts` |
| 32 | Documentation | No API documentation | MEDIUM | (absent) |
| 33 | Documentation | No incident runbook | MEDIUM | (absent) |
| 34 | Documentation | No ADRs | LOW | (absent) |
| 35 | Documentation | No changelog | LOW | (absent) |
| 36 | Documentation | No onboarding guide | LOW | (absent) |

---

## Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| HIGH | 9 |
| MEDIUM | 12 |
| LOW | 7 |
| **Total** | **36** |

---

## What CalendAI Does Well

To be fair, the codebase has several positive attributes:

1. **Input validation is thorough**: Zod schemas for event types, email validation, password strength checks, timezone validation, field length limits, hex color format validation, and dangerous URL scheme rejection.
2. **Double-booking prevention**: Time-slot conflict checking on booking creation and rescheduling.
3. **Token-based auth flows are correctly implemented**: Cryptographically random tokens (32 bytes), expiration times, single-use enforcement, and constant-time email enumeration prevention (always returns success on forgot-password/magic-link).
4. **Authorization checks are consistent**: Every authenticated endpoint checks `req.user.id` ownership before returning data.
5. **Password handling is correct**: bcrypt with cost factor 10, password excluded from API responses (`const { password, ...safeUser } = user`).
6. **Fire-and-forget isolation**: Email/enrichment failures do not crash or block the HTTP response.
7. **Booking cancellation uses soft delete**: Sets `status: "cancelled"` rather than deleting the row.
8. **OAuth state parameter validated**: Calendar OAuth flow validates CSRF state parameter.
9. **Tests exist**: 11 test files covering core server functionality.

---

## Recommended Priority Order for Remediation

### Phase 1 — Stop the Bleeding (Week 1)
1. Remove hardcoded session secret fallback; require `SESSION_SECRET` at startup
2. Add startup validation for all critical env vars
3. Add rate limiting (at minimum on auth and public endpoints)
4. Add `helmet` middleware for security headers
5. Add `/health` endpoint with database connectivity check
6. Add `SIGTERM`/`SIGINT` handlers for graceful shutdown

### Phase 2 — Operational Foundation (Weeks 2-3)
7. Replace `console.log` with structured logger (pino or winston)
8. Add request ID middleware (uuid per request, propagated to logs)
9. Create `.env.example` with all required variables documented
10. Create Dockerfile and docker-compose.yml
11. Set up CI/CD pipeline (GitHub Actions: lint, typecheck, test, build)
12. Switch from `drizzle-kit push` to versioned migrations

### Phase 3 — Reliability (Weeks 3-5)
13. Wrap `deleteUserAndData` in a database transaction
14. Add circuit breakers and timeouts for OpenAI and Google APIs
15. Replace fire-and-forget async blocks with a job queue (pg-boss or BullMQ)
16. Add idempotency keys to booking creation
17. Implement database backup automation
18. Add distributed locking for brief scheduler (or move to job queue)

### Phase 4 — Maturity (Weeks 5-8)
19. Add Prometheus/OpenTelemetry metrics
20. Create incident runbook
21. Add OpenAPI spec / Swagger documentation
22. Add soft-delete pattern for event types and user data
23. Add audit trail table for sensitive operations
24. Add expired token cleanup job
25. Split monolithic routes.ts into domain modules
