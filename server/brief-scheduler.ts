/**
 * F11 R1: Automatic Brief Generation Scheduler
 *
 * Runs on a 15-minute interval to generate meeting prep briefs
 * for confirmed bookings in the next 1-2 hours that don't already have briefs.
 */
import { addHours } from "date-fns";
import { storage } from "./storage";
import { generateMeetingBrief } from "./ai-service";
import { sendEmail } from "./email-service";
import * as emailTemplates from "./email-templates";
import type { Booking } from "@shared/schema";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let cycleRunning = false;

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [brief-scheduler] ${message}`);
}

/**
 * Generate and deliver a meeting prep brief for a single booking.
 */
async function generateAndDeliverBrief(booking: Booking): Promise<void> {
  // 1. Get full booking details
  const details = await storage.getBookingWithDetails(booking.id);
  if (!details) {
    log(`Booking ${booking.id} not found when fetching details, skipping`);
    return;
  }

  // 2. Enrichment is optional — don't block brief on it
  const enrichment = details.enrichment || null;

  // 3. Get documents
  const docs = await storage.getDocuments(booking.id);

  // 4. Generate the brief via AI
  const briefData = await generateMeetingBrief(
    details.guestName,
    details.guestEmail,
    details.guestCompany,
    details.eventType?.name || "Meeting",
    details.eventType?.description || null,
    enrichment,
    details.notes,
    details.prequalResponse?.chatHistory || null,
    docs.map((d: any) => ({ name: d.name, contentType: d.contentType || "unknown", size: d.size || 0 }))
  );

  // 5. Store the brief
  const brief = await storage.createMeetingBrief({
    bookingId: booking.id,
    summary: briefData.summary,
    talkingPoints: briefData.talkingPoints,
    keyContext: briefData.keyContext,
    documentAnalysis: briefData.documentAnalysis,
  });

  log(`Brief generated for booking ${booking.id} (guest: ${details.guestName})`);

  // 6. Attempt to send email notification
  try {
    // Check notification preferences for the host
    const prefs = await storage.getNotificationPreferences(booking.userId);
    if (prefs && prefs.meetingBriefEmail === false) {
      log(`Host ${booking.userId} has brief emails disabled, skipping email`);
      return;
    }

    const { meetingPrepBriefEmail } = emailTemplates;
    if (typeof meetingPrepBriefEmail === "function") {
      const host = await storage.getUser(booking.userId);
      if (host?.email) {
        const rules = await storage.getAvailabilityRules(booking.userId);
        const hostTimezone = rules?.timezone || "UTC";
        const baseUrl = process.env.BASE_URL || "https://calendai.com";

        const template = meetingPrepBriefEmail({
          guestName: details.guestName,
          guestEmail: details.guestEmail,
          hostName: [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host",
          eventTypeName: details.eventType?.name || "Meeting",
          startTime: new Date(details.startTime),
          endTime: new Date(details.endTime),
          duration: details.eventType?.duration || 30,
          guestTimezone: details.guestTimezone || details.timezone || "UTC",
          hostTimezone,
          summary: briefData.summary,
          talkingPoints: briefData.talkingPoints,
          keyContext: briefData.keyContext,
          documentAnalysis: briefData.documentAnalysis || null,
          enrichment: enrichment ? {
            companyInfo: enrichment.companyInfo || null,
            personalInfo: enrichment.personalInfo || null,
            leadScore: enrichment.leadScore ?? null,
            leadScoreLabel: enrichment.leadScoreLabel ?? null,
            leadScoreReasoning: enrichment.leadScoreReasoning ?? null,
          } : null,
          baseUrl,
          bookingId: booking.id,
        });
        await sendEmail({
          to: host.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        log(`Brief email sent to ${host.email} for booking ${booking.id}`);
      }
    } else {
      log(`Meeting prep brief email template not yet available, skipping email for booking ${booking.id}`);
    }
  } catch (emailErr) {
    // Email failure should not block the brief generation
    log(
      `Failed to send brief email for booking ${booking.id}: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`
    );
  }
}

/**
 * Run one cycle of the brief scheduler: find upcoming bookings
 * in the next 1-2 hours without briefs and generate them.
 */
async function runBriefCycle(): Promise<void> {
  if (cycleRunning) {
    log("Previous cycle still running, skipping");
    return;
  }
  cycleRunning = true;
  try {
    const now = new Date();
    const oneHourFromNow = addHours(now, 1);
    const twoHoursFromNow = addHours(now, 2);

    const upcoming = await storage.getUpcomingBookingsWithoutBriefs(
      oneHourFromNow,
      twoHoursFromNow
    );

    if (upcoming.length === 0) {
      return;
    }

    log(`Found ${upcoming.length} upcoming booking(s) needing briefs`);

    for (const booking of upcoming) {
      try {
        await generateAndDeliverBrief(booking);
      } catch (err) {
        log(
          `Error generating brief for booking ${booking.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    log(
      `Error in brief scheduler cycle: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    cycleRunning = false;
  }
}

/**
 * Start the brief scheduler. Runs immediately once, then every 15 minutes.
 */
export function startBriefScheduler(): void {
  if (intervalHandle) {
    log("Brief scheduler is already running");
    return;
  }

  log("Starting automatic brief scheduler (every 15 minutes)");

  // Run once immediately, then on interval
  runBriefCycle();
  intervalHandle = setInterval(runBriefCycle, INTERVAL_MS);
}

/**
 * Stop the brief scheduler for graceful shutdown.
 */
export function stopBriefScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log("Brief scheduler stopped");
  }
}
