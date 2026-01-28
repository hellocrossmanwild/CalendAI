import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// F05: Booking Page Enhancements - Comprehensive Tests
// ============================================================================
// Covers:
//   1. ICS (iCalendar) file generation (generateICSContent, generateGoogleCalendarURL, createICSBlob)
//   2. Public API security (getEventTypeBySlugWithHost exposes only safe host fields)
//   3. Timezone helper (getTimezoneLabel formatting and fallback)
// ============================================================================

// ---------------------------------------------------------------------------
// Part 1: ICS Generation Tests
// ---------------------------------------------------------------------------
// Import pure functions from the client lib (no DOM dependencies needed).
import {
  generateICSContent,
  generateGoogleCalendarURL,
  createICSBlob,
  type ICSEventParams,
} from "../../client/src/lib/ics";

/** Reusable fixture for a standard booking event */
function makeBaseParams(overrides?: Partial<ICSEventParams>): ICSEventParams {
  return {
    summary: "Discovery Call",
    description: "A quick introductory call",
    startTime: new Date("2026-03-15T14:00:00Z"),
    durationMinutes: 30,
    location: "Google Meet",
    organizerName: "Jane Smith",
    attendeeEmail: "guest@example.com",
    attendeeName: "John Doe",
    ...overrides,
  };
}

describe("ICS Generation — generateICSContent", () => {
  it("produces valid VCALENDAR/VEVENT structure", () => {
    const ics = generateICSContent(makeBaseParams());

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//CalendAI//Booking//EN");
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("METHOD:REQUEST");
  });

  it("formats DTSTART in YYYYMMDDTHHMMSSZ UTC format", () => {
    const ics = generateICSContent(makeBaseParams());
    // 2026-03-15T14:00:00Z → 20260315T140000Z
    expect(ics).toContain("DTSTART:20260315T140000Z");
  });

  it("computes DTEND = DTSTART + duration", () => {
    const ics = generateICSContent(makeBaseParams({ durationMinutes: 30 }));
    // 14:00 + 30 min = 14:30
    expect(ics).toContain("DTEND:20260315T143000Z");
  });

  it("computes DTEND correctly for longer durations", () => {
    const ics = generateICSContent(makeBaseParams({ durationMinutes: 90 }));
    // 14:00 + 90 min = 15:30
    expect(ics).toContain("DTEND:20260315T153000Z");
  });

  it("includes SUMMARY from the event title", () => {
    const ics = generateICSContent(makeBaseParams({ summary: "Team Standup" }));
    expect(ics).toContain("SUMMARY:Team Standup");
  });

  it("includes DESCRIPTION when provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ description: "Discuss roadmap" }),
    );
    expect(ics).toContain("DESCRIPTION:Discuss roadmap");
  });

  it("omits DESCRIPTION when not provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ description: undefined }),
    );
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("includes LOCATION when provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ location: "Zoom" }),
    );
    expect(ics).toContain("LOCATION:Zoom");
  });

  it("omits LOCATION when not provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ location: undefined }),
    );
    expect(ics).not.toContain("LOCATION:");
  });

  it("includes ORGANIZER with CN when organizerName is provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ organizerName: "Jane Smith" }),
    );
    expect(ics).toContain("ORGANIZER;CN=Jane Smith:MAILTO:noreply@calendai.app");
  });

  it("omits ORGANIZER when organizerName is not provided", () => {
    const ics = generateICSContent(
      makeBaseParams({ organizerName: undefined }),
    );
    expect(ics).not.toContain("ORGANIZER");
  });

  it("includes ATTENDEE with name, RSVP, and email", () => {
    const ics = generateICSContent(makeBaseParams());
    expect(ics).toContain(
      "ATTENDEE;CN=John Doe;RSVP=TRUE:MAILTO:guest@example.com",
    );
  });

  it("includes STATUS:CONFIRMED", () => {
    const ics = generateICSContent(makeBaseParams());
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("includes a UID ending with @calendai", () => {
    const ics = generateICSContent(makeBaseParams());
    const uidLine = ics
      .split("\r\n")
      .find((line) => line.startsWith("UID:"));
    expect(uidLine).toBeDefined();
    expect(uidLine).toMatch(/@calendai$/);
  });

  it("includes DTSTAMP in correct format", () => {
    const ics = generateICSContent(makeBaseParams());
    const dtstampLine = ics
      .split("\r\n")
      .find((line) => line.startsWith("DTSTAMP:"));
    expect(dtstampLine).toBeDefined();
    // Should match YYYYMMDDTHHMMSSZ
    expect(dtstampLine).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/);
  });

  it("uses CRLF line endings per RFC 5545", () => {
    const ics = generateICSContent(makeBaseParams());
    // The joined result should contain \r\n between lines
    expect(ics).toContain("\r\n");
    // And should not have bare \n without \r (other than escaped \\n in content)
    const lines = ics.split("\r\n");
    for (const line of lines) {
      // Lines should not contain unescaped bare newlines
      expect(line).not.toMatch(/[^\\\n]\n/);
    }
  });

  // --- Special character escaping ---

  it("escapes semicolons in text fields", () => {
    const ics = generateICSContent(
      makeBaseParams({ summary: "Call; follow-up" }),
    );
    expect(ics).toContain("SUMMARY:Call\\; follow-up");
  });

  it("escapes commas in text fields", () => {
    const ics = generateICSContent(
      makeBaseParams({ summary: "Call, intro" }),
    );
    expect(ics).toContain("SUMMARY:Call\\, intro");
  });

  it("escapes newlines in text fields", () => {
    const ics = generateICSContent(
      makeBaseParams({ description: "Line1\nLine2" }),
    );
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
  });

  it("escapes backslashes in text fields", () => {
    const ics = generateICSContent(
      makeBaseParams({ summary: "Path\\Value" }),
    );
    expect(ics).toContain("SUMMARY:Path\\\\Value");
  });

  it("escapes multiple special characters together", () => {
    const ics = generateICSContent(
      makeBaseParams({
        description: "Hello; world,\nnew\\line",
      }),
    );
    expect(ics).toContain(
      "DESCRIPTION:Hello\\; world\\,\\nnew\\\\line",
    );
  });

  // --- Edge cases ---

  it("handles midnight start time correctly", () => {
    const ics = generateICSContent(
      makeBaseParams({ startTime: new Date("2026-01-01T00:00:00Z") }),
    );
    expect(ics).toContain("DTSTART:20260101T000000Z");
  });

  it("handles end-of-day boundary (duration crossing midnight)", () => {
    const ics = generateICSContent(
      makeBaseParams({
        startTime: new Date("2026-01-01T23:30:00Z"),
        durationMinutes: 60,
      }),
    );
    // 23:30 + 60 min = 00:30 next day
    expect(ics).toContain("DTSTART:20260101T233000Z");
    expect(ics).toContain("DTEND:20260102T003000Z");
  });

  it("handles zero-minute duration", () => {
    const ics = generateICSContent(
      makeBaseParams({ durationMinutes: 0 }),
    );
    // DTSTART == DTEND
    expect(ics).toContain("DTSTART:20260315T140000Z");
    expect(ics).toContain("DTEND:20260315T140000Z");
  });
});

describe("ICS Generation — generateGoogleCalendarURL", () => {
  it("returns a valid Google Calendar URL", () => {
    const url = generateGoogleCalendarURL(makeBaseParams());
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/event\?/);
  });

  it("includes action=TEMPLATE parameter", () => {
    const url = generateGoogleCalendarURL(makeBaseParams());
    const parsed = new URL(url);
    expect(parsed.searchParams.get("action")).toBe("TEMPLATE");
  });

  it("includes the event summary as text parameter", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({ summary: "Discovery Call" }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("text")).toBe("Discovery Call");
  });

  it("formats dates parameter as DTSTART/DTEND", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({
        startTime: new Date("2026-03-15T14:00:00Z"),
        durationMinutes: 30,
      }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dates")).toBe(
      "20260315T140000Z/20260315T143000Z",
    );
  });

  it("includes details parameter when description is provided", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({ description: "Intro meeting" }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("details")).toBe("Intro meeting");
  });

  it("omits details parameter when description is not provided", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({ description: undefined }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.has("details")).toBe(false);
  });

  it("includes location parameter when provided", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({ location: "Zoom" }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("location")).toBe("Zoom");
  });

  it("omits location parameter when not provided", () => {
    const url = generateGoogleCalendarURL(
      makeBaseParams({ location: undefined }),
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.has("location")).toBe(false);
  });
});

describe("ICS Generation — createICSBlob", () => {
  it("returns a Blob with text/calendar MIME type", () => {
    const blob = createICSBlob(makeBaseParams());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/calendar;charset=utf-8");
  });

  it("blob contains valid ICS content", async () => {
    const blob = createICSBlob(makeBaseParams());
    const text = await blob.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
  });
});

// ---------------------------------------------------------------------------
// Part 2: Public API Security — getEventTypeBySlugWithHost
// ---------------------------------------------------------------------------
// We mock the database layer to verify that the storage method returns only
// safe host fields (firstName, lastName, profileImageUrl) and never leaks
// sensitive data (id, email, password, username, emailVerified, etc.).

// Mock the database module used by storage
vi.mock("../db", () => {
  const selectFn = vi.fn();
  const fromFn = vi.fn();
  const whereFn = vi.fn();
  const limitFn = vi.fn();

  // Chainable query builder
  const chain = {
    select: selectFn,
    from: fromFn,
    where: whereFn,
    limit: limitFn,
  };

  selectFn.mockReturnValue(chain);
  fromFn.mockReturnValue(chain);
  whereFn.mockReturnValue(chain);
  limitFn.mockResolvedValue([]);

  return {
    db: {
      select: selectFn,
      // expose internals for per-test overrides
      __chain: chain,
      __limitFn: limitFn,
    },
  };
});

// We need to import after mocking
import { DatabaseStorage } from "../storage";

// Retrieve mock internals
import { db as mockedDb } from "../db";
const { __limitFn: limitFn } = mockedDb as any;

describe("Public API Security — getEventTypeBySlugWithHost", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();

    // Re-wire the mock chain after clearing
    const chain = (mockedDb as any).__chain;
    (mockedDb as any).select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockResolvedValue([]);
  });

  it("returns undefined for a non-existent slug", async () => {
    limitFn.mockResolvedValueOnce([]); // No event type found

    const result = await storage.getEventTypeBySlugWithHost("non-existent-slug");
    expect(result).toBeUndefined();
  });

  it("returns event type with host containing only safe fields", async () => {
    const fakeEventType = {
      id: 1,
      userId: "user-123",
      name: "Discovery Call",
      slug: "discovery-call",
      description: "Intro call",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      color: "#6366f1",
      isActive: true,
      questions: [],
      location: "google-meet",
      logo: null,
      primaryColor: "#ff0000",
      secondaryColor: "#00ff00",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fakeUser = {
      firstName: "Jane",
      lastName: "Smith",
      profileImageUrl: "https://example.com/photo.jpg",
    };

    // First call: event type lookup
    limitFn.mockResolvedValueOnce([fakeEventType]);
    // Second call: user lookup (only safe fields via db.select projection)
    limitFn.mockResolvedValueOnce([fakeUser]);

    const result = await storage.getEventTypeBySlugWithHost("discovery-call");

    expect(result).toBeDefined();
    // Host should contain exactly the safe fields
    expect(result!.host).toEqual({
      firstName: "Jane",
      lastName: "Smith",
      profileImageUrl: "https://example.com/photo.jpg",
      defaultLogo: null,
      defaultPrimaryColor: null,
      defaultSecondaryColor: null,
    });

    // Verify no sensitive fields leak through host
    const hostKeys = Object.keys(result!.host);
    expect(hostKeys).toContain("firstName");
    expect(hostKeys).toContain("lastName");
    expect(hostKeys).toContain("profileImageUrl");
    expect(hostKeys).toContain("defaultLogo");
    expect(hostKeys).toContain("defaultPrimaryColor");
    expect(hostKeys).toContain("defaultSecondaryColor");
    expect(hostKeys).not.toContain("id");
    expect(hostKeys).not.toContain("email");
    expect(hostKeys).not.toContain("password");
    expect(hostKeys).not.toContain("username");
    expect(hostKeys).not.toContain("emailVerified");
    expect(hostKeys).not.toContain("createdAt");
    expect(hostKeys).not.toContain("updatedAt");
    expect(hostKeys).toHaveLength(6);
  });

  it("returns null host fields gracefully when user data is missing", async () => {
    const fakeEventType = {
      id: 2,
      userId: "user-456",
      name: "Quick Chat",
      slug: "quick-chat",
      description: null,
      duration: 15,
      bufferBefore: 0,
      bufferAfter: 0,
      color: "#6366f1",
      isActive: true,
      questions: [],
      location: null,
      logo: null,
      primaryColor: null,
      secondaryColor: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Event type found
    limitFn.mockResolvedValueOnce([fakeEventType]);
    // User not found (orphaned event type)
    limitFn.mockResolvedValueOnce([]);

    const result = await storage.getEventTypeBySlugWithHost("quick-chat");

    expect(result).toBeDefined();
    expect(result!.host).toEqual({
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      defaultLogo: null,
      defaultPrimaryColor: null,
      defaultSecondaryColor: null,
    });
  });

  it("returns null for individual host fields when user has partial data", async () => {
    const fakeEventType = {
      id: 3,
      userId: "user-789",
      name: "Office Hours",
      slug: "office-hours",
      description: null,
      duration: 60,
      bufferBefore: 5,
      bufferAfter: 5,
      color: "#10b981",
      isActive: true,
      questions: ["What topic?"],
      location: null,
      logo: null,
      primaryColor: null,
      secondaryColor: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // User with only firstName set
    const partialUser = {
      firstName: "Alice",
      lastName: null,
      profileImageUrl: null,
    };

    limitFn.mockResolvedValueOnce([fakeEventType]);
    limitFn.mockResolvedValueOnce([partialUser]);

    const result = await storage.getEventTypeBySlugWithHost("office-hours");

    expect(result).toBeDefined();
    expect(result!.host.firstName).toBe("Alice");
    expect(result!.host.lastName).toBeNull();
    expect(result!.host.profileImageUrl).toBeNull();
  });

  it("preserves all event type fields alongside host", async () => {
    const fakeEventType = {
      id: 4,
      userId: "user-abc",
      name: "Branded Meeting",
      slug: "branded-meeting",
      description: "Branded event",
      duration: 45,
      bufferBefore: 10,
      bufferAfter: 10,
      color: "#6366f1",
      isActive: true,
      questions: ["What is your role?"],
      location: "zoom",
      logo: "https://example.com/logo.png",
      primaryColor: "#ff5500",
      secondaryColor: "#003366",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fakeUser = {
      firstName: "Bob",
      lastName: "Jones",
      profileImageUrl: null,
    };

    limitFn.mockResolvedValueOnce([fakeEventType]);
    limitFn.mockResolvedValueOnce([fakeUser]);

    const result = await storage.getEventTypeBySlugWithHost("branded-meeting");

    expect(result).toBeDefined();
    // Event type fields should all be present
    expect(result!.name).toBe("Branded Meeting");
    expect(result!.slug).toBe("branded-meeting");
    expect(result!.duration).toBe(45);
    expect(result!.primaryColor).toBe("#ff5500");
    expect(result!.secondaryColor).toBe("#003366");
    expect(result!.questions).toEqual(["What is your role?"]);
    // Host is attached
    expect(result!.host.firstName).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// Part 3: Timezone Helper — getTimezoneLabel
// ---------------------------------------------------------------------------
// The getTimezoneLabel function and COMMON_TIMEZONES data are defined in
// book.tsx but not exported. We mirror the logic here to validate the contract.
// If the implementation is refactored to a shared module, these tests can
// import directly.

const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Pacific/Midway", label: "Midway Island (UTC-11:00)" },
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10:00)" },
  { value: "America/Anchorage", label: "Alaska (UTC-09:00)" },
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-08:00)" },
  { value: "America/Denver", label: "Mountain Time (UTC-07:00)" },
  { value: "America/Chicago", label: "Central Time (UTC-06:00)" },
  { value: "America/New_York", label: "Eastern Time (UTC-05:00)" },
  { value: "America/Caracas", label: "Venezuela (UTC-04:30)" },
  { value: "America/Halifax", label: "Atlantic Time (UTC-04:00)" },
  { value: "America/St_Johns", label: "Newfoundland (UTC-03:30)" },
  { value: "America/Sao_Paulo", label: "Brasilia (UTC-03:00)" },
  { value: "Atlantic/South_Georgia", label: "Mid-Atlantic (UTC-02:00)" },
  { value: "Atlantic/Azores", label: "Azores (UTC-01:00)" },
  { value: "Europe/London", label: "London (UTC+00:00)" },
  { value: "Europe/Paris", label: "Paris, Berlin (UTC+01:00)" },
  { value: "Europe/Helsinki", label: "Helsinki, Kyiv (UTC+02:00)" },
  { value: "Europe/Moscow", label: "Moscow (UTC+03:00)" },
  { value: "Asia/Tehran", label: "Tehran (UTC+03:30)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+04:00)" },
  { value: "Asia/Kabul", label: "Kabul (UTC+04:30)" },
  { value: "Asia/Karachi", label: "Karachi (UTC+05:00)" },
  { value: "Asia/Kolkata", label: "Mumbai, Kolkata (UTC+05:30)" },
  { value: "Asia/Kathmandu", label: "Kathmandu (UTC+05:45)" },
  { value: "Asia/Dhaka", label: "Dhaka (UTC+06:00)" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+07:00)" },
  { value: "Asia/Shanghai", label: "Beijing, Shanghai (UTC+08:00)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+09:00)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10:00)" },
  { value: "Pacific/Noumea", label: "New Caledonia (UTC+11:00)" },
  { value: "Pacific/Auckland", label: "Auckland (UTC+12:00)" },
];

/** Mirror of getTimezoneLabel from book.tsx */
function getTimezoneLabel(tz: string): string {
  const found = COMMON_TIMEZONES.find((t) => t.value === tz);
  return found ? `${found.label} - ${tz}` : tz.replace(/_/g, " ");
}

describe("Timezone Helper — getTimezoneLabel", () => {
  it("returns correct label for America/New_York", () => {
    const label = getTimezoneLabel("America/New_York");
    expect(label).toBe("Eastern Time (UTC-05:00) - America/New_York");
  });

  it("returns correct label for Europe/London", () => {
    const label = getTimezoneLabel("Europe/London");
    expect(label).toBe("London (UTC+00:00) - Europe/London");
  });

  it("returns correct label for Asia/Tokyo", () => {
    const label = getTimezoneLabel("Asia/Tokyo");
    expect(label).toBe("Tokyo (UTC+09:00) - Asia/Tokyo");
  });

  it("returns correct label for America/Los_Angeles", () => {
    const label = getTimezoneLabel("America/Los_Angeles");
    expect(label).toBe("Pacific Time (UTC-08:00) - America/Los_Angeles");
  });

  it("returns correct label for Pacific/Auckland", () => {
    const label = getTimezoneLabel("Pacific/Auckland");
    expect(label).toBe("Auckland (UTC+12:00) - Pacific/Auckland");
  });

  it("falls back to raw ID with underscores replaced by spaces for unknown timezone", () => {
    const label = getTimezoneLabel("Africa/Johannesburg");
    expect(label).toBe("Africa/Johannesburg");
  });

  it("replaces underscores with spaces in unknown timezone IDs", () => {
    const label = getTimezoneLabel("America/North_Dakota/Center");
    expect(label).toBe("America/North Dakota/Center");
  });

  it("handles timezone with no underscores in unknown ID", () => {
    const label = getTimezoneLabel("UTC");
    expect(label).toBe("UTC");
  });

  it("handles empty string gracefully", () => {
    const label = getTimezoneLabel("");
    expect(label).toBe("");
  });

  it("returns correct labels for all entries in COMMON_TIMEZONES", () => {
    for (const tz of COMMON_TIMEZONES) {
      const label = getTimezoneLabel(tz.value);
      expect(label).toBe(`${tz.label} - ${tz.value}`);
    }
  });
});
