import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: class {
      chat = { completions: { create: mockCreate } };
    },
    __mockCreate: mockCreate,
  };
});

import { processEventTypeCreation } from "../ai-service";
import * as openaiModule from "openai";
const mockCreate = (openaiModule as any).__mockCreate;

describe("processEventTypeCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AI response for initial message", async () => {
    const aiResponse = {
      response: "What kind of meeting is this?",
      complete: false,
      action: null,
      eventType: null,
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processEventTypeCreation([
      { role: "user", content: "I want to create a new event type" },
    ]);

    expect(typeof result.response).toBe("string");
    expect(result.response).toBe("What kind of meeting is this?");
    expect(result.complete).toBe(false);
    expect(result.action).toBeNull();
    expect(result.eventType).toBeNull();
  });

  it("detects website URL and returns scan action", async () => {
    const aiResponse = {
      response: "Let me scan your website...",
      complete: false,
      action: { type: "scan_website", url: "https://example.com" },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processEventTypeCreation([
      { role: "user", content: "My website is https://example.com" },
    ]);

    expect(result.action).toBeDefined();
    expect(result.action!.type).toBe("scan_website");
    expect(result.action!.url).toBe("https://example.com");
    expect(result.complete).toBe(false);
  });

  it("returns complete event type when done", async () => {
    const aiResponse = {
      response: "Here's your event type!",
      complete: true,
      eventType: {
        name: "Discovery Call",
        slug: "discovery-call",
        description: "A 30-minute discovery call",
        duration: 30,
        location: "google-meet",
        questions: ["What brings you here?"],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processEventTypeCreation([
      { role: "user", content: "I want a 30 min discovery call on Google Meet" },
    ]);

    expect(result.complete).toBe(true);
    expect(result.eventType).toBeDefined();
    expect(result.eventType!.name).toBe("Discovery Call");
    expect(result.eventType!.slug).toBe("discovery-call");
    expect(result.eventType!.description).toBe("A 30-minute discovery call");
    expect(result.eventType!.duration).toBe(30);
    expect(result.eventType!.location).toBe("google-meet");
    expect(result.eventType!.questions).toEqual(["What brings you here?"]);
  });

  it("generates slug from event type name", async () => {
    const aiResponse = {
      response: "Here's your event type!",
      complete: true,
      eventType: {
        name: "My Cool Meeting",
        slug: "anything",
        description: "A cool meeting",
        duration: 45,
        location: "zoom",
        questions: [],
      },
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await processEventTypeCreation([
      { role: "user", content: "Create a meeting called My Cool Meeting" },
    ]);

    // The function regenerates the slug from the name
    expect(result.eventType!.slug).toBe("my-cool-meeting");
  });

  it("includes calendar note when connected", async () => {
    const aiResponse = {
      response: "What kind of meeting would you like to create?",
      complete: false,
      action: null,
      eventType: null,
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    await processEventTypeCreation(
      [{ role: "user", content: "I want to create an event type" }],
      true,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const systemContent = mockCreate.mock.calls[0][0].messages[0]
      .content as string;
    expect(systemContent).toContain("Google Meet");
  });

  it("handles AI error gracefully", async () => {
    mockCreate.mockRejectedValueOnce(new Error("OpenAI API error"));

    const result = await processEventTypeCreation([
      { role: "user", content: "I want to create an event type" },
    ]);

    expect(result.response).toContain("trouble");
    expect(result.complete).toBe(false);
  });

  it("handles empty AI response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const result = await processEventTypeCreation([
      { role: "user", content: "I want to create an event type" },
    ]);

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });
});
