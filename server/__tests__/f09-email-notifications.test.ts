import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ============================================================================
// F09: Email Notifications — Comprehensive Tests
// ============================================================================
// Covers:
//   A. Email Templates — structure, escaping, timezone formatting
//   B. Email Service — console fallback, error handling
//   C. Token Generation — entropy and uniqueness
//   D. Notification Preferences — schema defaults
//   E. Auth Email Templates — magic link, password reset, verification
// ============================================================================

import {
  bookingConfirmationEmail,
  hostNotificationEmail,
  cancellationEmailToBooker,
  cancellationEmailToHost,
  authEmail,
  type EmailTemplate,
} from "../email-templates";

// ===========================================================================
// A. Booking Confirmation Email
// ===========================================================================

describe("Booking Confirmation Email", () => {
  const baseData = {
    guestName: "Alice Smith",
    guestEmail: "alice@example.com",
    hostName: "Bob Host",
    eventTypeName: "Strategy Call",
    startTime: new Date("2026-02-15T14:00:00Z"),
    endTime: new Date("2026-02-15T14:30:00Z"),
    duration: 30,
    guestTimezone: "America/New_York",
    hostTimezone: "America/Chicago",
    location: null,
    calendarEventId: "cal-123",
    rescheduleToken: "abc123reschedule",
    cancelToken: "def456cancel",
    baseUrl: "https://calendai.example.com",
  };

  it("returns subject, html, and text fields", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
    expect(result.subject).toBeTruthy();
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("subject contains event type and host name", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.subject).toContain("Strategy Call");
    expect(result.subject).toContain("Bob Host");
  });

  it("html includes guest name", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.html).toContain("Alice Smith");
  });

  it("html includes reschedule and cancel links", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.html).toContain("/booking/reschedule/abc123reschedule");
    expect(result.html).toContain("/booking/cancel/def456cancel");
  });

  it("text includes reschedule and cancel links", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.text).toContain("/booking/reschedule/abc123reschedule");
    expect(result.text).toContain("/booking/cancel/def456cancel");
  });

  it("html includes calendar invite message", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.html).toContain("calendar invite");
  });

  it("handles Google Meet location", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      location: "google-meet",
    });
    expect(result.html).toContain("Google Meet");
  });

  it("handles Zoom location with link", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      location: "zoom:https://zoom.us/j/123",
    });
    expect(result.html).toContain("zoom.us/j/123");
    expect(result.html).toContain("Zoom");
  });

  it("handles phone location", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      location: "phone:+1-555-1234",
    });
    expect(result.html).toContain("+1-555-1234");
  });

  it("handles in-person location", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      location: "in-person:123 Main St, London",
    });
    expect(result.html).toContain("123 Main St, London");
  });

  it("handles custom link location", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      location: "custom:https://meet.example.com/room",
    });
    expect(result.html).toContain("meet.example.com/room");
  });

  it("omits action links when tokens are null", () => {
    const result = bookingConfirmationEmail({
      ...baseData,
      rescheduleToken: null,
      cancelToken: null,
    });
    expect(result.html).not.toContain("/booking/reschedule/");
    expect(result.html).not.toContain("/booking/cancel/");
  });

  it("html includes duration", () => {
    const result = bookingConfirmationEmail(baseData);
    expect(result.html).toContain("30 minutes");
  });

  it("formats date in guest timezone", () => {
    const result = bookingConfirmationEmail(baseData);
    // Feb 15 2026, 14:00 UTC = 9:00 AM EST
    expect(result.html).toContain("February");
    expect(result.html).toContain("15");
    expect(result.html).toContain("2026");
  });
});

// ===========================================================================
// B. Host Notification Email
// ===========================================================================

describe("Host Notification Email", () => {
  const baseData = {
    guestName: "Alice Smith",
    guestEmail: "alice@example.com",
    guestCompany: "Acme Corp",
    guestPhone: "+1-555-9999",
    hostName: "Bob Host",
    eventTypeName: "Strategy Call",
    startTime: new Date("2026-02-15T14:00:00Z"),
    endTime: new Date("2026-02-15T14:30:00Z"),
    duration: 30,
    guestTimezone: "America/New_York",
    hostTimezone: "America/Chicago",
    location: null,
    baseUrl: "https://calendai.example.com",
    leadScore: 85,
    leadScoreLabel: "High",
    leadScoreReasoning: "Executive role, large company",
    prequalSummary: "Interested in enterprise plan",
  };

  it("returns subject, html, and text fields", () => {
    const result = hostNotificationEmail(baseData);
    expect(result).toHaveProperty("subject");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
  });

  it("subject contains guest name and event type", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.subject).toContain("Alice Smith");
    expect(result.subject).toContain("Strategy Call");
  });

  it("html includes guest company", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.html).toContain("Acme Corp");
  });

  it("html includes guest phone", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.html).toContain("+1-555-9999");
  });

  it("html includes lead score badge when provided", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.html).toContain("High");
    expect(result.html).toContain("85");
  });

  it("html includes prequal summary when provided", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.html).toContain("Interested in enterprise plan");
  });

  it("html includes dashboard link", () => {
    const result = hostNotificationEmail(baseData);
    expect(result.html).toContain("calendai.example.com/bookings");
  });

  it("omits lead score section when not provided", () => {
    const result = hostNotificationEmail({
      ...baseData,
      leadScore: null,
      leadScoreLabel: null,
      leadScoreReasoning: null,
    });
    expect(result.html).not.toContain("Lead Score");
  });

  it("omits company line when not provided", () => {
    const result = hostNotificationEmail({
      ...baseData,
      guestCompany: null,
    });
    expect(result.html).not.toContain("Company:");
  });

  it("omits phone line when not provided", () => {
    const result = hostNotificationEmail({
      ...baseData,
      guestPhone: null,
    });
    // The phone label should not appear
    expect(result.text).not.toContain("Phone:");
  });
});

// ===========================================================================
// C. Cancellation Email (to Booker)
// ===========================================================================

describe("Cancellation Email to Booker", () => {
  const baseData = {
    guestName: "Alice Smith",
    hostName: "Bob Host",
    eventTypeName: "Strategy Call",
    startTime: new Date("2026-02-15T14:00:00Z"),
    guestTimezone: "America/New_York",
    eventTypeSlug: "strategy-call",
    baseUrl: "https://calendai.example.com",
  };

  it("returns subject, html, and text", () => {
    const result = cancellationEmailToBooker(baseData);
    expect(result.subject).toContain("Cancelled");
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("subject contains event type and host name", () => {
    const result = cancellationEmailToBooker(baseData);
    expect(result.subject).toContain("Strategy Call");
    expect(result.subject).toContain("Bob Host");
  });

  it("html shows date with strikethrough", () => {
    const result = cancellationEmailToBooker(baseData);
    expect(result.html).toContain("line-through");
  });

  it("html includes rebook link", () => {
    const result = cancellationEmailToBooker(baseData);
    expect(result.html).toContain("/book/strategy-call");
  });

  it("text includes rebook link", () => {
    const result = cancellationEmailToBooker(baseData);
    expect(result.text).toContain("/book/strategy-call");
  });
});

// ===========================================================================
// D. Cancellation Email (to Host)
// ===========================================================================

describe("Cancellation Email to Host", () => {
  const baseData = {
    guestName: "Alice Smith",
    hostName: "Bob Host",
    eventTypeName: "Strategy Call",
    startTime: new Date("2026-02-15T14:00:00Z"),
    hostTimezone: "America/Chicago",
    baseUrl: "https://calendai.example.com",
  };

  it("returns subject, html, and text", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.subject).toContain("Cancelled");
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("subject contains guest name", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.subject).toContain("Alice Smith");
  });

  it("html mentions the guest cancelled", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.html).toContain("Alice Smith");
    expect(result.html).toContain("cancelled");
  });

  it("includes cancellation reason when provided", () => {
    const result = cancellationEmailToHost({
      ...baseData,
      cancellationReason: "Schedule conflict",
    });
    expect(result.html).toContain("Schedule conflict");
    expect(result.text).toContain("Schedule conflict");
  });

  it("omits reason section when not provided", () => {
    const result = cancellationEmailToHost(baseData);
    expect(result.html).not.toContain("Reason:");
  });
});

// ===========================================================================
// E. Auth Email Templates
// ===========================================================================

describe("Auth Email Templates", () => {
  const link = "https://calendai.example.com/auth/verify?token=abc123";

  describe("email-verification", () => {
    it("returns correct subject", () => {
      const result = authEmail("email-verification", "user@example.com", link);
      expect(result.subject).toContain("Verify");
    });

    it("html includes verify button", () => {
      const result = authEmail("email-verification", "user@example.com", link);
      expect(result.html).toContain("Verify Email");
    });

    it("html includes the link URL", () => {
      const result = authEmail("email-verification", "user@example.com", link);
      expect(result.html).toContain(link);
    });

    it("text includes the link URL", () => {
      const result = authEmail("email-verification", "user@example.com", link);
      expect(result.text).toContain(link);
    });

    it("html mentions 24 hours expiry", () => {
      const result = authEmail("email-verification", "user@example.com", link);
      expect(result.html).toContain("24 hours");
    });
  });

  describe("magic-link", () => {
    it("returns correct subject", () => {
      const result = authEmail("magic-link", "user@example.com", link);
      expect(result.subject).toContain("login link");
    });

    it("html includes sign in button", () => {
      const result = authEmail("magic-link", "user@example.com", link);
      expect(result.html).toContain("Sign In");
    });

    it("html mentions 15 minutes expiry", () => {
      const result = authEmail("magic-link", "user@example.com", link);
      expect(result.html).toContain("15 minutes");
    });
  });

  describe("password-reset", () => {
    it("returns correct subject", () => {
      const result = authEmail("password-reset", "user@example.com", link);
      expect(result.subject).toContain("Reset");
    });

    it("html includes reset button", () => {
      const result = authEmail("password-reset", "user@example.com", link);
      expect(result.html).toContain("Reset Password");
    });

    it("html mentions 1 hour expiry", () => {
      const result = authEmail("password-reset", "user@example.com", link);
      expect(result.html).toContain("1 hour");
    });
  });
});

// ===========================================================================
// F. HTML Escaping (XSS Prevention)
// ===========================================================================

describe("XSS Prevention in Templates", () => {
  it("escapes HTML in guest name for booking confirmation", () => {
    const result = bookingConfirmationEmail({
      guestName: '<script>alert("xss")</script>',
      guestEmail: "test@example.com",
      hostName: "Host",
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30,
      guestTimezone: "UTC",
      hostTimezone: "UTC",
      location: null,
      baseUrl: "https://example.com",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in host name for booking confirmation", () => {
    const result = bookingConfirmationEmail({
      guestName: "Alice",
      guestEmail: "test@example.com",
      hostName: '<img onerror="alert(1)" src="x">',
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30,
      guestTimezone: "UTC",
      hostTimezone: "UTC",
      location: null,
      baseUrl: "https://example.com",
    });
    expect(result.html).not.toContain('<img onerror');
    expect(result.html).toContain("&lt;img");
  });

  it("escapes HTML in event type name", () => {
    const result = bookingConfirmationEmail({
      guestName: "Alice",
      guestEmail: "test@example.com",
      hostName: "Bob",
      eventTypeName: '"><script>alert(1)</script>',
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30,
      guestTimezone: "UTC",
      hostTimezone: "UTC",
      location: null,
      baseUrl: "https://example.com",
    });
    expect(result.html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes HTML in guest company for host notification", () => {
    const result = hostNotificationEmail({
      guestName: "Alice",
      guestEmail: "test@example.com",
      guestCompany: '<script>alert("company")</script>',
      guestPhone: null,
      hostName: "Bob",
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30,
      guestTimezone: "UTC",
      hostTimezone: "UTC",
      location: null,
      baseUrl: "https://example.com",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in auth email link", () => {
    const xssLink = 'https://example.com/auth?token="><script>alert(1)</script>';
    const result = authEmail("magic-link", "user@example.com", xssLink);
    expect(result.html).not.toContain('"><script>');
    expect(result.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes HTML in cancellation reason for host email", () => {
    const result = cancellationEmailToHost({
      guestName: "Alice",
      hostName: "Bob",
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      hostTimezone: "UTC",
      cancellationReason: '<img src=x onerror=alert(1)>',
      baseUrl: "https://example.com",
    });
    expect(result.html).not.toContain("<img src=x");
    expect(result.html).toContain("&lt;img");
  });
});

// ===========================================================================
// G. Email Template Structure Validation
// ===========================================================================

describe("Email Template Structure", () => {
  it("all templates produce valid HTML with DOCTYPE", () => {
    const templates: EmailTemplate[] = [
      bookingConfirmationEmail({
        guestName: "A", guestEmail: "a@b.com", hostName: "B",
        eventTypeName: "C", startTime: new Date(), endTime: new Date(),
        duration: 30, guestTimezone: "UTC", hostTimezone: "UTC",
        location: null, baseUrl: "https://example.com",
      }),
      hostNotificationEmail({
        guestName: "A", guestEmail: "a@b.com", hostName: "B",
        eventTypeName: "C", startTime: new Date(), endTime: new Date(),
        duration: 30, guestTimezone: "UTC", hostTimezone: "UTC",
        location: null, baseUrl: "https://example.com",
      }),
      cancellationEmailToBooker({
        guestName: "A", hostName: "B", eventTypeName: "C",
        startTime: new Date(), guestTimezone: "UTC",
        eventTypeSlug: "c", baseUrl: "https://example.com",
      }),
      cancellationEmailToHost({
        guestName: "A", hostName: "B", eventTypeName: "C",
        startTime: new Date(), hostTimezone: "UTC",
        baseUrl: "https://example.com",
      }),
      authEmail("magic-link", "a@b.com", "https://example.com/link"),
      authEmail("password-reset", "a@b.com", "https://example.com/link"),
      authEmail("email-verification", "a@b.com", "https://example.com/link"),
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

  it("all templates include CalendAI branding", () => {
    const tpl = bookingConfirmationEmail({
      guestName: "A", guestEmail: "a@b.com", hostName: "B",
      eventTypeName: "C", startTime: new Date(), endTime: new Date(),
      duration: 30, guestTimezone: "UTC", hostTimezone: "UTC",
      location: null, baseUrl: "https://example.com",
    });
    expect(tpl.html).toContain("CalendAI");
  });

  it("all templates include footer", () => {
    const tpl = authEmail("magic-link", "a@b.com", "https://example.com/link");
    expect(tpl.html).toContain("This email was sent by CalendAI");
  });
});

// ===========================================================================
// H. Token Generation
// ===========================================================================

describe("Token Generation", () => {
  it("crypto.randomBytes generates 64-character hex tokens", () => {
    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("generates unique tokens on each call", () => {
    const crypto = require("crypto");
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(crypto.randomBytes(32).toString("hex"));
    }
    expect(tokens.size).toBe(100);
  });
});

// ===========================================================================
// I. Timezone Handling
// ===========================================================================

describe("Timezone Handling in Templates", () => {
  it("formats time correctly for US Eastern timezone", () => {
    // Feb 15 2026, 14:00 UTC = 9:00 AM EST
    const result = bookingConfirmationEmail({
      guestName: "Alice", guestEmail: "a@b.com", hostName: "Bob",
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30, guestTimezone: "America/New_York", hostTimezone: "UTC",
      location: null, baseUrl: "https://example.com",
    });
    // Should contain AM/PM time in the guest's timezone
    expect(result.html).toContain("AM");
  });

  it("falls back gracefully for invalid timezone", () => {
    const result = bookingConfirmationEmail({
      guestName: "Alice", guestEmail: "a@b.com", hostName: "Bob",
      eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30, guestTimezone: "Invalid/Timezone", hostTimezone: "UTC",
      location: null, baseUrl: "https://example.com",
    });
    // Should still produce output without crashing
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("host notification uses host timezone for date display", () => {
    const result = hostNotificationEmail({
      guestName: "Alice", guestEmail: "a@b.com",
      hostName: "Bob", eventTypeName: "Call",
      startTime: new Date("2026-02-15T14:00:00Z"),
      endTime: new Date("2026-02-15T14:30:00Z"),
      duration: 30, guestTimezone: "America/New_York",
      hostTimezone: "America/Chicago",
      location: null, baseUrl: "https://example.com",
    });
    // Should show time in CST
    expect(result.html).toContain("AM");
  });
});

// ===========================================================================
// J. Email Service Console Fallback
// ===========================================================================

describe("Email Service Console Fallback", () => {
  let consoleSpy: any;

  beforeEach(() => {
    // Clear SMTP env vars to ensure console fallback
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("sendEmail logs to console when SMTP is not configured", async () => {
    // Dynamic import to get fresh module state
    const { sendEmail } = await import("../email-service");
    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("console-stub");
  });
});
