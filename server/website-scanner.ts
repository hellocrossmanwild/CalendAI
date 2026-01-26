import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface WebsiteScanResult {
  businessName: string | null;
  description: string | null;
  suggestedEventDescription: string | null;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
  };
  warning?: string;
}

const EMPTY_RESULT: WebsiteScanResult = {
  businessName: null,
  description: null,
  suggestedEventDescription: null,
  branding: {
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
};

/**
 * Validates and normalises the provided URL. Rejects dangerous schemes and
 * prepends `https://` when no protocol is present.
 */
function normaliseUrl(raw: string): string | null {
  let url = raw.trim();

  // Block dangerous schemes before we attempt anything else.
  const dangerous = /^(javascript|data|file|vbscript|blob):/i;
  if (dangerous.test(url)) {
    return null;
  }

  // If no protocol is present, default to https.
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    // Extra guard: only allow http(s) after parsing.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Resolves a potentially-relative URL against the page's base URL.
 * Returns `null` when the value is empty or cannot be resolved.
 */
function resolveUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value.trim(), baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Extracts simple metadata from raw HTML using regex (no external parser).
 */
function extractMetadata(html: string, baseUrl: string) {
  // <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // <meta name="description" content="...">
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*?)["'][^>]*>/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']description["'][^>]*>/i,
  );
  const metaDescription = descMatch ? descMatch[1].trim() : null;

  // <meta property="og:image" content="...">
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*?)["'][^>]*>/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']og:image["'][^>]*>/i,
  );
  const ogImage = resolveUrl(ogImageMatch ? ogImageMatch[1] : null, baseUrl);

  // <link rel="icon" href="..."> or <link rel="shortcut icon" href="...">
  const faviconMatch = html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*?)["'][^>]*>/i,
  ) ?? html.match(
    /<link[^>]+href=["']([^"']*?)["'][^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i,
  );
  const favicon = resolveUrl(faviconMatch ? faviconMatch[1] : null, baseUrl);

  // <meta name="theme-color" content="...">
  const themeColorMatch = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']*?)["'][^>]*>/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']theme-color["'][^>]*>/i,
  );
  const themeColor = themeColorMatch ? themeColorMatch[1].trim() : null;

  // Body text (strip tags, collapse whitespace, limit to 5000 chars)
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  return { title, metaDescription, ogImage, favicon, themeColor, bodyText };
}

/**
 * Fetches a website URL, extracts branding information, and uses OpenAI to
 * produce structured data suitable for pre-populating a scheduling page.
 *
 * This function **never throws**. On failure it returns a result with `null`
 * fields and an explanatory `warning`.
 */
export async function scanWebsite(url: string): Promise<WebsiteScanResult> {
  // ── 1. Validate URL ──────────────────────────────────────────────────
  const validatedUrl = normaliseUrl(url);
  if (!validatedUrl) {
    return {
      ...EMPTY_RESULT,
      warning: "The provided URL is not valid. Please enter a valid website address.",
    };
  }

  // ── 2. Fetch HTML ────────────────────────────────────────────────────
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(validatedUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (compatible; CalendAI/1.0; +https://calendai.app)",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ...EMPTY_RESULT,
        warning:
          "Could not reach the website. Please enter your branding details manually.",
      };
    }

    html = await response.text();
  } catch {
    return {
      ...EMPTY_RESULT,
      warning:
        "Could not reach the website. Please enter your branding details manually.",
    };
  }

  // ── 3. Extract metadata ──────────────────────────────────────────────
  const meta = extractMetadata(html, validatedUrl);

  // ── 4. Send to GPT-4o ───────────────────────────────────────────────
  const prompt = `You are a branding analysis assistant. Analyse the following website metadata and content, then extract structured branding information.

Website URL: ${validatedUrl}

Title: ${meta.title ?? "(none)"}
Meta description: ${meta.metaDescription ?? "(none)"}
OG image URL: ${meta.ogImage ?? "(none)"}
Favicon URL: ${meta.favicon ?? "(none)"}
Theme color: ${meta.themeColor ?? "(none)"}

Body text excerpt (first 5000 chars):
${meta.bodyText}

Based on this information, identify the following and respond in JSON:
{
  "businessName": "The name of the business or organisation (string or null)",
  "description": "A concise 1-2 sentence description of what the business does (string or null)",
  "suggestedEventDescription": "A short, professional description suitable for a scheduling/booking page hosted by this business, e.g. 'Book a consultation with [Business]' (string or null)",
  "primaryColor": "The primary brand colour as a hex code, e.g. #1a73e8 (string or null)",
  "secondaryColor": "A secondary/accent brand colour as a hex code (string or null)",
  "logoUrl": "The best logo URL from the options provided (OG image: ${meta.ogImage ?? "none"}, Favicon: ${meta.favicon ?? "none"}). Choose the OG image if available, otherwise the favicon. Return the full absolute URL or null."
}

Rules:
- Only return colours as 6-digit hex codes prefixed with #.
- If you cannot confidently determine a value, set it to null.
- If a theme-color is provided, use it as the primary colour unless you have a better candidate from the page content.
- Do NOT invent or guess URLs. Only use the OG image or favicon URLs provided above.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        businessName: meta.title,
        description: meta.metaDescription,
        suggestedEventDescription: null,
        branding: {
          logoUrl: meta.ogImage ?? meta.favicon,
          primaryColor: meta.themeColor,
          secondaryColor: null,
        },
        warning: "AI analysis returned no data. Partial metadata has been used.",
      };
    }

    const parsed = JSON.parse(content) as {
      businessName?: string | null;
      description?: string | null;
      suggestedEventDescription?: string | null;
      primaryColor?: string | null;
      secondaryColor?: string | null;
      logoUrl?: string | null;
    };

    return {
      businessName: parsed.businessName ?? null,
      description: parsed.description ?? null,
      suggestedEventDescription: parsed.suggestedEventDescription ?? null,
      branding: {
        logoUrl: parsed.logoUrl ?? meta.ogImage ?? meta.favicon ?? null,
        primaryColor: parsed.primaryColor ?? meta.themeColor ?? null,
        secondaryColor: parsed.secondaryColor ?? null,
      },
    };
  } catch (error) {
    console.error("Website scan AI analysis error:", error);

    // Fall back to raw metadata so the caller still gets something useful.
    return {
      businessName: meta.title,
      description: meta.metaDescription,
      suggestedEventDescription: null,
      branding: {
        logoUrl: meta.ogImage ?? meta.favicon ?? null,
        primaryColor: meta.themeColor ?? null,
        secondaryColor: null,
      },
      warning:
        "AI analysis failed. Basic metadata has been extracted from the website.",
    };
  }
}
