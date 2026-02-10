# 07 -- Accessibility Audit

## Scope

Full WCAG 2.1 AA audit of the CalendAI React frontend: 15 page components, 6 shared components, the HTML shell, and the embeddable widget script. Each finding references the source file and line number, rated by severity.

**Rating scale:**
- CRITICAL -- Blocks entire user groups (screen-reader users, keyboard-only users) from completing core tasks.
- HIGH -- Significant barrier that degrades the experience for assistive-technology users or fails a Level A/AA success criterion.
- MEDIUM -- Noticeable gap that reduces usability but has a workaround.
- LOW -- Best-practice deviation or minor polish issue.

---

## 1. WCAG Compliance

### 1.1 Missing Skip-to-Content Link

| Severity | CRITICAL |
|----------|--------------|
| Files | `client/src/App.tsx:37-51` |
| SC | 2.4.1 Bypass Blocks (A) |

The `AuthenticatedLayout` renders a sidebar followed by header and main content. There is no skip-navigation link allowing keyboard or screen-reader users to jump past the sidebar and header directly to `<main>`. Every page load forces tabbing through every sidebar item.

### 1.2 Icon-Only Buttons Without Accessible Names

| Severity | CRITICAL |
|----------|--------------|
| SC | 4.1.2 Name, Role, Value (A); 1.1.1 Non-text Content (A) |

Numerous interactive controls contain only an SVG icon with no `aria-label`, `aria-labelledby`, or visible text. Screen readers announce these as "button" with no description.

| File | Line(s) | Element | Missing Label |
|------|---------|---------|---------------|
| `client/src/components/ThemeToggle.tsx` | 9-20 | Theme toggle button | No `aria-label` (e.g. "Toggle dark mode") |
| `client/src/pages/book.tsx` | 873-879 | Previous-week nav button | Only contains `<ChevronLeft>` icon |
| `client/src/pages/book.tsx` | 884-889 | Next-week nav button | Only contains `<ChevronRight>` icon |
| `client/src/pages/book.tsx` | 1311-1320 | Chat file-upload button | Only contains `<Paperclip>` icon |
| `client/src/pages/book.tsx` | 1329-1337 | Chat send button | Only contains `<Send>` icon |
| `client/src/pages/reschedule-booking.tsx` | 570-577 | Previous-week nav button | Only contains `<ChevronLeft>` icon |
| `client/src/pages/reschedule-booking.tsx` | 583-588 | Next-week nav button | Only contains `<ChevronRight>` icon |
| `client/src/pages/briefs.tsx` | 164-175 | Regenerate-brief button | Only contains `<RefreshCw>` or `<Loader2>` icon |
| `client/src/pages/leads.tsx` | 233-243 | LinkedIn external-link button | Only contains `<ExternalLink>` icon |
| `client/src/pages/event-types.tsx` | 153-156 | More-actions dropdown trigger | Only contains `<MoreVertical>` icon |
| `client/src/pages/bookings.tsx` | (dropdown trigger) | More-actions dropdown trigger | Only contains `<MoreVertical>` icon |
| `client/src/pages/settings.tsx` | 948-950 | Copy URL button | Only contains `<Copy>` icon |
| `client/src/pages/settings.tsx` | 951-955 | Preview URL button | Only contains `<ExternalLink>` icon |
| `client/src/pages/settings.tsx` | 1073-1079 | Toggle current-password visibility | Only contains `<Eye>`/`<EyeOff>` icon |
| `client/src/pages/settings.tsx` | 1094-1100 | Toggle new-password visibility | Only contains `<Eye>`/`<EyeOff>` icon |
| `client/src/pages/settings.tsx` | 822-828 | Remove time-block button | Only contains `<Trash2>` icon |
| `client/src/pages/book.tsx` | 1107-1109 | Remove-file button inside badge | Only contains `<X>` icon |

### 1.3 Form Inputs Without Associated Labels

| Severity | CRITICAL |
|----------|--------------|
| SC | 1.3.1 Info and Relationships (A); 4.1.2 Name, Role, Value (A) |

Multiple `<Input>` elements rely solely on `placeholder` text and have no `<label>`, `aria-label`, or `aria-labelledby`. Placeholders disappear on input and are not announced by all screen readers as labels.

| File | Line(s) | Input | Issue |
|------|---------|-------|-------|
| `client/src/pages/leads.tsx` | 98-104 | Search leads input | `placeholder` only, no label |
| `client/src/pages/briefs.tsx` | 100-106 | Search briefs input | `placeholder` only, no label |
| `client/src/pages/bookings.tsx` | (search input) | Search bookings | `placeholder` only, no label |
| `client/src/pages/book.tsx` | 1039-1046 | Name input (info step) | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1049-1059 | Email input (info step) | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1065-1075 | Phone input (info step) | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1081-1088 | Company input (info step) | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1090-1098 | Notes textarea (info step) | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1101 | Attachments label | Uses `<label>` element but no `htmlFor`/`id` pair |
| `client/src/pages/book.tsx` | 1321-1328 | Chat input | `placeholder` only, no label |
| `client/src/pages/cancel-booking.tsx` | 448-458 | Cancel-reason textarea | `<label>` present but no `htmlFor`/`id` pairing with `<Textarea>` |
| `client/src/pages/settings.tsx` | 935-942 | Booking page URL input | `<label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 962 | Embed widget label | `<label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 736-738 | Availability timezone Label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 755 | Weekly Hours label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 878-879 | Minimum Notice label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 893-894 | Maximum Advance label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 617-618 | Profile Timezone label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 1143 | Logo label | `<Label>` without `htmlFor` |
| `client/src/pages/settings.tsx` | 1187-1191 | Primary color picker (`<input type="color">`) | No `id` or `aria-label` on the native color input |
| `client/src/pages/settings.tsx` | 1206-1210 | Secondary color picker (`<input type="color">`) | No `id` or `aria-label` on the native color input |

### 1.4 Missing `aria-live` Region for Dynamic Content

| Severity | HIGH |
|----------|----------|
| SC | 4.1.3 Status Messages (AA) |

Several areas update dynamically without notifying screen readers:

- **Chat messages** (`client/src/pages/book.tsx:1169-1212`): New assistant and user messages are appended to the ScrollArea. No `aria-live="polite"` region wraps the message list, so screen readers never announce incoming messages.
- **Toast notifications** (`client/src/components/ui/toaster.tsx`): The shadcn `Toaster` component uses Radix which typically handles this, but verification is needed that the toast viewport has the correct live-region role.
- **Loading skeletons across all pages**: When data loads and skeletons are replaced with real content, no `aria-live` or `aria-busy` attributes communicate this transition.
- **Validation errors** (`client/src/pages/book.tsx:1060-1062, 1076-1078`): Phone and email error messages appear dynamically but are not linked via `aria-describedby` to their inputs, so screen readers do not announce the error.
- **Password mismatch** (`client/src/pages/settings.tsx:1115-1117`): Dynamic error text appears but is not associated with the input via `aria-describedby`.

### 1.5 Custom Timezone Dropdown Not Accessible

| Severity | HIGH |
|----------|----------|
| SC | 4.1.2 Name, Role, Value (A); 2.1.1 Keyboard (A) |

The timezone selector in `client/src/pages/book.tsx:926-956` and `client/src/pages/reschedule-booking.tsx:627-659` is a custom dropdown built from plain `<button>` and `<div>` elements. It is missing:
- `role="listbox"` on the dropdown container
- `role="option"` on each timezone item
- `aria-expanded` on the trigger button
- `aria-haspopup="listbox"` on the trigger button
- Keyboard navigation (Arrow Up/Down to move between options, Escape to close)
- The dropdown is closed via a `mousedown` listener only; there is no `Escape` key handler.

### 1.6 Calendar Date Buttons Missing Accessible Names

| Severity | HIGH |
|----------|----------|
| SC | 4.1.2 Name, Role, Value (A) |

In `client/src/pages/book.tsx:900-922` and `client/src/pages/reschedule-booking.tsx:599-622`, each day button renders only the abbreviated day name (e.g. "Mon") and a date number (e.g. "10"). Screen readers hear "button Mon 10" which is insufficient context. Each button needs an `aria-label` like "Monday, February 10, 2026" and an `aria-pressed` or `aria-selected` attribute when selected.

### 1.7 Step Progress Indicator Not Accessible

| Severity | HIGH |
|----------|----------|
| SC | 1.3.1 Info and Relationships (A) |

The step progress dots in `client/src/pages/book.tsx:832-846` and `client/src/pages/reschedule-booking.tsx:528-541` are purely visual (`<div>` elements with dynamic widths and colors). Screen readers receive no information about current step or total steps. Needs `role="progressbar"` or an `aria-label` like "Step 2 of 4", or a visually-hidden text equivalent.

### 1.8 Google OAuth SVG Missing Accessible Text

| Severity | MEDIUM |
|----------|------------|
| SC | 1.1.1 Non-text Content (A) |
| File | `client/src/pages/auth.tsx:498-515` |

The Google logo is an inline `<svg>` without `role="img"` and `aria-label`, or `aria-hidden="true"`. Since the button also contains the text "Continue with Google", adding `aria-hidden="true"` to the SVG would be the correct fix to prevent screen readers from attempting to describe the path data.

### 1.9 Heading Hierarchy Issues

| Severity | MEDIUM |
|----------|------------|
| SC | 1.3.1 Info and Relationships (A); 2.4.6 Headings and Labels (AA) |

- **Auth page** (`client/src/pages/auth.tsx`): The page has no `<h1>`. The `CardTitle` renders as a styled `<div>` (or `<h3>` depending on shadcn version), not as a proper heading element. The "CalendAI" brand text in `renderHeader()` (line 242-253) is a `<span>`, not a heading.
- **Leads page** (`client/src/pages/leads.tsx:90`): `<h1>` is present, but card headings inside use `<h3>` (line 153, 173) skipping `<h2>`.
- **Briefs page** (`client/src/pages/briefs.tsx:70`): `<h1>` present. Card headings use `<h3>` and `<h4>` -- the jump from `<h1>` to `<h3>` skips a level.
- **Dashboard** (`client/src/pages/dashboard.tsx:110`): `<h1>` present. CardTitle renders metric titles at `text-sm` which may be `<h3>` elements -- heading level jumps.
- **Cancel-booking** (`client/src/pages/cancel-booking.tsx`): Uses `<h1>` (line 389) and `<h2>` (lines 171, 206, 251, 300) -- acceptable hierarchy but varies across states.

### 1.10 Password Strength Indicator Not Linked to Input

| Severity | MEDIUM |
|----------|------------|
| SC | 1.3.1 Info and Relationships (A) |
| File | `client/src/components/password-strength-indicator.tsx` |

The password strength bar and checklist are rendered as sibling elements after the password input but are not connected via `aria-describedby`. Screen readers do not know the strength feedback relates to the password field. The strength bar (lines 17-33) also lacks `role="meter"` or `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.

### 1.11 Decorative Icons Missing `aria-hidden`

| Severity | LOW |
|----------|---------|
| SC | 1.1.1 Non-text Content (A) |

Lucide icons rendered alongside text (e.g., `<Calendar className="h-4 w-4" />` in buttons and info rows throughout all pages) do not have `aria-hidden="true"`. While Lucide React icons may default to `aria-hidden`, this should be verified. If not, screen readers may announce the SVG title or role, creating noise.

### 1.12 AvatarImage Missing Alt Text

| Severity | LOW |
|----------|---------|
| SC | 1.1.1 Non-text Content (A) |
| Files | `client/src/components/AppSidebar.tsx:114`, `client/src/pages/settings.tsx:523` |

`<AvatarImage src={...} />` does not provide an `alt` prop. The Radix Avatar component requires an explicit `alt` for the underlying `<img>`. The fallback initials are visible only when the image fails to load; the image itself is unlabeled.

---

## 2. Semantic HTML

### 2.1 No Landmark Structure on Public Pages

| Severity | HIGH |
|----------|----------|
| Files | `client/src/pages/book.tsx`, `cancel-booking.tsx`, `reschedule-booking.tsx` |

Public-facing pages (booking, cancel, reschedule) render their content inside generic `<div>` wrappers. There is no `<main>`, `<header>`, or `<footer>` landmark. This forces screen-reader users to navigate through all content linearly without landmark shortcuts.

The authenticated layout (`App.tsx:37-51`) does include a `<header>` and `<main>`, which is good.

### 2.2 Chat Interface Missing Semantic Roles

| Severity | MEDIUM |
|----------|------------|
| File | `client/src/pages/book.tsx:1149-1213` |

The chat messages are plain `<div>` elements inside a `ScrollArea`. They should use `role="log"` on the container and individual messages could benefit from being marked as chat messages to provide better screen-reader navigation.

### 2.3 Data Presentation Without Table Semantics

| Severity | LOW |
|----------|---------|
| File | `client/src/pages/settings.tsx:757-870` |

The weekly availability schedule is laid out with flexbox divs. A `<table>` or grid-role layout with proper row/column headers would be more accessible for screen readers to navigate the day/time-block structure.

---

## 3. Responsive Design & Touch Targets

### 3.1 Viewport Meta Blocks Pinch-to-Zoom

| Severity | HIGH |
|----------|----------|
| SC | 1.4.4 Resize Text (AA) |
| File | `client/src/../../client/index.html:5` |

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
```

`maximum-scale=1` prevents users from pinch-zooming on mobile, which is a WCAG 1.4.4 violation. Users with low vision rely on zoom. The `maximum-scale` restriction must be removed.

### 3.2 Small Touch Targets

| Severity | MEDIUM |
|----------|------------|
| SC | 2.5.5 Target Size (AAA -- but recommended at AA) |

Several interactive elements are smaller than the recommended 44x44px minimum:

| File | Line(s) | Element | Rendered Size |
|------|---------|---------|---------------|
| `client/src/pages/settings.tsx` | 822-828 | Remove time-block icon button | `h-8 w-8` = 32x32px |
| `client/src/pages/settings.tsx` | 835-841 | "Add break" button | `h-7` = 28px tall |
| `client/src/pages/settings.tsx` | 843-849 | "Done" button | `h-7` = 28px tall |
| `client/src/pages/book.tsx` | 1107-1109 | Remove-file "X" button inside badge | Approximately 12x12px |
| `client/src/pages/reschedule-booking.tsx` | 643-655 | Timezone dropdown items | `py-2 px-3` ~32px tall |
| `client/src/pages/book.tsx` | 940-953 | Timezone dropdown items | `py-2 px-3` ~32px tall |
| `client/src/pages/settings.tsx` | 1187-1191 | Color picker input | `h-9 w-9` = 36x36px |

### 3.3 Horizontal Overflow on Narrow Screens

| Severity | LOW |
|----------|---------|
| File | `client/src/pages/book.tsx:895, client/src/pages/reschedule-booking.tsx:593` |

The 7-day calendar grid (`grid-cols-7`) does not collapse on narrow viewports (below ~360px). Each cell has `p-4` padding, so 7 columns at minimum width can exceed the viewport. Consider collapsing to fewer visible days or using horizontal scrolling with appropriate overflow indicators on small screens.

### 3.4 Embed Widget Code Block Overflows

| Severity | LOW |
|----------|---------|
| File | `client/src/pages/settings.tsx:966-968` |

The `<pre>` block for the embed code snippet has `overflow-x-auto` on a parent `div`, but the `<pre>` content itself can be quite wide. On mobile this is manageable but should be tested.

---

## 4. Forms & Interactions

### 4.1 No Confirmation for Destructive Calendar Disconnect

| Severity | MEDIUM |
|----------|------------|
| File | `client/src/pages/settings.tsx:669` |

Clicking "Disconnect" on the Google Calendar integration immediately fires `disconnectCalendarMutation.mutate()` with no confirmation dialog. This is a destructive action that breaks calendar sync and should have an "Are you sure?" prompt.

**Note:** The event-type delete flow (`client/src/pages/event-types.tsx:225-245`) correctly uses an `AlertDialog` for confirmation, and the account deletion flow (`client/src/pages/settings.tsx:1309-1355`) correctly uses a `Dialog` with password confirmation. These are good patterns.

### 4.2 Book Page Info Form: Missing Inline Validation

| Severity | MEDIUM |
|----------|------------|
| File | `client/src/pages/book.tsx:390-427` |

The `handleInfoSubmit` function validates name, email, and phone, but:
- The name field has no inline error message -- only a generic toast "Please fill in required fields" is shown.
- Email and phone errors are set as state (`emailError`, `phoneError`) and displayed inline, but are not connected to the input via `aria-describedby`, so screen readers do not announce them.
- Required fields are marked with asterisks ("Name *", "Email *") but the asterisk convention is not explained, and the inputs lack `aria-required="true"`.

### 4.3 Missing Loading States on Some Actions

| Severity | LOW |
|----------|---------|

Most mutation-based buttons correctly show a `<Loader2>` spinner and `disabled` state during pending operations. However:
- `client/src/pages/settings.tsx:669`: Disconnect calendar button does not show a spinner during the mutation.
- `client/src/pages/event-types.tsx:211-216`: The active/inactive `Switch` toggle does not indicate loading while the PATCH request is in flight.

---

## 5. Color & Contrast

### 5.1 Dynamic Brand Colors May Fail Contrast

| Severity | HIGH |
|----------|----------|
| SC | 1.4.3 Contrast (Minimum) (AA) |
| Files | `client/src/pages/book.tsx`, `cancel-booking.tsx`, `reschedule-booking.tsx` |

Throughout the public booking pages, `brandPrimary` is derived from user-configurable event-type color settings (e.g., `eventType.color`, `eventType.primaryColor`). This color is applied as:
- Button background with hardcoded `text-white` (e.g., `book.tsx:1131-1133`, `cancel-booking.tsx:213-215`, `reschedule-booking.tsx:770-773`)
- Text color for step labels and headings (e.g., `book.tsx:1221`)
- Badge backgrounds

If a user configures a light brand color (e.g., yellow `#FFD700` or light green `#90EE90`), the white text will fail the 4.5:1 contrast ratio. No runtime contrast check or fallback is implemented.

### 5.2 Muted-Foreground on Muted Background

| Severity | MEDIUM |
|----------|------------|
| SC | 1.4.3 Contrast (Minimum) (AA) |

The color scheme uses `text-muted-foreground` on `bg-muted` or `bg-muted/50` backgrounds extensively. In the default shadcn theme this generally passes, but the contrast ratio should be verified for both light and dark modes, particularly for small text (14px and below) which requires 4.5:1.

---

## 6. Keyboard Navigation

### 6.1 Timezone Dropdown: No Keyboard Support

| Severity | HIGH |
|----------|----------|
| SC | 2.1.1 Keyboard (A) |
| Files | `client/src/pages/book.tsx:926-956`, `reschedule-booking.tsx:627-659` |

As noted in 1.5, the custom timezone dropdown has no keyboard navigation. Specifically:
- Cannot open the dropdown via Enter/Space on the trigger button (works with click only via `onClick`)
- No Arrow key navigation within the open dropdown
- No Escape key to close
- No focus management (focus does not move into the dropdown when opened)

This means keyboard-only users cannot change their timezone during booking.

### 6.2 Calendar Grid: No Arrow-Key Navigation

| Severity | MEDIUM |
|----------|------------|
| SC | 2.1.1 Keyboard (A) |
| Files | `client/src/pages/book.tsx:895-924`, `reschedule-booking.tsx:593-623` |

The 7-day calendar date buttons can be reached via Tab, but there is no arrow-key navigation between days as recommended by the WAI-ARIA grid pattern. Users must Tab through all 7 buttons rather than using Left/Right arrows, which is cumbersome.

### 6.3 Focus Not Managed on Step Transitions

| Severity | MEDIUM |
|----------|------------|
| SC | 2.4.3 Focus Order (A) |
| Files | `client/src/pages/book.tsx`, `reschedule-booking.tsx` |

When the booking flow advances from one step to the next (calendar -> time -> info -> chat -> confirm), focus is not programmatically moved to the new content. The user's focus remains on the last interacted element (which may now be unmounted), causing focus to reset to the top of the page or become lost. Each step transition should move focus to the new step's heading or first interactive element.

---

## 7. Internationalization (i18n)

### 7.1 No i18n Framework

| Severity | HIGH |
|----------|----------|
| Files | Entire frontend |

No internationalization library (react-i18next, react-intl, FormatJS, etc.) is installed or configured. All UI strings are hardcoded in English throughout every component. This makes the application impossible to localize without rewriting every file.

Key statistics:
- 15 page components with hundreds of hardcoded English strings
- Button labels, error messages, form labels, headings, descriptions -- all inline English
- Date formatting uses `date-fns/format` with English-only format strings (e.g., `"EEEE, MMMM d, yyyy"`) without locale support

### 7.2 No RTL Support

| Severity | MEDIUM |
|----------|------------|
| Files | `client/index.html`, `client/src/App.tsx` |

The `<html>` element has `lang="en"` but no `dir` attribute. The layout uses flexbox/grid with fixed directional properties (e.g., `pl-10`, `ml-auto`, `text-left`, `mr-2`). No CSS logical properties (`margin-inline-start`, `padding-inline-end`, etc.) are used. Adding RTL language support would require a comprehensive CSS refactor.

### 7.3 Hardcoded Date/Time Formatting

| Severity | MEDIUM |
|----------|------------|
| Files | `client/src/pages/book.tsx`, `dashboard.tsx`, `bookings.tsx`, `leads.tsx`, `briefs.tsx`, `cancel-booking.tsx`, `reschedule-booking.tsx` |

All date formatting uses `date-fns/format` with hardcoded English patterns:
- `"EEEE, MMMM d, yyyy"` (e.g., "Monday, February 10, 2026")
- `"h:mm a"` (12-hour format, US convention)
- `"MMM d, yyyy"`

No locale parameter is passed to `format()`. The `date-fns` library supports locale-aware formatting via a `locale` option, but this is never used.

### 7.4 Hardcoded Timezone Labels

| Severity | LOW |
|----------|---------|
| Files | `client/src/pages/book.tsx:84-116`, `reschedule-booking.tsx:62-94` |

The `COMMON_TIMEZONES` array contains hardcoded English labels like "Pacific Time (UTC-08:00)". These would need to be translatable in a localized application.

---

## 8. Widget Accessibility

### 8.1 iframe Has Title But May Lack Context

| Severity | LOW |
|----------|---------|
| File | `client/public/widget.js:106` |

The widget correctly sets `iframe.setAttribute("title", "CalendAI Booking - " + slug)` which is good. However, the iframe does not carry `role="application"` or additional context about what interaction is expected. The iframe content inherits the same accessibility issues as the booking page itself.

---

## Summary Table

| # | Finding | Severity | WCAG SC |
|---|---------|----------|---------|
| 1.1 | No skip-to-content link | CRITICAL | 2.4.1 |
| 1.2 | 17+ icon-only buttons without accessible names | CRITICAL | 4.1.2, 1.1.1 |
| 1.3 | 20+ form inputs without associated labels | CRITICAL | 1.3.1, 4.1.2 |
| 1.4 | No `aria-live` for chat, validation errors, loading states | HIGH | 4.1.3 |
| 1.5 | Custom timezone dropdown not ARIA-compliant | HIGH | 4.1.2, 2.1.1 |
| 1.6 | Calendar date buttons missing accessible names | HIGH | 4.1.2 |
| 1.7 | Step progress indicator not accessible | HIGH | 1.3.1 |
| 1.8 | Google OAuth SVG missing `aria-hidden` | MEDIUM | 1.1.1 |
| 1.9 | Heading hierarchy skips levels | MEDIUM | 1.3.1, 2.4.6 |
| 1.10 | Password strength not linked to input | MEDIUM | 1.3.1 |
| 1.11 | Decorative icons may lack `aria-hidden` | LOW | 1.1.1 |
| 1.12 | AvatarImage missing alt text | LOW | 1.1.1 |
| 2.1 | No landmarks on public pages | HIGH | 1.3.1 |
| 2.2 | Chat lacks semantic roles | MEDIUM | 1.3.1 |
| 2.3 | Availability schedule: divs instead of table | LOW | 1.3.1 |
| 3.1 | `maximum-scale=1` blocks pinch-zoom | HIGH | 1.4.4 |
| 3.2 | 7+ touch targets below 44px | MEDIUM | 2.5.5 |
| 3.3 | Calendar grid may overflow on narrow screens | LOW | 1.4.10 |
| 3.4 | Embed code block may overflow | LOW | 1.4.10 |
| 4.1 | Calendar disconnect has no confirmation | MEDIUM | -- |
| 4.2 | Booking form: missing inline validation + aria links | MEDIUM | 3.3.1 |
| 4.3 | Some actions missing loading indicators | LOW | -- |
| 5.1 | Dynamic brand colors may fail contrast with white text | HIGH | 1.4.3 |
| 5.2 | Muted color combinations need contrast verification | MEDIUM | 1.4.3 |
| 6.1 | Timezone dropdown: no keyboard support | HIGH | 2.1.1 |
| 6.2 | Calendar grid: no arrow-key navigation | MEDIUM | 2.1.1 |
| 6.3 | Focus not managed on step transitions | MEDIUM | 2.4.3 |
| 7.1 | No i18n framework; all strings hardcoded in English | HIGH | -- |
| 7.2 | No RTL support | MEDIUM | -- |
| 7.3 | Hardcoded date/time formatting without locale | MEDIUM | -- |
| 7.4 | Hardcoded timezone labels | LOW | -- |
| 8.1 | Widget iframe has title (good) but limited context | LOW | 4.1.2 |

**Totals:** 3 CRITICAL, 9 HIGH, 12 MEDIUM, 8 LOW

---

## Positive Findings

The codebase does several things well from an accessibility perspective:

1. **`lang="en"` on `<html>`** (`client/index.html:2`) -- correctly declared.
2. **Viewport meta includes `width=device-width`** -- responsive foundation is present.
3. **Proper `<main>` element** in authenticated layout (`App.tsx:45`).
4. **shadcn/ui sidebar uses ARIA** -- the `SidebarTrigger` has `aria-label="Toggle Sidebar"` (`sidebar.tsx:290`).
5. **`<Label htmlFor>` used on auth forms** -- login/register fields (`auth.tsx:330, 386, 442, 541, 551, 563, 577`) and settings fields (`settings.tsx:560-630, 996-1047, 1063-1114, 1185-1214, 1327`) correctly pair labels with inputs.
6. **AlertDialog for destructive actions** -- event-type deletion (`event-types.tsx:225-245`) and account deletion (`settings.tsx:1309-1355`) prompt for confirmation.
7. **Loading states on most buttons** -- `Loader2` spinner and `disabled` are correctly applied during mutations across most pages.
8. **Host profile images have alt text** -- `book.tsx:787`, `cancel-booking.tsx:357`, `reschedule-booking.tsx:458`.
9. **Event logo images have alt text** -- `book.tsx:809`, `cancel-booking.tsx:381`, `reschedule-booking.tsx:481`.
10. **Widget iframe has a descriptive title** -- `widget.js:106`.
11. **Onboarding wizard uses `aria-label` attributes** -- `onboarding-wizard.tsx:800, 813, 1201, 1223, 1238`.
12. **Dark mode support** via `ThemeProvider` with proper class-based toggling.
