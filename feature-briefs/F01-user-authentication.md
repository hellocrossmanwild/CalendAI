# F01: User Authentication

**Priority:** High
**Estimated Scope:** Medium
**Dependencies:** None

---

## Current State

The app has basic username/password authentication with session management:

- **Registration:** `POST /api/auth/register` accepts `username`, `password`, `firstName`, `lastName` (`server/routes.ts:24-50`)
- **Login:** `POST /api/auth/login` authenticates with `username`/`password` (`server/routes.ts:52-75`)
- **Sessions:** PostgreSQL-backed via `connect-pg-simple`, 7-day expiry (`server/index.ts:44-59`)
- **Password hashing:** bcrypt with 10 rounds (`server/routes.ts:36`)
- **User model:** `shared/models/auth.ts` — fields: `id`, `email`, `username`, `password`, `firstName`, `lastName`, `profileImageUrl`, `createdAt`, `updatedAt`
- **Frontend:** `client/src/pages/auth.tsx` — toggle between login/signup forms using `username` field

### What's Missing vs PRD

1. **Email-based auth** — PRD specifies email/password, not username/password
2. **Google OAuth** — Packages installed (`google-auth-library`, `openid-client`) but unused
3. **Magic link authentication** — Not implemented
4. **Password reset flow** — Not implemented
5. **Email verification** — Not implemented
6. **Password strength validation** — Not implemented

---

## Requirements

### R1: Switch from Username to Email as Primary Identifier

- Change registration to accept `email` instead of `username` as the primary field
- Update `POST /api/auth/register` to validate email format and check for existing email
- Update `POST /api/auth/login` to authenticate with `email`/`password`
- Update `client/src/pages/auth.tsx` to show email field instead of username
- Keep `username` in the user model as an optional display name (or remove it)
- Add email format validation (Zod schema)

### R2: Google OAuth

- Implement Google OAuth 2.0 flow using the installed `google-auth-library` package
- Add `GET /api/auth/google` — redirects to Google consent screen
- Add `GET /api/auth/google/callback` — handles OAuth callback, creates/finds user, sets session
- Frontend: Add "Sign in with Google" button on auth page
- If Google user doesn't exist, auto-create account from Google profile data (email, name, photo)
- If Google user exists (matched by email), link and login
- Environment variables needed: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### R3: Magic Link Authentication

- Add `POST /api/auth/magic-link` — accepts email, generates a time-limited token, sends email with login link
- Add `GET /api/auth/magic-link/verify?token=xxx` — verifies token, creates session
- Token should expire in 15 minutes
- Store tokens in a new `magic_link_tokens` table or use a signed JWT
- Frontend: Add "Sign in with email link" option on auth page
- Requires email sending capability (coordinate with F09 Email Notifications feature)

### R4: Password Reset Flow

- Add `POST /api/auth/forgot-password` — accepts email, sends reset link
- Add `POST /api/auth/reset-password` — accepts token + new password, updates password
- Token expires in 1 hour
- Frontend: Add "Forgot password?" link on login form, reset password page
- Requires email sending capability (coordinate with F09)

### R5: Email Verification

- On email/password registration, set `emailVerified: false` on user
- Send verification email with unique token
- Add `GET /api/auth/verify-email?token=xxx` — marks email as verified
- Add `emailVerified` boolean field to users table
- Optionally restrict certain features until email is verified
- Requires email sending capability (coordinate with F09)

### R6: Password Strength Validation

- Minimum 8 characters
- At least one uppercase, one lowercase, one number
- Add validation on both frontend (form) and backend (API)
- Show password strength indicator on signup form

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/models/auth.ts` | Add `emailVerified` boolean field to users table |
| `shared/schema.ts` | Add `magicLinkTokens` or `passwordResetTokens` table if needed |
| `server/routes.ts` | Update register/login to use email; add Google OAuth, magic link, password reset routes |
| `server/storage.ts` | Add `getUserByEmail()`, token CRUD methods |
| `server/index.ts` | Add Google OAuth middleware setup if needed |
| `client/src/pages/auth.tsx` | Rewrite to show email field, Google button, magic link option, forgot password link |
| `client/src/hooks/use-auth.ts` | Update if auth response shape changes |

---

## Database Changes

```sql
-- Add emailVerified to users
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;

-- Optional: password reset tokens table
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Acceptance Criteria

- [ ] Users can register with email + password (not username)
- [ ] Users can log in with email + password
- [ ] Users can sign in with Google OAuth
- [ ] Users can request a magic link login via email
- [ ] Users can reset their password via email
- [ ] Email verification is sent on registration
- [ ] Password strength is validated on signup (min 8 chars, mixed case, number)
- [ ] Existing sessions continue to work
- [ ] All auth flows redirect to dashboard on success

---

## Notes

- Magic link, password reset, and email verification all require email sending. If F09 (Email Notifications) is not yet implemented, these features can store tokens and log the email content to console as a stub, with actual sending wired up later.
- Google OAuth requires Google Cloud Console project with OAuth credentials configured.
- The `passport` and `passport-local` packages are installed but not currently used. You may choose to use them or continue with the current manual session approach.
