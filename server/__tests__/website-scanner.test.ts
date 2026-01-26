import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock OpenAI before importing the module under test
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: class {
      chat = { completions: { create: mockCreate } };
    },
    __mockCreate: mockCreate,
  };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { scanWebsite } from "../website-scanner";
import * as openaiModule from "openai";
const mockCreate = (openaiModule as any).__mockCreate;

describe("scanWebsite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects dangerous URL schemes", async () => {
    const dangerousUrls = [
      "javascript:alert(1)",
      "data:text/html,<h1>hi</h1>",
      "file:///etc/passwd",
    ];

    for (const url of dangerousUrls) {
      const result = await scanWebsite(url);

      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("not valid");
      expect(result.businessName).toBeNull();
      expect(result.description).toBeNull();
      expect(result.suggestedEventDescription).toBeNull();
      expect(result.branding.logoUrl).toBeNull();
      expect(result.branding.primaryColor).toBeNull();
      expect(result.branding.secondaryColor).toBeNull();
    }

    // fetch should never have been called for dangerous URLs
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("prepends https when no protocol", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        "<html><head><title>Example</title></head><body>Hello</body></html>",
    });

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              businessName: "Example",
              description: null,
              suggestedEventDescription: null,
              primaryColor: null,
              secondaryColor: null,
              logoUrl: null,
            }),
          },
        },
      ],
    });

    await scanWebsite("example.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchedUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchedUrl).toMatch(/^https:\/\//);
    expect(fetchedUrl).toContain("example.com");
  });

  it("returns warning when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await scanWebsite("https://unreachable.com");

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("Could not reach");
    expect(result.businessName).toBeNull();
    expect(result.description).toBeNull();
  });

  it("returns warning for non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await scanWebsite("https://example.com");

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("Could not reach");
    expect(result.businessName).toBeNull();
  });

  it("extracts metadata from HTML", async () => {
    const html = `<html>
<head>
  <title>Acme Corp</title>
  <meta name="description" content="We build great products">
  <meta property="og:image" content="https://acme.com/og.png">
  <link rel="icon" href="/favicon.ico">
  <meta name="theme-color" content="#ff5500">
</head>
<body>Welcome to Acme Corp</body>
</html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const aiResponse = {
      businessName: "Acme Corp",
      description: "We build great products",
      suggestedEventDescription: "Book a consultation with Acme Corp",
      primaryColor: "#ff5500",
      secondaryColor: "#333333",
      logoUrl: "https://acme.com/og.png",
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });

    const result = await scanWebsite("https://acme.com");

    expect(result.businessName).toBe("Acme Corp");
    expect(result.description).toBe("We build great products");
    expect(result.suggestedEventDescription).toBe(
      "Book a consultation with Acme Corp",
    );
    expect(result.branding.primaryColor).toBe("#ff5500");
    expect(result.branding.secondaryColor).toBe("#333333");
    expect(result.branding.logoUrl).toBe("https://acme.com/og.png");
    expect(result.warning).toBeUndefined();
  });

  it("falls back to metadata when AI fails", async () => {
    const html = `<html>
<head>
  <title>Fallback Co</title>
  <meta name="theme-color" content="#0077cc">
</head>
<body>Welcome</body>
</html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    mockCreate.mockRejectedValueOnce(new Error("OpenAI API error"));

    const result = await scanWebsite("https://fallback.com");

    // Should fall back to raw metadata
    expect(result.businessName).toBe("Fallback Co");
    expect(result.branding.primaryColor).toBe("#0077cc");
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("AI analysis failed");
  });

  it("resolves relative URLs", async () => {
    const html = `<html>
<head>
  <title>Relative Test</title>
  <link rel="icon" href="/logo.png">
</head>
<body>Hello</body>
</html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              businessName: "Relative Test",
              description: null,
              suggestedEventDescription: null,
              primaryColor: null,
              secondaryColor: null,
              logoUrl: "https://example.com/logo.png",
            }),
          },
        },
      ],
    });

    await scanWebsite("https://example.com");

    // The prompt sent to OpenAI should contain the resolved favicon URL
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("https://example.com/logo.png");
  });
});
