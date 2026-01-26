# F13: Settings & Configuration

**Priority:** Medium
**Estimated Scope:** Medium
**Dependencies:** F03 (for availability rules) — **SATISFIED**, F09 (for notification preferences)

---

## Impact from F01 Implementation

**F01 directly enables several F13 features:**

- **`updateUser()` storage method exists** — added in F01, ready for R1 (Profile Editing). No need to create it.
- **`emailVerified` field on users** — F01 added this field. The settings page should display verification status and offer a "Resend verification" button (endpoint `POST /api/auth/resend-verification` already exists).
- **Password strength validation available** — `validatePasswordStrength()` in `server/routes.ts` can be reused for R3 (Password Change). The `PasswordStrengthIndicator` React component in `client/src/pages/auth.tsx` can be extracted and reused in the settings password change form.
- **User model changes** — F01 added `emailVerified` to `shared/models/auth.ts`. R1 plans to add `companyName`, `websiteUrl`, `timezone` — these are additive changes to the same file.
- **`/api/auth/user` excludes password** — F01 updated this endpoint to strip the password hash from responses, so the settings page receives clean user data.
- **Google OAuth profile image** — users who signed in via Google already have `profileImageUrl` set. The settings page can display this and offer photo change.

### Reusable components from F01:
- `PasswordStrengthIndicator` component (currently in `client/src/pages/auth.tsx` — extract to shared component for R3)
- `validatePasswordStrength()` function (backend, in `server/routes.ts`)
- `isValidEmail()` function (backend, in `server/routes.ts`)

### Impact from F02 Implementation

- **Calendar section in settings is now functional** — F02 replaced the stub calendar connection with a real Google OAuth flow. The settings page now: redirects to Google OAuth via `GET /api/calendar/auth`, handles the callback redirect with success/error toasts, displays connected calendar list from `listUserCalendars()`, and supports disconnect.
- **`selectedCalendars` schema field exists** — F02 added a `selectedCalendars` jsonb field to `calendar_tokens` for future multi-calendar selection UI. R4 (Availability Configuration) or a future settings section could add checkboxes for which calendars to check for conflicts.
- **Client timezone plumbing exists** — F02 updated `POST /api/public/book` to accept timezone from the client. R2 (Timezone Configuration) should store the host's timezone on their user profile, and the availability calculation in `server/calendar-service.ts` should use it instead of the hardcoded 9am-5pm in server time.

---

## Current State

The settings page (`client/src/pages/settings.tsx`) is minimal:

- **Profile section:** Shows avatar, name, email (read-only), logout button
- **Calendar section:** Shows real connection status with Google OAuth connect flow, calendar list display, and disconnect button (implemented in F02)
- **Booking links section:** Shows booking URL and embed code with copy buttons
- **No editing** — profile info cannot be changed
- **No availability rules** — not configured here
- **No notification preferences** — not configurable
- **No branding settings** — not available
- **No timezone setting** — not available

### User model fields (`shared/models/auth.ts`):
`id`, `email`, `username`, `password`, `firstName`, `lastName`, `profileImageUrl`, `createdAt`, `updatedAt`

### What's Missing vs PRD

1. **Profile editing** — name, email, photo, timezone, company name, website
2. **Timezone setting** — not in user model or UI
3. **Company name / website URL** — not in user model
4. **Availability rules** — no configuration UI (F03 covers the data model)
5. **Buffer time defaults** — not configurable globally
6. **Minimum notice / max advance** — not configurable
7. **Notification preferences** — no settings for email notifications
8. **Branding settings** — no logo upload, color selection
9. **Password change** — not available
10. **Event type management links** — not integrated into settings

---

## Requirements

### R1: Profile Editing

Add profile edit form to settings:
- **Fields:** First name, Last name, Email, Company name, Website URL
- **Photo:** Upload/change profile photo (use existing upload infrastructure)
- **Save button** with loading state
- **API:** `PATCH /api/auth/profile` — updates user profile fields

Add to users table:
```typescript
companyName: varchar("company_name"),
websiteUrl: varchar("website_url"),
timezone: varchar("timezone").default("UTC"),
```

### R2: Timezone Configuration

- Add timezone selector to profile section
- Dropdown with common timezones (use `Intl.supportedValuesOf('timeZone')` or a curated list)
- Auto-detect on first visit: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Stored timezone used for:
  - Availability calculation (host's timezone)
  - Calendar event creation
  - Email formatting
  - Dashboard time display

### R3: Password Change

Add "Change Password" section:
- Current password field (required)
- New password field
- Confirm new password field
- Password strength indicator
- API: `POST /api/auth/change-password`
  - Verify current password with bcrypt
  - Hash new password
  - Update user record
  - Invalidate other sessions (optional)

### R4: Availability Configuration

Add "Availability" section to settings (or link to dedicated page):
- Visual weekly schedule editor (from F03)
- Min notice period selector (1hr, 2hr, 4hr, 12hr, 24hr, 48hr)
- Max advance booking selector (1 week, 2 weeks, 1 month, 2 months, 3 months)
- Default buffer time (before and after meetings)
- This section reads/writes to the `availability_rules` table (from F03)

If F03 is not yet implemented, create a simpler version:
- Dropdown for working hours start/end
- Checkboxes for working days
- Store as JSON on users table as temporary solution

### R5: Notification Preferences

Add "Notifications" section:
- Toggle: "Email me when a new booking is made" (default: on)
- Toggle: "Email meeting prep briefs" (default: on)
- Toggle: "Daily digest of upcoming meetings" (default: off)
- Toggle: "Email me when a booking is cancelled" (default: on)
- API: `PATCH /api/notification-preferences` — saves preferences
- This depends on the notification_preferences table from F09

### R6: Branding Settings

Add "Branding" section:
- Logo upload (shows preview, uses existing upload infrastructure)
- Primary color picker (hex input + visual picker)
- Secondary color picker
- Preview: "This is how your booking page will look"
- Store on user profile or in a dedicated `branding` table
- Applied to all event types that don't have their own branding override

### R7: Event Type Management

Add "Event Types" quick-access section:
- List of event types with status badges (active/inactive)
- Quick toggle active/inactive
- Links to edit each event type
- "Create New Event Type" button
- This is a convenience shortcut — full management is at `/event-types`

### R8: Account Danger Zone

Add a "Danger Zone" section at the bottom:
- "Delete Account" button with confirmation dialog
- Warns about data loss
- API: `DELETE /api/auth/account` — deletes user and all associated data (cascade)
- Requires password confirmation

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/models/auth.ts` | Add `companyName`, `websiteUrl`, `timezone` to users table |
| `shared/schema.ts` | Add notification preferences table if not done in F09 |
| `server/routes.ts` | Add `PATCH /api/auth/profile`, `POST /api/auth/change-password`, notification prefs endpoints, `DELETE /api/auth/account` |
| `server/storage.ts` | Add user update methods, notification prefs CRUD |
| `client/src/pages/settings.tsx` | Major expansion: profile form, timezone, password change, availability, notifications, branding, event types, danger zone |

---

## Database Changes

```sql
ALTER TABLE users ADD COLUMN company_name VARCHAR;
ALTER TABLE users ADD COLUMN website_url VARCHAR;
ALTER TABLE users ADD COLUMN timezone VARCHAR DEFAULT 'UTC';

-- If not already created by F09:
CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  new_booking_email BOOLEAN DEFAULT true,
  meeting_brief_email BOOLEAN DEFAULT true,
  daily_digest BOOLEAN DEFAULT false,
  cancellation_email BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Endpoints

```
PATCH  /api/auth/profile           → Update profile fields
POST   /api/auth/change-password   → Change password (requires current password)
DELETE /api/auth/account           → Delete account and all data

GET    /api/notification-preferences     → Get notification preferences
PATCH  /api/notification-preferences     → Update notification preferences

GET    /api/branding               → Get user branding settings
PATCH  /api/branding               → Update branding settings
```

---

## Acceptance Criteria

- [ ] User can edit their profile: name, email, company name, website URL
- [ ] User can upload/change their profile photo
- [ ] User can set their timezone from a dropdown
- [ ] User can change their password (with current password verification)
- [ ] Availability rules are configurable (working hours, days, min notice, max advance)
- [ ] Notification preferences are configurable (email toggles)
- [ ] Branding settings allow logo upload and color selection
- [ ] Event types are listed with quick toggles in settings
- [ ] Account deletion works with confirmation and cascading data removal
- [ ] All settings changes are persisted and reflected immediately

---

## Notes

- The settings page will be significantly larger after these changes. Consider using a tabbed or sectioned layout (e.g., sidebar navigation within settings: Profile, Calendar, Availability, Notifications, Branding, Danger Zone).
- Profile photo upload can reuse the existing file upload infrastructure (presigned URLs to object storage).
- Timezone is important to get right — it affects availability, calendar events, email times, and dashboard display. Use IANA timezone identifiers (e.g., "America/New_York").
- The branding settings here set defaults; individual event types can override via F04.
