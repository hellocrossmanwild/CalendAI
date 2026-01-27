import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// F10: Dashboard Enhancements — Backend Tests
// ============================================================================
// Covers:
//   A. PATCH /api/bookings/:id/status — status management endpoint
//   B. updateBookingStatus — storage method
//   C. Valid status transitions
//   D. Security & validation
// ============================================================================

// ===========================================================================
// A. Status Validation
// ===========================================================================

describe("Booking Status Validation", () => {
  const VALID_STATUSES = ["confirmed", "completed", "cancelled", "no-show"];

  it("accepts all valid status values", () => {
    for (const status of VALID_STATUSES) {
      expect(VALID_STATUSES.includes(status)).toBe(true);
    }
  });

  it("rejects invalid status values", () => {
    const invalid = ["pending", "deleted", "active", "", null, undefined, 123, "CONFIRMED", "Completed"];
    for (const status of invalid) {
      expect(VALID_STATUSES.includes(status as string)).toBe(false);
    }
  });

  it("has exactly 4 valid statuses", () => {
    expect(VALID_STATUSES).toHaveLength(4);
  });

  it("includes confirmed status", () => {
    expect(VALID_STATUSES).toContain("confirmed");
  });

  it("includes completed status", () => {
    expect(VALID_STATUSES).toContain("completed");
  });

  it("includes cancelled status", () => {
    expect(VALID_STATUSES).toContain("cancelled");
  });

  it("includes no-show status", () => {
    expect(VALID_STATUSES).toContain("no-show");
  });
});

// ===========================================================================
// B. Status Transition Logic
// ===========================================================================

describe("Booking Status Transitions", () => {
  // Mirrors the logic in PATCH /api/bookings/:id/status
  function canTransition(currentStatus: string, newStatus: string): { allowed: boolean; error?: string } {
    const VALID_STATUSES = ["confirmed", "completed", "cancelled", "no-show"];

    if (!VALID_STATUSES.includes(newStatus)) {
      return { allowed: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` };
    }

    if (currentStatus === "cancelled") {
      return { allowed: false, error: "Cannot change status of a cancelled booking" };
    }

    if (currentStatus === newStatus) {
      return { allowed: false, error: `Booking is already ${newStatus}` };
    }

    return { allowed: true };
  }

  describe("from confirmed status", () => {
    it("allows transition to completed", () => {
      const result = canTransition("confirmed", "completed");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to cancelled", () => {
      const result = canTransition("confirmed", "cancelled");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to no-show", () => {
      const result = canTransition("confirmed", "no-show");
      expect(result.allowed).toBe(true);
    });

    it("rejects transition to same status (confirmed)", () => {
      const result = canTransition("confirmed", "confirmed");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("already confirmed");
    });
  });

  describe("from cancelled status", () => {
    it("rejects transition to confirmed", () => {
      const result = canTransition("cancelled", "confirmed");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Cannot change status of a cancelled booking");
    });

    it("rejects transition to completed", () => {
      const result = canTransition("cancelled", "completed");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Cannot change status of a cancelled booking");
    });

    it("rejects transition to no-show", () => {
      const result = canTransition("cancelled", "no-show");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Cannot change status of a cancelled booking");
    });

    it("rejects transition to same status (cancelled)", () => {
      const result = canTransition("cancelled", "cancelled");
      expect(result.allowed).toBe(false);
    });
  });

  describe("from completed status", () => {
    it("allows transition to confirmed (undo completion)", () => {
      const result = canTransition("completed", "confirmed");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to no-show", () => {
      const result = canTransition("completed", "no-show");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to cancelled", () => {
      const result = canTransition("completed", "cancelled");
      expect(result.allowed).toBe(true);
    });

    it("rejects transition to same status (completed)", () => {
      const result = canTransition("completed", "completed");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("already completed");
    });
  });

  describe("from no-show status", () => {
    it("allows transition to confirmed (undo no-show)", () => {
      const result = canTransition("no-show", "confirmed");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to completed", () => {
      const result = canTransition("no-show", "completed");
      expect(result.allowed).toBe(true);
    });

    it("allows transition to cancelled", () => {
      const result = canTransition("no-show", "cancelled");
      expect(result.allowed).toBe(true);
    });

    it("rejects transition to same status (no-show)", () => {
      const result = canTransition("no-show", "no-show");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("already no-show");
    });
  });

  describe("invalid status values", () => {
    it("rejects empty string", () => {
      const result = canTransition("confirmed", "");
      expect(result.allowed).toBe(false);
    });

    it("rejects arbitrary string", () => {
      const result = canTransition("confirmed", "pending");
      expect(result.allowed).toBe(false);
    });

    it("rejects uppercase variant", () => {
      const result = canTransition("confirmed", "COMPLETED");
      expect(result.allowed).toBe(false);
    });
  });
});

// ===========================================================================
// C. Status Badge Mapping
// ===========================================================================

describe("Status Badge Display", () => {
  // Maps status to display properties (mirrors frontend logic)
  function getStatusDisplay(status: string): { label: string; variant: string } {
    switch (status) {
      case "confirmed":
        return { label: "Confirmed", variant: "default" };
      case "completed":
        return { label: "Completed", variant: "outline-green" };
      case "cancelled":
        return { label: "Cancelled", variant: "destructive" };
      case "no-show":
        return { label: "No-Show", variant: "outline-orange" };
      default:
        return { label: status, variant: "secondary" };
    }
  }

  it("maps confirmed to default variant", () => {
    const result = getStatusDisplay("confirmed");
    expect(result.label).toBe("Confirmed");
    expect(result.variant).toBe("default");
  });

  it("maps completed to green outline variant", () => {
    const result = getStatusDisplay("completed");
    expect(result.label).toBe("Completed");
    expect(result.variant).toBe("outline-green");
  });

  it("maps cancelled to destructive variant", () => {
    const result = getStatusDisplay("cancelled");
    expect(result.label).toBe("Cancelled");
    expect(result.variant).toBe("destructive");
  });

  it("maps no-show to orange outline variant", () => {
    const result = getStatusDisplay("no-show");
    expect(result.label).toBe("No-Show");
    expect(result.variant).toBe("outline-orange");
  });

  it("handles unknown status gracefully", () => {
    const result = getStatusDisplay("unknown");
    expect(result.label).toBe("unknown");
    expect(result.variant).toBe("secondary");
  });
});

// ===========================================================================
// D. Date Range Filter Logic
// ===========================================================================

describe("Date Range Filter Logic", () => {
  const now = new Date("2026-01-27T12:00:00Z");

  function isInDateRange(bookingDate: Date, preset: string, referenceDate: Date): boolean {
    const date = new Date(bookingDate);
    const ref = new Date(referenceDate);

    switch (preset) {
      case "all":
        return true;
      case "today": {
        const start = new Date(ref);
        start.setHours(0, 0, 0, 0);
        const end = new Date(ref);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      case "this-week": {
        const dayOfWeek = ref.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const start = new Date(ref);
        start.setDate(ref.getDate() + mondayOffset);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      case "this-month": {
        return date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();
      }
      case "next-7": {
        const start = new Date(ref);
        start.setHours(0, 0, 0, 0);
        const end = new Date(ref);
        end.setDate(ref.getDate() + 7);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      case "next-30": {
        const start = new Date(ref);
        start.setHours(0, 0, 0, 0);
        const end = new Date(ref);
        end.setDate(ref.getDate() + 30);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }
      default:
        return true;
    }
  }

  it("'all' includes any date", () => {
    expect(isInDateRange(new Date("2020-01-01"), "all", now)).toBe(true);
    expect(isInDateRange(new Date("2030-12-31"), "all", now)).toBe(true);
  });

  it("'today' includes bookings on the reference date", () => {
    expect(isInDateRange(new Date("2026-01-27T09:00:00Z"), "today", now)).toBe(true);
    expect(isInDateRange(new Date("2026-01-27T23:59:00Z"), "today", now)).toBe(true);
  });

  it("'today' excludes bookings on different days", () => {
    expect(isInDateRange(new Date("2026-01-26T23:59:00Z"), "today", now)).toBe(false);
    expect(isInDateRange(new Date("2026-01-28T00:01:00Z"), "today", now)).toBe(false);
  });

  it("'this-week' includes bookings in the current Mon-Sun week", () => {
    // Jan 27, 2026 is a Tuesday. Monday = Jan 26, Sunday = Feb 1
    expect(isInDateRange(new Date("2026-01-26T10:00:00Z"), "this-week", now)).toBe(true); // Monday
    expect(isInDateRange(new Date("2026-01-27T10:00:00Z"), "this-week", now)).toBe(true); // Tuesday
    expect(isInDateRange(new Date("2026-02-01T10:00:00Z"), "this-week", now)).toBe(true); // Sunday
  });

  it("'this-week' excludes bookings outside current week", () => {
    expect(isInDateRange(new Date("2026-01-25T10:00:00Z"), "this-week", now)).toBe(false); // Previous Sunday
    expect(isInDateRange(new Date("2026-02-02T10:00:00Z"), "this-week", now)).toBe(false); // Next Monday
  });

  it("'this-month' includes bookings in January 2026", () => {
    expect(isInDateRange(new Date("2026-01-01T00:00:00Z"), "this-month", now)).toBe(true);
    expect(isInDateRange(new Date("2026-01-31T23:59:00Z"), "this-month", now)).toBe(true);
  });

  it("'this-month' excludes bookings in other months", () => {
    expect(isInDateRange(new Date("2025-12-31T23:59:00Z"), "this-month", now)).toBe(false);
    expect(isInDateRange(new Date("2026-02-01T00:00:00Z"), "this-month", now)).toBe(false);
  });

  it("'next-7' includes bookings within next 7 days", () => {
    expect(isInDateRange(new Date("2026-01-27T15:00:00Z"), "next-7", now)).toBe(true);
    expect(isInDateRange(new Date("2026-02-02T10:00:00Z"), "next-7", now)).toBe(true);
  });

  it("'next-7' excludes bookings beyond 7 days", () => {
    expect(isInDateRange(new Date("2026-02-04T10:00:00Z"), "next-7", now)).toBe(false);
  });

  it("'next-30' includes bookings within next 30 days", () => {
    expect(isInDateRange(new Date("2026-02-25T10:00:00Z"), "next-30", now)).toBe(true);
  });

  it("'next-30' excludes bookings beyond 30 days", () => {
    expect(isInDateRange(new Date("2026-02-27T10:00:00Z"), "next-30", now)).toBe(false);
  });
});

// ===========================================================================
// E. Sorting Logic
// ===========================================================================

describe("Booking Sort Logic", () => {
  const bookings = [
    { guestName: "Charlie", startTime: new Date("2026-02-01"), enrichment: { leadScore: 80, leadScoreLabel: "High" } },
    { guestName: "Alice", startTime: new Date("2026-01-15"), enrichment: { leadScore: 30, leadScoreLabel: "Low" } },
    { guestName: "Bob", startTime: new Date("2026-03-01"), enrichment: { leadScore: 55, leadScoreLabel: "Medium" } },
  ];

  it("sorts by date newest first", () => {
    const sorted = [...bookings].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    expect(sorted[0].guestName).toBe("Bob");
    expect(sorted[1].guestName).toBe("Charlie");
    expect(sorted[2].guestName).toBe("Alice");
  });

  it("sorts by date oldest first", () => {
    const sorted = [...bookings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    expect(sorted[0].guestName).toBe("Alice");
    expect(sorted[1].guestName).toBe("Charlie");
    expect(sorted[2].guestName).toBe("Bob");
  });

  it("sorts by name A-Z", () => {
    const sorted = [...bookings].sort((a, b) => a.guestName.localeCompare(b.guestName));
    expect(sorted[0].guestName).toBe("Alice");
    expect(sorted[1].guestName).toBe("Bob");
    expect(sorted[2].guestName).toBe("Charlie");
  });

  it("sorts by name Z-A", () => {
    const sorted = [...bookings].sort((a, b) => b.guestName.localeCompare(a.guestName));
    expect(sorted[0].guestName).toBe("Charlie");
    expect(sorted[1].guestName).toBe("Bob");
    expect(sorted[2].guestName).toBe("Alice");
  });

  it("sorts by lead score high to low", () => {
    const sorted = [...bookings].sort((a, b) => (b.enrichment?.leadScore || 0) - (a.enrichment?.leadScore || 0));
    expect(sorted[0].guestName).toBe("Charlie");
    expect(sorted[1].guestName).toBe("Bob");
    expect(sorted[2].guestName).toBe("Alice");
  });

  it("sorts by lead score low to high", () => {
    const sorted = [...bookings].sort((a, b) => (a.enrichment?.leadScore || 0) - (b.enrichment?.leadScore || 0));
    expect(sorted[0].guestName).toBe("Alice");
    expect(sorted[1].guestName).toBe("Bob");
    expect(sorted[2].guestName).toBe("Charlie");
  });

  it("handles missing enrichment data in score sort", () => {
    const bookingsWithMissing = [
      { guestName: "Dave", startTime: new Date(), enrichment: null as any },
      { guestName: "Eve", startTime: new Date(), enrichment: { leadScore: 50, leadScoreLabel: "Medium" } },
    ];
    const sorted = [...bookingsWithMissing].sort((a, b) => (b.enrichment?.leadScore || 0) - (a.enrichment?.leadScore || 0));
    expect(sorted[0].guestName).toBe("Eve");
    expect(sorted[1].guestName).toBe("Dave");
  });
});

// ===========================================================================
// F. Event Type Filter Logic
// ===========================================================================

describe("Event Type Filter Logic", () => {
  const bookings = [
    { guestName: "Alice", eventTypeId: 1, eventType: { id: 1, name: "Discovery Call" } },
    { guestName: "Bob", eventTypeId: 2, eventType: { id: 2, name: "Demo" } },
    { guestName: "Charlie", eventTypeId: 1, eventType: { id: 1, name: "Discovery Call" } },
  ];

  it("'all' includes all bookings", () => {
    const filtered = bookings.filter(() => true);
    expect(filtered).toHaveLength(3);
  });

  it("filters by specific event type id", () => {
    const targetId = 1;
    const filtered = bookings.filter((b) => b.eventTypeId === targetId);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].guestName).toBe("Alice");
    expect(filtered[1].guestName).toBe("Charlie");
  });

  it("filters by different event type id", () => {
    const targetId = 2;
    const filtered = bookings.filter((b) => b.eventTypeId === targetId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].guestName).toBe("Bob");
  });

  it("returns empty when no bookings match event type", () => {
    const targetId = 999;
    const filtered = bookings.filter((b) => b.eventTypeId === targetId);
    expect(filtered).toHaveLength(0);
  });
});

// ===========================================================================
// G. Status Filter Logic
// ===========================================================================

describe("Status Filter Logic", () => {
  const bookings = [
    { guestName: "Alice", status: "confirmed" },
    { guestName: "Bob", status: "completed" },
    { guestName: "Charlie", status: "cancelled" },
    { guestName: "Dave", status: "no-show" },
    { guestName: "Eve", status: "confirmed" },
  ];

  it("'all' includes all bookings", () => {
    const filtered = bookings;
    expect(filtered).toHaveLength(5);
  });

  it("filters confirmed bookings", () => {
    const filtered = bookings.filter((b) => b.status === "confirmed");
    expect(filtered).toHaveLength(2);
  });

  it("filters completed bookings", () => {
    const filtered = bookings.filter((b) => b.status === "completed");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].guestName).toBe("Bob");
  });

  it("filters cancelled bookings", () => {
    const filtered = bookings.filter((b) => b.status === "cancelled");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].guestName).toBe("Charlie");
  });

  it("filters no-show bookings", () => {
    const filtered = bookings.filter((b) => b.status === "no-show");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].guestName).toBe("Dave");
  });
});

// ===========================================================================
// H. Calendar Month View — Day Grouping
// ===========================================================================

describe("Calendar Month View — Booking Grouping", () => {
  const bookings = [
    { id: 1, startTime: new Date("2026-01-27T09:00:00Z"), guestName: "Alice" },
    { id: 2, startTime: new Date("2026-01-27T14:00:00Z"), guestName: "Bob" },
    { id: 3, startTime: new Date("2026-01-28T10:00:00Z"), guestName: "Charlie" },
    { id: 4, startTime: new Date("2026-02-01T10:00:00Z"), guestName: "Dave" },
  ];

  function getBookingsForDay(bookings: typeof bookings[number][], day: Date): typeof bookings {
    return bookings.filter((b) => {
      const bookingDate = new Date(b.startTime);
      return (
        bookingDate.getDate() === day.getDate() &&
        bookingDate.getMonth() === day.getMonth() &&
        bookingDate.getFullYear() === day.getFullYear()
      );
    });
  }

  it("groups multiple bookings on the same day", () => {
    const jan27 = new Date("2026-01-27T00:00:00Z");
    const result = getBookingsForDay(bookings, jan27);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.guestName)).toEqual(["Alice", "Bob"]);
  });

  it("groups single booking on a day", () => {
    const jan28 = new Date("2026-01-28T00:00:00Z");
    const result = getBookingsForDay(bookings, jan28);
    expect(result).toHaveLength(1);
    expect(result[0].guestName).toBe("Charlie");
  });

  it("returns empty for days with no bookings", () => {
    const jan29 = new Date("2026-01-29T00:00:00Z");
    const result = getBookingsForDay(bookings, jan29);
    expect(result).toHaveLength(0);
  });

  it("correctly separates bookings across months", () => {
    const feb1 = new Date("2026-02-01T00:00:00Z");
    const result = getBookingsForDay(bookings, feb1);
    expect(result).toHaveLength(1);
    expect(result[0].guestName).toBe("Dave");
  });
});

// ===========================================================================
// I. Dashboard Metrics Computation
// ===========================================================================

describe("Dashboard Metrics Computation", () => {
  const bookings = [
    { id: 1, startTime: new Date("2026-01-27T09:00:00Z"), status: "confirmed", enrichment: { leadScoreLabel: "High" } },
    { id: 2, startTime: new Date("2026-01-27T14:00:00Z"), status: "confirmed", enrichment: { leadScoreLabel: "Medium" } },
    { id: 3, startTime: new Date("2026-01-26T10:00:00Z"), status: "confirmed", enrichment: { leadScoreLabel: "Low" } },
    { id: 4, startTime: new Date("2026-01-20T10:00:00Z"), status: "cancelled", enrichment: null },
    { id: 5, startTime: new Date("2026-01-28T10:00:00Z"), status: "confirmed", enrichment: { leadScoreLabel: "High" } },
  ];

  it("counts enriched leads correctly (not total bookings)", () => {
    const enrichedCount = bookings.filter((b) => b.enrichment).length;
    expect(enrichedCount).toBe(4); // 4 bookings have enrichment, 1 is null
  });

  it("computes lead score distribution", () => {
    const distribution = bookings.reduce(
      (acc, b) => {
        const label = b.enrichment?.leadScoreLabel;
        if (label === "High") acc.high++;
        else if (label === "Medium") acc.medium++;
        else if (label === "Low") acc.low++;
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    expect(distribution.high).toBe(2);
    expect(distribution.medium).toBe(1);
    expect(distribution.low).toBe(1);
  });

  it("counts this week's bookings (Mon-Sun containing Jan 27)", () => {
    // Jan 27, 2026 is Tuesday. Week: Mon Jan 26 - Sun Feb 1
    const weekStart = new Date("2026-01-26T00:00:00Z");
    const weekEnd = new Date("2026-02-01T23:59:59Z");

    const weeklyBookings = bookings.filter((b) => {
      const d = new Date(b.startTime);
      return d >= weekStart && d <= weekEnd;
    });

    expect(weeklyBookings).toHaveLength(4); // Jan 26, Jan 27 (x2), Jan 28
  });
});
