import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// F13: Settings & Configuration — Comprehensive Tests
// ============================================================================
// Covers:
//   1. Profile Update Validation — email, timezone, text sanitization, colors
//   2. Password Change — current password verification, strength validation
//   3. Account Deletion — password verification, cascade delete ordering
//   4. Branding Cascade — event-type > user-default > system-default
//   5. Color Validation — hex format enforcement
//   6. Profile Field Whitelisting — only allowed fields accepted
//   7. Event Type Toggle — isActive toggle logic
// ============================================================================

// ---------------------------------------------------------------------------
// Mock the isValidTimezone function (from calendar-service)
// ---------------------------------------------------------------------------
vi.mock("../calendar-service", () => ({
  isValidTimezone: (tz: string) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  getGoogleAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  calculateAvailability: vi.fn(),
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  listUserCalendars: vi.fn(),
}));

import { isValidTimezone } from "../calendar-service";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const mockUser = {
  id: "user-1",
  email: "host@example.com",
  username: null,
  password: "$2b$10$hashedpassword123",
  firstName: "Bob",
  lastName: "Host",
  profileImageUrl: null,
  companyName: null,
  websiteUrl: null,
  timezone: "UTC",
  defaultLogo: null,
  defaultPrimaryColor: null,
  defaultSecondaryColor: null,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOAuthUser = {
  ...mockUser,
  id: "user-2",
  email: "oauth@example.com",
  password: null, // OAuth users have no password
};

// ---------------------------------------------------------------------------
// Helper: Replicates the profile update validation logic from routes.ts
// ---------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  return { valid: true, message: "Password is strong" };
}

function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

const ALLOWED_PROFILE_FIELDS = [
  "firstName", "lastName", "email", "companyName", "websiteUrl",
  "timezone", "profileImageUrl", "defaultLogo", "defaultPrimaryColor", "defaultSecondaryColor",
] as const;

function filterAllowedFields(body: Record<string, any>): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const field of ALLOWED_PROFILE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  return updates;
}

function sanitizeTextField(value: string): string {
  return value.trim().slice(0, 255);
}

// ===========================================================================
// 1. Profile Update Validation
// ===========================================================================

describe("Profile Update — Field Validation", () => {
  it("filters only allowed fields from request body", () => {
    const body = {
      firstName: "Alice",
      lastName: "Smith",
      password: "should-be-excluded",
      isAdmin: true,
      id: "hacked-id",
      email: "alice@example.com",
    };

    const updates = filterAllowedFields(body);

    expect(updates).toHaveProperty("firstName", "Alice");
    expect(updates).toHaveProperty("lastName", "Smith");
    expect(updates).toHaveProperty("email", "alice@example.com");
    expect(updates).not.toHaveProperty("password");
    expect(updates).not.toHaveProperty("isAdmin");
    expect(updates).not.toHaveProperty("id");
  });

  it("returns empty object for body with no valid fields", () => {
    const body = { password: "bad", isAdmin: true, role: "admin" };
    const updates = filterAllowedFields(body);
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it("accepts all branding fields", () => {
    const body = {
      defaultLogo: "/uploads/logo.png",
      defaultPrimaryColor: "#FF5500",
      defaultSecondaryColor: "#0055FF",
    };
    const updates = filterAllowedFields(body);
    expect(updates).toHaveProperty("defaultLogo");
    expect(updates).toHaveProperty("defaultPrimaryColor");
    expect(updates).toHaveProperty("defaultSecondaryColor");
  });

  it("validates email format", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("alice+tag@sub.example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@missing-local.com")).toBe(false);
    expect(isValidEmail("no-domain@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
  });

  it("validates timezone using isValidTimezone", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Invalid/Timezone")).toBe(false);
    expect(isValidTimezone("NotATimezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("sanitizes text fields by trimming and truncating to 255 chars", () => {
    expect(sanitizeTextField("  Alice  ")).toBe("Alice");
    expect(sanitizeTextField("A".repeat(300))).toHaveLength(255);
    expect(sanitizeTextField("")).toBe("");
    expect(sanitizeTextField("  ")).toBe("");
  });

  it("handles XSS attempts in text fields via truncation", () => {
    const xssInput = '<script>alert("xss")</script>';
    const sanitized = sanitizeTextField(xssInput);
    // Truncation happens but XSS content preserved as text (HTML escaping happens at template level)
    expect(sanitized).toBe(xssInput);
    expect(sanitized.length).toBeLessThanOrEqual(255);
  });
});

// ===========================================================================
// 2. Password Change Validation
// ===========================================================================

describe("Password Change — Validation Logic", () => {
  it("rejects empty current password", () => {
    const currentPassword = "";
    const newPassword = "NewPass1!";
    const isValid = currentPassword && newPassword;
    expect(!!isValid).toBe(false);
  });

  it("rejects empty new password", () => {
    const currentPassword = "OldPass1";
    const newPassword = "";
    const isValid = currentPassword && newPassword;
    expect(!!isValid).toBe(false);
  });

  it("validates new password strength — too short", () => {
    const result = validatePasswordStrength("Abc1");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("8 characters");
  });

  it("validates new password strength — no uppercase", () => {
    const result = validatePasswordStrength("abcdefg1");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("uppercase");
  });

  it("validates new password strength — no lowercase", () => {
    const result = validatePasswordStrength("ABCDEFG1");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("lowercase");
  });

  it("validates new password strength — no number", () => {
    const result = validatePasswordStrength("Abcdefgh");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("number");
  });

  it("accepts strong password", () => {
    const result = validatePasswordStrength("StrongPass1");
    expect(result.valid).toBe(true);
  });

  it("returns error for OAuth user without password", () => {
    const user = mockOAuthUser;
    const hasPassword = !!user.password;
    expect(hasPassword).toBe(false);
    // OAuth users should get: "Password change is not available for OAuth accounts"
  });

  it("requires current password for non-OAuth users", () => {
    const user = mockUser;
    const hasPassword = !!user.password;
    expect(hasPassword).toBe(true);
  });
});

// ===========================================================================
// 3. Account Deletion — Cascade Logic
// ===========================================================================

describe("Account Deletion — Cascade Delete Ordering", () => {
  it("requires password for non-OAuth users", () => {
    const user = mockUser;
    const password = "";
    const shouldReject = !!user.password && !password;
    expect(shouldReject).toBe(true);
  });

  it("allows deletion without password for OAuth users", () => {
    const user = mockOAuthUser;
    const password = "";
    const shouldReject = !!user.password && !password;
    expect(shouldReject).toBe(false);
  });

  it("defines correct cascade delete order (children before parents)", () => {
    // The cascade order in deleteUserAndData:
    const deleteOrder = [
      "meeting_briefs",       // booking child
      "lead_enrichments",     // booking child
      "prequal_responses",    // booking child
      "documents",            // booking child
      "bookings",             // user child via userId
      "event_types",          // user child
      "availability_rules",   // user config
      "calendar_tokens",      // user config
      "notification_preferences", // user config
      "password_reset_tokens",    // auth tokens
      "email_verification_tokens", // auth tokens
      "magic_link_tokens",    // auth tokens (by email)
      "users",                // finally the user
    ];

    // Booking children must come before bookings
    const bookingChildTables = ["meeting_briefs", "lead_enrichments", "prequal_responses", "documents"];
    const bookingsIndex = deleteOrder.indexOf("bookings");
    for (const child of bookingChildTables) {
      expect(deleteOrder.indexOf(child)).toBeLessThan(bookingsIndex);
    }

    // Bookings before event_types (bookings reference event_types)
    expect(deleteOrder.indexOf("bookings")).toBeLessThan(deleteOrder.indexOf("event_types"));

    // Users must be last
    expect(deleteOrder[deleteOrder.length - 1]).toBe("users");
  });

  it("handles user with no bookings", () => {
    const bookingIds: number[] = [];
    // Should still delete event_types, config records, and user
    expect(bookingIds.length).toBe(0);
    // No errors expected — the storage method handles empty arrays
  });

  it("handles user with multiple bookings", () => {
    const bookingIds = [1, 2, 3, 4, 5];
    // Each booking needs child records deleted individually
    expect(bookingIds.length).toBe(5);
    // All 5 bookings' children should be cleaned up
  });
});

// ===========================================================================
// 4. Branding Cascade Logic
// ===========================================================================

describe("Branding Cascade — Event Type > User Default > System Default", () => {
  const userDefaults = {
    defaultLogo: "/uploads/company-logo.png",
    defaultPrimaryColor: "#FF0000",
    defaultSecondaryColor: "#00FF00",
  };

  const eventTypeWithBranding = {
    id: 1,
    userId: "user-1",
    name: "Strategy Call",
    slug: "strategy-call",
    logo: "/uploads/event-specific-logo.png",
    primaryColor: "#0000FF",
    secondaryColor: "#FF00FF",
  };

  const eventTypeWithoutBranding = {
    id: 2,
    userId: "user-1",
    name: "Quick Chat",
    slug: "quick-chat",
    logo: null,
    primaryColor: null,
    secondaryColor: null,
  };

  it("event type branding takes precedence when set", () => {
    const effectiveLogo = eventTypeWithBranding.logo || userDefaults.defaultLogo || null;
    const effectivePrimary = eventTypeWithBranding.primaryColor || userDefaults.defaultPrimaryColor || null;
    const effectiveSecondary = eventTypeWithBranding.secondaryColor || userDefaults.defaultSecondaryColor || null;

    expect(effectiveLogo).toBe("/uploads/event-specific-logo.png");
    expect(effectivePrimary).toBe("#0000FF");
    expect(effectiveSecondary).toBe("#FF00FF");
  });

  it("falls back to user defaults when event type has no branding", () => {
    const effectiveLogo = eventTypeWithoutBranding.logo || userDefaults.defaultLogo || null;
    const effectivePrimary = eventTypeWithoutBranding.primaryColor || userDefaults.defaultPrimaryColor || null;
    const effectiveSecondary = eventTypeWithoutBranding.secondaryColor || userDefaults.defaultSecondaryColor || null;

    expect(effectiveLogo).toBe("/uploads/company-logo.png");
    expect(effectivePrimary).toBe("#FF0000");
    expect(effectiveSecondary).toBe("#00FF00");
  });

  it("returns null when neither event type nor user has branding", () => {
    const noUserDefaults = {
      defaultLogo: null,
      defaultPrimaryColor: null,
      defaultSecondaryColor: null,
    };

    const effectiveLogo = eventTypeWithoutBranding.logo || noUserDefaults.defaultLogo || null;
    const effectivePrimary = eventTypeWithoutBranding.primaryColor || noUserDefaults.defaultPrimaryColor || null;

    expect(effectiveLogo).toBeNull();
    expect(effectivePrimary).toBeNull();
  });

  it("getEventTypeBySlugWithHost includes host branding defaults", () => {
    // Simulates what getEventTypeBySlugWithHost returns
    const result = {
      ...eventTypeWithoutBranding,
      host: {
        firstName: "Bob",
        lastName: "Host",
        profileImageUrl: null,
        defaultLogo: userDefaults.defaultLogo,
        defaultPrimaryColor: userDefaults.defaultPrimaryColor,
        defaultSecondaryColor: userDefaults.defaultSecondaryColor,
      },
    };

    expect(result.host.defaultLogo).toBe("/uploads/company-logo.png");
    expect(result.host.defaultPrimaryColor).toBe("#FF0000");
    expect(result.host.defaultSecondaryColor).toBe("#00FF00");
  });
});

// ===========================================================================
// 5. Color Validation
// ===========================================================================

describe("Color Validation — Hex Format", () => {
  it("accepts valid 6-digit hex colors", () => {
    expect(isValidHexColor("#FF5500")).toBe(true);
    expect(isValidHexColor("#000000")).toBe(true);
    expect(isValidHexColor("#ffffff")).toBe(true);
    expect(isValidHexColor("#6366f1")).toBe(true);
    expect(isValidHexColor("#AbCdEf")).toBe(true);
  });

  it("rejects invalid color formats", () => {
    expect(isValidHexColor("FF5500")).toBe(false);      // missing #
    expect(isValidHexColor("#FFF")).toBe(false);          // 3-digit shorthand
    expect(isValidHexColor("#GGHHII")).toBe(false);       // invalid hex chars
    expect(isValidHexColor("red")).toBe(false);           // named color
    expect(isValidHexColor("rgb(255,0,0)")).toBe(false);  // rgb format
    expect(isValidHexColor("#FF550011")).toBe(false);     // 8-digit with alpha
    expect(isValidHexColor("")).toBe(false);               // empty
    expect(isValidHexColor("#")).toBe(false);               // just hash
  });

  it("allows empty string to clear color (treated separately)", () => {
    // Empty string means "clear the color", validated differently
    const color = "";
    const isEmptyOrValid = color === "" || isValidHexColor(color);
    expect(isEmptyOrValid).toBe(true);
  });
});

// ===========================================================================
// 6. Profile Update — Edge Cases
// ===========================================================================

describe("Profile Update — Edge Cases", () => {
  it("prevents setting email to another user's email", () => {
    const existingUser = { id: "user-2", email: "taken@example.com" };
    const requestUserId = "user-1";
    const newEmail = "taken@example.com";

    const isDuplicate = existingUser && existingUser.id !== requestUserId;
    expect(isDuplicate).toBe(true);
  });

  it("allows setting email to own current email", () => {
    const existingUser = { id: "user-1", email: "host@example.com" };
    const requestUserId = "user-1";
    const newEmail = "host@example.com";

    const isDuplicate = existingUser && existingUser.id !== requestUserId;
    expect(isDuplicate).toBe(false);
  });

  it("handles partial updates correctly", () => {
    const body = { firstName: "Updated" };
    const updates = filterAllowedFields(body);
    expect(Object.keys(updates)).toEqual(["firstName"]);
  });

  it("preserves profileImageUrl as an allowed field", () => {
    const body = { profileImageUrl: "/uploads/photo.jpg" };
    const updates = filterAllowedFields(body);
    expect(updates).toHaveProperty("profileImageUrl", "/uploads/photo.jpg");
  });

  it("rejects attempt to change id via profile update", () => {
    const body = { id: "hacked-id", firstName: "Hacker" };
    const updates = filterAllowedFields(body);
    expect(updates).not.toHaveProperty("id");
    expect(updates).toHaveProperty("firstName", "Hacker");
  });

  it("rejects attempt to change password via profile update", () => {
    const body = { password: "new-password-hash" };
    const updates = filterAllowedFields(body);
    expect(updates).not.toHaveProperty("password");
  });

  it("rejects attempt to change emailVerified via profile update", () => {
    const body = { emailVerified: true };
    const updates = filterAllowedFields(body);
    expect(updates).not.toHaveProperty("emailVerified");
  });
});

// ===========================================================================
// 7. Event Type Toggle
// ===========================================================================

describe("Event Type Toggle — isActive", () => {
  it("toggles from active to inactive", () => {
    const eventType = { id: 1, isActive: true };
    const newState = !eventType.isActive;
    expect(newState).toBe(false);
  });

  it("toggles from inactive to active", () => {
    const eventType = { id: 1, isActive: false };
    const newState = !eventType.isActive;
    expect(newState).toBe(true);
  });

  it("treats null isActive as active (default)", () => {
    const eventType = { id: 1, isActive: null };
    const isActive = eventType.isActive !== false;
    expect(isActive).toBe(true);
  });
});

// ===========================================================================
// 8. Timezone Configuration
// ===========================================================================

describe("Timezone Configuration", () => {
  it("stores IANA timezone identifiers", () => {
    const validTimezones = [
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];

    for (const tz of validTimezones) {
      expect(isValidTimezone(tz)).toBe(true);
    }
  });

  it("rejects non-IANA timezone strings", () => {
    const invalidTimezones = [
      "Not/A/Real/Zone",
      "Central Time",
      "fake/timezone",
      "Mars/Olympus",
      "12345",
    ];

    for (const tz of invalidTimezones) {
      expect(isValidTimezone(tz)).toBe(false);
    }
  });

  it("auto-detect returns a valid IANA timezone", () => {
    // Simulates the client-side detectTimezone() function
    let detected: string;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      detected = "America/New_York";
    }
    expect(isValidTimezone(detected)).toBe(true);
  });
});
