import OpenAI from "openai";
import { calculateLeadScore, type LeadScoreResult } from "./lead-scoring";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface LeadEnrichmentData {
  companyInfo?: {
    name?: string;
    industry?: string;
    size?: string;
    website?: string;
    description?: string;
    recentNews?: string[];
  };
  personalInfo?: {
    role?: string;
    linkedInUrl?: string;
    bio?: string;
    interests?: string[];
  };
}

export async function enrichLead(
  name: string,
  email: string,
  company?: string,
  prequalContext?: {
    summary?: string;
    keyPoints?: string[];
    timeline?: string;
    company?: string;
  }
): Promise<LeadEnrichmentData> {
  const domain = email.split("@")[1];

  // If a company name was extracted during pre-qualification, prefer it
  const effectiveCompany = company || prequalContext?.company;

  const prequalSection = prequalContext
    ? `
Pre-qualification conversation context:
${prequalContext.summary ? `Summary: ${prequalContext.summary}` : ""}
${prequalContext.keyPoints?.length ? `Key discussion points: ${prequalContext.keyPoints.join("; ")}` : ""}
${prequalContext.timeline ? `Timeline: ${prequalContext.timeline}` : ""}
${prequalContext.company ? `Company (from conversation): ${prequalContext.company}` : ""}
`
    : "";

  const prompt = `You are a lead research assistant. Based on the following information, provide enriched data about this person and their company.

Name: ${name}
Email: ${email}
${effectiveCompany ? `Company: ${effectiveCompany}` : `Email Domain: ${domain}`}
${prequalSection}
Please research and provide:
1. Company information (industry, size estimate, description, any recent news)
2. Personal information (likely role based on typical patterns, potential LinkedIn profile structure)

Respond in JSON format with this structure:
{
  "companyInfo": {
    "name": "Company Name",
    "industry": "Industry",
    "size": "1-10 / 11-50 / 51-200 / 201-500 / 501-1000 / 1001+",
    "website": "https://company.com",
    "description": "Brief company description",
    "recentNews": ["News item 1", "News item 2"]
  },
  "personalInfo": {
    "role": "Likely role/title",
    "linkedInUrl": "https://linkedin.com/in/estimated-profile",
    "bio": "Brief bio based on available info",
    "interests": ["interest1", "interest2"]
  }
}

Be realistic - if you don't have enough information for a field, omit it. Base your response on reasonable inferences from the email domain and name.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {};
    }

    return JSON.parse(content) as LeadEnrichmentData;
  } catch (error) {
    console.error("Lead enrichment error:", error);
    return {};
  }
}

export interface MeetingBriefData {
  summary: string;
  talkingPoints: string[];
  keyContext: string[];
  documentAnalysis?: string;
}

export async function generateMeetingBrief(
  guestName: string,
  guestEmail: string,
  guestCompany: string | null,
  eventTypeName: string,
  eventTypeDescription: string | null,
  enrichment: LeadEnrichmentData | null,
  notes: string | null,
  chatHistory: { role: string; content: string }[] | null,
  documents?: { name: string; contentType: string; size: number }[]
): Promise<MeetingBriefData> {
  const enrichmentContext = enrichment
    ? `
Company Info: ${JSON.stringify(enrichment.companyInfo || {})}
Personal Info: ${JSON.stringify(enrichment.personalInfo || {})}`
    : "";

  const chatContext = chatHistory?.length
    ? `
Pre-qualification conversation:
${chatHistory.map((m) => `${m.role}: ${m.content}`).join("\n")}`
    : "";

  const documentContext = documents?.length
    ? `\nUploaded Documents:\n${documents.map(d => `- ${d.name} (${d.contentType}, ${Math.round(d.size / 1024)}KB)`).join("\n")}\nPlease include a brief note about these documents in your response.`
    : "";

  const prompt = `You are a meeting preparation assistant. Generate a comprehensive meeting brief based on the following information.

Guest: ${guestName}
Email: ${guestEmail}
${guestCompany ? `Company: ${guestCompany}` : ""}
Meeting Type: ${eventTypeName}
${eventTypeDescription ? `Meeting Description: ${eventTypeDescription}` : ""}
${notes ? `Additional Notes: ${notes}` : ""}
${enrichmentContext}
${chatContext}
${documentContext}

Generate a meeting brief with:
1. A concise summary of who this person is and what they likely want to discuss
2. 3-5 specific talking points to address in the meeting
3. Key context points to keep in mind
4. If documents are attached, a brief analysis noting the document names and likely relevance

Respond in JSON format:
{
  "summary": "A 2-3 sentence summary of the meeting context",
  "talkingPoints": ["Talking point 1", "Talking point 2", ...],
  "keyContext": ["Context item 1", "Context item 2", ...],
  "documentAnalysis": "Brief analysis of uploaded documents and their relevance, or null if no documents"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        summary: "Unable to generate brief",
        talkingPoints: [],
        keyContext: [],
      };
    }

    return JSON.parse(content) as MeetingBriefData;
  } catch (error) {
    console.error("Meeting brief generation error:", error);
    return {
      summary: "Unable to generate brief",
      talkingPoints: [],
      keyContext: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Calendar Pattern Analysis (F03)
// ---------------------------------------------------------------------------

export interface AvailabilitySuggestions {
  timezone: string;
  weeklyHours: {
    [day: string]: { start: string; end: string }[] | null;
  };
  minNotice: number;
  maxAdvance: number;
  defaultBufferBefore: number;
  defaultBufferAfter: number;
}

export async function analyseCalendarPatterns(
  events: { start: Date; end: Date; summary: string }[]
): Promise<AvailabilitySuggestions> {
  // Prepare a summary of events for the AI
  const eventSummaries = events.map((e) => ({
    day: e.start.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
    start: e.start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    end: e.end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    summary: e.summary,
    date: e.start.toISOString().split("T")[0],
  }));

  const prompt = `You are a scheduling assistant. Analyse the following calendar events from the past 4 weeks and suggest optimal availability rules for accepting new meeting bookings.

Calendar events (${eventSummaries.length} events):
${JSON.stringify(eventSummaries, null, 2)}

Based on these patterns, suggest:
1. Which days of the week this person typically works (and their working hours per day)
2. Whether there are recurring blocks to avoid (e.g., lunch breaks, standups)
3. A suggested buffer time between meetings
4. A reasonable minimum notice period
5. A reasonable maximum advance booking period

If a day has no events or very few, consider whether they likely work that day.
For working hours, use 24-hour HH:MM format.
If a day should be unavailable, set it to null.
Split the day into blocks if there's a regular break (e.g., lunch 12:00-13:00 means two blocks: 09:00-12:00 and 13:00-17:00).

Respond in JSON format:
{
  "timezone": "UTC",
  "weeklyHours": {
    "monday": [{ "start": "09:00", "end": "12:00" }, { "start": "13:00", "end": "17:00" }],
    "tuesday": [{ "start": "09:00", "end": "17:00" }],
    "wednesday": [{ "start": "09:00", "end": "17:00" }],
    "thursday": [{ "start": "09:00", "end": "17:00" }],
    "friday": [{ "start": "09:00", "end": "15:00" }],
    "saturday": null,
    "sunday": null
  },
  "minNotice": 1440,
  "maxAdvance": 60,
  "defaultBufferBefore": 0,
  "defaultBufferAfter": 15,
  "reasoning": "Brief explanation of the patterns detected"
}

minNotice is in minutes (1440 = 24 hours). maxAdvance is in days. Buffer values are in minutes.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultSuggestions();
    }

    const parsed = JSON.parse(content) as AvailabilitySuggestions & { reasoning?: string };
    return {
      timezone: parsed.timezone || "UTC",
      weeklyHours: parsed.weeklyHours || getDefaultSuggestions().weeklyHours,
      minNotice: parsed.minNotice ?? 1440,
      maxAdvance: parsed.maxAdvance ?? 60,
      defaultBufferBefore: parsed.defaultBufferBefore ?? 0,
      defaultBufferAfter: parsed.defaultBufferAfter ?? 15,
    };
  } catch (error) {
    console.error("Calendar pattern analysis error:", error);
    return getDefaultSuggestions();
  }
}

function getDefaultSuggestions(): AvailabilitySuggestions {
  return {
    timezone: "UTC",
    weeklyHours: {
      monday: [{ start: "09:00", end: "17:00" }],
      tuesday: [{ start: "09:00", end: "17:00" }],
      wednesday: [{ start: "09:00", end: "17:00" }],
      thursday: [{ start: "09:00", end: "17:00" }],
      friday: [{ start: "09:00", end: "17:00" }],
      saturday: null,
      sunday: null,
    },
    minNotice: 1440,
    maxAdvance: 60,
    defaultBufferBefore: 0,
    defaultBufferAfter: 15,
  };
}

export interface PrequalExtractedData {
  name?: string;
  email?: string;
  company?: string;
  summary?: string;
  keyPoints?: string[];
  timeline?: string;
  documents?: string[];
  [key: string]: string | string[] | undefined;
}

export interface ChatResponse {
  response: string;
  complete: boolean;
  extractedData?: PrequalExtractedData;
}

// Default fallback questions used when no custom questions are configured
const DEFAULT_PREQUAL_QUESTIONS = [
  "What are you looking to discuss?",
  "What's your timeline?",
  "Is there anything specific you'd like to cover?",
];

export async function processPrequalChat(
  messages: { role: string; content: string }[],
  eventTypeName: string,
  questions: string[],
  guestInfo: { name: string; email: string; company?: string },
  hostName?: string
): Promise<ChatResponse> {
  const effectiveQuestions = questions.length > 0 ? questions : DEFAULT_PREQUAL_QUESTIONS;

  const questionsContext = `The following are the key questions to gather information about:\n${effectiveQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;

  const hostGreetingInstruction = hostName
    ? `When greeting the guest for the first time, reference the host by name. For example: "A few quick questions so ${hostName} can prep for your call." Use "${hostName}" naturally in your opening message.`
    : "When greeting the guest for the first time, use a friendly generic greeting without referencing a specific host name.";

  const prompt = `You are a friendly pre-qualification assistant for scheduling meetings. Your goal is to naturally gather information through conversation.

Meeting type: ${eventTypeName}
Guest: ${guestInfo.name} (${guestInfo.email})${guestInfo.company ? ` from ${guestInfo.company}` : ""}

${hostGreetingInstruction}

${questionsContext}

Document Uploads:
- If a guest message contains a document reference in the format "[Document uploaded: filename.ext]", acknowledge the upload naturally (e.g., "Thanks, I've noted that document." or "Got it, I'll make sure that's included.") and continue the conversation.
- Keep track of all document names mentioned or uploaded during the conversation. Extract the filename from the "[Document uploaded: ...]" pattern.

Conversation so far:
${messages.map((m) => `${m.role === "assistant" ? "Assistant" : "Guest"}: ${m.content}`).join("\n")}

Guidelines:
- Be conversational and friendly, not robotic
- Ask one question at a time
- Acknowledge their responses before asking the next question
- Once you have gathered enough information (usually 2-3 exchanges), indicate the conversation is complete
- Keep responses concise (1-2 sentences)

Respond in JSON format:
{
  "response": "Your next message to the guest",
  "complete": true/false (true if you have enough information to proceed with booking),
  "extractedData": {
    "name": "Guest name (use: ${guestInfo.name})",
    "email": "Guest email (use: ${guestInfo.email})",
    "company": "Company name inferred from conversation or email domain, or empty string if unknown",
    "summary": "1-2 sentence summary of what the booker needs",
    "keyPoints": ["Key discussion point 1", "Key discussion point 2"],
    "timeline": "Timeline if mentioned (e.g., 'Next month', 'ASAP', 'Q2'), or empty string if not mentioned",
    "documents": ["document1.pdf"]
  }
}

Important rules for extractedData:
- Always include extractedData in your response, even when complete is false (provide partial data gathered so far).
- When complete is true, provide the full structured extractedData with all fields populated.
- For "name", always use "${guestInfo.name}".
- For "email", always use "${guestInfo.email}".
- For "company", infer from the conversation content, the guest's email domain, or their self-introduction. Use an empty string if unknown.
- For "summary", write a concise 1-2 sentence summary of the booker's needs based on the conversation.
- For "keyPoints", extract an array of the main discussion topics and requirements mentioned.
- For "timeline", include only if the guest mentioned a specific timeframe. Use an empty string if not mentioned.
- For "documents", list filenames of any documents referenced via "[Document uploaded: ...]" patterns. Use an empty array if none.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        response: "Thanks for the information! You can proceed with booking.",
        complete: true,
        extractedData: {
          name: guestInfo.name,
          email: guestInfo.email,
          keyPoints: [],
          documents: [],
        },
      };
    }

    const parsed = JSON.parse(content) as ChatResponse;

    // Ensure extractedData always contains the guest's known info
    if (parsed.extractedData) {
      parsed.extractedData.name = guestInfo.name;
      parsed.extractedData.email = guestInfo.email;
    } else if (parsed.complete) {
      parsed.extractedData = {
        name: guestInfo.name,
        email: guestInfo.email,
        keyPoints: [],
        documents: [],
      };
    }

    return parsed;
  } catch (error) {
    console.error("Chat processing error:", error);
    return {
      response: "Thanks for the information! You can proceed with booking.",
      complete: true,
      extractedData: {
        name: guestInfo.name,
        email: guestInfo.email,
        keyPoints: [],
        documents: [],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// AI-Assisted Event Type Creation (F04)
// ---------------------------------------------------------------------------

export interface EventTypeCreationResponse {
  response: string;
  complete: boolean;
  action?: {
    type: "scan_website";
    url: string;
  };
  eventType?: {
    name: string;
    slug: string;
    description: string;
    duration: number;
    location?: string;
    questions?: string[];
  };
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function processEventTypeCreation(
  messages: { role: string; content: string }[],
  calendarConnected?: boolean
): Promise<EventTypeCreationResponse> {
  const calendarNote = calendarConnected
    ? " The user has Google Calendar connected, so Google Meet is available for auto-generated meeting links."
    : "";

  const systemPrompt = `You are an AI assistant helping a user create a bookable event type for their scheduling page.

Guide them step by step. Ask about:
1) What kind of meeting (discovery call, consultation, etc.)
2) How long it should be (suggest 30 min as default)
3) Their website URL (for branding extraction)
4) Where meetings happen (Google Meet, Zoom, Phone, In-person, Custom URL)

Ask ONE question at a time. Be conversational and concise (1-2 sentences per response).

When you detect a website URL in the user's message, include an action to scan it.${calendarNote}

When you have enough info to create the event type (at minimum: name/type and duration), signal completion.

Always respond in JSON format with this structure:
{
  "response": "Your next message to the user",
  "complete": false,
  "action": null,
  "eventType": null
}

When you detect a URL in the user's message:
{
  "response": "Let me scan your website for branding...",
  "complete": false,
  "action": { "type": "scan_website", "url": "https://example.com" }
}

When you have enough information to create the event type:
{
  "response": "Here's your event type! ...",
  "complete": true,
  "eventType": {
    "name": "Discovery Call",
    "slug": "discovery-call",
    "description": "A 30-minute call to explore...",
    "duration": 30,
    "location": "google-meet",
    "questions": ["What are you looking to discuss?", "What's your timeline?"]
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        response: "I had trouble processing that. Could you try again?",
        complete: false,
      };
    }

    const parsed = JSON.parse(content) as EventTypeCreationResponse;

    // Ensure slug is properly generated from the name
    if (parsed.eventType?.name) {
      parsed.eventType.slug = generateSlug(parsed.eventType.name);
    }

    return parsed;
  } catch (error) {
    console.error("Event type creation error:", error);
    return {
      response: "I had trouble processing that. Could you try again?",
      complete: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Lead Enrichment + Scoring Orchestrator (F08)
// ---------------------------------------------------------------------------

/**
 * Enriches a lead using AI and then scores it deterministically.
 * Returns both the enrichment data and the score, or null on failure.
 * The caller (routes.ts in Phase 2) is responsible for persisting the results.
 */
export async function enrichAndScore(
  bookingId: number,
  name: string,
  email: string,
  company: string | undefined,
  guestPhone: string | null | undefined,
  notes: string | null,
  prequalData: {
    summary?: string;
    keyPoints?: string[];
    timeline?: string;
    documents?: string[];
    company?: string;
  } | null,
  documentCount: number
): Promise<{ enrichment: LeadEnrichmentData; score: LeadScoreResult } | null> {
  try {
    // 1. AI-powered enrichment (with optional pre-qual context)
    const prequalContext = prequalData
      ? {
          summary: prequalData.summary,
          keyPoints: prequalData.keyPoints,
          timeline: prequalData.timeline,
          company: prequalData.company,
        }
      : undefined;

    const enrichment = await enrichLead(name, email, company, prequalContext);

    // 2. Deterministic scoring based on all available signals
    const score = calculateLeadScore({
      enrichmentData: {
        companyInfo: enrichment.companyInfo,
        personalInfo: enrichment.personalInfo,
      },
      bookingData: {
        guestPhone: guestPhone ?? null,
        notes,
      },
      prequalData,
      documentCount,
    });

    return { enrichment, score };
  } catch (error) {
    console.error(`[enrichAndScore] Failed for booking ${bookingId}:`, error);
    return null;
  }
}
