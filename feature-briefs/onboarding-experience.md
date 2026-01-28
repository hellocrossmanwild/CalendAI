# CalendAI Onboarding Experience

## Overview

A beautiful, AI-powered onboarding wizard that helps new users set up their scheduling presence in minutes. The experience feels personalized and intelligent, with website scanning to auto-populate business information and smart event type suggestions.

## User Journey

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Step 1        │     │   Step 2        │     │   Step 3        │
│   About You     │ ──▶ │   Your Business │ ──▶ │   Event Types   │
│                 │     │   (AI Scan)     │     │   (Suggestions) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Step 5        │     │   Step 4        │
                        │   All Set!      │ ◀── │   Branding      │
                        │   (Celebration) │     │   (Preview)     │
                        └─────────────────┘     └─────────────────┘
```

## Detailed Step Breakdown

### Step 1: "Tell us about you"

**Purpose**: Collect basic identity and business information

**Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Full Name | Text | Yes | Pre-filled if available from auth |
| Role/Title | Text | No | e.g., "Founder", "Sales Lead", "Coach" |
| Business Name | Text | Yes | Company or personal brand name |
| Website URL | URL | No | Enables AI scanning in next step |
| Timezone | Dropdown | Yes | Auto-detected, user can change |

**UI Notes**:
- Single column, centered layout
- Friendly, conversational copy: "Let's get to know you"
- Progress indicator showing 5 steps
- "Continue" button disabled until required fields filled

---

### Step 2: "Let's learn about your business"

**Purpose**: Use AI to understand and describe the user's business

**Two Paths**:

#### Path A: Website Provided
1. Show scanning animation with the URL
2. Display progress: "Reading your website...", "Understanding your business...", "Creating your profile..."
3. AI extracts and displays:
   - Business description (2-3 sentences)
   - Industry/category
   - Key services offered
   - Suggested booking page headline
4. User reviews and can edit any field
5. "Looks good!" or "Let me edit" options

#### Path B: No Website
1. Show industry category picker (grid of icons):
   - Consulting & Coaching
   - Design & Creative
   - Software & Tech
   - Sales & Marketing
   - Healthcare & Wellness
   - Legal & Finance
   - Education & Training
   - Other
2. Brief description textarea: "Tell us what you do in 1-2 sentences"
3. AI enhances the description

**AI Prompt Strategy**:
```
Analyze this website and extract:
1. A 2-3 sentence business description suitable for a booking page
2. The primary industry/category
3. 3-5 key services or offerings
4. A short, professional headline (under 10 words)

Website URL: {url}
```

**Error Handling**:
- Scan timeout: "We couldn't reach your website. Would you like to try again or describe your business instead?"
- Scan fails: Graceful fallback to Path B with pre-filled URL

---

### Step 3: "What types of meetings do you have?"

**Purpose**: Create initial event types with AI-powered suggestions

**Layout**:
- Header: "Based on your business, here are some meeting types we suggest"
- Grid/list of suggested event types (3-5)
- Each card shows:
  - Checkbox (selected by default)
  - Event name
  - Duration dropdown (15, 30, 45, 60 min)
  - Brief description
  - Edit icon

**AI Suggestions by Industry**:

| Industry | Suggested Event Types |
|----------|----------------------|
| Consulting | Discovery Call (30m), Strategy Session (60m), Check-in (30m) |
| Design | Portfolio Review (30m), Project Kickoff (45m), Design Critique (30m) |
| Coaching | Intro Session (30m), Coaching Call (60m), Goal Setting (45m) |
| Sales | Demo (30m), Discovery (30m), Follow-up (15m) |
| Healthcare | Initial Consultation (45m), Follow-up (30m), Quick Check (15m) |
| Tech | Technical Consultation (60m), Code Review (45m), Quick Sync (15m) |

**User Actions**:
- Toggle suggestions on/off
- Edit any suggested event type inline
- "Add custom event type" button
- "Skip for now" link (creates 1 default event type)

---

### Step 4: "Make it yours"

**Purpose**: Personalize the booking page appearance

**Left Panel (Controls)**:
- **Brand Color**: Color picker with smart defaults
  - Auto-extracted from website if available
  - 8 preset colors as quick options
- **Logo Upload**: Drag-drop or click to upload
  - Accepts PNG, JPG, SVG
  - Auto-crops/resizes
- **Booking Page Headline**: Editable text
  - Pre-filled from AI in Step 2
  - Example: "Book a time with Sarah"
- **Welcome Message**: Optional textarea
  - Short message shown on booking page

**Right Panel (Live Preview)**:
- Real-time preview of booking page
- Shows selected event types
- Updates as user makes changes
- Device toggle: Desktop / Mobile view

---

### Step 5: "You're all set!"

**Purpose**: Celebrate completion and guide next steps

**Layout**:
- Success animation (confetti, checkmark, or subtle celebration)
- Summary card:
  - "Your booking page is live at: calendai.app/book/username"
  - Copy link button
  - QR code for link
- Created items summary:
  - "3 event types created"
  - "Booking page customized"

**Call-to-Actions**:
| Action | Style | Description |
|--------|-------|-------------|
| View My Booking Page | Primary Button | Opens booking page in new tab |
| Share My Link | Secondary Button | Opens share modal |
| Set Up Availability | Link | Goes to settings > availability |
| Go to Dashboard | Link | Completes onboarding |

---

## Technical Specification

### Database Schema Additions

```typescript
// Add to users table
onboardingStep: integer("onboarding_step").default(0),
onboardingCompletedAt: timestamp("onboarding_completed_at"),
businessName: text("business_name"),
businessDescription: text("business_description"),
industry: text("industry"),
websiteUrl: text("website_url"),
logoUrl: text("logo_url"),
brandColor: text("brand_color").default("#6366f1"),
bookingHeadline: text("booking_headline"),
bookingWelcomeMessage: text("booking_welcome_message"),

// New table for onboarding drafts (temporary state)
export const onboardingDrafts = pgTable("onboarding_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  step: integer("step").default(1),
  data: jsonb("data"), // Stores all collected data as JSON
  aiSuggestions: jsonb("ai_suggestions"), // Cached AI responses
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/onboarding/scan-website` | POST | Scan URL and return AI analysis |
| `/api/onboarding/suggest-events` | POST | Generate event type suggestions |
| `/api/onboarding/draft` | GET | Get current onboarding draft |
| `/api/onboarding/draft` | PATCH | Save onboarding progress |
| `/api/onboarding/complete` | POST | Finalize and create all entities |

### Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/onboarding` | OnboardingWizard | Main wizard container |
| `/onboarding/step/1` | AboutYouStep | Step 1 |
| `/onboarding/step/2` | BusinessStep | Step 2 with AI scan |
| `/onboarding/step/3` | EventTypesStep | Step 3 suggestions |
| `/onboarding/step/4` | BrandingStep | Step 4 preview |
| `/onboarding/step/5` | CompleteStep | Step 5 celebration |

### AI Service Functions

```typescript
// Website scanning
async function scanWebsiteForBusiness(url: string): Promise<{
  description: string;
  industry: string;
  services: string[];
  headline: string;
}>

// Event type suggestions
async function suggestEventTypes(
  industry: string,
  description: string
): Promise<{
  name: string;
  duration: number;
  description: string;
}[]>
```

---

## UX Guidelines

### Progress Indicator
- Horizontal step indicator at top
- Shows completed (checkmark), current (highlighted), and upcoming (muted)
- Step labels visible on desktop, numbers only on mobile

### Navigation
- "Back" link (not button) on left
- "Continue" button on right, full-width on mobile
- "Skip this step" link below continue (where applicable)
- Steps are skippable but encourage completion

### Loading States
- Website scan: Animated progress with status messages
- AI suggestions: Skeleton cards that fill in
- Never block the user; allow skip if taking too long

### Error States
- Inline validation on fields
- Toast notifications for API errors
- Graceful fallbacks for AI failures

### Responsive Design
- Single column on mobile
- Side-by-side preview on desktop (Step 4)
- Touch-friendly inputs and buttons

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Completion Rate | >70% | Users who finish all 5 steps |
| Time to Complete | <3 min | Average time from start to finish |
| Event Types Created | >2 | Average event types created during onboarding |
| Return Rate | <20% | Users who return to edit immediately |

---

## Edge Cases & Fallbacks

| Scenario | Handling |
|----------|----------|
| User closes mid-onboarding | Save draft, resume on next login |
| Website unreachable | Offer manual entry path |
| AI service down | Use default templates, log for retry |
| No event types selected | Create 1 default "Meeting" event type |
| User skips all steps | Create minimal profile, prompt later |
| Logo upload fails | Continue without logo, prompt in settings |

---

## Implementation Priority

### Phase 1: Core Flow (MVP)
- [ ] Basic 5-step wizard UI
- [ ] Step 1: Form with basic fields
- [ ] Step 2: Manual business description (no AI yet)
- [ ] Step 3: Static event type suggestions by industry
- [ ] Step 4: Brand color picker and simple preview
- [ ] Step 5: Completion with link

### Phase 2: AI Enhancement
- [ ] Website scanning with AI analysis
- [ ] Dynamic event type suggestions
- [ ] AI-generated descriptions and headlines
- [ ] Brand color extraction from website

### Phase 3: Polish
- [ ] Animations and transitions
- [ ] Mobile optimization
- [ ] Resume incomplete onboarding
- [ ] Analytics and tracking

---

## Design Inspiration

- **Notion**: Clean, minimal onboarding with smart defaults
- **Calendly**: Industry-specific templates
- **Linear**: Smooth animations and progress feel
- **Stripe**: Professional yet approachable tone

---

## Open Questions

1. Should onboarding be skippable entirely with a "Set up later" option?
2. Should we collect availability preferences during onboarding or keep it separate?
3. Should the booking page URL/slug be customizable during onboarding?
4. Do we want social login options visible during onboarding or just email?
