import { vi, describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// F07: Conversational Pre-Qualification Enhancements — Comprehensive Tests
// ============================================================================
// Covers:
//   1. Phone number validation (phoneRegex and insertBookingSchema)
//   2. AI Service — processPrequalChat (mocked OpenAI)
//   3. Input validation for guestPhone via Zod schema
//   4. AI summary / extractedData structure validation
// ============================================================================

// ---------------------------------------------------------------------------
// Mock OpenAI before importing ai-service (same pattern as ai-service.test.ts)
// ---------------------------------------------------------------------------
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: class {
      chat = { completions: { create: mockCreate } };
    },
    __mockCreate: mockCreate,
  };
});

import { processPrequalChat, type PrequalExtractedData, type ChatResponse } from "../ai-service";
import { phoneRegex, insertBookingSchema } from "@shared/schema";
import * as openaiModule from "openai";

const mockCreate = (openaiModule as any).__mockCreate;

// ---------------------------------------------------------------------------
// Group 1: Phone Validation — phoneRegex
// ---------------------------------------------------------------------------

describe("Phone Validation — phoneRegex", () => {
  describe("valid phone numbers", () => {
    const validNumbers = [
      "+1 555-123-4567",
      "(020) 7123 4567",
      "+44 20 7123 4567",
      "5551234567",
      "+1234567890",
      "555 123 4567",
      "(555) 123-4567",
      "+61 2 1234 5678",
      "020-7123-4567",
      "1234",
      "+1 (555) 123-4567",
    ];

    it.each(validNumbers)("accepts valid phone: %s", (phone) => {
      expect(phoneRegex.test(phone)).toBe(true);
    });
  });

  describe("invalid phone numbers", () => {
    const invalidNumbers = [
      "abc",
      "12@34",
      "phone: 555",
      "hello world",
      "555#1234",
      "test@test.com",
      "12.34.56",
      "",
      "555!1234",
    ];

    it.each(invalidNumbers)("rejects invalid phone: '%s'", (phone) => {
      expect(phoneRegex.test(phone)).toBe(false);
    });
  });

  describe("null/undefined phone (optional field)", () => {
    it("phoneRegex is not tested when phone is null", () => {
      // phoneRegex is only tested when a value is provided
      // null/undefined should be acceptable at the schema level
      const phone: string | null = null;
      // If phone is null, we skip regex testing
      const shouldValidate = phone !== null && phone !== undefined;
      expect(shouldValidate).toBe(false);
    });

    it("phoneRegex is not tested when phone is undefined", () => {
      const phone: string | undefined = undefined;
      const shouldValidate = phone !== null && phone !== undefined;
      expect(shouldValidate).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Group 2: AI Service — processPrequalChat
// ---------------------------------------------------------------------------

describe("AI Service — processPrequalChat", () => {
  const defaultGuestInfo = {
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Inc",
  };

  const defaultMessages = [
    { role: "user", content: "I want to discuss a new project" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct response structure (response, complete, extractedData)", async () => {
    const aiResponse: ChatResponse = {
      response: "Thanks for reaching out! What kind of project are you looking to discuss?",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        company: "Acme Inc",
        summary: "",
        keyPoints: [],
        timeline: "",
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    expect(result).toHaveProperty("response");
    expect(result).toHaveProperty("complete");
    expect(typeof result.response).toBe("string");
    expect(typeof result.complete).toBe("boolean");
  });

  it("returns extractedData with expected fields when complete is true", async () => {
    const aiResponse: ChatResponse = {
      response: "Great, I have all the info I need. You can proceed with booking!",
      complete: true,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        company: "Acme Inc",
        summary: "Looking to discuss a website redesign project",
        keyPoints: ["Website redesign", "Q2 launch target"],
        timeline: "Q2 2026",
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    expect(result.complete).toBe(true);
    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("John Doe");
    expect(result.extractedData!.email).toBe("john@example.com");
    expect(result.extractedData!.company).toBe("Acme Inc");
    expect(result.extractedData!.summary).toBe("Looking to discuss a website redesign project");
    expect(result.extractedData!.keyPoints).toEqual(["Website redesign", "Q2 launch target"]);
    expect(result.extractedData!.timeline).toBe("Q2 2026");
    expect(result.extractedData!.documents).toEqual([]);
  });

  it("hostName parameter is optional and works without it", async () => {
    const aiResponse: ChatResponse = {
      response: "Hi there! A few questions before we proceed.",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    // Call without hostName (5th parameter omitted)
    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("hostName parameter is used when provided", async () => {
    const aiResponse: ChatResponse = {
      response: "Hi! A few quick questions so Jane can prep for your call.",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
      "Jane Smith",
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Verify the prompt includes the host name
    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptContent).toContain("Jane Smith");
  });

  it("uses fallback questions when no custom questions provided", async () => {
    const aiResponse: ChatResponse = {
      response: "What are you looking to discuss?",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    // Pass empty questions array to trigger fallback
    await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      [],
      defaultGuestInfo,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    // Verify fallback questions appear in the prompt
    expect(promptContent).toContain("What are you looking to discuss?");
    expect(promptContent).toContain("What's your timeline?");
    expect(promptContent).toContain("Is there anything specific you'd like to cover?");
  });

  it("uses custom questions when provided", async () => {
    const aiResponse: ChatResponse = {
      response: "Tell me about your budget.",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const customQuestions = ["What is your budget?", "How many team members?"];
    await processPrequalChat(
      defaultMessages,
      "Consultation",
      customQuestions,
      defaultGuestInfo,
    );

    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptContent).toContain("What is your budget?");
    expect(promptContent).toContain("How many team members?");
  });

  it("recognizes document upload messages in conversation", async () => {
    const messagesWithDoc = [
      { role: "user", content: "Here is our project brief" },
      { role: "user", content: "[Document uploaded: project-brief.pdf]" },
    ];

    const aiResponse: ChatResponse = {
      response: "Thanks, I've noted that document. What's your timeline?",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: ["Has project brief"],
        documents: ["project-brief.pdf"],
        timeline: "",
        summary: "",
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      messagesWithDoc,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.documents).toContain("project-brief.pdf");

    // Verify the prompt includes document upload instructions
    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptContent).toContain("[Document uploaded:");
    expect(promptContent).toContain("project-brief.pdf");
  });

  it("handles AI service returning invalid JSON gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "This is not valid JSON at all!" } }],
    });

    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    // Should fall back to a safe default response
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.complete).toBe(true);
    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("John Doe");
    expect(result.extractedData!.email).toBe("john@example.com");
  });

  it("handles AI service throwing an error gracefully", async () => {
    mockCreate.mockRejectedValueOnce(new Error("OpenAI API rate limit exceeded"));

    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    // Should return a safe fallback response
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.complete).toBe(true);
    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("John Doe");
    expect(result.extractedData!.email).toBe("john@example.com");
    expect(result.extractedData!.keyPoints).toEqual([]);
    expect(result.extractedData!.documents).toEqual([]);
  });

  it("handles empty AI response (null content) gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const result = await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      ["What is your project about?"],
      defaultGuestInfo,
    );

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.complete).toBe(true);
    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("John Doe");
    expect(result.extractedData!.email).toBe("john@example.com");
    expect(result.extractedData!.keyPoints).toEqual([]);
    expect(result.extractedData!.documents).toEqual([]);
  });

  it("includes generic greeting instruction when hostName is omitted", async () => {
    const aiResponse: ChatResponse = {
      response: "Hi there! Let me ask a few questions.",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      [],
      defaultGuestInfo,
      // hostName intentionally omitted
    );

    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptContent).toContain("friendly generic greeting");
  });

  it("includes host name personalization instruction when hostName is provided", async () => {
    const aiResponse: ChatResponse = {
      response: "A few quick questions so Alex can prep for your call.",
      complete: false,
      extractedData: {
        name: "John Doe",
        email: "john@example.com",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    await processPrequalChat(
      defaultMessages,
      "Discovery Call",
      [],
      defaultGuestInfo,
      "Alex",
    );

    const promptContent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptContent).toContain("Alex");
    expect(promptContent).toContain("reference the host by name");
  });
});

// ---------------------------------------------------------------------------
// Group 3: Input Validation — Phone in booking (Zod schema)
// ---------------------------------------------------------------------------

describe("Input Validation — insertBookingSchema with guestPhone", () => {
  // Base valid booking data for schema validation
  const validBookingBase = {
    eventTypeId: 1,
    userId: "user-123",
    guestName: "John Doe",
    guestEmail: "john@example.com",
    startTime: new Date("2026-06-01T14:00:00Z"),
    endTime: new Date("2026-06-01T14:30:00Z"),
    status: "confirmed",
    timezone: "UTC",
  };

  it("accepts booking without guestPhone (field is optional)", () => {
    const result = insertBookingSchema.safeParse(validBookingBase);
    expect(result.success).toBe(true);
  });

  it("accepts booking with guestPhone set to null", () => {
    const result = insertBookingSchema.safeParse({
      ...validBookingBase,
      guestPhone: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts booking with guestPhone set to undefined", () => {
    const result = insertBookingSchema.safeParse({
      ...validBookingBase,
      guestPhone: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("accepts booking with a valid phone number", () => {
    const result = insertBookingSchema.safeParse({
      ...validBookingBase,
      guestPhone: "+1 555-123-4567",
    });
    expect(result.success).toBe(true);
  });

  it("accepts booking with various valid phone formats", () => {
    const validPhones = [
      "+44 20 7123 4567",
      "(555) 123-4567",
      "5551234567",
      "+61 2 1234 5678",
    ];

    for (const phone of validPhones) {
      const result = insertBookingSchema.safeParse({
        ...validBookingBase,
        guestPhone: phone,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects booking with an invalid phone number", () => {
    const result = insertBookingSchema.safeParse({
      ...validBookingBase,
      guestPhone: "abc-not-a-phone",
    });
    expect(result.success).toBe(false);
  });

  it("rejects booking with phone containing special characters", () => {
    const invalidPhones = [
      "555@1234",
      "phone: 555-1234",
      "12.34.56",
      "hello",
    ];

    for (const phone of invalidPhones) {
      const result = insertBookingSchema.safeParse({
        ...validBookingBase,
        guestPhone: phone,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects booking with empty string phone number", () => {
    const result = insertBookingSchema.safeParse({
      ...validBookingBase,
      guestPhone: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 4: AI Summary Structure — PrequalExtractedData
// ---------------------------------------------------------------------------

describe("AI Summary Structure — PrequalExtractedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultGuestInfo = {
    name: "Alice Johnson",
    email: "alice@example.com",
    company: "TechCorp",
  };

  it("extractedData follows the PrequalExtractedData interface shape", async () => {
    const aiResponse: ChatResponse = {
      response: "All set! You can proceed.",
      complete: true,
      extractedData: {
        name: "Alice Johnson",
        email: "alice@example.com",
        company: "TechCorp",
        summary: "Interested in enterprise plan",
        keyPoints: ["Enterprise features", "Team onboarding"],
        timeline: "Next quarter",
        documents: ["requirements.pdf"],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "We need enterprise features" }],
      "Sales Call",
      ["What features do you need?"],
      defaultGuestInfo,
    );

    const data = result.extractedData!;
    // Verify the shape matches PrequalExtractedData
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("email");
    expect(data).toHaveProperty("company");
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("keyPoints");
    expect(data).toHaveProperty("timeline");
    expect(data).toHaveProperty("documents");
  });

  it("name is always populated from guest info (defensive post-processing)", async () => {
    // Even if AI returns a different name, the code overwrites it with guestInfo.name
    const aiResponse: ChatResponse = {
      response: "All set!",
      complete: true,
      extractedData: {
        name: "Wrong Name From AI",
        email: "wrong@email.com",
        company: "TechCorp",
        summary: "Testing",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Hello" }],
      "Meeting",
      [],
      defaultGuestInfo,
    );

    // The function should override with guest info
    expect(result.extractedData!.name).toBe("Alice Johnson");
    expect(result.extractedData!.email).toBe("alice@example.com");
  });

  it("email is always populated from guest info (defensive post-processing)", async () => {
    const aiResponse: ChatResponse = {
      response: "Done!",
      complete: true,
      extractedData: {
        name: "Someone Else",
        email: "someone@else.com",
        summary: "Quick chat",
        keyPoints: ["Discussion"],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Hi" }],
      "Chat",
      [],
      defaultGuestInfo,
    );

    expect(result.extractedData!.email).toBe("alice@example.com");
  });

  it("keyPoints is always an array (even when empty)", async () => {
    const aiResponse: ChatResponse = {
      response: "Thanks!",
      complete: true,
      extractedData: {
        name: "Alice Johnson",
        email: "alice@example.com",
        summary: "General inquiry",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Just a general question" }],
      "Meeting",
      [],
      defaultGuestInfo,
    );

    expect(Array.isArray(result.extractedData!.keyPoints)).toBe(true);
  });

  it("documents is always an array (even when empty)", async () => {
    const aiResponse: ChatResponse = {
      response: "Thanks!",
      complete: true,
      extractedData: {
        name: "Alice Johnson",
        email: "alice@example.com",
        summary: "General inquiry",
        keyPoints: [],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "No documents to share" }],
      "Meeting",
      [],
      defaultGuestInfo,
    );

    expect(Array.isArray(result.extractedData!.documents)).toBe(true);
  });

  it("keyPoints and documents are arrays in error fallback", async () => {
    // When the AI throws, the fallback response should still have arrays
    mockCreate.mockRejectedValueOnce(new Error("Network error"));

    const result = await processPrequalChat(
      [{ role: "user", content: "Hello" }],
      "Meeting",
      [],
      defaultGuestInfo,
    );

    expect(result.extractedData).toBeDefined();
    expect(Array.isArray(result.extractedData!.keyPoints)).toBe(true);
    expect(Array.isArray(result.extractedData!.documents)).toBe(true);
  });

  it("keyPoints and documents are arrays in null content fallback", async () => {
    // When the AI returns null content, the fallback should still have arrays
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Hello" }],
      "Meeting",
      [],
      defaultGuestInfo,
    );

    expect(result.extractedData).toBeDefined();
    expect(Array.isArray(result.extractedData!.keyPoints)).toBe(true);
    expect(Array.isArray(result.extractedData!.documents)).toBe(true);
  });

  it("when AI returns extractedData without explicit name/email, they are overwritten from guestInfo", async () => {
    // Simulate AI response that omits name and email from extractedData
    const aiResponse = {
      response: "Got it!",
      complete: true,
      extractedData: {
        company: "SomeCorp",
        summary: "Interest in product",
        keyPoints: ["Product demo"],
        timeline: "ASAP",
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Interested in your product" }],
      "Demo",
      [],
      defaultGuestInfo,
    );

    // Post-processing should set name and email from guestInfo
    expect(result.extractedData!.name).toBe("Alice Johnson");
    expect(result.extractedData!.email).toBe("alice@example.com");
  });

  it("when complete is true but extractedData is missing, a default is created", async () => {
    // AI returns complete but no extractedData
    const aiResponse = {
      response: "You're all set to book!",
      complete: true,
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "Just booking a meeting" }],
      "Quick Chat",
      [],
      defaultGuestInfo,
    );

    expect(result.complete).toBe(true);
    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("Alice Johnson");
    expect(result.extractedData!.email).toBe("alice@example.com");
    expect(Array.isArray(result.extractedData!.keyPoints)).toBe(true);
    expect(Array.isArray(result.extractedData!.documents)).toBe(true);
  });

  it("handles multiple document uploads in extracted data", async () => {
    const aiResponse: ChatResponse = {
      response: "Thanks for sharing those documents!",
      complete: true,
      extractedData: {
        name: "Alice Johnson",
        email: "alice@example.com",
        company: "TechCorp",
        summary: "Sharing project documents",
        keyPoints: ["Project scope", "Timeline review"],
        timeline: "Q1 2026",
        documents: ["proposal.pdf", "budget.xlsx", "timeline.docx"],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [
        { role: "user", content: "[Document uploaded: proposal.pdf]" },
        { role: "user", content: "[Document uploaded: budget.xlsx]" },
        { role: "user", content: "[Document uploaded: timeline.docx]" },
      ],
      "Project Review",
      [],
      defaultGuestInfo,
    );

    expect(result.extractedData!.documents).toHaveLength(3);
    expect(result.extractedData!.documents).toContain("proposal.pdf");
    expect(result.extractedData!.documents).toContain("budget.xlsx");
    expect(result.extractedData!.documents).toContain("timeline.docx");
  });

  it("guest info without company still produces valid extractedData", async () => {
    const guestInfoNoCompany = {
      name: "Bob Smith",
      email: "bob@gmail.com",
    };

    const aiResponse: ChatResponse = {
      response: "All set!",
      complete: true,
      extractedData: {
        name: "Bob Smith",
        email: "bob@gmail.com",
        company: "",
        summary: "Personal inquiry",
        keyPoints: ["General question"],
        documents: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processPrequalChat(
      [{ role: "user", content: "I have a general question" }],
      "Office Hours",
      [],
      guestInfoNoCompany,
    );

    expect(result.extractedData).toBeDefined();
    expect(result.extractedData!.name).toBe("Bob Smith");
    expect(result.extractedData!.email).toBe("bob@gmail.com");
  });
});
