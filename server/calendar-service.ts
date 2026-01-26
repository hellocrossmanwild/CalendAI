import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import {
  startOfDay,
  endOfDay,
  addMinutes,
  setHours,
  setMinutes,
  format,
  isBefore,
  isAfter,
} from "date-fns";
import { storage } from "./storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  start: Date;
  end: Date;
  summary: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

interface BookingData {
  guestName: string;
  guestEmail: string;
  guestCompany?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const WORKING_HOURS_START = 9; // 9 AM
const WORKING_HOURS_END = 17; // 5 PM
const SLOT_INTERVAL_MINUTES = 30;

function createOAuth2Client(redirectUri?: string): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

// ---------------------------------------------------------------------------
// 1. getGoogleAuthUrl
// ---------------------------------------------------------------------------

/**
 * Build Google OAuth URL that requests calendar scopes.
 * Uses `access_type=offline` and `prompt=consent` to guarantee a refresh token
 * is returned on first authorisation.
 */
export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const oauth2Client = createOAuth2Client(redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

// ---------------------------------------------------------------------------
// 2. exchangeCodeForTokens
// ---------------------------------------------------------------------------

/**
 * Exchange an authorisation code obtained from the OAuth consent screen for
 * access / refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null }> {
  const oauth2Client = createOAuth2Client(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

// ---------------------------------------------------------------------------
// 3. getValidCalendarClient
// ---------------------------------------------------------------------------

/**
 * Return an authenticated Google Calendar client for the given user.
 *
 * - Retrieves the stored token from the database.
 * - If the access token has expired, refreshes it using the stored refresh
 *   token and persists the new credentials.
 * - Returns `null` when no token exists or the refresh fails (i.e. calendar
 *   is disconnected).
 */
export async function getValidCalendarClient(
  userId: string,
): Promise<{ calendar: calendar_v3.Calendar; calendarId: string } | null> {
  try {
    const calendarToken = await storage.getCalendarToken(userId);
    if (!calendarToken) {
      return null;
    }

    const oauth2Client = createOAuth2Client();

    oauth2Client.setCredentials({
      access_token: calendarToken.accessToken,
      refresh_token: calendarToken.refreshToken ?? undefined,
    });

    // Check whether the access token has expired (with a small buffer).
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // Refresh 5 minutes before expiry
    const isExpired =
      calendarToken.expiresAt && isBefore(calendarToken.expiresAt, new Date(now.getTime() + bufferMs));

    if (isExpired) {
      if (!calendarToken.refreshToken) {
        // Cannot refresh without a refresh token – treat as disconnected.
        return null;
      }

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Persist refreshed credentials.
        await storage.upsertCalendarToken({
          userId,
          accessToken: credentials.access_token ?? calendarToken.accessToken,
          refreshToken:
            credentials.refresh_token ?? calendarToken.refreshToken,
          expiresAt: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : calendarToken.expiresAt,
          calendarId: calendarToken.calendarId ?? "primary",
        });

        oauth2Client.setCredentials(credentials);
      } catch (refreshError) {
        console.error("Failed to refresh Google Calendar token:", (refreshError as Error).message);
        return null;
      }
    }

    return {
      calendar: google.calendar({ version: "v3", auth: oauth2Client }),
      calendarId: calendarToken.calendarId ?? "primary",
    };
  } catch (error) {
    console.error("Error getting calendar client:", (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. getCalendarEvents
// ---------------------------------------------------------------------------

/**
 * Fetch Google Calendar events between `startDate` and `endDate`.
 * Returns an empty array if the calendar is not connected.
 */
export async function getCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  try {
    const result = await getValidCalendarClient(userId);
    if (!result) {
      return [];
    }

    const { calendar, calendarId } = result;

    const response = await calendar.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: CalendarEvent[] = (response.data.items ?? [])
      .filter((event) => event.start && event.end)
      .map((event) => ({
        start: new Date(
          (event.start!.dateTime ?? event.start!.date) as string,
        ),
        end: new Date((event.end!.dateTime ?? event.end!.date) as string),
        summary: event.summary ?? "(No title)",
      }));

    return events;
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 5. calculateAvailability
// ---------------------------------------------------------------------------

/**
 * Calculate available time slots for a given event type on a given date.
 *
 * 1. Fetches the event type to read duration / buffer settings.
 * 2. Fetches Google Calendar events for the date (if connected).
 * 3. Fetches existing CalendAI bookings for the date.
 * 4. Generates 30-minute interval slots during working hours (9 AM – 5 PM).
 * 5. Marks slots as unavailable when they overlap with existing events or
 *    bookings (buffers included).
 * 6. Filters out slots in the past.
 */
export async function calculateAvailability(
  userId: string,
  eventTypeId: number,
  date: Date,
): Promise<TimeSlot[]> {
  try {
    // Fetch event type for duration + buffer config.
    const eventType = await storage.getEventType(eventTypeId);
    if (!eventType) {
      return [];
    }

    const duration = eventType.duration; // minutes
    const bufferBefore = eventType.bufferBefore ?? 0;
    const bufferAfter = eventType.bufferAfter ?? 0;

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Fetch external calendar events and internal bookings in parallel.
    const [calendarEvents, existingBookings] = await Promise.all([
      getCalendarEvents(userId, dayStart, dayEnd),
      storage.getBookingsByDateRange(userId, dayStart, dayEnd),
    ]);

    // Build a unified list of busy periods.
    interface BusyPeriod {
      start: Date;
      end: Date;
    }

    const busyPeriods: BusyPeriod[] = [
      ...calendarEvents.map((e) => ({ start: e.start, end: e.end })),
      ...existingBookings.map((b) => ({
        start: b.startTime,
        end: b.endTime,
      })),
    ];

    const now = new Date();
    const slots: TimeSlot[] = [];

    // Generate candidate slots from working-hours start to end.
    const workStart = setMinutes(setHours(dayStart, WORKING_HOURS_START), 0);
    const workEnd = setMinutes(setHours(dayStart, WORKING_HOURS_END), 0);

    let cursor = workStart;

    while (isBefore(cursor, workEnd)) {
      const slotStart = cursor;
      const slotEnd = addMinutes(slotStart, duration);

      // The slot must finish within working hours.
      if (isAfter(slotEnd, workEnd)) {
        break;
      }

      // Skip slots that are in the past.
      if (isBefore(slotStart, now)) {
        cursor = addMinutes(cursor, SLOT_INTERVAL_MINUTES);
        continue;
      }

      // Determine availability by checking overlaps with busy periods,
      // accounting for buffers around the proposed slot.
      const bufferedStart = addMinutes(slotStart, -bufferBefore);
      const bufferedEnd = addMinutes(slotEnd, bufferAfter);

      const hasConflict = busyPeriods.some((busy) => {
        // Two intervals overlap when one starts before the other ends and
        // vice-versa.
        return isBefore(bufferedStart, busy.end) && isAfter(bufferedEnd, busy.start);
      });

      slots.push({
        time: format(slotStart, "h:mm a"),
        available: !hasConflict,
      });

      cursor = addMinutes(cursor, SLOT_INTERVAL_MINUTES);
    }

    return slots;
  } catch (error) {
    console.error("Error calculating availability:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 6. createCalendarEvent
// ---------------------------------------------------------------------------

/**
 * Create a Google Calendar event for a confirmed booking.
 * Automatically provisions a Google Meet link via `conferenceData`.
 * Returns the newly-created event ID, or `null` if the calendar is not
 * connected.
 */
export async function createCalendarEvent(
  userId: string,
  booking: BookingData,
  eventTypeName: string,
): Promise<string | null> {
  try {
    const result = await getValidCalendarClient(userId);
    if (!result) {
      return null;
    }

    const { calendar, calendarId } = result;

    const descriptionLines = [
      `Booking via CalendAI`,
      ``,
      `Guest: ${booking.guestName}`,
      `Email: ${booking.guestEmail}`,
    ];

    if (booking.guestCompany) {
      descriptionLines.push(`Company: ${booking.guestCompany}`);
    }

    if (booking.notes) {
      descriptionLines.push(``, `Notes: ${booking.notes}`);
    }

    descriptionLines.push(``, `View in CalendAI dashboard`);

    const requestId = `calendai-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    const response = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: `${eventTypeName} - ${booking.guestName}`,
        description: descriptionLines.join("\n"),
        start: {
          dateTime: booking.startTime.toISOString(),
          timeZone: booking.timezone,
        },
        end: {
          dateTime: booking.endTime.toISOString(),
          timeZone: booking.timezone,
        },
        attendees: [{ email: booking.guestEmail }],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      },
    });

    return response.data.id ?? null;
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 7. deleteCalendarEvent
// ---------------------------------------------------------------------------

/**
 * Delete a previously-created Google Calendar event.
 * Returns `true` on success, `false` if the calendar is disconnected or the
 * deletion fails.
 */
export async function deleteCalendarEvent(
  userId: string,
  calendarEventId: string,
): Promise<boolean> {
  try {
    const result = await getValidCalendarClient(userId);
    if (!result) {
      return false;
    }

    const { calendar, calendarId } = result;

    await calendar.events.delete({
      calendarId,
      eventId: calendarEventId,
    });

    return true;
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 8. listUserCalendars
// ---------------------------------------------------------------------------

/**
 * List all calendars accessible to the authenticated user.
 * Returns a simplified array of `{ id, summary, primary }`.
 */
export async function listUserCalendars(
  userId: string,
): Promise<{ id: string; summary: string; primary: boolean }[]> {
  try {
    const result = await getValidCalendarClient(userId);
    if (!result) {
      return [];
    }

    const { calendar } = result;

    const response = await calendar.calendarList.list();

    return (response.data.items ?? []).map((cal) => ({
      id: cal.id ?? "",
      summary: cal.summary ?? "",
      primary: cal.primary ?? false,
    }));
  } catch (error) {
    console.error("Error listing calendars:", error);
    return [];
  }
}
