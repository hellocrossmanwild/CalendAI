import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let transporter: nodemailer.Transporter | null = null;

/**
 * Initialise the email transporter based on environment configuration.
 * Falls back to console logging when SMTP is not configured.
 */
function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Returns true if a real SMTP transport is configured.
 */
export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}

/**
 * Get the sender address from environment or fall back to a default.
 */
function getFromAddress(): string {
  return process.env.EMAIL_FROM || "CalendAI <noreply@calendai.com>";
}

/**
 * Send an email via the configured SMTP transport. If SMTP is not configured,
 * logs the email to the console (useful for local development).
 *
 * Never throws — returns a result object with success/error fields. This
 * ensures that callers can fire-and-forget without crashing the server.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const transport = getTransporter();

  if (!transport) {
    // Dev / unconfigured fallback: log to console
    console.log(`\n========== EMAIL ==========`);
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body (text): ${options.text || "(html only)"}`);
    console.log(`===========================\n`);
    return { success: true, messageId: "console-stub" };
  }

  try {
    const info = await transport.sendMail({
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Email send failed:", message);
    return { success: false, error: message };
  }
}
