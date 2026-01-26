# CalendAI - AI-First Scheduling Platform

## Overview
CalendAI is an AI-powered scheduling platform that transforms meeting booking with intelligent features:
- AI-powered lead enrichment using web research
- Conversational pre-qualification chat
- AI-generated meeting prep briefs
- Professional booking pages with real-time availability
- Dark/light mode with indigo/violet theme

## Project Architecture

### Tech Stack
- **Frontend**: React + TypeScript, Wouter routing, TanStack Query, Shadcn UI, Tailwind CSS
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations
- **Auth**: Replit Auth
- **Storage**: Replit Object Storage for file uploads

### File Structure
```
client/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── AppSidebar.tsx
│   │   ├── ThemeProvider.tsx
│   │   └── ThemeToggle.tsx
│   ├── pages/          # Route pages
│   │   ├── landing.tsx
│   │   ├── dashboard.tsx
│   │   ├── event-types.tsx
│   │   ├── event-type-form.tsx
│   │   ├── bookings.tsx
│   │   ├── booking-detail.tsx
│   │   ├── leads.tsx
│   │   ├── briefs.tsx
│   │   ├── settings.tsx
│   │   └── book.tsx (public booking page)
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utility libraries
server/
├── routes.ts           # API endpoints
├── storage.ts          # Database operations
├── ai-service.ts       # AI integration (OpenAI)
├── db.ts               # Database connection
└── replit_integrations/ # Replit service integrations
shared/
├── schema.ts           # Database schema & types
└── models/             # Shared models
```

### Database Schema
- **eventTypes**: Customizable meeting types (duration, buffer, color)
- **bookings**: Scheduled meetings with guest info
- **leadEnrichments**: AI-generated company/personal research
- **prequalResponses**: Chat history from pre-qualification
- **documents**: File attachments for bookings
- **meetingBriefs**: AI-generated prep summaries
- **calendarTokens**: Google Calendar OAuth tokens

## Key Features

### For Meeting Hosts
1. Create custom event types with flexible settings
2. Automatic lead enrichment when bookings come in
3. Generate meeting prep briefs before meetings
4. View enriched leads with company research
5. Connect Google Calendar for availability

### For Guests
1. Clean, professional booking experience
2. Real-time availability display
3. Conversational pre-qualification (optional)
4. File upload support
5. Timezone-aware scheduling

## API Endpoints

### Authenticated Routes
- `GET /api/event-types` - List event types
- `POST /api/event-types` - Create event type
- `PATCH /api/event-types/:id` - Update event type
- `DELETE /api/event-types/:id` - Delete event type
- `GET /api/bookings` - List bookings with details
- `GET /api/bookings/:id` - Get booking details
- `DELETE /api/bookings/:id` - Cancel booking
- `POST /api/bookings/:id/enrich` - Trigger AI enrichment
- `POST /api/bookings/:id/generate-brief` - Generate AI brief
- `GET /api/calendar/status` - Check calendar connection
- `GET /api/calendar/connect` - Connect calendar
- `DELETE /api/calendar/disconnect` - Disconnect calendar

### Public Routes
- `GET /api/public/event-types/:slug` - Get event type by slug
- `GET /api/public/availability/:slug` - Get available time slots
- `POST /api/public/book` - Create a booking
- `POST /api/public/chat` - Process pre-qual chat

## Design System
- Primary color: Indigo (#6366f1)
- Light/dark mode with full theme support
- Shadcn UI components with custom styling
- Inter font family
- Professional scheduling aesthetic

## Running the Project
The application runs with `npm run dev` which starts:
- Express backend on port 5000
- Vite dev server for frontend

## Recent Changes
- Initial implementation of full CalendAI platform
- Created 7 database tables for complete data model
- Built 10+ pages with full CRUD operations
- Integrated OpenAI for AI features via Replit AI Integrations
- Added object storage for file uploads
- Implemented Replit Auth for user authentication
