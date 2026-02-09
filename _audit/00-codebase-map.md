# Codebase Map — CalendAI

## Overview
CalendAI is a full-stack AI-powered scheduling/booking platform (like Calendly) built on Replit. It supports event type creation, guest booking, calendar integration (Google), lead enrichment/scoring, meeting prep briefs, email notifications, and a conversational pre-qualification chatbot.

## Tech Stack
- **Runtime**: Node.js (ESM)
- **Language**: TypeScript (strict mode)
- **Frontend**: React 18, Vite 7, Wouter (routing), TanStack React Query, Tailwind CSS 3, shadcn/ui (Radix primitives), Recharts, Framer Motion
- **Backend**: Express 5, express-session (pg-backed), Passport (local strategy), bcrypt
- **Database**: PostgreSQL via Drizzle ORM + drizzle-zod
- **AI**: OpenAI SDK (openai ^6.16.0)
- **Auth**: Email/password with bcrypt, Google OAuth, magic links, email verification, password reset
- **Email**: Nodemailer
- **Calendar**: Google Calendar API (googleapis)
- **Storage**: Google Cloud Storage (@google-cloud/storage), Replit Object Storage
- **Testing**: Vitest + @vitest/coverage-v8 (server-only tests)
- **Build**: tsx (dev), esbuild (production build via script/build.ts)
- **No linter configured** (no ESLint/Prettier config found)

## Total Lines of Code
~34,618 lines across TypeScript/TSX/JS files

## Directory Structure
```
.
├── client/                          # Frontend (React SPA)
│   ├── src/
│   │   ├── App.tsx                  # Root component, routing, auth guard
│   │   ├── main.tsx                 # Entry point
│   │   ├── pages/                   # 15 page components
│   │   │   ├── auth.tsx             # Login/register/magic-link/reset
│   │   │   ├── dashboard.tsx
│   │   │   ├── event-types.tsx
│   │   │   ├── event-type-form.tsx
│   │   │   ├── event-type-ai-create.tsx
│   │   │   ├── bookings.tsx
│   │   │   ├── booking-detail.tsx
│   │   │   ├── book.tsx             # Public booking page
│   │   │   ├── cancel-booking.tsx   # Public cancel page
│   │   │   ├── reschedule-booking.tsx
│   │   │   ├── leads.tsx
│   │   │   ├── briefs.tsx
│   │   │   ├── settings.tsx
│   │   │   ├── onboarding.tsx
│   │   │   └── onboarding-wizard.tsx
│   │   ├── components/              # Shared components
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── ThemeProvider.tsx
│   │   │   ├── lead-score-badge.tsx
│   │   │   ├── ObjectUploader.tsx
│   │   │   ├── password-strength-indicator.tsx
│   │   │   └── ui/                  # ~40 shadcn/ui components
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-upload.ts
│   │   │   ├── use-toast.ts
│   │   │   └── use-mobile.tsx
│   │   └── lib/
│   │       ├── queryClient.ts
│   │       ├── utils.ts
│   │       ├── auth-utils.ts
│   │       └── ics.ts
│   ├── public/
│   │   ├── favicon.png
│   │   └── widget.js                # Embeddable booking widget
│   └── replit_integrations/audio/   # Voice/audio streaming (Replit-specific)
├── server/                          # Backend (Express)
│   ├── index.ts                     # App bootstrap, session, middleware
│   ├── routes.ts                    # ~2500 lines, ALL API routes (monolith)
│   ├── storage.ts                   # Database access layer
│   ├── db.ts                        # Drizzle + pg Pool setup
│   ├── ai-service.ts               # OpenAI integration (enrichment, briefs, prequal, event creation)
│   ├── calendar-service.ts          # Google Calendar OAuth + availability
│   ├── email-service.ts            # Nodemailer wrapper
│   ├── email-templates.ts          # HTML email templates
│   ├── lead-scoring.ts             # Lead scoring algorithm
│   ├── website-scanner.ts          # Website scraping for onboarding
│   ├── brief-scheduler.ts          # Auto-generates meeting briefs
│   ├── vite.ts                     # Vite dev server integration
│   ├── static.ts                   # Static file serving (production)
│   ├── __tests__/                  # 11 test files (Vitest)
│   └── replit_integrations/        # Replit-specific: auth, chat, audio, images, object storage, batch
├── shared/
│   ├── schema.ts                    # Drizzle tables + Zod schemas
│   └── models/
│       ├── auth.ts
│       └── chat.ts
├── feature-briefs/                  # 13 feature specification docs
├── script/
│   └── build.ts                     # Production build script
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── postcss.config.js
└── .gitignore
```

## Key Entry Points
- **Client entry**: `client/src/main.tsx` → `client/src/App.tsx`
- **Server entry**: `server/index.ts` → bootstraps Express, sessions, registers routes
- **API routes**: `server/routes.ts` — single monolithic file with ~55 endpoints

## API Routes (55 endpoints)
### Auth (16 endpoints)
- POST /api/auth/register, /api/auth/login, /api/auth/logout
- GET /api/auth/user, /api/auth/google, /api/auth/google/callback
- POST /api/auth/magic-link, GET /api/auth/magic-link/verify
- POST /api/auth/forgot-password, /api/auth/reset-password
- GET /api/auth/verify-email, POST /api/auth/resend-verification
- PATCH /api/auth/profile, POST /api/auth/change-password
- DELETE /api/auth/account

### Event Types (5 endpoints)
- CRUD: GET/POST/PATCH/DELETE /api/event-types, GET /api/event-types/:id

### Bookings (7 endpoints)
- GET /api/bookings, GET /api/bookings/:id, DELETE /api/bookings/:id
- POST /api/bookings/:id/reschedule, PATCH /api/bookings/:id/status
- POST /api/bookings/:id/enrich, POST /api/bookings/:id/generate-brief

### Briefs (2 endpoints)
- PATCH /api/bookings/:id/brief/read, GET /api/briefs/unread-count

### Calendar (5 endpoints)
- GET /api/calendar/auth, /api/calendar/callback, /api/calendar/status
- DELETE /api/calendar/disconnect
- GET /api/availability-rules, PUT /api/availability-rules

### Onboarding (5 endpoints)
- POST /api/availability-rules/analyse
- GET/PATCH /api/onboarding/draft
- POST /api/onboarding/scan-website, /api/onboarding/suggest-events, /api/onboarding/complete

### AI (2 endpoints)
- POST /api/ai/create-event-type, /api/ai/scan-website

### Uploads (1 endpoint)
- POST /api/uploads/request-url

### Notifications (2 endpoints)
- GET/PATCH /api/notification-preferences

### Public (8 endpoints)
- GET/POST /api/public/booking/cancel/:token
- GET /api/public/booking/reschedule/:token, GET .../availability, POST .../reschedule
- GET /api/public/event-types/:slug, /api/public/availability/:slug
- POST /api/public/book, /api/public/chat

## Auth Boundaries
- `requireAuth` middleware on all authenticated routes
- Public routes: /api/public/*, /api/auth/register, /api/auth/login, /api/auth/magic-link/*, /api/auth/verify-email, /api/auth/forgot-password, /api/auth/reset-password, /api/calendar/callback
- Session-based auth (express-session with PostgreSQL store)
- Passwords hashed with bcrypt (cost 10)

## Environment Variables (expected)
- `DATABASE_URL` (required, validated at startup in db.ts)
- `SESSION_SECRET` (has hardcoded fallback: "calendai-secret-key")
- `BASE_URL` (optional, falls back to request host header)
- `PORT` (defaults to 5000)
- `NODE_ENV`
- `OPENAI_API_KEY` (for AI features)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Calendar OAuth)
- Various Replit-specific env vars

## Testing
- 11 test files in `server/__tests__/`
- Vitest with v8 coverage provider
- Tests cover server code only (no frontend tests)
- Coverage config: includes `server/**/*.ts`, excludes tests and replit_integrations

## No Docker Setup
No Dockerfile or docker-compose found. Deployed via Replit.

## No Linter/Formatter
No ESLint, Prettier, or similar config found. Only `tsc` type checking via `npm run check`.
