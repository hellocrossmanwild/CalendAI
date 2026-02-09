# Security Audit Report -- CalendAI

**Auditor role:** Senior Penetration Tester
**Date:** 2026-02-09
**Scope:** Full codebase audit (server, client, shared, configuration)
**Codebase:** ~34,618 lines TypeScript/TSX/JS

---

## Executive Summary

The CalendAI codebase demonstrates several good security practices (Drizzle ORM parameterized queries, bcrypt password hashing, HTML escaping in email templates, Zod schema validation on some inputs, secure token generation via `crypto.randomBytes`). However, the audit identified **4 critical**, **7 high**, **8 medium**, and **6 low** severity findings across injection, authentication, secrets management, data exposure, API security, and infrastructure categories.

The most urgent issues are: a hardcoded session secret fallback, missing rate limiting on all endpoints (including authentication), Server-Side Request Forgery (SSRF) in the website scanner, an unauthenticated file upload endpoint, and missing CSRF protection.

---

## Findings

### 1. SECRETS / HARDCODED CREDENTIALS

#### SEC-01: Hardcoded Session Secret Fallback
- **Severity:** CRITICAL
- **File:** `server/index.ts` line 52
- **Code:**
  ```typescript
  secret: process.env.SESSION_SECRET || "calendai-secret-key",
  ```
- **Impact:** If `SESSION_SECRET` is not set in the environment (common in dev, possible in misconfigured production), all sessions are signed with a publicly known static key. An attacker can forge arbitrary session cookies, impersonating any user including administrators.
- **Recommendation:** Remove the fallback. Fail startup if `SESSION_SECRET` is not set, similar to how `DATABASE_URL` is validated in `server/db.ts`.

#### SEC-02: `.env` Not in `.gitignore`
- **Severity:** HIGH
- **File:** `.gitignore`
- **Detail:** The `.gitignore` file does not include `.env`, `.env.local`, `.env.production`, or any environment file patterns. If a developer creates a `.env` file with secrets (`DATABASE_URL`, `SESSION_SECRET`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_SECRET`, SMTP credentials), it can be accidentally committed to the repository.
- **Recommendation:** Add `.env*` to `.gitignore` immediately. Audit git history for any previously committed secrets.

#### SEC-03: Google Calendar OAuth Tokens Stored in Plaintext
- **Severity:** MEDIUM
- **File:** `shared/schema.ts` lines 133-143, `server/storage.ts` lines 507-523
- **Detail:** Google OAuth access tokens and refresh tokens are stored as plaintext in the `calendar_tokens` table. A database compromise or SQL injection elsewhere would expose long-lived refresh tokens that grant persistent access to users' Google Calendars.
- **Recommendation:** Encrypt tokens at rest using application-level encryption (e.g., AES-256-GCM with a key from an environment variable).

---

### 2. AUTHENTICATION & SESSION MANAGEMENT

#### SEC-04: No Rate Limiting on Any Endpoint
- **Severity:** CRITICAL
- **Files:** `server/index.ts`, `server/routes.ts` (entire file)
- **Detail:** There is no rate limiting middleware on any endpoint. This enables:
  - **Credential stuffing / brute force** on `POST /api/auth/login` (line 121)
  - **Password reset token brute force** on `POST /api/auth/reset-password` (line 361)
  - **Magic link abuse / email bombing** on `POST /api/auth/magic-link` (line 262)
  - **Verification email bombing** on `POST /api/auth/resend-verification` (line 413)
  - **AI resource exhaustion** on `POST /api/public/chat`, `POST /api/ai/create-event-type`, `POST /api/ai/scan-website` (each call consumes OpenAI API credits)
  - **Booking spam** on `POST /api/public/book` (line 2174) -- anonymous endpoint creates confirmed bookings with no throttle
- **Recommendation:** Implement `express-rate-limit` with tiered limits: strict limits (5-10/min) on auth endpoints, moderate (30/min) on public booking, and standard (100/min) on authenticated API routes.

#### SEC-05: Session Cookie Missing `httpOnly` Flag
- **Severity:** HIGH
- **File:** `server/index.ts` lines 55-58
- **Code:**
  ```typescript
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  ```
- **Detail:** The session cookie configuration does not set `httpOnly: true`. Without this flag, client-side JavaScript (including injected scripts via XSS) can read the session cookie via `document.cookie`, enabling session hijacking.
- **Recommendation:** Add `httpOnly: true` to the cookie configuration.

#### SEC-06: Session Cookie Missing `sameSite` Attribute
- **Severity:** HIGH
- **File:** `server/index.ts` lines 55-58
- **Detail:** No `sameSite` attribute is set on the session cookie. Modern browsers default to `Lax`, but explicitly setting `sameSite: "lax"` (or `"strict"`) ensures cross-site request protection across all browsers and prevents CSRF via cross-site form submissions.
- **Recommendation:** Add `sameSite: "lax"` to the cookie configuration.

#### SEC-07: No CSRF Protection
- **Severity:** HIGH
- **File:** `server/index.ts`, `server/routes.ts`
- **Detail:** There is no CSRF token middleware (e.g., `csurf`, double-submit cookie, or `Origin`/`Referer` header validation) on state-changing endpoints. The Google Calendar OAuth callback correctly validates a `state` parameter (line 1150), but all other POST/PATCH/DELETE endpoints are unprotected. Since session cookies are sent automatically by the browser, a malicious page could trigger actions like:
  - `DELETE /api/auth/account` (account deletion)
  - `POST /api/auth/logout` (session destruction)
  - `PATCH /api/event-types/:id` (event modification)
  - `DELETE /api/bookings/:id` (booking cancellation)
- **Note:** `sameSite: "lax"` (SEC-06 fix) would mitigate most CSRF for POST requests from cross-origin sites, but explicit CSRF tokens provide defense-in-depth.
- **Recommendation:** Implement CSRF protection via `sameSite` cookie attribute and/or a CSRF token mechanism.

#### SEC-08: OAuth Users Created with Empty String Password
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 239, 308
- **Code:**
  ```typescript
  password: "", // No password for OAuth users
  ```
- **Detail:** Google OAuth and magic-link users are created with `password: ""` (empty string) instead of `null`. While the login flow checks `if (!user.password)` (line 129), an empty string is truthy in JavaScript. If an attacker attempts to log in with an OAuth-only user's email and an empty password, `bcrypt.compare("", "")` would be called. Bcrypt will not match an empty string to an empty string (since `""` is not a bcrypt hash), so this is not directly exploitable. However, the semantics are confusing and error-prone for future code changes.
- **Recommendation:** Use `null` instead of `""` for passwordless accounts to make the "no password" state explicit.

#### SEC-09: Password Reset Tokens Not Invalidated on Password Change
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 514-545
- **Detail:** When a user changes their password via `POST /api/auth/change-password`, existing password reset tokens are not invalidated. An attacker who obtained a password reset link before the password change could still use it afterward (until the token expires).
- **Recommendation:** Invalidate all outstanding password reset tokens when a user changes their password.

#### SEC-10: No Session Invalidation on Password Change
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 514-545
- **Detail:** When a user changes their password, other active sessions are not invalidated. If an attacker has an active session (e.g., via a stolen cookie), changing the password does not revoke that session.
- **Recommendation:** Destroy all other sessions for the user upon password change (query the `sessions` table and delete rows matching the userId but not the current session).

---

### 3. INJECTION

#### SEC-11: Server-Side Request Forgery (SSRF) in Website Scanner
- **Severity:** CRITICAL
- **File:** `server/website-scanner.ts` lines 136-179
- **Detail:** The `scanWebsite()` function accepts a user-provided URL and performs a server-side HTTP fetch to it (line 152). While it validates the URL scheme (`http:` / `https:` only) and blocks `javascript:`, `data:`, `file:` schemes, it does NOT validate the hostname against internal/private network ranges. An attacker can supply URLs like:
  - `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint)
  - `http://localhost:5000/api/auth/user` (internal API)
  - `http://10.0.0.1/admin` (internal network)
  - `http://[::1]/` (IPv6 loopback)

  This endpoint is exposed on two authenticated routes (`POST /api/onboarding/scan-website` line 1398 and `POST /api/ai/scan-website` line 1685). While authentication is required, any registered user can perform SSRF.
- **Recommendation:** Implement hostname validation that blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7, etc.). Consider using a library like `ssrf-req-filter` or performing DNS resolution and validating the resolved IP before making the request.

#### SEC-12: Prompt Injection via User-Controlled AI Inputs
- **Severity:** MEDIUM
- **File:** `server/ai-service.ts` lines 52-80, 140-165, 329-391, 481-522
- **Detail:** Multiple AI prompts interpolate user-controlled data directly into the prompt string without any sanitization:
  - `enrichLead()` (line 55): Guest name, email, company
  - `generateMeetingBrief()` (line 143): Guest name, email, company, notes, chat history
  - `processPrequalChat()` (line 344-391): Guest info, chat messages, host name
  - `processEventTypeCreation()` (line 529): User messages

  While these are sent to OpenAI and the model is instructed to return JSON, an attacker could craft names, emails, or notes that contain adversarial prompt instructions to manipulate the AI output (e.g., producing misleading lead scores, injecting malicious content into meeting briefs, or exfiltrating data in the response).
- **Recommendation:** Sanitize user inputs before prompt interpolation (remove control characters, limit length). Consider using structured message roles (system/user) to separate instructions from data. Mark user-provided content explicitly as untrusted data in the prompt.

#### SEC-13: Unvalidated `req.body` Pass-Through on Event Type Update
- **Severity:** MEDIUM
- **File:** `server/routes.ts` line 637
- **Code:**
  ```typescript
  const updated = await storage.updateEventType(parseInt(req.params.id), req.body);
  ```
- **Detail:** The `PATCH /api/event-types/:id` endpoint passes the entire `req.body` directly to the storage layer without validation or field whitelisting. This contrasts with the `POST /api/event-types` endpoint (line 611) which validates via `insertEventTypeSchema.parse()`. An attacker could inject unexpected fields like `userId` (to reassign ownership), `createdAt`, or any future sensitive columns.
- **Recommendation:** Validate `req.body` through the schema or apply an explicit allow-list of updatable fields, similar to how `PATCH /api/auth/profile` (line 439) uses `allowedFields`.

---

### 4. API SECURITY

#### SEC-14: Unauthenticated File Upload URL Generation
- **Severity:** HIGH
- **File:** `server/routes.ts` lines 1701-1710
- **Code:**
  ```typescript
  app.post("/api/uploads/request-url", async (req, res) => {
  ```
- **Detail:** The `POST /api/uploads/request-url` endpoint does NOT use the `requireAuth` middleware. Any unauthenticated visitor can request upload URLs, potentially consuming storage resources, uploading malicious content, or abusing the storage service. There is also no validation of the request body (filename, size, content type).
- **Recommendation:** Add `requireAuth` middleware. Alternatively, if public uploads are intentional (for the booking flow), at minimum validate filename, content type, and file size, and apply rate limiting.

#### SEC-15: No Input Length/Size Validation on Public Booking
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 2174-2476
- **Detail:** The `POST /api/public/book` endpoint (public, no auth required) accepts several free-text fields without length validation:
  - `name` -- no length limit
  - `notes` -- no length limit
  - `company` -- no length limit
  - `chatHistory` -- arbitrary array of messages with no size limit
  - `documents` -- array with no count limit

  An attacker could submit extremely large payloads to consume server memory or database storage.
- **Recommendation:** Enforce maximum lengths on all string fields and array sizes. For example: name (255), notes (5000), company (255), chatHistory (50 messages, 2000 chars each), documents (20 max).

#### SEC-16: No Input Validation on Public Chat Endpoint
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 2478-2505
- **Detail:** The `POST /api/public/chat` endpoint accepts a `messages` array and `guestInfo` object without validation. The messages array could be arbitrarily large, and guestInfo fields are not validated. Each call triggers an OpenAI API request (consuming credits).
- **Recommendation:** Validate message count (max 50), individual message length (max 2000 chars), and guestInfo field lengths. Apply rate limiting per IP.

#### SEC-17: BOLA/IDOR Risk on Booking Token Endpoints
- **Severity:** LOW
- **File:** `server/routes.ts` lines 1751-1907
- **Detail:** The public cancel/reschedule endpoints use bearer tokens (`cancelToken`, `rescheduleToken`) in the URL path to authorize actions. The tokens are generated with `crypto.randomBytes(32)` (64 hex chars), which provides sufficient entropy (256 bits) against brute force. However, these tokens appear in:
  - Email bodies (could be leaked via email forwarding)
  - URL paths (logged by web servers, proxies, and browser history)
  - API response from `POST /api/public/book` (line 2298 -- tokens returned in the booking creation response)

  The risk is low because the token entropy is high, but token leakage could allow unauthorized rescheduling/cancellation.
- **Recommendation:** Consider sending tokens only in emails (not in the booking API response). Use POST-only endpoints to prevent token leakage in server logs.

---

### 5. DATA EXPOSURE

#### SEC-18: Full API Response Bodies Logged to Console
- **Severity:** HIGH
- **File:** `server/index.ts` lines 93-108
- **Code:**
  ```typescript
  if (capturedJsonResponse) {
    logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
  }
  ```
- **Detail:** The logging middleware captures and logs the full JSON response body for all `/api` requests. This means:
  - User objects (which may include hashed passwords if the `{ password, ...safeUser }` destructuring is missed anywhere)
  - Calendar tokens (access tokens, refresh tokens)
  - Email addresses, phone numbers, company information
  - Meeting briefs, chat histories
  - Session data

  All of this PII is written to stdout/stderr, which in production environments typically flows to centralized logging services. The `GET /api/auth/user` endpoint correctly strips the password (line 166), but the logging middleware operates on the raw response.
- **Recommendation:** Remove response body logging or redact sensitive fields. At minimum, exclude responses from endpoints that return sensitive data (`/api/auth/*`, `/api/calendar/*`).

#### SEC-19: Verbose Error Objects Logged to Console
- **Severity:** LOW
- **File:** `server/index.ts` line 124, `server/routes.ts` (throughout)
- **Detail:** The global error handler logs the full error object: `console.error("Internal Server Error:", err)`. Many route handlers also log the full error. Stack traces and internal details should not be exposed in production logs that may be accessible to a wider team.
- **Recommendation:** In production, log only sanitized error messages. Ensure stack traces are not returned in API responses (they currently are not -- only `message` is returned, which is good).

#### SEC-20: Email Content Logged to Console in Dev Mode
- **Severity:** LOW
- **File:** `server/email-service.ts` lines 69-75
- **Detail:** When SMTP is not configured, email content (including magic link URLs, password reset URLs, and verification URLs) is logged to console. If these logs are captured in a shared logging environment, token URLs could be exposed.
- **Recommendation:** In production, ensure SMTP is always configured. Redact token URLs in development logs.

---

### 6. INFRASTRUCTURE & HEADERS

#### SEC-21: No Security Headers (Helmet)
- **Severity:** HIGH
- **File:** `server/index.ts`
- **Detail:** The application does not use `helmet` or set any security headers. Missing headers include:
  - `Strict-Transport-Security` (HSTS) -- prevents SSL stripping
  - `X-Content-Type-Options: nosniff` -- prevents MIME type sniffing
  - `X-Frame-Options` / `Content-Security-Policy: frame-ancestors` -- prevents clickjacking
  - `X-XSS-Protection` -- legacy XSS filter
  - `Content-Security-Policy` -- prevents XSS, data injection
  - `Referrer-Policy` -- controls referrer information leakage
  - `Permissions-Policy` -- restricts browser features
- **Recommendation:** Install and configure `helmet` middleware with appropriate CSP, HSTS, and frame-ancestors policies. Note that `frame-ancestors` must allow embedding for the widget.js use case.

#### SEC-22: No CORS Configuration
- **Severity:** MEDIUM
- **File:** `server/index.ts`
- **Detail:** There is no explicit CORS middleware. Express 5 does not set CORS headers by default, meaning:
  - The widget.js iframe approach works because it loads the full page in an iframe (not a cross-origin XHR)
  - Cross-origin API requests from external domains will be blocked by the browser's same-origin policy
  - However, the lack of explicit CORS configuration means if CORS is ever needed, it might be configured too permissively

  The current setup is actually secure by omission (no CORS = same-origin only). However, the `postMessage` in the widget uses `"*"` as the target origin (see SEC-23).
- **Impact:** Low risk currently, but no defense-in-depth.

#### SEC-23: postMessage with Wildcard Target Origin
- **Severity:** LOW
- **File:** `client/src/pages/book.tsx` lines 208-210
- **Code:**
  ```typescript
  window.parent.postMessage(
    { source: "calendai", ...message },
    "*"
  );
  ```
- **Detail:** When the booking page is embedded as a widget, it sends `postMessage` to the parent window with `"*"` as the target origin. This means the message (which includes booking confirmation data: slug, date, time, guest name, email) is sent to any parent origin. If the widget is embedded on a malicious page, the attacker receives the booking data.
- **Recommendation:** Allow the host to specify the expected parent origin (e.g., via a query parameter or configuration), and use that as the `targetOrigin` instead of `"*"`.

#### SEC-24: Server Binds to 0.0.0.0
- **Severity:** LOW
- **File:** `server/index.ts` line 151
- **Detail:** The server binds to `0.0.0.0` (all network interfaces). On Replit this is expected, but in other deployment environments this could expose the server on unintended interfaces.
- **Recommendation:** Document this as intentional for the Replit deployment. In other environments, consider binding to `127.0.0.1` behind a reverse proxy.

---

### 7. DEPENDENCIES

#### SEC-25: Vulnerable Dependencies
- **Severity:** HIGH
- **Source:** `npm audit` output
- **Detail:** 3 known vulnerabilities detected:
  1. **fast-xml-parser 4.3.6-5.3.3** (HIGH) -- RangeError DoS via Numeric Entities Bug (GHSA-37qj-frw5-hhjh). Pulled in by `@google-cloud/storage`.
  2. **lodash 4.0.0-4.17.21** (MODERATE) -- Prototype Pollution Vulnerability in `_.unset` and `_.omit` (GHSA-xxjr-mmjv-4gpg).
- **Recommendation:** Run `npm audit fix` to update to patched versions. Monitor dependencies continuously.

---

### 8. CRYPTO & RANDOMNESS

#### SEC-26: Secure Token Generation (POSITIVE)
- **File:** `server/routes.ts` line 42
- **Code:**
  ```typescript
  function generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
  ```
- **Assessment:** Token generation uses `crypto.randomBytes(32)` which produces 256 bits of cryptographically secure randomness. This is sufficient for all token use cases (password reset, magic link, email verification, cancel/reschedule). **No issue.**

#### SEC-27: Bcrypt Cost Factor (POSITIVE)
- **File:** `server/routes.ts` lines 88, 378, 537
- **Assessment:** Bcrypt is used with a cost factor of 10, which is the current minimum recommended value. While cost factor 12 would be more future-proof, 10 is acceptable. **No issue.**

---

### 9. ADDITIONAL OBSERVATIONS

#### SEC-28: Google OAuth `state` Parameter Not Validated for Auth Login
- **Severity:** MEDIUM
- **File:** `server/routes.ts` lines 171-259
- **Detail:** The Google OAuth login flow (`/api/auth/google` and `/api/auth/google/callback`) does not use or validate a `state` parameter for CSRF protection. In contrast, the calendar OAuth flow correctly generates and validates a state parameter (lines 1127-1154). Without state validation, the OAuth login is vulnerable to CSRF -- an attacker could initiate an OAuth flow and trick a victim into completing it, linking the attacker's Google account to the victim's CalendAI session (login CSRF).
- **Recommendation:** Generate a random `state` parameter, store it in the session, and validate it in the callback.

#### SEC-29: Host Header Injection (Mitigated but Partial)
- **Severity:** LOW
- **File:** `server/routes.ts` lines 48-50
- **Code:**
  ```typescript
  function getBaseUrl(req: Request): string {
    return process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  }
  ```
- **Detail:** When `BASE_URL` is not set, the function derives the base URL from the request's `Host` header. An attacker could send a request with a manipulated `Host` header to generate password reset or magic link emails containing a malicious URL (pointing to an attacker's server), capturing the token when the victim clicks the link. The code includes a comment acknowledging this risk and preferring `BASE_URL`. However, the fallback to `req.get("host")` is still present.
- **Recommendation:** In production, always set `BASE_URL`. Consider removing the fallback or validating the Host header against a whitelist.

---

## Risk Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 4 | SEC-01, SEC-04, SEC-11, SEC-14 (via SEC-04 amplification) |
| HIGH | 7 | SEC-02, SEC-05, SEC-06, SEC-07, SEC-18, SEC-21, SEC-25 |
| MEDIUM | 8 | SEC-03, SEC-08, SEC-09, SEC-10, SEC-12, SEC-13, SEC-15/16, SEC-28 |
| LOW | 6 | SEC-17, SEC-19, SEC-20, SEC-22, SEC-23, SEC-24/29 |

---

## Priority Remediation Roadmap

### Immediate (Week 1) -- Critical & Quick Wins
1. **SEC-01:** Remove hardcoded session secret fallback. Fail if env var missing.
2. **SEC-02:** Add `.env*` to `.gitignore`.
3. **SEC-05 + SEC-06:** Add `httpOnly: true` and `sameSite: "lax"` to session cookie.
4. **SEC-04:** Install `express-rate-limit`; apply strict limits to auth and public endpoints.
5. **SEC-14:** Add `requireAuth` to `POST /api/uploads/request-url` or add validation and rate limiting.

### Short Term (Weeks 2-3) -- High Severity
6. **SEC-21:** Install and configure `helmet` middleware.
7. **SEC-11:** Add SSRF protection (private IP blocking) to website scanner.
8. **SEC-07 + SEC-28:** Implement CSRF protection; add `state` to Google OAuth login.
9. **SEC-25:** Run `npm audit fix`.
10. **SEC-18:** Remove or redact response body logging.

### Medium Term (Weeks 3-4) -- Medium Severity
11. **SEC-13:** Add field whitelisting/validation to `PATCH /api/event-types/:id`.
12. **SEC-15 + SEC-16:** Add input length validation to public booking and chat endpoints.
13. **SEC-12:** Sanitize user inputs before AI prompt interpolation.
14. **SEC-03:** Encrypt OAuth tokens at rest.
15. **SEC-09 + SEC-10:** Invalidate tokens and sessions on password change.

### Long Term -- Low Severity & Hardening
16. **SEC-23:** Restrict `postMessage` target origin.
17. **SEC-08:** Use `null` instead of `""` for passwordless accounts.
18. **SEC-29:** Remove Host header fallback or validate against whitelist.
19. Add automated security scanning (SAST/DAST) to CI pipeline.
20. Implement security logging and alerting (failed auth attempts, rate limit hits).

---

## Positive Security Practices Observed

- Drizzle ORM with parameterized queries prevents SQL injection
- Bcrypt password hashing (cost 10) with password strength validation
- `crypto.randomBytes(32)` for all security tokens (256-bit entropy)
- HTML escaping (`escapeHtml()`) in email templates prevents XSS in emails
- URL scheme validation on image/logo fields (blocks `javascript:`, `data:`, `vbscript:`)
- Password not returned in `GET /api/auth/user` response (destructured out)
- Google Calendar OAuth callback validates `state` parameter (CSRF protection)
- Magic link and forgot-password endpoints do not reveal user existence
- Booking ownership checks on all authenticated booking endpoints (prevents IDOR)
- Event type ownership checks on all authenticated event type endpoints
- Cancellation reason sanitized and truncated (`String(reason).slice(0, 1000)`)
- Onboarding data size limited (100KB max)
- Guest timezone validated with `isValidTimezone()`
- Dangerous URL schemes blocked in website scanner
