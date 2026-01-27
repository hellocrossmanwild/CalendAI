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

### Impact from F05 Implementation

- **Branding is now applied on the public booking page** — F05 applies `primaryColor` and `secondaryColor` from event types to all five booking steps (calendar, time, info, chat, confirm) via CSS custom properties (`--brand-primary`, `--brand-secondary`). When F13 adds branding settings (R6) to the settings page, changes to brand colors will have immediate visible impact on all public booking pages.
- **Per-event-type branding already exists** — F04 added `primaryColor`, `secondaryColor`, and `logo` fields to `event_types`, and F05 applies them on the booking page. F13's R6 (Branding Settings) should establish user-level default branding that applies to all event types without their own override.
- **Host info displayed on booking page** — F05 shows the host's name and avatar on the booking page. When F13's R1 (Profile Editing) allows changing name and profile photo, the changes will be reflected on all public booking pages via the expanded public API endpoint.
- **Timezone selector on booking page** — F05 added timezone detection and a 31-timezone selector for bookers. F13's R2 (Timezone Configuration) sets the host's timezone, which is used by the availability engine. These are complementary: host timezone (F13) determines when slots are generated, booker timezone (F05) determines how they are displayed.

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

> **Note:** F05 now applies `primaryColor` and `secondaryColor` from event types to the booking page using CSS custom properties. Branding changes made via F13's settings will have immediate visible impact on public booking pages. F04 established per-event-type branding fields; F13 should add user-level defaults.

Add "Branding" section:
- Logo upload (shows preview, uses existing upload infrastructure)
- Primary color picker (hex input + visual picker)
- Secondary color picker
- Preview: "This is how your booking page will look" — F05's booking page already applies colors, so a live preview can demonstrate the effect
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

---

## Dependencies & Implications from F05

- **Branding settings will have immediate visible impact.** F05 applies `primaryColor` and `secondaryColor` from event types to the booking page via CSS custom properties (`--brand-primary`, `--brand-secondary`) across all five booking steps. When F13 allows hosts to change brand colors, the public booking page will reflect those changes immediately.
- **Host profile changes will be visible on booking pages.** F05 displays the host's name (firstName, lastName) and avatar (profileImageUrl) on the booking page header. F13's R1 (Profile Editing) changes to name and photo will propagate to all public booking pages via the expanded `GET /api/public/event-types/:slug` endpoint.
- **User-level vs event-type-level branding.** F04 added per-event-type branding fields, and F05 applies them. F13's R6 should add user-level default branding. The booking page should apply: event-type branding if set, otherwise user-level defaults, otherwise CalendAI theme defaults.
- **Booker timezone (F05) complements host timezone (F13 R2).** F05 detects and stores the booker's timezone. F13's R2 stores the host's timezone. Together these enable proper timezone conversion when F06 completes server-side conversion.

### Impact from F06 Implementation

- **Host timezone from `availability_rules.timezone` is now actively used by `calculateAvailability()` for working-hour interpretation.** F06 implemented server-side timezone conversion using native `Intl.DateTimeFormat`, reading the host's timezone from `availability_rules.timezone` to interpret working hours correctly. Changes to the host timezone in settings (R2) will immediately affect slot generation on all public booking pages.
- **`isValidTimezone()` helper is available for validating timezone input in settings.** F06 added an `isValidTimezone()` utility that validates IANA timezone strings. R2 (Timezone Configuration) should use this same validator when the host selects or changes their timezone, ensuring only valid IANA identifiers are stored.
- **Server-side timezone conversion is now operational.** F06 completed the server-side timezone conversion that F05 and F13 R2 anticipated. The host timezone stored via F13's settings is now the authoritative source for working-hour interpretation in `calculateAvailability()`. This means R2's timezone selector has real, immediate impact on the booking experience — it is no longer a deferred or cosmetic setting.
- **Dynamic slot intervals depend on event duration.** F06 calculates slot intervals as `Math.min(duration, 30)`. If F13 adds global default duration settings, the slot interval logic will automatically adapt. No additional configuration for slot intervals is needed in settings.

---

## Impact from F11 Implementation

- **The `meetingBriefEmail` notification preference is now actively used.** F11 checks `notification_preferences.meetingBriefEmail` before sending brief emails (both auto-generated and manual). The settings page (R5: Notification Preferences) should display this toggle so users can control brief email delivery.
- **Brief delivery depends on F09 email infrastructure.** The `meetingPrepBriefEmail()` template in `server/email-templates.ts` uses the same `sendEmail()` service from F09. If SMTP is not configured, emails are logged to console as a development fallback.
