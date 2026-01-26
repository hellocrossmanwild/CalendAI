import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventTypeSchema, insertBookingSchema } from "@shared/schema";
import { enrichLead, generateMeetingBrief, processPrequalChat, processEventTypeCreation } from "./ai-service";
import { scanWebsite } from "./website-scanner";
import { getGoogleAuthUrl, exchangeCodeForTokens, calculateAvailability, createCalendarEvent, deleteCalendarEvent, listUserCalendars } from "./calendar-service";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { addMinutes } from "date-fns";
import bcrypt from "bcrypt";
import crypto from "crypto";

const objectStorageService = new ObjectStorageService();

// Password strength validation
function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  return { valid: true, message: "Password is strong" };
}

// Email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Stub email sender (logs to console until F09 implements real email)
function sendEmail(to: string, subject: string, body: string): void {
  console.log(`\n========== EMAIL (stub) ==========`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
  console.log(`==================================\n`);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth routes

  // R1: Register with email + password (replaces username-based registration)
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      // R6: Password strength validation
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      // R5: Send email verification
      const verifyToken = generateToken();
      const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await storage.createEmailVerificationToken(user.id, verifyToken, verifyExpires);
      const verifyUrl = `${req.protocol}://${req.get("host")}/auth/verify-email?token=${verifyToken}`;
      sendEmail(
        email,
        "Verify your CalendAI email",
        `Welcome to CalendAI! Please verify your email by clicking this link: ${verifyUrl}\n\nThis link expires in 24 hours.`
      );

      (req.session as any).userId = user.id;
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // R1: Login with email + password (replaces username-based login)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      (req.session as any).userId = user.id;
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { password, ...safeUser } = req.user;
    res.json(safeUser);
  });

  // R2: Google OAuth - redirect to Google consent screen
  app.get("/api/auth/google", async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Google OAuth is not configured" });
    }
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
    const scope = encodeURIComponent("openid email profile");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    res.redirect(authUrl);
  });

  // R2: Google OAuth - callback handler
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.redirect("/auth?error=google_auth_failed");
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

      if (!clientId || !clientSecret) {
        return res.redirect("/auth?error=google_not_configured");
      }

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        console.error("Google token exchange failed:", await tokenResponse.text());
        return res.redirect("/auth?error=google_auth_failed");
      }

      const tokens = await tokenResponse.json() as { access_token: string };

      // Get user info from Google
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return res.redirect("/auth?error=google_auth_failed");
      }

      const googleUser = await userInfoResponse.json() as {
        email: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };

      // Find or create user
      let user = await storage.getUserByEmail(googleUser.email);
      if (!user) {
        user = await storage.createUser({
          email: googleUser.email,
          password: "", // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null,
        });
        // Google-authenticated users are automatically email-verified
        await storage.updateUser(user.id, {
          emailVerified: true,
          profileImageUrl: googleUser.picture || null,
        });
      } else if (!user.emailVerified) {
        // If existing user signs in with Google, verify their email
        await storage.updateUser(user.id, { emailVerified: true });
      }

      (req.session as any).userId = user.id;
      res.redirect("/");
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/auth?error=google_auth_failed");
    }
  });

  // R3: Magic link - request a login link via email
  app.post("/api/auth/magic-link", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      // Always return success to avoid leaking whether an email is registered
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.createMagicLinkToken(email, token, expiresAt);

      const magicUrl = `${req.protocol}://${req.get("host")}/auth/magic-link?token=${token}`;
      sendEmail(
        email,
        "Your CalendAI login link",
        `Click here to sign in to CalendAI: ${magicUrl}\n\nThis link expires in 15 minutes. If you didn't request this, you can safely ignore this email.`
      );

      res.json({ success: true, message: "If an account exists with that email, a login link has been sent" });
    } catch (error) {
      console.error("Magic link error:", error);
      res.status(500).json({ error: "Failed to send magic link" });
    }
  });

  // R3: Magic link - verify token and create session
  app.get("/api/auth/magic-link/verify", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const tokenRecord = await storage.getMagicLinkToken(token as string);
      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      await storage.markMagicLinkTokenUsed(tokenRecord.id);

      // Find or create user
      let user = await storage.getUserByEmail(tokenRecord.email);
      if (!user) {
        user = await storage.createUser({
          email: tokenRecord.email,
          password: "", // No password for magic link users
        });
      }

      // Magic link verifies email ownership
      if (!user.emailVerified) {
        await storage.updateUser(user.id, { emailVerified: true });
      }

      (req.session as any).userId = user.id;
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: true,
      });
    } catch (error) {
      console.error("Magic link verify error:", error);
      res.status(500).json({ error: "Failed to verify magic link" });
    }
  });

  // R4: Password reset - request a reset link
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      // Always return success to avoid leaking whether an email is registered
      const user = await storage.getUserByEmail(email);
      if (user) {
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await storage.createPasswordResetToken(user.id, token, expiresAt);

        const resetUrl = `${req.protocol}://${req.get("host")}/auth/reset-password?token=${token}`;
        sendEmail(
          email,
          "Reset your CalendAI password",
          `Click here to reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`
        );
      }

      res.json({ success: true, message: "If an account exists with that email, a reset link has been sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to process password reset" });
    }
  });

  // R4: Password reset - reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const tokenRecord = await storage.getPasswordResetToken(token);
      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateUser(tokenRecord.userId, { password: hashedPassword });
      await storage.markPasswordResetTokenUsed(tokenRecord.id);

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // R5: Email verification - verify email with token
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const tokenRecord = await storage.getEmailVerificationToken(token as string);
      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      await storage.updateUser(tokenRecord.userId, { emailVerified: true });
      await storage.markEmailVerificationTokenUsed(tokenRecord.id);

      res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // R5: Resend verification email
  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      if (req.user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await storage.createEmailVerificationToken(req.user.id, token, expiresAt);

      const verifyUrl = `${req.protocol}://${req.get("host")}/auth/verify-email?token=${token}`;
      sendEmail(
        req.user.email,
        "Verify your CalendAI email",
        `Please verify your email by clicking this link: ${verifyUrl}\n\nThis link expires in 24 hours.`
      );

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Event Types CRUD
  app.get("/api/event-types", requireAuth, async (req, res) => {
    try {
      const eventTypes = await storage.getEventTypes(req.user!.id);
      res.json(eventTypes);
    } catch (error) {
      console.error("Error fetching event types:", error);
      res.status(500).json({ error: "Failed to fetch event types" });
    }
  });

  app.get("/api/event-types/:id", requireAuth, async (req, res) => {
    try {
      const eventType = await storage.getEventType(parseInt(req.params.id));
      if (!eventType || eventType.userId !== req.user!.id) {
        return res.status(404).json({ error: "Event type not found" });
      }
      res.json(eventType);
    } catch (error) {
      console.error("Error fetching event type:", error);
      res.status(500).json({ error: "Failed to fetch event type" });
    }
  });

  app.post("/api/event-types", requireAuth, async (req, res) => {
    try {
      const data = insertEventTypeSchema.parse({
        ...req.body,
        userId: req.user!.id,
      });
      
      // Check for duplicate slug
      const existing = await storage.getEventTypeBySlug(data.slug);
      if (existing) {
        return res.status(400).json({ error: "Slug already in use" });
      }
      
      const eventType = await storage.createEventType(data);
      res.status(201).json(eventType);
    } catch (error) {
      console.error("Error creating event type:", error);
      res.status(400).json({ error: "Invalid event type data" });
    }
  });

  app.patch("/api/event-types/:id", requireAuth, async (req, res) => {
    try {
      const eventType = await storage.getEventType(parseInt(req.params.id));
      if (!eventType || eventType.userId !== req.user!.id) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const updated = await storage.updateEventType(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating event type:", error);
      res.status(400).json({ error: "Failed to update event type" });
    }
  });

  app.delete("/api/event-types/:id", requireAuth, async (req, res) => {
    try {
      const eventType = await storage.getEventType(parseInt(req.params.id));
      if (!eventType || eventType.userId !== req.user!.id) {
        return res.status(404).json({ error: "Event type not found" });
      }

      await storage.deleteEventType(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event type:", error);
      res.status(500).json({ error: "Failed to delete event type" });
    }
  });

  // Bookings CRUD
  app.get("/api/bookings", requireAuth, async (req, res) => {
    try {
      const bookings = await storage.getBookingsWithDetails(req.user!.id);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.get("/api/bookings/:id", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBookingWithDetails(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json(booking);
    } catch (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ error: "Failed to fetch booking" });
    }
  });

  app.delete("/api/bookings/:id", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBooking(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Delete Google Calendar event if one exists
      if (booking.calendarEventId) {
        const deleted = await deleteCalendarEvent(req.user!.id, booking.calendarEventId);
        if (!deleted) {
          console.warn(`Failed to delete Google Calendar event ${booking.calendarEventId} for booking ${booking.id}`);
        }
      }

      await storage.deleteBooking(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // AI Features - Lead Enrichment
  app.post("/api/bookings/:id/enrich", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBooking(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const existing = await storage.getLeadEnrichment(booking.id);
      if (existing) {
        return res.json(existing);
      }

      const enrichmentData = await enrichLead(
        booking.guestName,
        booking.guestEmail,
        booking.guestCompany || undefined
      );

      const enrichment = await storage.createLeadEnrichment({
        bookingId: booking.id,
        companyInfo: enrichmentData.companyInfo,
        personalInfo: enrichmentData.personalInfo,
      });

      res.json(enrichment);
    } catch (error) {
      console.error("Error enriching lead:", error);
      res.status(500).json({ error: "Failed to enrich lead" });
    }
  });

  // AI Features - Meeting Brief Generation
  app.post("/api/bookings/:id/generate-brief", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBookingWithDetails(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const existing = await storage.getMeetingBrief(booking.id);
      if (existing) {
        return res.json(existing);
      }

      const briefData = await generateMeetingBrief(
        booking.guestName,
        booking.guestEmail,
        booking.guestCompany,
        booking.eventType?.name || "Meeting",
        booking.eventType?.description || null,
        booking.enrichment || null,
        booking.notes,
        booking.prequalResponse?.chatHistory || null
      );

      const brief = await storage.createMeetingBrief({
        bookingId: booking.id,
        summary: briefData.summary,
        talkingPoints: briefData.talkingPoints,
        keyContext: briefData.keyContext,
        documentAnalysis: briefData.documentAnalysis,
      });

      res.json(brief);
    } catch (error) {
      console.error("Error generating brief:", error);
      res.status(500).json({ error: "Failed to generate meeting brief" });
    }
  });

  // Calendar Integration - Google Calendar OAuth
  app.get("/api/calendar/auth", requireAuth, async (req, res) => {
    try {
      const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/calendar/callback`;
      const state = crypto.randomBytes(32).toString("hex");
      (req.session as any).calendarOAuthState = state;
      const url = getGoogleAuthUrl(redirectUri, state);
      res.json({ url });
    } catch (error) {
      console.error("Calendar auth error:", error);
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  app.get("/api/calendar/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code) {
        return res.redirect("/settings?error=calendar_auth_failed");
      }

      const userId = (req.session as any).userId;
      if (!userId) {
        return res.redirect("/auth?error=not_authenticated");
      }

      // Validate OAuth state parameter to prevent CSRF
      const expectedState = (req.session as any).calendarOAuthState;
      if (!state || state !== expectedState) {
        return res.redirect("/settings?error=calendar_auth_failed");
      }
      delete (req.session as any).calendarOAuthState;

      const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/calendar/callback`;
      const tokens = await exchangeCodeForTokens(code as string, redirectUri);

      await storage.upsertCalendarToken({
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        calendarId: "primary",
      });

      res.redirect("/settings?calendar=connected");
    } catch (error) {
      console.error("Calendar callback error:", error);
      res.redirect("/settings?error=calendar_auth_failed");
    }
  });

  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const token = await storage.getCalendarToken(req.user!.id);
      if (!token) {
        return res.json({ connected: false });
      }

      const calendars = await listUserCalendars(req.user!.id);
      res.json({
        connected: true,
        email: req.user!.email,
        calendars,
      });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  app.delete("/api/calendar/disconnect", requireAuth, async (req, res) => {
    try {
      await storage.deleteCalendarToken(req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to disconnect calendar" });
    }
  });

  // Availability Rules
  app.get("/api/availability-rules", requireAuth, async (req, res) => {
    try {
      const rules = await storage.getAvailabilityRules(req.user!.id);
      if (!rules) {
        // Return sensible defaults when no rules exist yet
        return res.json({
          userId: req.user!.id,
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
          defaultBufferAfter: 0,
        });
      }
      res.json(rules);
    } catch (error) {
      console.error("Error fetching availability rules:", error);
      res.status(500).json({ error: "Failed to fetch availability rules" });
    }
  });

  app.put("/api/availability-rules", requireAuth, async (req, res) => {
    try {
      const { timezone, weeklyHours, minNotice, maxAdvance, defaultBufferBefore, defaultBufferAfter } = req.body;

      // Validate timezone
      if (timezone && typeof timezone !== "string") {
        return res.status(400).json({ error: "Invalid timezone" });
      }

      // Validate numeric fields
      if (minNotice != null && (!Number.isInteger(minNotice) || minNotice < 0)) {
        return res.status(400).json({ error: "minNotice must be a non-negative integer (minutes)" });
      }
      if (maxAdvance != null && (!Number.isInteger(maxAdvance) || maxAdvance < 1 || maxAdvance > 365)) {
        return res.status(400).json({ error: "maxAdvance must be between 1 and 365 (days)" });
      }
      if (defaultBufferBefore != null && (!Number.isInteger(defaultBufferBefore) || defaultBufferBefore < 0)) {
        return res.status(400).json({ error: "defaultBufferBefore must be a non-negative integer (minutes)" });
      }
      if (defaultBufferAfter != null && (!Number.isInteger(defaultBufferAfter) || defaultBufferAfter < 0)) {
        return res.status(400).json({ error: "defaultBufferAfter must be a non-negative integer (minutes)" });
      }

      // Validate weeklyHours structure
      if (weeklyHours) {
        const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        for (const day of validDays) {
          const hours = weeklyHours[day];
          if (hours !== null && hours !== undefined) {
            if (!Array.isArray(hours)) {
              return res.status(400).json({ error: `Invalid hours for ${day}` });
            }
            for (const block of hours) {
              if (!block.start || !block.end || typeof block.start !== "string" || typeof block.end !== "string") {
                return res.status(400).json({ error: `Invalid time block for ${day}` });
              }
              // Validate HH:MM format with valid ranges (00:00 - 23:59)
              const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
              if (!timeRegex.test(block.start) || !timeRegex.test(block.end)) {
                return res.status(400).json({ error: `Time must be in HH:MM format (00:00-23:59) for ${day}` });
              }
            }
          }
        }
      }

      const rules = await storage.upsertAvailabilityRules({
        userId: req.user!.id,
        timezone: timezone || "UTC",
        weeklyHours: weeklyHours || undefined,
        minNotice: minNotice != null ? minNotice : undefined,
        maxAdvance: maxAdvance != null ? maxAdvance : undefined,
        defaultBufferBefore: defaultBufferBefore != null ? defaultBufferBefore : undefined,
        defaultBufferAfter: defaultBufferAfter != null ? defaultBufferAfter : undefined,
      });

      res.json(rules);
    } catch (error) {
      console.error("Error saving availability rules:", error);
      res.status(500).json({ error: "Failed to save availability rules" });
    }
  });

  app.post("/api/availability-rules/analyse", requireAuth, async (req, res) => {
    try {
      // Import dynamically to avoid circular deps
      const { analyseCalendarPatterns } = await import("./ai-service");
      const { getCalendarEvents } = await import("./calendar-service");

      // Check calendar connection
      const calendarToken = await storage.getCalendarToken(req.user!.id);
      if (!calendarToken) {
        return res.status(400).json({ error: "Google Calendar is not connected. Please connect your calendar first." });
      }

      // Fetch 4 weeks of calendar events for analysis
      const now = new Date();
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const events = await getCalendarEvents(req.user!.id, fourWeeksAgo, now);

      if (events.length === 0) {
        return res.json({
          suggestions: {
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
          },
          message: "No calendar events found in the last 4 weeks. Using default working hours.",
        });
      }

      const suggestions = await analyseCalendarPatterns(events);
      res.json({ suggestions, message: "AI analysed your calendar patterns and generated suggestions." });
    } catch (error) {
      console.error("Error analysing calendar:", error);
      res.status(500).json({ error: "Failed to analyse calendar patterns" });
    }
  });

  // AI-Assisted Event Type Creation (F04)
  app.post("/api/ai/create-event-type", requireAuth, async (req, res) => {
    try {
      const { messages, calendarConnected } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const result = await processEventTypeCreation(messages, calendarConnected);
      res.json(result);
    } catch (error) {
      console.error("Error in AI event type creation:", error);
      res.status(500).json({ error: "Failed to process event type creation" });
    }
  });

  app.post("/api/ai/scan-website", requireAuth, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      const result = await scanWebsite(url);
      res.json(result);
    } catch (error) {
      console.error("Error scanning website:", error);
      res.status(500).json({ error: "Failed to scan website" });
    }
  });

  // File Upload
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Public Routes - Booking Page
  app.get("/api/public/event-types/:slug", async (req, res) => {
    try {
      const eventType = await storage.getEventTypeBySlug(req.params.slug);
      if (!eventType || !eventType.isActive) {
        return res.status(404).json({ error: "Event type not found" });
      }
      res.json(eventType);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event type" });
    }
  });

  app.get("/api/public/availability/:slug", async (req, res) => {
    try {
      const eventType = await storage.getEventTypeBySlug(req.params.slug);
      if (!eventType || !eventType.isActive) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();

      const slots = await calculateAvailability(eventType.userId, eventType.id, date);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/public/book", async (req, res) => {
    try {
      const { eventTypeSlug, date, time, name, email, company, notes, timezone: clientTimezone, chatHistory, documents } = req.body;

      const eventType = await storage.getEventTypeBySlug(eventTypeSlug);
      if (!eventType || !eventType.isActive) {
        return res.status(404).json({ error: "Event type not found" });
      }

      // Parse date and time
      const [hours, minutes] = time.replace(/ [AP]M/, "").split(":").map(Number);
      const isPM = time.includes("PM");
      const adjustedHours = isPM && hours !== 12 ? hours + 12 : (hours === 12 && !isPM ? 0 : hours);
      
      const startTime = new Date(date);
      startTime.setHours(adjustedHours, minutes, 0, 0);
      const endTime = addMinutes(startTime, eventType.duration);

      // Prevent double-booking: check for existing confirmed bookings in this time slot
      const existingBookings = await storage.getBookingsByDateRange(
        eventType.userId,
        startTime,
        endTime
      );
      const hasConflict = existingBookings.some((b) => {
        return b.startTime < endTime && b.endTime > startTime;
      });
      if (hasConflict) {
        return res.status(409).json({ error: "This time slot is no longer available" });
      }

      // Create booking
      const booking = await storage.createBooking({
        eventTypeId: eventType.id,
        userId: eventType.userId,
        guestName: name,
        guestEmail: email,
        guestCompany: company || null,
        startTime,
        endTime,
        status: "confirmed",
        timezone: clientTimezone || "UTC",
        notes: notes || null,
      });

      // Save pre-qual chat if exists
      if (chatHistory?.length) {
        await storage.createPrequalResponse({
          bookingId: booking.id,
          chatHistory,
          extractedData: {},
        });
      }

      // Save document references
      if (documents?.length) {
        for (const doc of documents) {
          await storage.createDocument({
            bookingId: booking.id,
            name: doc.name,
            objectPath: doc.path,
          });
        }
      }

      // Create Google Calendar event if calendar is connected
      const calendarEventId = await createCalendarEvent(
        eventType.userId,
        {
          guestName: name,
          guestEmail: email,
          guestCompany: company || null,
          startTime,
          endTime,
          timezone: clientTimezone || "UTC",
          notes: notes || null,
        },
        eventType.name
      );

      if (calendarEventId) {
        await storage.updateBooking(booking.id, { calendarEventId });
      }

      res.status(201).json({ ...booking, calendarEventId: calendarEventId || booking.calendarEventId });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(400).json({ error: "Failed to create booking" });
    }
  });

  app.post("/api/public/chat", async (req, res) => {
    try {
      const { eventTypeSlug, messages, guestInfo } = req.body;

      const eventType = await storage.getEventTypeBySlug(eventTypeSlug);
      if (!eventType) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const response = await processPrequalChat(
        messages,
        eventType.name,
        (eventType.questions as string[]) || [],
        guestInfo
      );

      res.json(response);
    } catch (error) {
      console.error("Error processing chat:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  return httpServer;
}
