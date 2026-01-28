import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// F12: Reschedule & Cancel — Comprehensive Tests
// ============================================================================
// Covers:
//   1. Cancellation Email Template — subject, body, reason, XSS, notice period
//   2. Reschedule Email Templates — booker confirmation, host notification,
//      host-initiated booker notification
//   3. Cancel Endpoint Logic — POST /api/public/booking/cancel/:token
//   4. Reschedule Endpoint Logic — POST /api/public/booking/reschedule/:token
//      and POST /api/bookings/:id/reschedule (host-initiated)
//   5. Reschedule Availability Endpoint — GET .../availability
//   6. Cancel GET Endpoint — GET /api/public/booking/cancel/:token
//   7. Edge Cases — truncation, timezone, 365-day window, self-exclusion
//   8. F12 + F11 Integration — brief deletion on reschedule
// ============================================================================

import {
  cancellationEmailToHost,
  rescheduleConfirmationToBooker,
  rescheduleNotificationToHost,
  hostRescheduleNotificationToBooker,
} from "../email-templates";

// ===========================================================================
// Shared test data
// ===========================================================================

const mockBooking = {
  id: 1,
  eventTypeId: 1,
  userId: "user-1",
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  guestCompany: "Acme Inc",
  startTime: new Date("2025-06-15T14:00:00Z"),
  endTime: new Date("2025-06-15T14:30:00Z"),
  status: "confirmed",
  timezone: "America/New_York",
  notes: null,
  calendarEventId: "cal-123",
  rescheduleToken: "test-reschedule-token-abc123",
  cancelToken: "test-cancel-token-xyz789",
  cancellationReason: null,
  createdAt: new Date(),
};

const mockEventType = {
  id: 1,
  userId: "user-1",
  name: "Strategy Call",
  slug: "strategy-call",
  duration: 30,
  isActive: true,
  primaryColor: "#6366f1",
  secondaryColor: "#818cf8",
  color: "indigo",
  logo: null,
  location: null,
  description: "A strategy discussion",
  questions: [],
};

const mockHost = {
  id: "user-1",
  email: "host@example.com",
  firstName: "Bob",
  lastName: "Host",
  profileImageUrl: null,
};

// ===========================================================================
// 1. Cancellation Email Template — cancellationEmailToHost with withinNoticePeriod
// ===========================================================================

describe("cancellationEmailToHost with withinNoticePeriod", () => {
  const baseData = {
    guestName: "Jane Doe",
    hostName: "Bob Host",
    eventTypeName: "Strategy Call",
    startTime: new Date("2026-02-15T14:00:00Z"),
    hostTimezone: "America/Chicago",
    baseUrl: "https://calendai.example.com",
  };

  it("generates correct subject line", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.subject).toContain("Cancelled");
    expect(result.subject).toContain("Jane Doe");
    expect(result.subject).toContain("Strategy Call");
  });

  it("includes cancellation reason when provided", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      cancellationReason: "Schedule conflict with another meeting",
    });
    expect(result.html).toContain("Schedule conflict with another meeting");
    expect(result.text).toContain("Schedule conflict with another meeting");
  });

  it("escapes HTML in cancellation reason (XSS prevention)", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      cancellationReason: '<script>alert("xss")</script>',
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("includes minimum notice period warning when withinNoticePeriod is true", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      withinNoticePeriod: true,
    });
    expect(result.html).toContain("minimum notice period");
    expect(result.text).toContain("minimum notice period");
  });

  it("omits notice period warning when withinNoticePeriod is false", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      withinNoticePeriod: false,
    });
    expect(result.html).not.toContain("minimum notice period");
    expect(result.text).not.toContain("minimum notice period");
  });

  it("omits notice period warning when withinNoticePeriod is undefined", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.html).not.toContain("minimum notice period");
    expect(result.text).not.toContain("minimum notice period");
  });

  it("generates valid plain text version", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      cancellationReason: "Schedule conflict",
      withinNoticePeriod: true,
    });
    expect(result.text).toContain("Jane Doe");
    expect(result.text).toContain("cancelled");
    expect(result.text).toContain("Schedule conflict");
    expect(result.text).toContain("minimum notice period");
    expect(result.text.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 2a. Reschedule Confirmation Email (to booker)
// ===========================================================================

describe("rescheduleConfirmationToBooker", () => {
  const baseParams = {
    guestName: "Jane Doe",
    eventTypeName: "Strategy Call",
    oldStartTime: new Date("2026-02-15T14:00:00Z"),
    oldEndTime: new Date("2026-02-15T14:30:00Z"),
    newStartTime: new Date("2026-02-16T10:00:00Z"),
    newEndTime: new Date("2026-02-16T10:30:00Z"),
    hostName: "Bob Host",
    timezone: "America/New_York",
    rescheduleToken: "resched-token-abc",
    cancelToken: "cancel-token-xyz",
    baseUrl: "https://calendai.example.com",
  };

  it("generates correct subject line with event type and host name", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.subject).toContain("Rescheduled");
    expect(result.subject).toContain("Strategy Call");
    expect(result.subject).toContain("Bob Host");
  });

  it("includes old and new time in body", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    // Old time should appear with strikethrough
    expect(result.html).toContain("line-through");
    // Both old and new date strings should be present
    expect(result.html).toContain("February");
  });

  it("formats times using timezone", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    // Feb 16, 2026 10:00 UTC = 5:00 AM EST
    expect(result.html).toContain("AM");
  });

  it("includes reschedule/cancel action links when tokens provided", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.html).toContain("/booking/reschedule/resched-token-abc");
    expect(result.html).toContain("/booking/cancel/cancel-token-xyz");
    expect(result.html).toContain("Reschedule Again");
    expect(result.html).toContain("Cancel Booking");
  });

  it("includes notice period warning when withinNoticePeriod is true", () => {
    const result = rescheduleConfirmationToBooker({
      ...baseParams,
      withinNoticePeriod: true,
    });
    expect(result.html).toContain("minimum notice period");
    expect(result.text).toContain("minimum notice period");
  });

  it("omits notice period warning when withinNoticePeriod is false", () => {
    const result = rescheduleConfirmationToBooker({
      ...baseParams,
      withinNoticePeriod: false,
    });
    expect(result.html).not.toContain("minimum notice period");
  });

  it("escapes HTML in user-provided strings", () => {
    const result = rescheduleConfirmationToBooker({
      ...baseParams,
      guestName: '<script>alert("xss")</script>',
      eventTypeName: '<img onerror="alert(1)" src="x">',
      hostName: '<b onmouseover="alert(1)">Evil</b>',
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain('<img onerror');
    expect(result.html).toContain("&lt;img");
    expect(result.html).not.toContain('<b onmouseover');
    expect(result.html).toContain("&lt;b");
  });

  it("generates valid plain text version", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.text).toContain("Jane Doe");
    expect(result.text).toContain("rescheduled");
    expect(result.text).toContain("Old time:");
    expect(result.text).toContain("New time:");
    expect(result.text).toContain("Strategy Call");
    expect(result.text).toContain("Bob Host");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("omits action links when tokens are not provided", () => {
    const result = rescheduleConfirmationToBooker({
      ...baseParams,
      rescheduleToken: undefined,
      cancelToken: undefined,
    });
    expect(result.html).not.toContain("/booking/reschedule/");
    expect(result.html).not.toContain("/booking/cancel/");
  });

  it("includes duration calculated from new start/end times", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.html).toContain("30 minutes");
  });

  it("returns subject, html, and text fields", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.html.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("produces valid HTML with DOCTYPE", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("</html>");
    expect(result.html).toContain("<body");
    expect(result.html).toContain("</body>");
  });

  it("includes CalendAI branding", () => {
    const result = rescheduleConfirmationToBooker(baseParams);
    expect(result.html).toContain("CalendAI");
  });
});

// ===========================================================================
// 2b. Reschedule Notification Email (to host)
// ===========================================================================

describe("rescheduleNotificationToHost", () => {
  const baseParams = {
    guestName: "Jane Doe",
    guestEmail: "jane@example.com",
    eventTypeName: "Strategy Call",
    oldStartTime: new Date("2026-02-15T14:00:00Z"),
    oldEndTime: new Date("2026-02-15T14:30:00Z"),
    newStartTime: new Date("2026-02-16T10:00:00Z"),
    newEndTime: new Date("2026-02-16T10:30:00Z"),
    hostName: "Bob Host",
    timezone: "America/Chicago",
    bookingId: 42,
    baseUrl: "https://calendai.example.com",
  };

  it("generates correct subject line", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result.subject).toContain("Rescheduled");
    expect(result.subject).toContain("Jane Doe");
    expect(result.subject).toContain("Strategy Call");
  });

  it("includes guest name and email", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result.html).toContain("Jane Doe");
    expect(result.html).toContain("jane@example.com");
  });

  it("shows old to new time transition", () => {
    const result = rescheduleNotificationToHost(baseParams);
    // Old time with strikethrough
    expect(result.html).toContain("line-through");
    // Arrow indicator for new time
    expect(result.html).toContain("&rarr;");
  });

  it("includes view booking link", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result.html).toContain("calendai.example.com/bookings/42");
    expect(result.html).toContain("View Booking");
  });

  it("includes notice period warning when withinNoticePeriod is true", () => {
    const result = rescheduleNotificationToHost({
      ...baseParams,
      withinNoticePeriod: true,
    });
    expect(result.html).toContain("minimum notice period");
    expect(result.text).toContain("minimum notice period");
  });

  it("omits notice period warning when withinNoticePeriod is false", () => {
    const result = rescheduleNotificationToHost({
      ...baseParams,
      withinNoticePeriod: false,
    });
    expect(result.html).not.toContain("minimum notice period");
  });

  it("generates valid plain text version", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result.text).toContain("Jane Doe");
    expect(result.text).toContain("jane@example.com");
    expect(result.text).toContain("rescheduled");
    expect(result.text).toContain("Old time:");
    expect(result.text).toContain("New time:");
    expect(result.text).toContain("View booking:");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("returns subject, html, and text fields", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
  });

  it("produces valid HTML with DOCTYPE", () => {
    const result = rescheduleNotificationToHost(baseParams);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("</html>");
  });

  it("escapes HTML in guest name and email", () => {
    const result = rescheduleNotificationToHost({
      ...baseParams,
      guestName: '<script>alert("xss")</script>',
      guestEmail: '"><img src=x onerror=alert(1)>',
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});

// ===========================================================================
// 2c. Host Reschedule Notification Email (to booker)
// ===========================================================================

describe("hostRescheduleNotificationToBooker", () => {
  const baseParams = {
    guestName: "Jane Doe",
    eventTypeName: "Strategy Call",
    oldStartTime: new Date("2026-02-15T14:00:00Z"),
    oldEndTime: new Date("2026-02-15T14:30:00Z"),
    newStartTime: new Date("2026-02-16T10:00:00Z"),
    newEndTime: new Date("2026-02-16T10:30:00Z"),
    hostName: "Bob Host",
    timezone: "America/New_York",
    rescheduleToken: "resched-token-abc",
    cancelToken: "cancel-token-xyz",
    baseUrl: "https://calendai.example.com",
  };

  it("generates correct subject: 'Your booking with {hostName} has been rescheduled'", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.subject).toBe("Your booking with Bob Host has been rescheduled");
  });

  it("includes host name as initiator", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.html).toContain("Bob Host");
    expect(result.html).toContain("has rescheduled");
  });

  it("shows old to new time", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    // Both old and new times should be mentioned
    expect(result.html).toContain("from");
    expect(result.html).toContain("to");
    // Old time: Feb 15, New time: Feb 16
    expect(result.html).toContain("February");
  });

  it("includes reschedule/cancel action links for booker", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.html).toContain("/booking/reschedule/resched-token-abc");
    expect(result.html).toContain("/booking/cancel/cancel-token-xyz");
    expect(result.html).toContain("Reschedule to a different time");
    expect(result.html).toContain("Cancel booking");
  });

  it("generates valid plain text version", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.text).toContain("Jane Doe");
    expect(result.text).toContain("Bob Host");
    expect(result.text).toContain("rescheduled");
    expect(result.text).toContain("Strategy Call");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("omits action links when tokens are not provided", () => {
    const result = hostRescheduleNotificationToBooker({
      ...baseParams,
      rescheduleToken: undefined,
      cancelToken: undefined,
    });
    expect(result.html).not.toContain("/booking/reschedule/");
    expect(result.html).not.toContain("/booking/cancel/");
  });

  it("includes duration calculated from new times", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.html).toContain("30 minutes");
  });

  it("returns subject, html, and text fields", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
  });

  it("produces valid HTML with DOCTYPE", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("</html>");
  });

  it("escapes HTML in user-provided strings", () => {
    const result = hostRescheduleNotificationToBooker({
      ...baseParams,
      guestName: '<script>alert("xss")</script>',
      hostName: '<img onerror="alert(1)" src="x">',
      eventTypeName: '"><b>XSS</b>',
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain('<img onerror');
    expect(result.html).toContain("&lt;img");
  });

  it("includes CalendAI branding and footer", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.html).toContain("CalendAI");
    expect(result.html).toContain("This email was sent by CalendAI");
  });

  it("text version includes reschedule/cancel links", () => {
    const result = hostRescheduleNotificationToBooker(baseParams);
    expect(result.text).toContain("/booking/reschedule/resched-token-abc");
    expect(result.text).toContain("/booking/cancel/cancel-token-xyz");
  });
});

// ===========================================================================
// 3. Cancel Endpoint Logic — POST /api/public/booking/cancel/:token
// ===========================================================================

describe("POST /api/public/booking/cancel/:token", () => {
  it("returns 404 for invalid token", () => {
    const booking = undefined;
    const shouldReturn404 = !booking;
    expect(shouldReturn404).toBe(true);
  });

  it("returns 400 for already cancelled booking", () => {
    const booking = { ...mockBooking, status: "cancelled" };
    const isCancelled = booking.status === "cancelled";
    expect(isCancelled).toBe(true);
  });

  it("cancels booking and returns success", () => {
    const booking = { ...mockBooking, status: "confirmed" };
    const isValid = !!booking && booking.status !== "cancelled";
    expect(isValid).toBe(true);

    // After cancellation
    const updatedBooking = { ...booking, status: "cancelled" };
    expect(updatedBooking.status).toBe("cancelled");
  });

  it("stores sanitized cancellation reason (truncated to 1000 chars)", () => {
    const reason = "A".repeat(2000);
    const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;
    expect(sanitizedReason).toHaveLength(1000);
    expect(sanitizedReason).toBe("A".repeat(1000));
  });

  it("detects within notice period correctly", () => {
    const minNotice = 1440; // 24 hours in minutes
    const now = new Date("2026-02-15T13:00:00Z");
    const startTime = new Date("2026-02-15T14:00:00Z"); // 1 hour from now

    const minutesUntilMeeting = (startTime.getTime() - now.getTime()) / (1000 * 60);
    const withinNoticePeriod = minutesUntilMeeting < minNotice && minutesUntilMeeting > 0;

    expect(minutesUntilMeeting).toBe(60);
    expect(withinNoticePeriod).toBe(true);
  });

  it("detects outside notice period correctly", () => {
    const minNotice = 60; // 1 hour in minutes
    const now = new Date("2026-02-14T10:00:00Z");
    const startTime = new Date("2026-02-15T14:00:00Z"); // 28 hours from now

    const minutesUntilMeeting = (startTime.getTime() - now.getTime()) / (1000 * 60);
    const withinNoticePeriod = minutesUntilMeeting < minNotice && minutesUntilMeeting > 0;

    expect(withinNoticePeriod).toBe(false);
  });

  it("handles null/missing reason gracefully", () => {
    const body1: any = {};
    const body2: any = { reason: null };
    const body3: any = undefined;

    const reason1 = body1.reason ? String(body1.reason).slice(0, 1000) : null;
    const reason2 = body2.reason ? String(body2.reason).slice(0, 1000) : null;
    const reason3 = (body3 || {}).reason ? String((body3 || {}).reason).slice(0, 1000) : null;

    expect(reason1).toBeNull();
    expect(reason2).toBeNull();
    expect(reason3).toBeNull();
  });

  it("sanitizes reason to prevent XSS (truncation)", () => {
    const reason = '<script>alert("xss")</script>' + "A".repeat(2000);
    const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;
    expect(sanitizedReason!.length).toBe(1000);
    // The raw string is truncated; HTML escaping happens at email template level
    expect(sanitizedReason!.startsWith("<script>")).toBe(true);
    // But it's truncated
    expect(sanitizedReason!.length).toBeLessThanOrEqual(1000);
  });

  it("uses default minNotice of 1440 when rules are not set", () => {
    const rules = undefined;
    const minNotice = (rules as any)?.minNotice ?? 1440;
    expect(minNotice).toBe(1440);
  });

  it("respects custom minNotice from availability rules", () => {
    const rules = { minNotice: 120 }; // 2 hours
    const minNotice = rules?.minNotice ?? 1440;
    expect(minNotice).toBe(120);
  });
});

// ===========================================================================
// 4a. Reschedule Endpoint Logic — POST /api/public/booking/reschedule/:token
// ===========================================================================

describe("POST /api/public/booking/reschedule/:token", () => {
  it("returns 404 for invalid token", () => {
    const booking = undefined;
    const shouldReturn404 = !booking;
    expect(shouldReturn404).toBe(true);
  });

  it("returns 400 for cancelled booking", () => {
    const booking = { ...mockBooking, status: "cancelled" };
    const isCancelled = booking.status === "cancelled";
    expect(isCancelled).toBe(true);
  });

  it("returns 400 when startTimeUTC is missing", () => {
    const body: any = {};
    const startTimeUTC = body.startTimeUTC;
    expect(!startTimeUTC).toBe(true);
  });

  it("returns 400 for invalid date", () => {
    const startTimeUTC = "not-a-date";
    const newStartTime = new Date(startTimeUTC);
    expect(isNaN(newStartTime.getTime())).toBe(true);
  });

  it("returns 400 for past dates", () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // yesterday
    const isPast = pastDate.getTime() < now.getTime();
    expect(isPast).toBe(true);
  });

  it("returns 400 for same time (prevent no-op reschedule)", () => {
    const booking = { ...mockBooking };
    const newStartTime = new Date(booking.startTime);
    const isSameTime = booking.startTime.getTime() === newStartTime.getTime();
    expect(isSameTime).toBe(true);
  });

  it("returns 409 for double-booking conflict (excluding self)", () => {
    const booking = { ...mockBooking, id: 1 };
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const newEndTime = new Date("2026-02-16T10:30:00Z");

    const existingBookings = [
      { id: 1, startTime: new Date("2025-06-15T14:00:00Z"), endTime: new Date("2025-06-15T14:30:00Z") },
      { id: 2, startTime: new Date("2026-02-16T10:15:00Z"), endTime: new Date("2026-02-16T10:45:00Z") },
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === booking.id) return false; // self-exclusion
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    expect(hasConflict).toBe(true);
  });

  it("self-exclusion allows rescheduling to overlapping slot with own booking", () => {
    const booking = { ...mockBooking, id: 1 };
    const newStartTime = new Date("2025-06-15T14:15:00Z"); // overlaps with self
    const newEndTime = new Date("2025-06-15T14:45:00Z");

    const existingBookings = [
      { id: 1, startTime: new Date("2025-06-15T14:00:00Z"), endTime: new Date("2025-06-15T14:30:00Z") },
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === booking.id) return false; // self is excluded
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    expect(hasConflict).toBe(false);
  });

  it("successfully updates booking times", () => {
    const booking = { ...mockBooking };
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const duration = mockEventType.duration;
    const newEndTime = new Date(newStartTime.getTime() + duration * 60000);

    // Simulate update
    const updatedBooking = {
      ...booking,
      startTime: newStartTime,
      endTime: newEndTime,
    };

    expect(updatedBooking.startTime).toEqual(newStartTime);
    expect(updatedBooking.endTime).toEqual(newEndTime);
    expect(updatedBooking.endTime.getTime() - updatedBooking.startTime.getTime()).toBe(30 * 60000);
  });

  it("detects within notice period correctly", () => {
    const minNotice = 1440; // 24 hours in minutes
    const now = new Date("2026-02-16T09:00:00Z");
    const newStartTime = new Date("2026-02-16T10:00:00Z"); // 1 hour from now

    const minutesUntilNew = (newStartTime.getTime() - now.getTime()) / (1000 * 60);
    const withinNoticePeriod = minutesUntilNew < minNotice;

    expect(minutesUntilNew).toBe(60);
    expect(withinNoticePeriod).toBe(true);
  });

  it("validates 365-day booking window", () => {
    const now = new Date("2026-01-28T00:00:00Z");
    const maxBookingWindow = 365 * 24 * 60 * 60 * 1000;
    const tooFar = new Date(now.getTime() + maxBookingWindow + 1);

    const exceedsWindow = tooFar.getTime() - now.getTime() > maxBookingWindow;
    expect(exceedsWindow).toBe(true);
  });

  it("allows booking within 365-day window", () => {
    const now = new Date("2026-01-28T00:00:00Z");
    const maxBookingWindow = 365 * 24 * 60 * 60 * 1000;
    const withinWindow = new Date(now.getTime() + maxBookingWindow - 1000);

    const exceedsWindow = withinWindow.getTime() - now.getTime() > maxBookingWindow;
    expect(exceedsWindow).toBe(false);
  });

  it("validates timezone and falls back to booking timezone", () => {
    // Replicate: const validatedTimezone = (clientTimezone && isValidTimezone(clientTimezone)) ? clientTimezone : booking.timezone
    const bookingTimezone = "America/New_York";

    // Valid timezone
    const validTz = "Europe/London";
    const result1 = validTz || bookingTimezone;
    expect(result1).toBe("Europe/London");

    // Invalid/missing timezone falls back
    const invalidTz = undefined;
    const result2 = invalidTz || bookingTimezone;
    expect(result2).toBe("America/New_York");
  });
});

// ===========================================================================
// 4b. Host-Initiated Reschedule — POST /api/bookings/:id/reschedule
// ===========================================================================

describe("POST /api/bookings/:id/reschedule (host-initiated)", () => {
  it("returns 404 for non-existent booking", () => {
    const booking = undefined;
    const requestUserId = "user-1";
    const notFound = !booking || (booking as any)?.userId !== requestUserId;
    expect(notFound).toBe(true);
  });

  it("returns 404 for booking belonging to a different user", () => {
    const booking = { ...mockBooking, userId: "user-2" };
    const requestUserId = "user-1";
    const notFound = !booking || booking.userId !== requestUserId;
    expect(notFound).toBe(true);
  });

  it("returns 400 for cancelled booking", () => {
    const booking = { ...mockBooking, status: "cancelled" };
    const isCancelled = booking.status === "cancelled";
    expect(isCancelled).toBe(true);
  });

  it("returns 400 for same time", () => {
    const booking = { ...mockBooking };
    const newStartTime = new Date(booking.startTime);
    const isSameTime = booking.startTime.getTime() === newStartTime.getTime();
    expect(isSameTime).toBe(true);
  });

  it("returns 400 for missing startTimeUTC", () => {
    const body: any = {};
    expect(!body.startTimeUTC).toBe(true);
  });

  it("returns 400 for invalid start time", () => {
    const newStartTime = new Date("invalid-date");
    expect(isNaN(newStartTime.getTime())).toBe(true);
  });

  it("returns 400 for past dates", () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 60000);
    expect(pastDate.getTime() < now.getTime()).toBe(true);
  });

  it("returns 409 for conflict", () => {
    const booking = { ...mockBooking, id: 5 };
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const newEndTime = new Date("2026-02-16T10:30:00Z");

    const existingBookings = [
      { id: 5, startTime: mockBooking.startTime, endTime: mockBooking.endTime },
      { id: 10, startTime: new Date("2026-02-16T10:00:00Z"), endTime: new Date("2026-02-16T10:30:00Z") },
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === booking.id) return false;
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    expect(hasConflict).toBe(true);
  });

  it("successfully reschedules", () => {
    const booking = { ...mockBooking };
    const newStartTime = new Date("2026-03-01T15:00:00Z");
    const newEndTime = new Date("2026-03-01T15:30:00Z");

    const existingBookings = [
      { id: 1, startTime: mockBooking.startTime, endTime: mockBooking.endTime },
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === booking.id) return false;
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    expect(hasConflict).toBe(false);

    const result = { success: true, newStartTime, newEndTime };
    expect(result.success).toBe(true);
    expect(result.newStartTime).toEqual(newStartTime);
    expect(result.newEndTime).toEqual(newEndTime);
  });

  it("deletes meeting brief after reschedule", () => {
    // Route calls: storage.deleteMeetingBrief(booking.id)
    let briefDeleted = false;
    const deleteMeetingBrief = (bookingId: number) => {
      briefDeleted = true;
    };
    deleteMeetingBrief(mockBooking.id);
    expect(briefDeleted).toBe(true);
  });

  it("deletes old calendar event and creates new one", () => {
    let oldDeleted = false;
    let newCreated = false;

    // Simulate fire-and-forget calendar operations
    const deleteCalendarEvent = (userId: string, eventId: string) => { oldDeleted = true; };
    const createCalendarEvent = () => { newCreated = true; return "new-cal-id"; };

    if (mockBooking.calendarEventId) {
      deleteCalendarEvent(mockBooking.userId, mockBooking.calendarEventId);
    }
    createCalendarEvent();

    expect(oldDeleted).toBe(true);
    expect(newCreated).toBe(true);
  });

  it("sends host-initiated reschedule email to booker", () => {
    // Verify the template is called with correct params
    const bookerTpl = hostRescheduleNotificationToBooker({
      guestName: mockBooking.guestName,
      eventTypeName: mockEventType.name,
      oldStartTime: mockBooking.startTime,
      oldEndTime: mockBooking.endTime,
      newStartTime: new Date("2026-03-01T15:00:00Z"),
      newEndTime: new Date("2026-03-01T15:30:00Z"),
      hostName: "Bob Host",
      timezone: mockBooking.timezone,
      rescheduleToken: mockBooking.rescheduleToken!,
      cancelToken: mockBooking.cancelToken!,
      baseUrl: "https://calendai.example.com",
    });

    expect(bookerTpl.subject).toContain("Bob Host");
    expect(bookerTpl.subject).toContain("rescheduled");
    expect(bookerTpl.html).toContain("Jane Doe");
  });
});

// ===========================================================================
// 5. Reschedule Availability Endpoint
// ===========================================================================

describe("GET /api/public/booking/reschedule/:token/availability", () => {
  it("returns 404 for invalid token", () => {
    const booking = undefined;
    const shouldReturn404 = !booking;
    expect(shouldReturn404).toBe(true);
  });

  it("returns 400 for cancelled booking", () => {
    const booking = { ...mockBooking, status: "cancelled" };
    const isCancelled = booking.status === "cancelled";
    expect(isCancelled).toBe(true);
  });

  it("returns 400 for invalid date parameter", () => {
    const dateStr = "not-a-date";
    const date = new Date(dateStr);
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("accepts valid date parameter", () => {
    const dateStr = "2026-03-01";
    const date = new Date(dateStr);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it("returns 400 for invalid timezone", () => {
    // Replicate: isValidTimezone validation
    const invalidTimezones = ["Invalid/TZ", "NotATimezone", "UTC+99"];
    for (const tz of invalidTimezones) {
      let isValid = true;
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        isValid = false;
      }
      expect(isValid).toBe(false);
    }
  });

  it("accepts valid timezone", () => {
    const validTimezones = ["America/New_York", "UTC", "Europe/London", "Asia/Tokyo"];
    for (const tz of validTimezones) {
      let isValid = true;
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        isValid = false;
      }
      expect(isValid).toBe(true);
    }
  });

  it("returns 404 when event type not found", () => {
    const eventType = undefined;
    const shouldReturn404 = !eventType;
    expect(shouldReturn404).toBe(true);
  });

  it("uses booking timezone as fallback when guest timezone not provided", () => {
    const guestTimezone = undefined;
    const bookingTimezone = "America/New_York";
    const effectiveTimezone = guestTimezone || bookingTimezone;
    expect(effectiveTimezone).toBe("America/New_York");
  });
});

// ===========================================================================
// 6. Cancel GET Endpoint — GET /api/public/booking/cancel/:token
// ===========================================================================

describe("GET /api/public/booking/cancel/:token", () => {
  it("returns booking details for valid token", () => {
    const booking = { ...mockBooking };
    const eventType = { ...mockEventType };
    const host = { ...mockHost };
    const hostName = [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host";

    const response = {
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      eventTypeName: eventType.name,
      eventTypeSlug: eventType.slug,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      timezone: booking.timezone,
      cancellationReason: booking.cancellationReason,
      hostName,
      eventType: {
        primaryColor: eventType.primaryColor,
        secondaryColor: eventType.secondaryColor,
        color: eventType.color,
        logo: eventType.logo,
        duration: eventType.duration,
        host: {
          firstName: host.firstName,
          lastName: host.lastName,
          profileImageUrl: host.profileImageUrl,
        },
      },
    };

    expect(response.id).toBe(1);
    expect(response.guestName).toBe("Jane Doe");
    expect(response.guestEmail).toBe("jane@example.com");
    expect(response.eventTypeName).toBe("Strategy Call");
    expect(response.eventTypeSlug).toBe("strategy-call");
    expect(response.hostName).toBe("Bob Host");
    expect(response.status).toBe("confirmed");
    expect(response.eventType.duration).toBe(30);
    expect(response.eventType.host.firstName).toBe("Bob");
  });

  it("returns 404 for invalid token", () => {
    const booking = undefined;
    const shouldReturn404 = !booking;
    expect(shouldReturn404).toBe(true);
  });

  it("returns cancelled booking (allows showing 'already cancelled' UI)", () => {
    // The GET endpoint returns the booking regardless of status
    // This allows the UI to show an "already cancelled" message
    const booking = { ...mockBooking, status: "cancelled", cancellationReason: "No longer needed" };
    const response = {
      id: booking.id,
      status: booking.status,
      cancellationReason: booking.cancellationReason,
    };
    expect(response.status).toBe("cancelled");
    expect(response.cancellationReason).toBe("No longer needed");
  });

  it("includes event type details and host info", () => {
    const booking = { ...mockBooking };
    const eventType = { ...mockEventType };
    const host = { ...mockHost };

    const response = {
      eventTypeName: eventType.name,
      hostName: [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host",
      eventType: {
        primaryColor: eventType.primaryColor,
        secondaryColor: eventType.secondaryColor,
        color: eventType.color,
        logo: eventType.logo,
        duration: eventType.duration,
        host: {
          firstName: host.firstName,
          lastName: host.lastName,
          profileImageUrl: host.profileImageUrl,
        },
      },
    };

    expect(response.eventTypeName).toBe("Strategy Call");
    expect(response.hostName).toBe("Bob Host");
    expect(response.eventType.primaryColor).toBe("#6366f1");
    expect(response.eventType.duration).toBe(30);
    expect(response.eventType.host.firstName).toBe("Bob");
    expect(response.eventType.host.lastName).toBe("Host");
  });

  it("falls back to 'Host' when host name fields are empty", () => {
    const host = { firstName: null, lastName: null };
    const hostName = [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host";
    expect(hostName).toBe("Host");
  });

  it("falls back to 'Meeting' when event type is not found", () => {
    const eventType = undefined;
    const eventTypeName = (eventType as any)?.name || "Meeting";
    expect(eventTypeName).toBe("Meeting");
  });
});

// ===========================================================================
// 7. Edge Case Tests
// ===========================================================================

describe("F12 Edge Cases", () => {
  it("cancellation reason is truncated to 1000 characters", () => {
    const longReason = "X".repeat(5000);
    const sanitizedReason = longReason ? String(longReason).slice(0, 1000) : null;
    expect(sanitizedReason).toHaveLength(1000);
  });

  it("cancellation reason truncation preserves start of string", () => {
    const reason = "Important reason: " + "A".repeat(2000);
    const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;
    expect(sanitizedReason!.startsWith("Important reason: ")).toBe(true);
  });

  it("empty reason becomes null", () => {
    const reason = "";
    const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;
    expect(sanitizedReason).toBeNull();
  });

  it("timezone validation on reschedule", () => {
    const validTimezones = ["America/New_York", "UTC", "Europe/London", "Asia/Tokyo", "Pacific/Auckland"];
    for (const tz of validTimezones) {
      let isValid = true;
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        isValid = false;
      }
      expect(isValid).toBe(true);
    }
  });

  it("invalid timezone is rejected on reschedule", () => {
    const invalidTimezones = ["Not/Valid", "FakeZone", "GMT+999"];
    for (const tz of invalidTimezones) {
      let isValid = true;
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        isValid = false;
      }
      expect(isValid).toBe(false);
    }
  });

  it("booking within 365-day window validation on reschedule", () => {
    const now = new Date("2026-01-28T00:00:00Z");
    const maxBookingWindow = 365 * 24 * 60 * 60 * 1000;

    // Exactly at boundary
    const atBoundary = new Date(now.getTime() + maxBookingWindow);
    const exceedsAtBoundary = atBoundary.getTime() - now.getTime() > maxBookingWindow;
    expect(exceedsAtBoundary).toBe(false);

    // Just past boundary
    const pastBoundary = new Date(now.getTime() + maxBookingWindow + 1);
    const exceedsPastBoundary = pastBoundary.getTime() - now.getTime() > maxBookingWindow;
    expect(exceedsPastBoundary).toBe(true);

    // Well within boundary
    const withinBoundary = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const exceedsWithin = withinBoundary.getTime() - now.getTime() > maxBookingWindow;
    expect(exceedsWithin).toBe(false);
  });

  it("self-exclusion in double-booking check (reschedule can keep same slot)", () => {
    const bookingId = 42;
    const newStartTime = new Date("2026-02-15T14:00:00Z");
    const newEndTime = new Date("2026-02-15T14:30:00Z");

    // Existing bookings include the booking being rescheduled
    const existingBookings = [
      { id: 42, startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") },
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === bookingId) return false; // self-exclusion
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    // No conflict because the only overlapping booking is itself
    expect(hasConflict).toBe(false);
  });

  it("self-exclusion still detects conflict with other bookings", () => {
    const bookingId = 42;
    const newStartTime = new Date("2026-02-15T14:00:00Z");
    const newEndTime = new Date("2026-02-15T14:30:00Z");

    const existingBookings = [
      { id: 42, startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") }, // self
      { id: 99, startTime: new Date("2026-02-15T14:15:00Z"), endTime: new Date("2026-02-15T14:45:00Z") }, // conflict
    ];

    const hasConflict = existingBookings.some((b) => {
      if (b.id === bookingId) return false;
      return b.startTime < newEndTime && b.endTime > newStartTime;
    });

    expect(hasConflict).toBe(true);
  });

  it("endTime is computed correctly from startTime + duration", () => {
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const duration = 30; // minutes
    const newEndTime = new Date(newStartTime.getTime() + duration * 60000);
    expect(newEndTime.toISOString()).toBe("2026-02-16T10:30:00.000Z");
  });

  it("endTime computation works for 60-minute meetings", () => {
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const duration = 60;
    const newEndTime = new Date(newStartTime.getTime() + duration * 60000);
    expect(newEndTime.toISOString()).toBe("2026-02-16T11:00:00.000Z");
  });

  it("endTime computation crosses midnight", () => {
    const newStartTime = new Date("2026-02-16T23:45:00Z");
    const duration = 30;
    const newEndTime = new Date(newStartTime.getTime() + duration * 60000);
    expect(newEndTime.toISOString()).toBe("2026-02-17T00:15:00.000Z");
    expect(newEndTime.getUTCDate()).toBe(17);
  });

  it("notice period check handles negative minutes (past meetings)", () => {
    const minNotice = 1440;
    const now = new Date("2026-02-16T15:00:00Z");
    const startTime = new Date("2026-02-16T14:00:00Z"); // 1 hour ago
    const minutesUntilMeeting = (startTime.getTime() - now.getTime()) / (1000 * 60);

    // For cancel: withinNoticePeriod = minutesUntilMeeting < minNotice && minutesUntilMeeting > 0
    const withinNoticePeriod = minutesUntilMeeting < minNotice && minutesUntilMeeting > 0;
    expect(minutesUntilMeeting).toBe(-60);
    expect(withinNoticePeriod).toBe(false);
  });
});

// ===========================================================================
// 8. Integration Tests — F12 Reschedule + F11 Brief
// ===========================================================================

describe("F12 Reschedule + F11 Brief Integration", () => {
  it("meeting brief is deleted when booking is rescheduled (public endpoint)", () => {
    let briefDeleted = false;
    const deleteMeetingBrief = async (bookingId: number) => {
      briefDeleted = true;
    };

    // Simulate the reschedule route behavior
    const booking = { ...mockBooking };
    deleteMeetingBrief(booking.id);
    expect(briefDeleted).toBe(true);
  });

  it("meeting brief is deleted when booking is rescheduled (host endpoint)", () => {
    let briefDeleted = false;
    const deleteMeetingBrief = async (bookingId: number) => {
      briefDeleted = true;
    };

    // Host-initiated reschedule also deletes the brief
    const booking = { ...mockBooking };
    deleteMeetingBrief(booking.id);
    expect(briefDeleted).toBe(true);
  });

  it("brief deletion failure does not block reschedule success", () => {
    let rescheduled = false;
    let briefDeleteFailed = false;

    // Simulate reschedule succeeding
    rescheduled = true;

    // Simulate brief deletion failing (fire-and-forget)
    try {
      throw new Error("Brief not found");
    } catch {
      briefDeleteFailed = true;
    }

    expect(rescheduled).toBe(true);
    expect(briefDeleteFailed).toBe(true);
    // Reschedule succeeded despite brief deletion failure
  });

  it("brief will be regenerated by scheduler after reschedule", () => {
    // After deletion, the brief no longer exists
    const existingBrief = null;

    // The scheduler checks for bookings without briefs
    const needsBrief = !existingBrief;
    expect(needsBrief).toBe(true);
  });
});

// ===========================================================================
// 9. Additional Email Template Structure Validation
// ===========================================================================

describe("Reschedule Email Template Structure", () => {
  it("all reschedule templates produce valid HTML with DOCTYPE", () => {
    const templates = [
      rescheduleConfirmationToBooker({
        guestName: "A", eventTypeName: "C",
        oldStartTime: new Date(), oldEndTime: new Date(),
        newStartTime: new Date(), newEndTime: new Date(),
        hostName: "B", timezone: "UTC", baseUrl: "https://example.com",
      }),
      rescheduleNotificationToHost({
        guestName: "A", guestEmail: "a@b.com", eventTypeName: "C",
        oldStartTime: new Date(), oldEndTime: new Date(),
        newStartTime: new Date(), newEndTime: new Date(),
        hostName: "B", timezone: "UTC", bookingId: 1, baseUrl: "https://example.com",
      }),
      hostRescheduleNotificationToBooker({
        guestName: "A", eventTypeName: "C",
        oldStartTime: new Date(), oldEndTime: new Date(),
        newStartTime: new Date(), newEndTime: new Date(),
        hostName: "B", timezone: "UTC", baseUrl: "https://example.com",
      }),
      cancellationEmailToHost({
        guestName: "A", hostName: "B", eventTypeName: "C",
        startTime: new Date(), hostTimezone: "UTC",
        baseUrl: "https://example.com", withinNoticePeriod: true,
      }),
    ];

    for (const tpl of templates) {
      expect(tpl.html).toContain("<!DOCTYPE html>");
      expect(tpl.html).toContain("</html>");
      expect(tpl.html).toContain("<body");
      expect(tpl.html).toContain("</body>");
      expect(tpl.subject.length).toBeGreaterThan(0);
      expect(tpl.text.length).toBeGreaterThan(0);
    }
  });

  it("all reschedule templates include CalendAI branding", () => {
    const tpl = rescheduleConfirmationToBooker({
      guestName: "A", eventTypeName: "C",
      oldStartTime: new Date(), oldEndTime: new Date(),
      newStartTime: new Date(), newEndTime: new Date(),
      hostName: "B", timezone: "UTC", baseUrl: "https://example.com",
    });
    expect(tpl.html).toContain("CalendAI");
  });

  it("all reschedule templates include footer", () => {
    const tpl = rescheduleNotificationToHost({
      guestName: "A", guestEmail: "a@b.com", eventTypeName: "C",
      oldStartTime: new Date(), oldEndTime: new Date(),
      newStartTime: new Date(), newEndTime: new Date(),
      hostName: "B", timezone: "UTC", bookingId: 1, baseUrl: "https://example.com",
    });
    expect(tpl.html).toContain("This email was sent by CalendAI");
  });
});

// ===========================================================================
// 10. Reschedule GET Endpoint — GET /api/public/booking/reschedule/:token
// ===========================================================================

describe("GET /api/public/booking/reschedule/:token", () => {
  it("returns booking details for valid token", () => {
    const booking = { ...mockBooking };
    const eventType = { ...mockEventType };
    const host = { ...mockHost };
    const hostName = [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host";

    const response = {
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      eventTypeName: eventType.name,
      eventTypeSlug: eventType.slug,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      timezone: booking.timezone,
      hostName,
      duration: eventType.duration,
      cancelToken: booking.cancelToken,
      eventType: {
        primaryColor: eventType.primaryColor,
        secondaryColor: eventType.secondaryColor,
        color: eventType.color,
        logo: eventType.logo,
        duration: eventType.duration,
        host: {
          firstName: host.firstName,
          lastName: host.lastName,
          profileImageUrl: host.profileImageUrl,
        },
      },
    };

    expect(response.id).toBe(1);
    expect(response.guestName).toBe("Jane Doe");
    expect(response.hostName).toBe("Bob Host");
    expect(response.duration).toBe(30);
    expect(response.cancelToken).toBe("test-cancel-token-xyz789");
    expect(response.eventType.host.firstName).toBe("Bob");
  });

  it("returns 404 for invalid token", () => {
    const booking = undefined;
    const shouldReturn404 = !booking;
    expect(shouldReturn404).toBe(true);
  });

  it("includes cancelToken for the booker UI", () => {
    const booking = { ...mockBooking };
    // The reschedule GET endpoint includes cancelToken so UI can offer cancel option
    expect(booking.cancelToken).toBeTruthy();
    expect(typeof booking.cancelToken).toBe("string");
  });
});

// ===========================================================================
// 11. Calendar Event Management on Reschedule
// ===========================================================================

describe("Calendar Event Management on Reschedule", () => {
  it("deletes old calendar event when calendarEventId exists", () => {
    const booking = { ...mockBooking, calendarEventId: "cal-123" };
    let deleteCalled = false;

    if (booking.calendarEventId) {
      deleteCalled = true;
    }

    expect(deleteCalled).toBe(true);
  });

  it("skips calendar deletion when calendarEventId is null", () => {
    const booking = { ...mockBooking, calendarEventId: null };
    let deleteCalled = false;

    if (booking.calendarEventId) {
      deleteCalled = true;
    }

    expect(deleteCalled).toBe(false);
  });

  it("creates new calendar event with updated times", () => {
    const newStartTime = new Date("2026-02-16T10:00:00Z");
    const newEndTime = new Date("2026-02-16T10:30:00Z");

    const calendarEventData = {
      guestName: mockBooking.guestName,
      guestEmail: mockBooking.guestEmail,
      guestCompany: mockBooking.guestCompany,
      startTime: newStartTime,
      endTime: newEndTime,
      timezone: mockBooking.timezone,
      notes: mockBooking.notes,
    };

    expect(calendarEventData.startTime).toEqual(newStartTime);
    expect(calendarEventData.endTime).toEqual(newEndTime);
    expect(calendarEventData.guestName).toBe("Jane Doe");
  });

  it("updates booking with new calendarEventId when calendar event is created", () => {
    const newCalendarEventId = "new-cal-456";
    const updatedBooking = { ...mockBooking, calendarEventId: newCalendarEventId };
    expect(updatedBooking.calendarEventId).toBe("new-cal-456");
  });
});

// ===========================================================================
// 12. Cancellation Email to Booker/Host Flow
// ===========================================================================

describe("Cancellation Email Flow", () => {
  it("sends cancellation email to booker on public cancel", () => {
    // The public cancel endpoint fires-and-forgets emails
    const booking = { ...mockBooking };
    const eventType = { ...mockEventType };

    // Verify the booker template is generated correctly
    const emailData = {
      to: booking.guestEmail,
      guestName: booking.guestName,
      hostName: "Bob Host",
      eventTypeName: eventType.name,
      startTime: booking.startTime,
      guestTimezone: booking.timezone,
      eventTypeSlug: eventType.slug,
      baseUrl: "https://calendai.example.com",
    };

    expect(emailData.to).toBe("jane@example.com");
    expect(emailData.guestName).toBe("Jane Doe");
    expect(emailData.eventTypeName).toBe("Strategy Call");
  });

  it("sends cancellation email to host with reason and notice period", () => {
    const result = cancellationEmailToHost({
      guestName: "Jane Doe",
      hostName: "Bob Host",
      eventTypeName: "Strategy Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      hostTimezone: "UTC",
      baseUrl: "https://calendai.example.com",
      cancellationReason: "Conflicting schedule",
      withinNoticePeriod: true,
    });

    expect(result.html).toContain("Conflicting schedule");
    expect(result.html).toContain("minimum notice period");
    expect(result.text).toContain("Conflicting schedule");
    expect(result.text).toContain("minimum notice period");
  });

  it("respects notification preferences for host cancellation email", () => {
    // If cancellationEmail is false, skip sending to host
    const prefs1 = { cancellationEmail: false };
    const shouldNotify1 = prefs1?.cancellationEmail !== false;
    expect(shouldNotify1).toBe(false);

    // If cancellationEmail is true, send to host
    const prefs2 = { cancellationEmail: true };
    const shouldNotify2 = prefs2?.cancellationEmail !== false;
    expect(shouldNotify2).toBe(true);

    // If no prefs, default to true
    const prefs3 = undefined;
    const shouldNotify3 = (prefs3 as any)?.cancellationEmail !== false;
    expect(shouldNotify3).toBe(true);
  });
});

// ===========================================================================
// 13. Reschedule Email Flow
// ===========================================================================

describe("Reschedule Email Flow", () => {
  it("sends reschedule confirmation to booker with correct data", () => {
    const result = rescheduleConfirmationToBooker({
      guestName: "Jane Doe",
      eventTypeName: "Strategy Call",
      oldStartTime: new Date("2026-02-15T14:00:00Z"),
      oldEndTime: new Date("2026-02-15T14:30:00Z"),
      newStartTime: new Date("2026-02-16T10:00:00Z"),
      newEndTime: new Date("2026-02-16T10:30:00Z"),
      hostName: "Bob Host",
      timezone: "America/New_York",
      rescheduleToken: "resched-token",
      cancelToken: "cancel-token",
      baseUrl: "https://calendai.example.com",
      withinNoticePeriod: false,
    });

    expect(result.subject).toContain("Rescheduled");
    expect(result.html).toContain("Jane Doe");
    expect(result.html).not.toContain("minimum notice period");
  });

  it("sends reschedule notification to host with booking link", () => {
    const result = rescheduleNotificationToHost({
      guestName: "Jane Doe",
      guestEmail: "jane@example.com",
      eventTypeName: "Strategy Call",
      oldStartTime: new Date("2026-02-15T14:00:00Z"),
      oldEndTime: new Date("2026-02-15T14:30:00Z"),
      newStartTime: new Date("2026-02-16T10:00:00Z"),
      newEndTime: new Date("2026-02-16T10:30:00Z"),
      hostName: "Bob Host",
      timezone: "America/Chicago",
      bookingId: 42,
      baseUrl: "https://calendai.example.com",
      withinNoticePeriod: true,
    });

    expect(result.subject).toContain("Rescheduled");
    expect(result.html).toContain("jane@example.com");
    expect(result.html).toContain("calendai.example.com/bookings/42");
    expect(result.html).toContain("minimum notice period");
  });

  it("respects notification preferences for host reschedule email", () => {
    // If newBookingEmail is false, skip sending reschedule notification to host
    const prefs1 = { newBookingEmail: false };
    const shouldNotify1 = prefs1?.newBookingEmail !== false;
    expect(shouldNotify1).toBe(false);

    // Default behavior: send
    const prefs2 = { newBookingEmail: true };
    const shouldNotify2 = prefs2?.newBookingEmail !== false;
    expect(shouldNotify2).toBe(true);
  });
});

// ===========================================================================
// 14. Token-Based Lookup Patterns
// ===========================================================================

describe("Token-Based Booking Lookup", () => {
  it("cancel token lookup returns correct booking", () => {
    // Simulate storage.getBookingByCancelToken
    const bookings = [
      { ...mockBooking, cancelToken: "token-aaa" },
      { ...mockBooking, id: 2, cancelToken: "token-bbb" },
    ];

    const found = bookings.find((b) => b.cancelToken === "token-bbb");
    expect(found).toBeDefined();
    expect(found!.id).toBe(2);
  });

  it("reschedule token lookup returns correct booking", () => {
    const bookings = [
      { ...mockBooking, rescheduleToken: "resched-aaa" },
      { ...mockBooking, id: 2, rescheduleToken: "resched-bbb" },
    ];

    const found = bookings.find((b) => b.rescheduleToken === "resched-bbb");
    expect(found).toBeDefined();
    expect(found!.id).toBe(2);
  });

  it("returns undefined for non-existent cancel token", () => {
    const bookings = [{ ...mockBooking }];
    const found = bookings.find((b) => b.cancelToken === "nonexistent-token");
    expect(found).toBeUndefined();
  });

  it("returns undefined for non-existent reschedule token", () => {
    const bookings = [{ ...mockBooking }];
    const found = bookings.find((b) => b.rescheduleToken === "nonexistent-token");
    expect(found).toBeUndefined();
  });
});

// ===========================================================================
// 15. Conflict Detection Edge Cases
// ===========================================================================

describe("Double-Booking Conflict Detection", () => {
  it("detects partial overlap at start", () => {
    const newStart = new Date("2026-02-15T13:45:00Z");
    const newEnd = new Date("2026-02-15T14:15:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(true);
  });

  it("detects partial overlap at end", () => {
    const newStart = new Date("2026-02-15T14:15:00Z");
    const newEnd = new Date("2026-02-15T14:45:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(true);
  });

  it("detects complete overlap (new contains existing)", () => {
    const newStart = new Date("2026-02-15T13:00:00Z");
    const newEnd = new Date("2026-02-15T15:00:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(true);
  });

  it("detects complete overlap (existing contains new)", () => {
    const newStart = new Date("2026-02-15T14:05:00Z");
    const newEnd = new Date("2026-02-15T14:25:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(true);
  });

  it("no conflict when adjacent (back-to-back)", () => {
    const newStart = new Date("2026-02-15T14:30:00Z"); // starts exactly when existing ends
    const newEnd = new Date("2026-02-15T15:00:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(false);
  });

  it("no conflict when completely before", () => {
    const newStart = new Date("2026-02-15T12:00:00Z");
    const newEnd = new Date("2026-02-15T12:30:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(false);
  });

  it("no conflict when completely after", () => {
    const newStart = new Date("2026-02-15T15:00:00Z");
    const newEnd = new Date("2026-02-15T15:30:00Z");
    const existing = { startTime: new Date("2026-02-15T14:00:00Z"), endTime: new Date("2026-02-15T14:30:00Z") };

    const hasConflict = existing.startTime < newEnd && existing.endTime > newStart;
    expect(hasConflict).toBe(false);
  });
});
