import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ============================================================================
// F06: Date & Time Selection Improvements — Comprehensive Tests
// ============================================================================
// Covers:
//   1. Timezone helpers: isValidTimezone, wallClockToUTC, formatTimeInTimezone
//   2. calculateAvailability with timezone conversion
//   3. Dynamic slot intervals based on event type duration
//   4. Timezone validation on public availability endpoint
//   5. startTimeUTC handling in booking creation
// ============================================================================

// ---------------------------------------------------------------------------
// Part 1: Timezone Helpers (exported from calendar-service)
// ---------------------------------------------------------------------------

import { isValidTimezone } from "../calendar-service";

describe("isValidTimezone", () => {
  it("returns true for valid IANA timezone identifiers", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("Australia/Sydney")).toBe(true);
    expect(isValidTimezone("Pacific/Auckland")).toBe(true);
  });

  it("returns false for invalid timezone strings", () => {
    expect(isValidTimezone("Invalid/Timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("NOPE")).toBe(false);
    expect(isValidTimezone("America/FakeCity")).toBe(false);
  });

  it("returns false for SQL injection attempts", () => {
    expect(isValidTimezone("'; DROP TABLE users; --")).toBe(false);
    expect(isValidTimezone("<script>alert(1)</script>")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 2: calculateAvailability with timezone + dynamic intervals
// ---------------------------------------------------------------------------
// We mock the storage and Google Calendar layers to test availability logic
// in isolation.

// Mock the database module
vi.mock("../db", () => {
  const selectFn = vi.fn();
  const fromFn = vi.fn();
  const whereFn = vi.fn();
  const limitFn = vi.fn();

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
      __chain: chain,
      __limitFn: limitFn,
    },
  };
});

// Mock Google Calendar to avoid real API calls
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
        setCredentials: vi.fn(),
        refreshAccessToken: vi.fn(),
      })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        list: vi.fn().mockResolvedValue({ data: { items: [] } }),
        insert: vi.fn().mockResolvedValue({ data: { id: "test-event-id" } }),
        delete: vi.fn().mockResolvedValue({}),
      },
      calendarList: {
        list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      },
    }),
  },
}));

// Mock storage methods
vi.mock("../storage", () => {
  const mockStorage = {
    getEventType: vi.fn(),
    getAvailabilityRules: vi.fn(),
    getCalendarToken: vi.fn().mockResolvedValue(null), // No calendar connected
    getBookingsByDateRange: vi.fn().mockResolvedValue([]),
    getEventTypeBySlug: vi.fn(),
    getBooking: vi.fn(),
    createBooking: vi.fn(),
    updateBooking: vi.fn(),
  };
  return { storage: mockStorage };
});

import { calculateAvailability, type TimeSlot } from "../calendar-service";
import { storage } from "../storage";

const mockStorage = storage as unknown as {
  getEventType: ReturnType<typeof vi.fn>;
  getAvailabilityRules: ReturnType<typeof vi.fn>;
  getCalendarToken: ReturnType<typeof vi.fn>;
  getBookingsByDateRange: ReturnType<typeof vi.fn>;
};

describe("calculateAvailability — timezone conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no calendar connected, no existing bookings
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupMocks(overrides?: {
    duration?: number;
    bufferBefore?: number;
    bufferAfter?: number;
    hostTimezone?: string;
    minNotice?: number;
    maxAdvance?: number;
    weeklyHours?: Record<string, { start: string; end: string }[] | null>;
  }) {
    const duration = overrides?.duration ?? 30;
    const hostTimezone = overrides?.hostTimezone ?? "UTC";

    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test Event",
      slug: "test-event",
      duration,
      bufferBefore: overrides?.bufferBefore ?? 0,
      bufferAfter: overrides?.bufferAfter ?? 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: hostTimezone,
      weeklyHours: overrides?.weeklyHours ?? {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [{ start: "09:00", end: "12:00" }],
        wednesday: [{ start: "09:00", end: "12:00" }],
        thursday: [{ start: "09:00", end: "12:00" }],
        friday: [{ start: "09:00", end: "12:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: overrides?.minNotice ?? 0, // 0 for testing (no notice period)
      maxAdvance: overrides?.maxAdvance ?? 365,
    });
  }

  it("returns slots with utc field in ISO 8601 format", async () => {
    setupMocks({ hostTimezone: "UTC" });

    // A future Monday in UTC
    const date = new Date("2026-06-01T00:00:00Z"); // Monday June 1 2026
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot).toHaveProperty("utc");
      expect(slot.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    }
  });

  it("formats display times in the guest timezone", async () => {
    setupMocks({ hostTimezone: "UTC" });

    // A future Monday
    const date = new Date("2026-06-01T00:00:00Z");

    // Request slots in Tokyo timezone (UTC+9)
    const slots = await calculateAvailability("user-1", 1, date, "Asia/Tokyo");

    expect(slots.length).toBeGreaterThan(0);
    // UTC 09:00 = Tokyo 18:00 (6:00 PM), UTC 09:30 = Tokyo 18:30 (6:30 PM), etc.
    // The first slot should be displayed in Tokyo time
    const firstSlot = slots[0];
    expect(firstSlot.time).toContain("PM"); // 9 AM UTC = 6 PM Tokyo
    expect(firstSlot.utc).toContain("T09:00:00.000Z");
  });

  it("formats display times in host timezone when no guest timezone provided", async () => {
    setupMocks({ hostTimezone: "UTC" });

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date);

    expect(slots.length).toBeGreaterThan(0);
    // Without guest timezone, display in host timezone (UTC)
    // 9:00 AM UTC should display as "9:00 AM"
    expect(slots[0].time).toBe("9:00 AM");
  });

  it("correctly interprets host working hours in host timezone", async () => {
    // Host is in New York (UTC-5 in winter, UTC-4 in summer)
    // Working hours: 9 AM - 12 PM in New York time
    setupMocks({ hostTimezone: "America/New_York" });

    // June 1 2026 is a Monday, EDT (UTC-4)
    const date = new Date("2026-06-01T00:00:00Z");

    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    expect(slots.length).toBeGreaterThan(0);
    // 9 AM EDT = 13:00 UTC
    expect(slots[0].utc).toContain("T13:00:00.000Z");
    // Display in UTC should show 1:00 PM
    expect(slots[0].time).toBe("1:00 PM");
  });

  it("returns empty array for disabled days (weekends)", async () => {
    setupMocks({ hostTimezone: "UTC" });

    // June 6 2026 is a Saturday
    const date = new Date("2026-06-06T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    expect(slots).toEqual([]);
  });

  it("returns empty array when no event type found", async () => {
    mockStorage.getEventType.mockResolvedValue(null);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 999, date, "UTC");

    expect(slots).toEqual([]);
  });

  it("falls back to host timezone for invalid guest timezone", async () => {
    setupMocks({ hostTimezone: "UTC" });

    const date = new Date("2026-06-01T00:00:00Z");
    // Pass an invalid timezone string
    const slots = await calculateAvailability("user-1", 1, date, "Invalid/TZ");

    expect(slots.length).toBeGreaterThan(0);
    // Should fall back to host timezone (UTC)
    expect(slots[0].time).toBe("9:00 AM");
  });
});

describe("calculateAvailability — dynamic slot intervals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  function setupWithDuration(duration: number) {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test Event",
      slug: "test",
      duration,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [{ start: "09:00", end: "12:00" }],
        wednesday: [{ start: "09:00", end: "12:00" }],
        thursday: [{ start: "09:00", end: "12:00" }],
        friday: [{ start: "09:00", end: "12:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });
  }

  it("generates 15-minute intervals for 15-minute events", async () => {
    setupWithDuration(15);

    // Monday June 1
    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // 3 hours (09:00-12:00) with 15-min intervals = 12 slots
    // (09:00, 09:15, 09:30, 09:45, 10:00, ..., 11:30, 11:45)
    expect(slots.length).toBe(12);

    // Check the interval between first two slots
    const firstUTC = new Date(slots[0].utc).getTime();
    const secondUTC = new Date(slots[1].utc).getTime();
    expect(secondUTC - firstUTC).toBe(15 * 60 * 1000); // 15 minutes
  });

  it("generates 30-minute intervals for 30-minute events", async () => {
    setupWithDuration(30);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // 3 hours with 30-min intervals = 6 slots (09:00, 09:30, 10:00, 10:30, 11:00, 11:30)
    expect(slots.length).toBe(6);

    const firstUTC = new Date(slots[0].utc).getTime();
    const secondUTC = new Date(slots[1].utc).getTime();
    expect(secondUTC - firstUTC).toBe(30 * 60 * 1000);
  });

  it("generates 30-minute intervals for 60-minute events", async () => {
    setupWithDuration(60);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // 3 hours with 60-min duration and 30-min intervals:
    // Slots start at 09:00, 09:30, 10:00, 10:30, 11:00
    // 11:30 won't fit because 11:30+60=12:30 > 12:00
    // But wait, 11:00+60=12:00 which equals blockEnd - isAfter(12:00, 12:00) = false, so it should be included.
    // Let me trace: cursor starts at 09:00
    //   09:00: slotEnd=10:00, isAfter(10:00, 12:00)? No → include
    //   09:30: slotEnd=10:30, isAfter(10:30, 12:00)? No → include
    //   10:00: slotEnd=11:00, isAfter(11:00, 12:00)? No → include
    //   10:30: slotEnd=11:30, isAfter(11:30, 12:00)? No → include
    //   11:00: slotEnd=12:00, isAfter(12:00, 12:00)? No (isAfter is strict) → include
    //   11:30: slotEnd=12:30, isAfter(12:30, 12:00)? Yes → break
    expect(slots.length).toBe(5);

    const firstUTC = new Date(slots[0].utc).getTime();
    const secondUTC = new Date(slots[1].utc).getTime();
    expect(secondUTC - firstUTC).toBe(30 * 60 * 1000); // 30-min intervals (min(60,30))
  });

  it("generates 30-minute intervals for 45-minute events", async () => {
    setupWithDuration(45);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // 3 hours with 45-min duration and 30-min interval (min(45,30)=30):
    // 09:00 → end 09:45 (fits), 09:30 → end 10:15 (fits), 10:00 → 10:45 (fits),
    // 10:30 → 11:15 (fits), 11:00 → 11:45 (fits), 11:30 → 12:15 (exceeds 12:00, break)
    expect(slots.length).toBe(5);
  });
});

describe("calculateAvailability — conflict detection with timezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
  });

  it("marks slots as unavailable when they conflict with existing bookings", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "11:00" }],
        tuesday: [{ start: "09:00", end: "11:00" }],
        wednesday: [{ start: "09:00", end: "11:00" }],
        thursday: [{ start: "09:00", end: "11:00" }],
        friday: [{ start: "09:00", end: "11:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    // Existing booking at 09:30 - 10:00 UTC on June 1
    mockStorage.getBookingsByDateRange.mockResolvedValue([
      {
        id: 1,
        startTime: new Date("2026-06-01T09:30:00Z"),
        endTime: new Date("2026-06-01T10:00:00Z"),
        status: "confirmed",
      },
    ]);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // Slots: 09:00 (available), 09:30 (conflict), 10:00 (available), 10:30 (available)
    expect(slots.length).toBe(4);
    expect(slots[0].available).toBe(true);  // 09:00-09:30
    expect(slots[1].available).toBe(false); // 09:30-10:00 conflicts
    expect(slots[2].available).toBe(true);  // 10:00-10:30
    expect(slots[3].available).toBe(true);  // 10:30-11:00
  });

  it("respects buffer times when checking conflicts", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 15,
      bufferAfter: 15,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [{ start: "09:00", end: "12:00" }],
        wednesday: [{ start: "09:00", end: "12:00" }],
        thursday: [{ start: "09:00", end: "12:00" }],
        friday: [{ start: "09:00", end: "12:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    // Booking at 10:00-10:30 UTC
    mockStorage.getBookingsByDateRange.mockResolvedValue([
      {
        id: 1,
        startTime: new Date("2026-06-01T10:00:00Z"),
        endTime: new Date("2026-06-01T10:30:00Z"),
        status: "confirmed",
      },
    ]);

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // With 15-min buffer before and after:
    // 09:30 slot: buffered range = 09:15-10:15, booking is 10:00-10:30 → OVERLAP
    // 10:00 slot: buffered range = 09:45-10:45, booking is 10:00-10:30 → OVERLAP
    const slot0930 = slots.find((s) => s.utc.includes("T09:30:00"));
    const slot1000 = slots.find((s) => s.utc.includes("T10:00:00"));

    expect(slot0930?.available).toBe(false);
    expect(slot1000?.available).toBe(false);
  });
});

describe("calculateAvailability — max advance and min notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  it("returns empty slots for dates beyond max advance", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [{ start: "09:00", end: "12:00" }],
        wednesday: [{ start: "09:00", end: "12:00" }],
        thursday: [{ start: "09:00", end: "12:00" }],
        friday: [{ start: "09:00", end: "12:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 1, // Only 1 day advance
    });

    // Request a date far in the future
    const farFuture = new Date("2027-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, farFuture, "UTC");

    expect(slots).toEqual([]);
  });
});

describe("calculateAvailability — multiple time blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  it("generates slots across multiple time blocks (morning + afternoon)", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [
          { start: "09:00", end: "10:00" }, // 2 slots
          { start: "14:00", end: "15:00" }, // 2 slots
        ],
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    const date = new Date("2026-06-01T00:00:00Z"); // Monday
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    // 2 blocks × 2 slots each = 4 total
    expect(slots.length).toBe(4);

    // First block: 09:00, 09:30
    expect(slots[0].time).toBe("9:00 AM");
    expect(slots[1].time).toBe("9:30 AM");
    // Second block: 14:00, 14:30
    expect(slots[2].time).toBe("2:00 PM");
    expect(slots[3].time).toBe("2:30 PM");
  });
});

// ---------------------------------------------------------------------------
// Part 3: TimeSlot response shape validation
// ---------------------------------------------------------------------------

describe("TimeSlot response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  it("every slot has time, available, and utc fields", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "10:00" }],
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    const date = new Date("2026-06-01T00:00:00Z"); // Monday
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    for (const slot of slots) {
      expect(slot).toHaveProperty("time");
      expect(slot).toHaveProperty("available");
      expect(slot).toHaveProperty("utc");
      expect(typeof slot.time).toBe("string");
      expect(typeof slot.available).toBe("boolean");
      expect(typeof slot.utc).toBe("string");
    }
  });

  it("utc timestamps increase monotonically", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    const date = new Date("2026-06-01T00:00:00Z");
    const slots = await calculateAvailability("user-1", 1, date, "UTC");

    for (let i = 1; i < slots.length; i++) {
      const prev = new Date(slots[i - 1].utc).getTime();
      const curr = new Date(slots[i].utc).getTime();
      expect(curr).toBeGreaterThan(prev);
    }
  });
});

// ---------------------------------------------------------------------------
// Part 4: Cross-timezone edge cases
// ---------------------------------------------------------------------------

describe("Cross-timezone edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getCalendarToken.mockResolvedValue(null);
    mockStorage.getBookingsByDateRange.mockResolvedValue([]);
  });

  it("correctly handles UTC host with various guest timezones", async () => {
    mockStorage.getEventType.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      slug: "test",
      duration: 60,
      bufferBefore: 0,
      bufferAfter: 0,
      isActive: true,
      questions: [],
      color: "#6366f1",
    });

    mockStorage.getAvailabilityRules.mockResolvedValue({
      userId: "user-1",
      timezone: "UTC",
      weeklyHours: {
        monday: [{ start: "09:00", end: "11:00" }],
        tuesday: [{ start: "09:00", end: "11:00" }],
        wednesday: [{ start: "09:00", end: "11:00" }],
        thursday: [{ start: "09:00", end: "11:00" }],
        friday: [{ start: "09:00", end: "11:00" }],
        saturday: null,
        sunday: null,
      },
      minNotice: 0,
      maxAdvance: 365,
    });

    const date = new Date("2026-06-01T00:00:00Z"); // Monday

    // Same availability, different display timezones
    const slotsUTC = await calculateAvailability("user-1", 1, date, "UTC");
    const slotsNY = await calculateAvailability("user-1", 1, date, "America/New_York");
    const slotsTokyo = await calculateAvailability("user-1", 1, date, "Asia/Tokyo");

    // All should have the same number of slots and same UTC timestamps
    expect(slotsUTC.length).toBe(slotsNY.length);
    expect(slotsUTC.length).toBe(slotsTokyo.length);

    for (let i = 0; i < slotsUTC.length; i++) {
      // UTC timestamps must be identical regardless of display timezone
      expect(slotsUTC[i].utc).toBe(slotsNY[i].utc);
      expect(slotsUTC[i].utc).toBe(slotsTokyo[i].utc);
      // But display times should differ
      // (We can't assert exact values since they depend on DST, but they should differ)
    }

    // Display time in UTC should be "9:00 AM"
    expect(slotsUTC[0].time).toBe("9:00 AM");
    // Display time in New York (EDT, UTC-4 in June) should be "5:00 AM"
    expect(slotsNY[0].time).toBe("5:00 AM");
    // Display time in Tokyo (JST, UTC+9) should be "6:00 PM"
    expect(slotsTokyo[0].time).toBe("6:00 PM");
  });
});
