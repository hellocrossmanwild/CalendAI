# F01: User Authentication

**Priority:** High
**Estimated Scope:** Medium
**Dependencies:** None
**Status: IMPLEMENTED** (email sending stubbed to console — awaiting F09)

---

## Implementation Summary

All 6 requirements (R1–R6) have been implemented. Email sending for magic links, password reset, and email verification is stubbed to `console.log` pending F09 (Email Notifications).

### What Was Built

| Requirement | Status | Details |
|-------------|--------|---------|
| R1: Email as primary identifier | Done | Registration and login use email. `getUserByEmail()` added to storage layer. |
| R2: Google OAuth | Done | `GET /api/auth/google` + callback. Auto-creates/links accounts. Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env vars. |
| R3: Magic link auth | Done (stub) | `POST /api/auth/magic-link` + `GET /api/auth/magic-link/verify`. 15-min token expiry. Email stubbed to console. |
| R4: Password reset | Done (stub) | `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`. 1-hour token expiry. Email stubbed to console. |
| R5: Email verification | Done (stub) | `emailVerified` field on users. Verification token sent on registration. `GET /api/auth/verify-email` + `POST /api/auth/resend-verification`. Email stubbed to console. |
| R6: Password strength | Done | Min 8 chars, uppercase, lowercase, number. Validated on backend and frontend. Visual strength indicator on signup. |

### Files Modified

| File | Changes |
|------|---------|
| `shared/models/auth.ts` | Added `emailVerified` boolean to users table. Added `passwordResetTokens`, `magicLinkTokens`, `emailVerificationTokens` tables. |
| `server/routes.ts` | Rewrote register/login for email. Added Google OAuth, magic link, password reset, email verification, resend verification endpoints. Added `validatePasswordStrength()`, `isValidEmail()`, `generateToken()`, `sendEmail()` (stub). |
| `server/storage.ts` | Added `getUserByEmail()`, `updateUser()`. Added token CRUD for all 3 token types (password reset, magic link, email verification). |
| `client/src/pages/auth.tsx` | Complete rewrite: email-based login/register, Google OAuth button, magic link flow, forgot password flow, reset password page, email verification page, password strength indicator component. |
| `client/src/App.tsx` | Added auth-related route handling (`/auth/verify-email`, `/auth/magic-link`, `/auth/reset-password`). |

### Database Tables Added

```sql
-- emailVerified added to users table
email_verified BOOLEAN DEFAULT false

-- New tables
password_reset_tokens (id, user_id, token, expires_at, used, created_at)
magic_link_tokens (id, email, token, expires_at, used, created_at)
email_verification_tokens (id, user_id, token, expires_at, used, created_at)
```

### API Endpoints Added

```
POST /api/auth/register              → Email + password registration (was username)
POST /api/auth/login                 → Email + password login (was username)
POST /api/auth/logout                → (unchanged)
GET  /api/auth/user                  → Now excludes password from response
GET  /api/auth/google                → Redirect to Google OAuth
GET  /api/auth/google/callback       → Google OAuth callback
POST /api/auth/magic-link            → Request magic link email
GET  /api/auth/magic-link/verify     → Verify magic link token
POST /api/auth/forgot-password       → Request password reset email
POST /api/auth/reset-password        → Reset password with token
GET  /api/auth/verify-email          → Verify email with token
POST /api/auth/resend-verification   → Resend verification email (auth required)
```

### What's Stubbed (Waiting for F09)

The `sendEmail()` function in `server/routes.ts` logs email content to the server console. When F09 implements real email infrastructure, replace this stub with:

```typescript
// Current stub in server/routes.ts:
function sendEmail(to: string, subject: string, body: string): void {
  console.log(`\n========== EMAIL (stub) ==========`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
  console.log(`==================================\n`);
}
```

F09 should:
1. Create `server/email-service.ts` with a real `sendEmail()` function
2. Update the stub in `server/routes.ts` to import and use the real service
3. Wire up: verification emails, magic link emails, password reset emails

### Patterns Established for Other Features

- **Token-based verification pattern**: `generateToken()` + database table + expiry check + mark-as-used. This pattern can be reused by F09 (booking tokens for reschedule/cancel) and F12.
- **`updateUser()` storage method**: New method available for any feature that needs to update user fields (F13 settings, etc.).
- **Password validation utility**: `validatePasswordStrength()` can be reused by F13 (change password).
- **`/api/auth/user` now excludes password hash** from response for security.

---

## Acceptance Criteria

- [x] Users can register with email + password (not username)
- [x] Users can log in with email + password
- [x] Users can sign in with Google OAuth (requires env vars configured)
- [x] Users can request a magic link login via email (stubbed to console)
- [x] Users can reset their password via email (stubbed to console)
- [x] Email verification is sent on registration (stubbed to console)
- [x] Password strength is validated on signup (min 8 chars, mixed case, number)
- [x] Existing sessions continue to work
- [x] All auth flows redirect to dashboard on success

---

## Notes

- Magic link, password reset, and email verification emails are logged to the server console as stubs. Wire up real delivery when F09 (Email Notifications) is implemented.
- Google OAuth requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables. Without them, the Google button returns a 503 error.
- The `username` field remains in the user model as an optional display name but is no longer used for authentication.
- The `passport` and `passport-local` packages remain installed but unused — the manual session approach was continued for consistency.
