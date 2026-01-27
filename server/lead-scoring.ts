/**
 * Lead Scoring Engine (F08)
 *
 * Deterministic, rule-based scoring that evaluates enrichment data, booking
 * context, pre-qualification conversation data, and document uploads to
 * produce a numeric score, a label ("High" / "Medium" / "Low"), and a
 * human-readable reasoning string.
 */

export interface LeadScoreInput {
  enrichmentData: {
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
  };
  bookingData: {
    guestPhone?: string | null;
    notes?: string | null;
  };
  prequalData?: {
    summary?: string;
    keyPoints?: string[];
    timeline?: string;
    documents?: string[];
    company?: string;
  } | null;
  documentCount: number;
}

export interface LeadScoreResult {
  score: number;
  label: "High" | "Medium" | "Low";
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EXECUTIVE_KEYWORDS = [
  "founder",
  "ceo",
  "cto",
  "coo",
  "cfo",
  "director",
  "owner",
  "managing director",
  "president",
  "vp",
  "vice president",
  "chief",
  "partner",
  "principal",
];

const TIMELINE_KEYWORDS = [
  "soon",
  "asap",
  "immediately",
  "urgent",
  "next week",
  "next month",
  "this month",
  "this quarter",
  "q1",
  "q2",
  "q3",
  "q4",
];

function hasExecutiveRole(role: string | undefined): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return EXECUTIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

function getCompanySizePoints(size: string | undefined): { points: number; description: string } | null {
  if (!size) return null;

  // Larger companies first so "51-200" doesn't accidentally match "11-50" substring
  if (
    size.includes("51-200") ||
    size.includes("201-500") ||
    size.includes("501-1000") ||
    size.includes("1001")
  ) {
    return { points: 20, description: `Company size (${size})` };
  }

  if (size.includes("11-50")) {
    return { points: 15, description: `Company size (${size})` };
  }

  return null;
}

function hasClearUseCase(prequalData: LeadScoreInput["prequalData"]): boolean {
  if (!prequalData) return false;

  const hasSummary =
    typeof prequalData.summary === "string" && prequalData.summary.length > 20;
  const hasKeyPoints =
    Array.isArray(prequalData.keyPoints) && prequalData.keyPoints.length >= 2;

  return hasSummary || hasKeyPoints;
}

function hasUrgentTimeline(timeline: string | undefined): boolean {
  if (!timeline) return false;
  const lower = timeline.toLowerCase();
  return TIMELINE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function calculateLeadScore(input: LeadScoreInput): LeadScoreResult {
  let score = 0;
  const factors: string[] = [];

  // 1. Executive / decision-maker role (+20)
  if (hasExecutiveRole(input.enrichmentData.personalInfo?.role)) {
    score += 20;
    factors.push(`+20 Executive/decision-maker role (${input.enrichmentData.personalInfo!.role})`);
  }

  // 2. Company size (+15 or +20)
  const sizeResult = getCompanySizePoints(input.enrichmentData.companyInfo?.size);
  if (sizeResult) {
    score += sizeResult.points;
    factors.push(`+${sizeResult.points} ${sizeResult.description}`);
  }

  // 3. Clear use case in message (+15)
  if (hasClearUseCase(input.prequalData)) {
    score += 15;
    factors.push("+15 Clear use case described in pre-qualification");
  }

  // 4. Urgent / near-term timeline (+15)
  if (hasUrgentTimeline(input.prequalData?.timeline)) {
    score += 15;
    factors.push(`+15 Urgent timeline (${input.prequalData!.timeline})`);
  }

  // 5. Document uploaded (+10)
  if (input.documentCount > 0) {
    score += 10;
    factors.push(`+10 Document(s) uploaded (${input.documentCount})`);
  }

  // 6. Phone number provided (+5)
  if (input.bookingData.guestPhone && input.bookingData.guestPhone.trim().length > 0) {
    score += 5;
    factors.push("+5 Phone number provided");
  }

  // 7. LinkedIn profile found (+10)
  if (
    input.enrichmentData.personalInfo?.linkedInUrl &&
    input.enrichmentData.personalInfo.linkedInUrl.trim().length > 0
  ) {
    score += 10;
    factors.push("+10 LinkedIn profile found");
  }

  // Determine label
  let label: "High" | "Medium" | "Low";
  if (score >= 60) {
    label = "High";
  } else if (score >= 30) {
    label = "Medium";
  } else {
    label = "Low";
  }

  const reasoning =
    factors.length > 0
      ? `Score ${score} (${label}): ${factors.join("; ")}`
      : `Score ${score} (${label}): No scoring factors detected`;

  return { score, label, reasoning };
}
