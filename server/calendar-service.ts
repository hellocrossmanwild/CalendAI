import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import {
  addMinutes,
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
  utc: string;
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

const DEFAULT_WORKING_HOURS_START = 9; // 9 AM
const DEFAULT_WORKING_HOURS_END = 17; // 5 PM

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// ---------------------------------------------------------------------------
// Timezone Helpers (native Intl — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Validate whether a string is a valid IANA timezone identifier.
 * Returns true for valid timezones (e.g. "America/New_York"), false otherwise.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a UTC Date representing a specific wall-clock time in a given timezone.
 *
 * Example: wallClockToUTC(2026, 1, 27, 9, 0, "America/New_York")
 * returns the UTC instant when it is 9:00 AM in New York on Jan 27, 2026.
 */
function wallClockToUTC(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  // Start with a "guess": treat the wall-clock values as if they were UTC.
  const guessMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const guess = new Date(guessMs);

  // Ask Intl what wall-clock values the *guess* instant shows in the target TZ.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(guess);

  const get = (type: string): number => {
    const val = parts.find((p) => p.type === type)?.value ?? "0";
    return parseInt(val, 10);
  };

  let h = get("hour");
  if (h === 24) h = 0; // midnight edge case in some locales

  // Compute what UTC timestamp the TZ wall-clock values correspond to.
  const tzWallMs = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), 0, 0);

  // The offset (in ms) between the guess instant and what the TZ shows.
  const offsetMs = tzWallMs - guessMs;

  // The correct UTC instant is the guess shifted back by that offset.
  return new Date(guessMs - offsetMs);
}

/**
 * Format a UTC Date for display in a specific timezone (e.g. "2:00 PM").
 */
function formatTimeInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Get the calendar-date components (year, month 1-based, day) from a Date's
 * UTC values. Client-sent ISO strings encode the selected calendar date in UTC.
 */
function getUTCDateParts(date: Date): { year: number; month: number; day: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

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
 * 2. Fetches the host's availability rules (or falls back to defaults).
 * 3. Checks if the requested date is within min notice and max advance limits.
 * 4. Fetches Google Calendar events for the date (if connected).
 * 5. Fetches existing CalendAI bookings for the date.
 * 6. Generates slots within configured working hours for the day of the week,
 *    using the host's timezone for working-hour interpretation.
 * 7. Marks slots as unavailable when they overlap with existing events or
 *    bookings (buffers included).
 * 8. Filters out slots in the past and those within min notice period.
 * 9. Returns slots with display times in the guest's timezone and UTC stamps.
 *
 * @param guestTimezone  IANA timezone for the booker (e.g. "America/New_York").
 *                       When omitted, display times fall back to the host timezone.
 */
export async function calculateAvailability(
  userId: string,
  eventTypeId: number,
  date: Date,
  guestTimezone?: string,
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

    // Dynamic slot interval: min(duration, 30) so 15-min events get 15-min
    // intervals while 30+ min events keep the standard 30-min grid.
    const slotInterval = Math.min(duration, 30);

    // Fetch availability rules for the host (F03)
    const rules = await storage.getAvailabilityRules(userId);
    const minNotice = rules?.minNotice ?? 1440; // default 24 hours
    const maxAdvance = rules?.maxAdvance ?? 60;  // default 60 days

    // Host timezone from availability rules (or UTC as fallback).
    const hostTimezone = rules?.timezone || "UTC";
    // Display timezone: prefer guest's, fall back to host's.
    const displayTimezone = guestTimezone && isValidTimezone(guestTimezone)
      ? guestTimezone
      : hostTimezone;

    const now = new Date();

    // Extract the calendar date the guest selected (encoded as UTC date parts).
    const { year, month, day } = getUTCDateParts(date);

    // Check max advance limit: compare against the requested date interpreted
    // in the host's timezone.
    const requestedDayStart = wallClockToUTC(year, month, day, 0, 0, hostTimezone);
    const maxAdvanceDate = addMinutes(now, maxAdvance * 24 * 60);
    if (isAfter(requestedDayStart, maxAdvanceDate)) {
      return [];
    }

    // Determine the day of the week in the host's timezone.
    // We use the host-timezone wall clock to find the weekday name.
    const hostDayParts = new Intl.DateTimeFormat("en-US", {
      timeZone: hostTimezone,
      weekday: "long",
    }).formatToParts(requestedDayStart);
    const hostWeekday = (hostDayParts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();

    const weeklyHours = rules?.weeklyHours as {
      [day: string]: { start: string; end: string }[] | null;
    } | null;

    let timeBlocks: { start: string; end: string }[];
    if (weeklyHours && hostWeekday in weeklyHours) {
      const dayConfig = weeklyHours[hostWeekday];
      if (dayConfig === null || dayConfig === undefined) {
        // Day is disabled (e.g., weekends)
        return [];
      }
      timeBlocks = dayConfig;
    } else {
      // Fallback to default working hours
      timeBlocks = [{ start: `${String(DEFAULT_WORKING_HOURS_START).padStart(2, "0")}:00`, end: `${String(DEFAULT_WORKING_HOURS_END).padStart(2, "0")}:00` }];
    }

    if (timeBlocks.length === 0) {
      return [];
    }

    // Build the full-day range in the host's timezone for fetching busy periods.
    const dayStartUTC = wallClockToUTC(year, month, day, 0, 0, hostTimezone);
    const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    // Fetch external calendar events and internal bookings in parallel.
    const [calendarEvents, existingBookings] = await Promise.all([
      getCalendarEvents(userId, dayStartUTC, dayEndUTC),
      storage.getBookingsByDateRange(userId, dayStartUTC, dayEndUTC),
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

    // Calculate minimum notice cutoff
    const minNoticeCutoff = addMinutes(now, minNotice);

    const slots: TimeSlot[] = [];

    // Generate candidate slots for each time block in the day.
    // Block times are interpreted in the host's timezone.
    for (const block of timeBlocks) {
      const [startHour, startMin] = block.start.split(":").map(Number);
      const [endHour, endMin] = block.end.split(":").map(Number);

      const blockStart = wallClockToUTC(year, month, day, startHour, startMin, hostTimezone);
      const blockEnd = wallClockToUTC(year, month, day, endHour, endMin, hostTimezone);

      let cursor = blockStart;

      while (isBefore(cursor, blockEnd)) {
        const slotStart = cursor;
        const slotEnd = addMinutes(slotStart, duration);

        // The slot must finish within this block's working hours.
        if (isAfter(slotEnd, blockEnd)) {
          break;
        }

        // Skip slots that are in the past.
        if (isBefore(slotStart, now)) {
          cursor = addMinutes(cursor, slotInterval);
          continue;
        }

        // Skip slots within minimum notice period
        if (isBefore(slotStart, minNoticeCutoff)) {
          cursor = addMinutes(cursor, slotInterval);
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
          time: formatTimeInTimezone(slotStart, displayTimezone),
          available: !hasConflict,
          utc: slotStart.toISOString(),
        });

        cursor = addMinutes(cursor, slotInterval);
      }
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
