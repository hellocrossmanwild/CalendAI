/**
 * ICS (iCalendar) file generation utility.
 * Generates RFC 5545 compliant .ics files for calendar event downloads.
 */

export interface ICSEventParams {
  /** Event title / summary */
  summary: string;
  /** Event description or notes */
  description?: string;
  /** Event start time as a Date object (in UTC) */
  startTime: Date;
  /** Event duration in minutes */
  durationMinutes: number;
  /** Location string (optional) */
  location?: string;
  /** Organizer name (optional) */
  organizerName?: string;
  /** Attendee email */
  attendeeEmail: string;
  /** Attendee name */
  attendeeName: string;
}

/**
 * Formats a Date object into ICS UTC datetime format: YYYYMMDDTHHMMSSZ
 */
function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escapes special characters in ICS text fields per RFC 5545.
 * Backslash, semicolons, commas, and newlines must be escaped.
 * CRLF sequences and bare carriage returns are normalized before escaping.
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

/**
 * Generates a unique identifier for the ICS event.
 */
function generateUID(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}@calendai`;
}

/**
 * Generates a valid RFC 5545 ICS file content string.
 */
export function generateICSContent(params: ICSEventParams): string {
  const {
    summary,
    description,
    startTime,
    durationMinutes,
    location,
    organizerName,
    attendeeEmail,
    attendeeName,
  } = params;

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalendAI//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${generateUID()}`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(startTime)}`,
    `DTEND:${formatICSDate(endTime)}`,
    `SUMMARY:${escapeICSText(summary)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeICSText(description)}`);
  }

  if (location) {
    lines.push(`LOCATION:${escapeICSText(location)}`);
  }

  if (organizerName) {
    lines.push(`ORGANIZER;CN=${escapeICSText(organizerName)}:MAILTO:noreply@calendai.app`);
  }

  // Sanitize email: strip any CRLF characters that could inject ICS properties
  const sanitizedEmail = attendeeEmail.replace(/[\r\n]/g, "");
  lines.push(
    `ATTENDEE;CN=${escapeICSText(attendeeName)};RSVP=TRUE:MAILTO:${sanitizedEmail}`
  );

  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Creates a Blob from ICS content for file download.
 */
export function createICSBlob(params: ICSEventParams): Blob {
  const content = generateICSContent(params);
  return new Blob([content], { type: "text/calendar;charset=utf-8" });
}

/**
 * Triggers a browser download of the generated ICS file.
 */
export function downloadICSFile(params: ICSEventParams, filename: string): void {
  const blob = createICSBlob(params);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a Google Calendar event creation URL.
 * The dates parameter uses the format: YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
 */
export function generateGoogleCalendarURL(params: ICSEventParams): string {
  const {
    summary,
    description,
    startTime,
    durationMinutes,
    location,
  } = params;

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  const googleParams = new URLSearchParams({
    action: "TEMPLATE",
    text: summary,
    dates: `${formatICSDate(startTime)}/${formatICSDate(endTime)}`,
  });

  if (description) {
    googleParams.set("details", description);
  }

  if (location) {
    googleParams.set("location", location);
  }

  return `https://calendar.google.com/calendar/event?${googleParams.toString()}`;
}
