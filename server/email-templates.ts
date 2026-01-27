/**
 * F09: HTML email template functions.
 *
 * Every function returns { subject, html, text } — the email service
 * consumes these directly.
 *
 * All user-provided strings are HTML-escaped before insertion to
 * prevent XSS in email clients that render HTML.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    // Fallback if timezone is invalid
    return date.toUTCString();
  }
}

function formatDateOnly(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function formatTimeOnly(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toTimeString().slice(0, 5) + " UTC";
  }
}

/** Shared wrapper that provides a consistent email chrome. */
function wrapHtml(bodyContent: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CalendAI</title>
${preheader ? `<span style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ""}
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <!-- Header -->
    <tr>
      <td style="padding:24px 32px 16px;border-bottom:1px solid #e4e4e7;">
        <span style="font-size:20px;font-weight:700;color:#18181b;">CalendAI</span>
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding:24px 32px 32px;">
        ${bodyContent}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:16px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
        <p style="margin:0;font-size:12px;color:#71717a;line-height:1.5;">
          This email was sent by CalendAI. If you believe you received this in error, you can safely ignore it.
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  hostName: string;
  eventTypeName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  guestTimezone: string;
  hostTimezone: string;
  location?: string | null;
  calendarEventId?: string | null;
  rescheduleToken?: string | null;
  cancelToken?: string | null;
  baseUrl: string;
}

interface HostNotificationData extends BookingEmailData {
  guestCompany?: string | null;
  guestPhone?: string | null;
  leadScore?: number | null;
  leadScoreLabel?: string | null;
  leadScoreReasoning?: string | null;
  prequalSummary?: string | null;
}

// ---------------------------------------------------------------------------
// 1. Booking Confirmation (to booker)
// ---------------------------------------------------------------------------

export function bookingConfirmationEmail(data: BookingEmailData): EmailTemplate {
  const eName = escapeHtml(data.eventTypeName);
  const gName = escapeHtml(data.guestName);
  const hName = escapeHtml(data.hostName);
  const dateStr = formatDateTime(data.startTime, data.guestTimezone);

  // Parse location for display
  let locationDisplay = "Details in calendar invite";
  if (data.location) {
    if (data.location.startsWith("google-meet")) {
      locationDisplay = "Google Meet (link in calendar invite)";
    } else if (data.location.startsWith("zoom:")) {
      locationDisplay = `<a href="${escapeHtml(data.location.slice(5))}" style="color:#6366f1;">Join Zoom Meeting</a>`;
    } else if (data.location.startsWith("phone:")) {
      locationDisplay = `Phone: ${escapeHtml(data.location.slice(6))}`;
    } else if (data.location.startsWith("in-person:")) {
      locationDisplay = escapeHtml(data.location.slice(10));
    } else if (data.location.startsWith("custom:")) {
      locationDisplay = `<a href="${escapeHtml(data.location.slice(7))}" style="color:#6366f1;">Meeting Link</a>`;
    }
  }

  // Build reschedule/cancel links
  let actionLinks = "";
  let actionLinksText = "";
  if (data.rescheduleToken || data.cancelToken) {
    const parts: string[] = [];
    const textParts: string[] = [];
    if (data.rescheduleToken) {
      const url = `${data.baseUrl}/booking/reschedule/${data.rescheduleToken}`;
      parts.push(`<a href="${escapeHtml(url)}" style="color:#6366f1;text-decoration:underline;">Reschedule</a>`);
      textParts.push(`Reschedule: ${url}`);
    }
    if (data.cancelToken) {
      const url = `${data.baseUrl}/booking/cancel/${data.cancelToken}`;
      parts.push(`<a href="${escapeHtml(url)}" style="color:#ef4444;text-decoration:underline;">Cancel</a>`);
      textParts.push(`Cancel: ${url}`);
    }
    actionLinks = `<p style="margin:16px 0 0;font-size:14px;color:#52525b;">Need to make changes? ${parts.join(" | ")}</p>`;
    actionLinksText = `\nNeed to make changes?\n${textParts.join("\n")}`;
  }

  const subject = `Confirmed: ${data.eventTypeName} with ${data.hostName}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Booking Confirmed!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hi ${gName}, your call is booked!</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:6px;margin-bottom:20px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-size:14px;color:#52525b;"><strong>${eName}</strong> with ${hName}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#18181b;">${dateStr}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#52525b;">Duration: ${data.duration} minutes</p>
        <p style="margin:0;font-size:14px;color:#52525b;">Location: ${locationDisplay}</p>
      </td></tr>
    </table>

    <p style="margin:0 0 4px;font-size:14px;color:#52525b;">A calendar invite has also been sent to your email.</p>
    ${actionLinks}
  `, `Your ${data.eventTypeName} with ${data.hostName} is confirmed`);

  const text = `Booking Confirmed!

Hi ${data.guestName}, your call is booked!

${data.eventTypeName} with ${data.hostName}
${dateStr}
Duration: ${data.duration} minutes
Location: ${data.location || "Details in calendar invite"}

A calendar invite has also been sent to your email.
${actionLinksText}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 2. Host Notification (to host)
// ---------------------------------------------------------------------------

export function hostNotificationEmail(data: HostNotificationData): EmailTemplate {
  const gName = escapeHtml(data.guestName);
  const eName = escapeHtml(data.eventTypeName);
  const dateStr = formatDateTime(data.startTime, data.hostTimezone);

  let scoreSection = "";
  let scoreText = "";
  if (data.leadScoreLabel && data.leadScore != null) {
    const colors: Record<string, string> = { High: "#22c55e", Medium: "#eab308", Low: "#ef4444" };
    const color = colors[data.leadScoreLabel] || "#71717a";
    scoreSection = `
      <p style="margin:0 0 8px;font-size:14px;color:#52525b;">
        Lead Score: <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background-color:${color}20;color:${color};font-weight:600;font-size:13px;">${escapeHtml(data.leadScoreLabel)} (${data.leadScore})</span>
      </p>`;
    scoreText = `Lead Score: ${data.leadScoreLabel} (${data.leadScore})`;
    if (data.leadScoreReasoning) {
      scoreText += `\nScoring: ${data.leadScoreReasoning}`;
    }
  }

  let companyLine = "";
  let companyText = "";
  if (data.guestCompany) {
    companyLine = `<p style="margin:0 0 6px;font-size:14px;color:#52525b;">Company: ${escapeHtml(data.guestCompany)}</p>`;
    companyText = `Company: ${data.guestCompany}`;
  }

  let phoneLine = "";
  let phoneText = "";
  if (data.guestPhone) {
    phoneLine = `<p style="margin:0 0 6px;font-size:14px;color:#52525b;">Phone: ${escapeHtml(data.guestPhone)}</p>`;
    phoneText = `Phone: ${data.guestPhone}`;
  }

  let summarySection = "";
  let summaryText = "";
  if (data.prequalSummary) {
    summarySection = `
      <p style="margin:16px 0 4px;font-size:13px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:0.05em;">Summary</p>
      <p style="margin:0;font-size:14px;color:#3f3f46;">${escapeHtml(data.prequalSummary)}</p>`;
    summaryText = `\nSummary:\n${data.prequalSummary}`;
  }

  const dashboardUrl = `${data.baseUrl}/bookings`;

  const subject = `New booking: ${data.guestName} - ${data.eventTypeName}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">New Booking!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;">You have a new booking.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:6px;margin-bottom:20px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 8px;font-size:14px;color:#52525b;"><strong>${eName}</strong></p>
        <p style="margin:0 0 6px;font-size:14px;color:#18181b;">${dateStr}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#52525b;">Guest: ${gName} (${escapeHtml(data.guestEmail)})</p>
        ${companyLine}
        ${phoneLine}
        ${scoreSection}
      </td></tr>
    </table>
    ${summarySection}

    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 20px;background-color:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Full Details</a>
    </p>
  `, `New booking from ${data.guestName} for ${data.eventTypeName}`);

  const text = `New Booking!

${data.eventTypeName}
${dateStr}
Guest: ${data.guestName} (${data.guestEmail})
${companyText}
${phoneText}
${scoreText}
${summaryText}

View details: ${dashboardUrl}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 3. Cancellation Email (to booker)
// ---------------------------------------------------------------------------

export function cancellationEmailToBooker(data: {
  guestName: string;
  hostName: string;
  eventTypeName: string;
  startTime: Date;
  guestTimezone: string;
  eventTypeSlug: string;
  baseUrl: string;
}): EmailTemplate {
  const dateStr = formatDateTime(data.startTime, data.guestTimezone);
  const rebookUrl = `${data.baseUrl}/book/${data.eventTypeSlug}`;

  const subject = `Booking Cancelled: ${data.eventTypeName} with ${data.hostName}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hi ${escapeHtml(data.guestName)}, your booking has been cancelled.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:6px;margin-bottom:20px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 6px;font-size:14px;color:#52525b;"><strong>${escapeHtml(data.eventTypeName)}</strong> with ${escapeHtml(data.hostName)}</p>
        <p style="margin:0;font-size:14px;color:#71717a;text-decoration:line-through;">${dateStr}</p>
      </td></tr>
    </table>

    <p style="margin:0;">
      <a href="${escapeHtml(rebookUrl)}" style="display:inline-block;padding:10px 20px;background-color:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Book Again</a>
    </p>
  `, `Your ${data.eventTypeName} has been cancelled`);

  const text = `Booking Cancelled

Hi ${data.guestName}, your booking has been cancelled.

${data.eventTypeName} with ${data.hostName}
Was: ${dateStr}

Want to rebook? ${rebookUrl}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 4. Cancellation Email (to host)
// ---------------------------------------------------------------------------

export function cancellationEmailToHost(data: {
  guestName: string;
  hostName: string;
  eventTypeName: string;
  startTime: Date;
  hostTimezone: string;
  cancellationReason?: string | null;
  baseUrl: string;
}): EmailTemplate {
  const dateStr = formatDateTime(data.startTime, data.hostTimezone);

  let reasonSection = "";
  let reasonText = "";
  if (data.cancellationReason) {
    reasonSection = `<p style="margin:12px 0 0;font-size:14px;color:#52525b;">Reason: ${escapeHtml(data.cancellationReason)}</p>`;
    reasonText = `\nReason: ${data.cancellationReason}`;
  }

  const subject = `Booking Cancelled: ${data.guestName} - ${data.eventTypeName}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;">${escapeHtml(data.guestName)} has cancelled their booking.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:6px;margin-bottom:20px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 6px;font-size:14px;color:#52525b;"><strong>${escapeHtml(data.eventTypeName)}</strong></p>
        <p style="margin:0;font-size:14px;color:#71717a;text-decoration:line-through;">${dateStr}</p>
      </td></tr>
    </table>
    ${reasonSection}
  `, `${data.guestName} cancelled their ${data.eventTypeName}`);

  const text = `Booking Cancelled

${data.guestName} has cancelled their booking.

${data.eventTypeName}
Was: ${dateStr}
${reasonText}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// 5. Auth Emails (magic link, password reset, email verification)
// ---------------------------------------------------------------------------

export function authEmail(
  type: "magic-link" | "password-reset" | "email-verification",
  to: string,
  link: string
): EmailTemplate {
  const configs: Record<string, { subject: string; heading: string; body: string; buttonText: string; expiry: string }> = {
    "magic-link": {
      subject: "Your CalendAI login link",
      heading: "Sign in to CalendAI",
      body: "Click the button below to sign in to your CalendAI account. This link is single-use.",
      buttonText: "Sign In",
      expiry: "This link expires in 15 minutes.",
    },
    "password-reset": {
      subject: "Reset your CalendAI password",
      heading: "Reset Your Password",
      body: "You requested a password reset. Click the button below to set a new password.",
      buttonText: "Reset Password",
      expiry: "This link expires in 1 hour.",
    },
    "email-verification": {
      subject: "Verify your CalendAI email",
      heading: "Verify Your Email",
      body: "Welcome to CalendAI! Please verify your email address by clicking the button below.",
      buttonText: "Verify Email",
      expiry: "This link expires in 24 hours.",
    },
  };

  const cfg = configs[type];

  const html = wrapHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">${cfg.heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;">${cfg.body}</p>

    <p style="margin:0 0 16px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background-color:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${cfg.buttonText}</a>
    </p>

    <p style="margin:0 0 8px;font-size:13px;color:#71717a;">${cfg.expiry}</p>
    <p style="margin:0;font-size:13px;color:#71717a;">If you didn't request this, you can safely ignore this email.</p>

    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">
      Or copy this link: ${escapeHtml(link)}
    </p>
  `, cfg.body);

  const text = `${cfg.heading}

${cfg.body}

${link}

${cfg.expiry}
If you didn't request this, you can safely ignore this email.`;

  return { subject: cfg.subject, html, text };
}
