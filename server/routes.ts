import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventTypeSchema, insertBookingSchema, phoneRegex } from "@shared/schema";
import { enrichLead, enrichAndScore, generateMeetingBrief, processPrequalChat, processEventTypeCreation } from "./ai-service";
import { calculateLeadScore } from "./lead-scoring";
import { scanWebsite } from "./website-scanner";
import { getGoogleAuthUrl, exchangeCodeForTokens, calculateAvailability, createCalendarEvent, deleteCalendarEvent, listUserCalendars, isValidTimezone } from "./calendar-service";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { sendEmail } from "./email-service";
import { authEmail, bookingConfirmationEmail, hostNotificationEmail, cancellationEmailToBooker, cancellationEmailToHost, rescheduleConfirmationToBooker, rescheduleNotificationToHost, hostRescheduleNotificationToBooker } from "./email-templates";
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

// Derive the public base URL for email links.
// Prefer the BASE_URL env var (prevents host-header injection);
// fall back to request headers for dev environments.
function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
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
      const verifyUrl = `${getBaseUrl(req)}/auth/verify-email?token=${verifyToken}`;
      const verifyEmail = authEmail("email-verification", email, verifyUrl);
      sendEmail({ to: email, ...verifyEmail }).catch(err =>
        console.error("Failed to send verification email:", err)
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

      const magicUrl = `${getBaseUrl(req)}/auth/magic-link?token=${token}`;
      const magicEmail = authEmail("magic-link", email, magicUrl);
      sendEmail({ to: email, ...magicEmail }).catch(err =>
        console.error("Failed to send magic link email:", err)
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

        const resetUrl = `${getBaseUrl(req)}/auth/reset-password?token=${token}`;
        const resetEmail = authEmail("password-reset", email, resetUrl);
        sendEmail({ to: email, ...resetEmail }).catch(err =>
          console.error("Failed to send password reset email:", err)
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

      const verifyUrl = `${getBaseUrl(req)}/auth/verify-email?token=${token}`;
      const verifyTpl = authEmail("email-verification", req.user.email, verifyUrl);
      sendEmail({ to: req.user.email, ...verifyTpl }).catch(err =>
        console.error("Failed to send verification email:", err)
      );

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // F13 R1: Update profile
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const allowedFields = [
        "firstName", "lastName", "email", "companyName", "websiteUrl",
        "timezone", "profileImageUrl", "defaultLogo", "defaultPrimaryColor", "defaultSecondaryColor",
      ] as const;

      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      // Validate email if being changed
      if (updates.email) {
        if (!isValidEmail(updates.email)) {
          return res.status(400).json({ error: "Please enter a valid email address" });
        }
        // Check uniqueness
        const existing = await storage.getUserByEmail(updates.email);
        if (existing && existing.id !== req.user!.id) {
          return res.status(400).json({ error: "An account with this email already exists" });
        }
      }

      // Validate timezone if provided
      if (updates.timezone && !isValidTimezone(updates.timezone)) {
        return res.status(400).json({ error: "Invalid timezone" });
      }

      // Validate color fields as hex if provided
      const colorFields = ["defaultPrimaryColor", "defaultSecondaryColor"] as const;
      for (const field of colorFields) {
        if (updates[field] && updates[field] !== "" && !/^#[0-9a-fA-F]{6}$/.test(updates[field])) {
          return res.status(400).json({ error: `Invalid color format for ${field}. Use hex format (e.g., #FF5500)` });
        }
      }

      // Sanitize text fields (trim, limit length)
      const textFields = ["firstName", "lastName", "companyName", "websiteUrl"] as const;
      for (const field of textFields) {
        if (typeof updates[field] === "string") {
          updates[field] = updates[field].trim().slice(0, 255);
        }
      }

      // Validate image URL fields — reject dangerous schemes
      const imageUrlFields = ["profileImageUrl", "defaultLogo"] as const;
      for (const field of imageUrlFields) {
        if (updates[field] && updates[field] !== "") {
          const val = String(updates[field]).trim();
          if (/^(javascript|data|vbscript):/i.test(val)) {
            return res.status(400).json({ error: `Invalid URL scheme for ${field}` });
          }
          updates[field] = val.slice(0, 2048);
        }
      }

      const updatedUser = await storage.updateUser(req.user!.id, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // F13 R3: Change password
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user || !user.password) {
        return res.status(400).json({ error: "Password change is not available for OAuth accounts" });
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.user!.id, { password: hashedPassword });

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // F13 R8: Delete account
  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const { password } = req.body;

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Require password confirmation if user has a password (non-OAuth)
      if (user.password) {
        if (!password) {
          return res.status(400).json({ error: "Password is required to delete your account" });
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: "Incorrect password" });
        }
      }

      // Cascade delete all user data
      await storage.deleteUserAndData(req.user!.id);

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error after account deletion:", err);
        }
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Account deleted successfully" });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
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

      // F12 R5: Capture optional cancellation reason from host
      const { reason } = req.body || {};
      const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;

      // Delete Google Calendar event if one exists
      if (booking.calendarEventId) {
        const deleted = await deleteCalendarEvent(req.user!.id, booking.calendarEventId);
        if (!deleted) {
          console.warn(`Failed to delete Google Calendar event ${booking.calendarEventId} for booking ${booking.id}`);
        }
      }

      // Use updateBooking to set status + reason (instead of deleteBooking which only sets status)
      await storage.updateBooking(parseInt(req.params.id), {
        status: "cancelled",
        cancellationReason: sanitizedReason,
      });
      res.status(204).send();

      // Fire-and-forget: send cancellation emails (F09 R4)
      (async () => {
        try {
          const eventType = await storage.getEventType(booking.eventTypeId);
          if (!eventType) return;
          const host = await storage.getUser(booking.userId);
          const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
          const hostTimezone = (await storage.getAvailabilityRules(booking.userId))?.timezone || "UTC";
          const baseUrl = getBaseUrl(req);

          // Email to booker
          const bookerTpl = cancellationEmailToBooker({
            guestName: booking.guestName,
            hostName,
            eventTypeName: eventType.name,
            startTime: booking.startTime,
            guestTimezone: booking.timezone,
            eventTypeSlug: eventType.slug,
            baseUrl,
          });
          sendEmail({ to: booking.guestEmail, ...bookerTpl }).catch(err =>
            console.error("Failed to send cancellation email to booker:", err)
          );

          // Email to host (check preferences)
          const prefs = await storage.getNotificationPreferences(booking.userId);
          const shouldNotify = prefs?.cancellationEmail !== false;
          if (shouldNotify && host?.email) {
            const hostTpl = cancellationEmailToHost({
              guestName: booking.guestName,
              hostName,
              eventTypeName: eventType.name,
              startTime: booking.startTime,
              hostTimezone,
              baseUrl,
              cancellationReason: sanitizedReason || undefined,
            });
            sendEmail({ to: host.email, ...hostTpl }).catch(err =>
              console.error("Failed to send cancellation email to host:", err)
            );
          }
        } catch (err) {
          console.error("Failed to send cancellation emails:", err);
        }
      })();
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Host-initiated reschedule (F12 R4)
  app.post("/api/bookings/:id/reschedule", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBooking(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Cannot reschedule a cancelled booking" });
      }

      const { startTimeUTC } = req.body;
      if (!startTimeUTC) {
        return res.status(400).json({ error: "New start time is required" });
      }

      const newStartTime = new Date(startTimeUTC);
      if (isNaN(newStartTime.getTime())) {
        return res.status(400).json({ error: "Invalid start time" });
      }

      const now = new Date();
      if (newStartTime.getTime() < now.getTime()) {
        return res.status(400).json({ error: "Cannot reschedule to a time in the past" });
      }

      if (booking.startTime.getTime() === newStartTime.getTime()) {
        return res.status(400).json({ error: "Please select a different time" });
      }

      const eventType = await storage.getEventType(booking.eventTypeId);
      if (!eventType) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const newEndTime = addMinutes(newStartTime, eventType.duration);

      // Double-booking prevention
      const existingBookings = await storage.getBookingsByDateRange(
        eventType.userId,
        newStartTime,
        newEndTime
      );
      const hasConflict = existingBookings.some((b) => {
        if (b.id === booking.id) return false;
        return b.startTime < newEndTime && b.endTime > newStartTime;
      });
      if (hasConflict) {
        return res.status(409).json({ error: "This time slot is no longer available" });
      }

      const oldStartTime = booking.startTime;
      const oldEndTime = booking.endTime;

      // Update the booking
      await storage.updateBooking(booking.id, {
        startTime: newStartTime,
        endTime: newEndTime,
      });

      // Update Google Calendar: delete old + create new
      if (booking.calendarEventId) {
        deleteCalendarEvent(booking.userId, booking.calendarEventId).catch(err =>
          console.error(`Failed to delete old calendar event for booking ${booking.id}:`, err)
        );
      }
      (async () => {
        try {
          const newCalendarEventId = await createCalendarEvent(
            eventType.userId,
            {
              guestName: booking.guestName,
              guestEmail: booking.guestEmail,
              guestCompany: booking.guestCompany,
              startTime: newStartTime,
              endTime: newEndTime,
              timezone: booking.timezone,
              notes: booking.notes,
            },
            eventType.name
          );
          if (newCalendarEventId) {
            await storage.updateBooking(booking.id, { calendarEventId: newCalendarEventId });
          }
        } catch (err) {
          console.error("Failed to create new calendar event for rescheduled booking:", err);
        }
      })();

      // Delete meeting brief (F11)
      storage.deleteMeetingBrief(booking.id).catch(err =>
        console.error("Failed to delete meeting brief for rescheduled booking:", err)
      );

      res.json({ success: true, newStartTime, newEndTime });

      // Fire-and-forget: send host-initiated reschedule email to booker
      (async () => {
        try {
          const host = await storage.getUser(booking.userId);
          const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
          const baseUrl = getBaseUrl(req);

          const bookerTpl = hostRescheduleNotificationToBooker({
            guestName: booking.guestName,
            eventTypeName: eventType.name,
            oldStartTime,
            oldEndTime,
            newStartTime,
            newEndTime,
            hostName,
            timezone: booking.timezone,
            rescheduleToken: booking.rescheduleToken || undefined,
            cancelToken: booking.cancelToken || undefined,
            baseUrl,
          });
          sendEmail({ to: booking.guestEmail, ...bookerTpl }).catch(err =>
            console.error("Failed to send host reschedule email to booker:", err)
          );
        } catch (err) {
          console.error("Failed to send host reschedule emails:", err);
        }
      })();
    } catch (error) {
      console.error("Error rescheduling booking:", error);
      res.status(500).json({ error: "Failed to reschedule booking" });
    }
  });

  // Booking Status Management (F10 R6)
  const VALID_BOOKING_STATUSES = ["confirmed", "completed", "cancelled", "no-show"];

  app.patch("/api/bookings/:id/status", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !VALID_BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${VALID_BOOKING_STATUSES.join(", ")}`,
        });
      }

      const booking = await storage.getBooking(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Cannot change status of a cancelled booking" });
      }

      if (booking.status === status) {
        return res.status(400).json({ error: `Booking is already ${status}` });
      }

      const updated = await storage.updateBookingStatus(booking.id, status);
      res.json(updated);
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ error: "Failed to update booking status" });
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

      // Fetch pre-qual and document data for enrichment context and scoring
      const prequalResponse = await storage.getPrequalResponse(booking.id);
      const extractedData = prequalResponse?.extractedData as Record<string, any> | null;
      const docs = await storage.getDocuments(booking.id);
      const documentCount = docs?.length || 0;

      const prequalData = extractedData ? {
        summary: extractedData.summary as string | undefined,
        keyPoints: extractedData.keyPoints as string[] | undefined,
        timeline: extractedData.timeline as string | undefined,
        documents: extractedData.documents as string[] | undefined,
        company: extractedData.company as string | undefined,
      } : null;

      const enrichmentData = await enrichLead(
        booking.guestName,
        booking.guestEmail,
        booking.guestCompany || undefined,
        prequalData ? { summary: prequalData.summary, keyPoints: prequalData.keyPoints, timeline: prequalData.timeline, company: prequalData.company } : undefined
      );

      const enrichment = await storage.createLeadEnrichment({
        bookingId: booking.id,
        companyInfo: enrichmentData.companyInfo,
        personalInfo: enrichmentData.personalInfo,
      });

      // After creating enrichment, calculate and store score
      const scoreResult = calculateLeadScore({
        enrichmentData: {
          companyInfo: enrichmentData.companyInfo,
          personalInfo: enrichmentData.personalInfo,
        },
        bookingData: {
          guestPhone: booking.guestPhone,
          notes: booking.notes,
        },
        prequalData,
        documentCount,
      });

      await storage.updateLeadEnrichmentScore(
        enrichment.id,
        scoreResult.score,
        scoreResult.label,
        scoreResult.reasoning
      );

      // Return enrichment with score
      res.json({ ...enrichment, leadScore: scoreResult.score, leadScoreLabel: scoreResult.label, leadScoreReasoning: scoreResult.reasoning });
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
      const force = req.query.force === "true";

      if (existing && !force) {
        return res.json(existing);
      }

      // If regenerating, delete the old brief
      if (existing && force) {
        await storage.deleteMeetingBrief(booking.id);
      }

      // Get documents for this booking
      const docs = await storage.getDocuments(booking.id);

      // Fetch past bookings from the same email domain (R5: Similar Bookings)
      const guestDomain = booking.guestEmail.split("@")[1];
      let pastBookings: { guestName: string; guestEmail: string; startTime: Date; status: string }[] = [];
      if (guestDomain) {
        const domainBookings = await storage.getBookingsByGuestDomain(booking.userId, guestDomain);
        pastBookings = domainBookings
          .filter(b => b.id !== booking.id)
          .map(b => ({ guestName: b.guestName, guestEmail: b.guestEmail, startTime: b.startTime, status: b.status }));
      }

      const briefData = await generateMeetingBrief(
        booking.guestName,
        booking.guestEmail,
        booking.guestCompany,
        booking.eventType?.name || "Meeting",
        booking.eventType?.description || null,
        booking.enrichment || null,
        booking.notes,
        booking.prequalResponse?.chatHistory || null,
        docs.map(d => ({ name: d.name, contentType: d.contentType || "unknown", size: d.size || 0 })),
        pastBookings
      );

      const brief = await storage.createMeetingBrief({
        bookingId: booking.id,
        summary: briefData.summary,
        talkingPoints: briefData.talkingPoints,
        keyContext: briefData.keyContext,
        documentAnalysis: briefData.documentAnalysis || null,
      });

      // Fire-and-forget: send brief email if preferences allow
      (async () => {
        try {
          const user = await storage.getUser(booking.userId);
          if (!user || !user.email) return;
          const prefs = await storage.getNotificationPreferences(booking.userId);
          if (prefs && prefs.meetingBriefEmail === false) return;

          // Send meeting prep brief email
          const { meetingPrepBriefEmail } = await import("./email-templates");
          if (typeof meetingPrepBriefEmail !== "function") return;

          const rules = await storage.getAvailabilityRules(booking.userId);
          const hostTimezone = rules?.timezone || "UTC";
          const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

          const template = meetingPrepBriefEmail({
            guestName: booking.guestName,
            guestEmail: booking.guestEmail,
            hostName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Host",
            eventTypeName: booking.eventType?.name || "Meeting",
            startTime: new Date(booking.startTime),
            endTime: new Date(booking.endTime),
            duration: booking.eventType?.duration || 30,
            guestTimezone: booking.guestTimezone || booking.timezone || "UTC",
            hostTimezone,
            summary: briefData.summary,
            talkingPoints: briefData.talkingPoints,
            keyContext: briefData.keyContext,
            documentAnalysis: briefData.documentAnalysis || null,
            enrichment: booking.enrichment || null,
            baseUrl,
            bookingId: booking.id,
          });

          const { sendEmail } = await import("./email-service");
          await sendEmail({ to: user.email, subject: template.subject, html: template.html, text: template.text });
        } catch (emailErr) {
          console.error("Failed to send brief email:", emailErr);
        }
      })();

      res.json(brief);
    } catch (error) {
      console.error("Error generating brief:", error);
      res.status(500).json({ error: "Failed to generate meeting brief" });
    }
  });

  // Brief read tracking
  app.patch("/api/bookings/:id/brief/read", requireAuth, async (req, res) => {
    try {
      const booking = await storage.getBooking(parseInt(req.params.id));
      if (!booking || booking.userId !== req.user!.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const brief = await storage.markBriefAsRead(booking.id);
      if (!brief) {
        return res.status(404).json({ error: "Brief not found" });
      }
      res.json(brief);
    } catch (error) {
      console.error("Error marking brief as read:", error);
      res.status(500).json({ error: "Failed to mark brief as read" });
    }
  });

  app.get("/api/briefs/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadBriefsCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread briefs count:", error);
      res.status(500).json({ error: "Failed to get unread count" });
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

  // Notification Preferences (F09 R6)
  app.get("/api/notification-preferences", requireAuth, async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferences(req.user!.id);
      if (!prefs) {
        // Return defaults when no record exists
        return res.json({
          userId: req.user!.id,
          newBookingEmail: true,
          meetingBriefEmail: true,
          dailyDigest: false,
          cancellationEmail: true,
        });
      }
      res.json(prefs);
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  app.patch("/api/notification-preferences", requireAuth, async (req, res) => {
    try {
      const { newBookingEmail, meetingBriefEmail, dailyDigest, cancellationEmail } = req.body;
      const prefs = await storage.upsertNotificationPreferences({
        userId: req.user!.id,
        newBookingEmail: newBookingEmail ?? undefined,
        meetingBriefEmail: meetingBriefEmail ?? undefined,
        dailyDigest: dailyDigest ?? undefined,
        cancellationEmail: cancellationEmail ?? undefined,
      });
      res.json(prefs);
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  // Public token-based booking lookup and management (F12)
  app.get("/api/public/booking/cancel/:token", async (req, res) => {
    try {
      const booking = await storage.getBookingByCancelToken(req.params.token);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const eventType = await storage.getEventType(booking.eventTypeId);
      const host = eventType ? await storage.getUser(eventType.userId) : null;
      const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
      res.json({
        id: booking.id,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTypeName: eventType?.name || "Meeting",
        eventTypeSlug: eventType?.slug,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        timezone: booking.timezone,
        cancellationReason: booking.cancellationReason,
        hostName,
        eventType: eventType ? {
          primaryColor: eventType.primaryColor,
          secondaryColor: eventType.secondaryColor,
          color: eventType.color,
          logo: eventType.logo,
          duration: eventType.duration,
          host: host ? { firstName: host.firstName, lastName: host.lastName, profileImageUrl: host.profileImageUrl } : null,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to look up booking" });
    }
  });

  // POST cancel: Booker cancels via token link (F12 R2)
  app.post("/api/public/booking/cancel/:token", async (req, res) => {
    try {
      const booking = await storage.getBookingByCancelToken(req.params.token);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "This booking has already been cancelled" });
      }

      const { reason } = req.body || {};
      const sanitizedReason = reason ? String(reason).slice(0, 1000) : null;

      // Check minimum notice period (soft warning — still allow)
      const rules = await storage.getAvailabilityRules(booking.userId);
      const minNotice = rules?.minNotice ?? 1440; // default 24h in minutes
      const now = new Date();
      const minutesUntilMeeting = (booking.startTime.getTime() - now.getTime()) / (1000 * 60);
      const withinNoticePeriod = minutesUntilMeeting < minNotice && minutesUntilMeeting > 0;

      // Cancel the booking
      await storage.updateBooking(booking.id, {
        status: "cancelled",
        cancellationReason: sanitizedReason,
      });

      // Delete Google Calendar event if one exists
      if (booking.calendarEventId) {
        deleteCalendarEvent(booking.userId, booking.calendarEventId).catch(err =>
          console.error(`Failed to delete calendar event for booking ${booking.id}:`, err)
        );
      }

      res.json({ success: true, withinNoticePeriod });

      // Fire-and-forget: send cancellation emails
      (async () => {
        try {
          const eventType = await storage.getEventType(booking.eventTypeId);
          if (!eventType) return;
          const host = await storage.getUser(booking.userId);
          const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
          const hostTimezone = rules?.timezone || "UTC";
          const baseUrl = getBaseUrl(req);

          // Email to booker
          const bookerTpl = cancellationEmailToBooker({
            guestName: booking.guestName,
            hostName,
            eventTypeName: eventType.name,
            startTime: booking.startTime,
            guestTimezone: booking.timezone,
            eventTypeSlug: eventType.slug,
            baseUrl,
          });
          sendEmail({ to: booking.guestEmail, ...bookerTpl }).catch(err =>
            console.error("Failed to send cancellation email to booker:", err)
          );

          // Email to host (check preferences)
          const prefs = await storage.getNotificationPreferences(booking.userId);
          const shouldNotify = prefs?.cancellationEmail !== false;
          if (shouldNotify && host?.email) {
            const hostTpl = cancellationEmailToHost({
              guestName: booking.guestName,
              hostName,
              eventTypeName: eventType.name,
              startTime: booking.startTime,
              hostTimezone,
              baseUrl,
              cancellationReason: sanitizedReason || undefined,
              withinNoticePeriod,
            });
            sendEmail({ to: host.email, ...hostTpl }).catch(err =>
              console.error("Failed to send cancellation email to host:", err)
            );
          }
        } catch (err) {
          console.error("Failed to send cancellation emails:", err);
        }
      })();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  app.get("/api/public/booking/reschedule/:token", async (req, res) => {
    try {
      const booking = await storage.getBookingByRescheduleToken(req.params.token);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const eventType = await storage.getEventType(booking.eventTypeId);
      const host = eventType ? await storage.getUser(eventType.userId) : null;
      const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
      res.json({
        id: booking.id,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTypeName: eventType?.name || "Meeting",
        eventTypeSlug: eventType?.slug,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        timezone: booking.timezone,
        hostName,
        duration: eventType?.duration || 30,
        eventType: eventType ? {
          primaryColor: eventType.primaryColor,
          secondaryColor: eventType.secondaryColor,
          color: eventType.color,
          logo: eventType.logo,
          duration: eventType.duration,
          host: host ? { firstName: host.firstName, lastName: host.lastName, profileImageUrl: host.profileImageUrl } : null,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to look up booking" });
    }
  });

  // GET reschedule availability: Available slots for rescheduling (F12 R3)
  app.get("/api/public/booking/reschedule/:token/availability", async (req, res) => {
    try {
      const booking = await storage.getBookingByRescheduleToken(req.params.token);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Cannot reschedule a cancelled booking" });
      }

      const eventType = await storage.getEventType(booking.eventTypeId);
      if (!eventType) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: "Invalid date parameter" });
      }

      const guestTimezone = req.query.timezone as string | undefined;
      if (guestTimezone && !isValidTimezone(guestTimezone)) {
        return res.status(400).json({ error: "Invalid timezone identifier" });
      }

      const slots = await calculateAvailability(
        eventType.userId,
        eventType.id,
        date,
        guestTimezone || booking.timezone
      );
      res.json(slots);
    } catch (error) {
      console.error("Error fetching reschedule availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // POST reschedule: Booker reschedules via token link (F12 R3)
  app.post("/api/public/booking/reschedule/:token", async (req, res) => {
    try {
      const booking = await storage.getBookingByRescheduleToken(req.params.token);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Cannot reschedule a cancelled booking" });
      }

      const { startTimeUTC, timezone: clientTimezone } = req.body;
      if (!startTimeUTC) {
        return res.status(400).json({ error: "New start time is required" });
      }

      const newStartTime = new Date(startTimeUTC);
      if (isNaN(newStartTime.getTime())) {
        return res.status(400).json({ error: "Invalid start time" });
      }

      // Validate not in the past
      const now = new Date();
      if (newStartTime.getTime() < now.getTime()) {
        return res.status(400).json({ error: "Cannot reschedule to a time in the past" });
      }

      // Validate within 365-day window
      const maxBookingWindow = 365 * 24 * 60 * 60 * 1000;
      if (newStartTime.getTime() - now.getTime() > maxBookingWindow) {
        return res.status(400).json({ error: "Booking date is too far in the future" });
      }

      // Prevent rescheduling to the same time
      if (booking.startTime.getTime() === newStartTime.getTime()) {
        return res.status(400).json({ error: "Please select a different time" });
      }

      const eventType = await storage.getEventType(booking.eventTypeId);
      if (!eventType) {
        return res.status(404).json({ error: "Event type not found" });
      }

      const newEndTime = addMinutes(newStartTime, eventType.duration);

      // Double-booking prevention (same pattern as POST /api/public/book)
      const existingBookings = await storage.getBookingsByDateRange(
        eventType.userId,
        newStartTime,
        newEndTime
      );
      const hasConflict = existingBookings.some((b) => {
        // Exclude the current booking from conflict check
        if (b.id === booking.id) return false;
        return b.startTime < newEndTime && b.endTime > newStartTime;
      });
      if (hasConflict) {
        return res.status(409).json({ error: "This time slot is no longer available" });
      }

      // Check minimum notice period (soft warning)
      const rules = await storage.getAvailabilityRules(booking.userId);
      const minNotice = rules?.minNotice ?? 1440;
      const minutesUntilNew = (newStartTime.getTime() - now.getTime()) / (1000 * 60);
      const withinNoticePeriod = minutesUntilNew < minNotice;

      const oldStartTime = booking.startTime;
      const oldEndTime = booking.endTime;

      // Validate and persist timezone
      const validatedTimezone = (clientTimezone && isValidTimezone(clientTimezone))
        ? clientTimezone
        : booking.timezone;

      // Update the booking
      await storage.updateBooking(booking.id, {
        startTime: newStartTime,
        endTime: newEndTime,
        timezone: validatedTimezone,
      });

      // Update Google Calendar: delete old event and create new one
      if (booking.calendarEventId) {
        deleteCalendarEvent(booking.userId, booking.calendarEventId).catch(err =>
          console.error(`Failed to delete old calendar event for booking ${booking.id}:`, err)
        );
      }
      // Create new calendar event (fire-and-forget for response, but persist ID)
      (async () => {
        try {
          const newCalendarEventId = await createCalendarEvent(
            eventType.userId,
            {
              guestName: booking.guestName,
              guestEmail: booking.guestEmail,
              guestCompany: booking.guestCompany,
              startTime: newStartTime,
              endTime: newEndTime,
              timezone: validatedTimezone,
              notes: booking.notes,
            },
            eventType.name
          );
          if (newCalendarEventId) {
            await storage.updateBooking(booking.id, { calendarEventId: newCalendarEventId });
          }
        } catch (err) {
          console.error("Failed to create new calendar event for rescheduled booking:", err);
        }
      })();

      // Delete and regenerate meeting brief (F11 integration)
      (async () => {
        try {
          await storage.deleteMeetingBrief(booking.id);
          // Brief will be auto-generated by scheduler if within window,
          // or can be manually triggered
        } catch (err) {
          console.error("Failed to delete meeting brief for rescheduled booking:", err);
        }
      })();

      res.json({ success: true, withinNoticePeriod, newStartTime, newEndTime });

      // Fire-and-forget: send reschedule emails
      (async () => {
        try {
          const host = await storage.getUser(booking.userId);
          const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Host" : "Host";
          const hostTimezone = rules?.timezone || "UTC";
          const baseUrl = getBaseUrl(req);

          // Email to booker
          const bookerTpl = rescheduleConfirmationToBooker({
            guestName: booking.guestName,
            eventTypeName: eventType.name,
            oldStartTime,
            oldEndTime,
            newStartTime,
            newEndTime,
            hostName,
            timezone: booking.timezone,
            rescheduleToken: booking.rescheduleToken || undefined,
            cancelToken: booking.cancelToken || undefined,
            baseUrl,
            withinNoticePeriod,
          });
          sendEmail({ to: booking.guestEmail, ...bookerTpl }).catch(err =>
            console.error("Failed to send reschedule email to booker:", err)
          );

          // Email to host (check preferences)
          const prefs = await storage.getNotificationPreferences(booking.userId);
          const shouldNotify = prefs?.newBookingEmail !== false;
          if (shouldNotify && host?.email) {
            const hostTpl = rescheduleNotificationToHost({
              guestName: booking.guestName,
              guestEmail: booking.guestEmail,
              eventTypeName: eventType.name,
              oldStartTime,
              oldEndTime,
              newStartTime,
              newEndTime,
              hostName,
              timezone: hostTimezone,
              bookingId: booking.id,
              baseUrl,
              withinNoticePeriod,
            });
            sendEmail({ to: host.email, ...hostTpl }).catch(err =>
              console.error("Failed to send reschedule email to host:", err)
            );
          }
        } catch (err) {
          console.error("Failed to send reschedule emails:", err);
        }
      })();
    } catch (error) {
      console.error("Error rescheduling booking:", error);
      res.status(500).json({ error: "Failed to reschedule booking" });
    }
  });

  // Public Routes - Booking Page
  app.get("/api/public/event-types/:slug", async (req, res) => {
    try {
      const eventType = await storage.getEventTypeBySlugWithHost(req.params.slug);
      if (!eventType || !eventType.isActive) {
        return res.status(404).json({ error: "Event type not found" });
      }
      // Strip internal fields from public response
      const { userId, ...publicEventType } = eventType;
      res.json(publicEventType);
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
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: "Invalid date parameter" });
      }

      // Validate and pass guest timezone for timezone-aware slot rendering.
      const guestTimezone = req.query.timezone as string | undefined;
      if (guestTimezone && !isValidTimezone(guestTimezone)) {
        return res.status(400).json({ error: "Invalid timezone identifier" });
      }

      const slots = await calculateAvailability(eventType.userId, eventType.id, date, guestTimezone);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/public/book", async (req, res) => {
    try {
      const { eventTypeSlug, date, time, name, email, phone, company, notes, timezone: clientTimezone, startTimeUTC, chatHistory, documents } = req.body;

      // Validate guest email (F09-A1 security fix)
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: "Valid email address is required" });
      }

      const eventType = await storage.getEventTypeBySlug(eventTypeSlug);
      if (!eventType || !eventType.isActive) {
        return res.status(404).json({ error: "Event type not found" });
      }

      // Prefer the precise UTC timestamp from the availability API when
      // available; fall back to the legacy date + display-time parsing.
      let startTime: Date;
      if (startTimeUTC) {
        startTime = new Date(startTimeUTC);
      } else {
        const [hours, minutes] = time.replace(/ [AP]M/, "").split(":").map(Number);
        const isPM = time.includes("PM");
        const adjustedHours = isPM && hours !== 12 ? hours + 12 : (hours === 12 && !isPM ? 0 : hours);
        startTime = new Date(date);
        startTime.setHours(adjustedHours, minutes, 0, 0);
      }

      // Validate the computed start time is a real date, in the future,
      // and within a reasonable booking window (365 days).
      if (isNaN(startTime.getTime())) {
        return res.status(400).json({ error: "Invalid booking time" });
      }
      const now = new Date();
      if (startTime.getTime() < now.getTime()) {
        return res.status(400).json({ error: "Cannot book a time in the past" });
      }
      const maxBookingWindow = 365 * 24 * 60 * 60 * 1000;
      if (startTime.getTime() - now.getTime() > maxBookingWindow) {
        return res.status(400).json({ error: "Booking date is too far in the future" });
      }

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

      // Validate guest phone number if provided
      if (phone && !phoneRegex.test(phone)) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }

      // Create booking — sanitize guest timezone before persisting.
      const validatedTimezone = (clientTimezone && isValidTimezone(clientTimezone))
        ? clientTimezone
        : "UTC";
      // Generate reschedule/cancel tokens (F09 R3)
      const rescheduleToken = generateToken();
      const cancelToken = generateToken();

      const booking = await storage.createBooking({
        eventTypeId: eventType.id,
        userId: eventType.userId,
        guestName: name,
        guestEmail: email,
        guestPhone: phone || null,
        guestCompany: company || null,
        startTime,
        endTime,
        status: "confirmed",
        timezone: validatedTimezone,
        notes: notes || null,
        rescheduleToken,
        cancelToken,
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

      // Fire-and-forget: send confirmation emails (F09 R4)
      (async () => {
        try {
          // Resolve host info for emails
          const host = await storage.getUser(eventType.userId);
          const hostName = host ? [host.firstName, host.lastName].filter(Boolean).join(" ") || "Your host" : "Your host";
          const hostTimezone = (await storage.getAvailabilityRules(eventType.userId))?.timezone || "UTC";
          const baseUrl = getBaseUrl(req);

          // 1. Booker confirmation email
          const confirmTpl = bookingConfirmationEmail({
            guestName: name,
            guestEmail: email,
            hostName,
            eventTypeName: eventType.name,
            startTime,
            endTime,
            duration: eventType.duration,
            guestTimezone: validatedTimezone,
            hostTimezone,
            location: eventType.location,
            calendarEventId: calendarEventId || null,
            rescheduleToken,
            cancelToken,
            baseUrl,
          });
          sendEmail({ to: email, ...confirmTpl }).catch(err =>
            console.error("Failed to send booking confirmation:", err)
          );

          // 2. Host notification email (check preferences first)
          const prefs = await storage.getNotificationPreferences(eventType.userId);
          const shouldNotifyHost = prefs?.newBookingEmail !== false; // default true

          if (shouldNotifyHost && host?.email) {
            // Get pre-qual summary if available
            const prequalResp = await storage.getPrequalResponse(booking.id);
            const extracted = prequalResp?.extractedData as Record<string, any> | null;

            const hostTpl = hostNotificationEmail({
              guestName: name,
              guestEmail: email,
              guestCompany: company || null,
              guestPhone: phone || null,
              hostName,
              eventTypeName: eventType.name,
              startTime,
              endTime,
              duration: eventType.duration,
              guestTimezone: validatedTimezone,
              hostTimezone,
              location: eventType.location,
              baseUrl,
              prequalSummary: extracted?.summary as string | undefined || null,
              // Score not included here — enrichment is async and may not be ready
            });
            sendEmail({ to: host.email, ...hostTpl }).catch(err =>
              console.error("Failed to send host notification:", err)
            );
          }
        } catch (err) {
          console.error("Failed to send booking emails:", err);
        }
      })();

      // Fire-and-forget: auto-enrich and score the new booking
      (async () => {
        try {
          // Get prequal data if it was stored
          const prequalResponse = await storage.getPrequalResponse(booking.id);
          const extractedData = prequalResponse?.extractedData as Record<string, any> | null;

          // Count documents for this booking
          const docs = await storage.getDocuments(booking.id);
          const documentCount = docs?.length || 0;

          // Build prequal context from extracted data
          const prequalData = extractedData ? {
            summary: extractedData.summary as string | undefined,
            keyPoints: extractedData.keyPoints as string[] | undefined,
            timeline: extractedData.timeline as string | undefined,
            documents: extractedData.documents as string[] | undefined,
            company: extractedData.company as string | undefined,
          } : null;

          const result = await enrichAndScore(
            booking.id,
            booking.guestName,
            booking.guestEmail,
            booking.guestCompany || undefined,
            booking.guestPhone,
            booking.notes,
            prequalData,
            documentCount
          );

          if (result) {
            // Persist enrichment
            const enrichment = await storage.createLeadEnrichment({
              bookingId: booking.id,
              companyInfo: result.enrichment.companyInfo,
              personalInfo: result.enrichment.personalInfo,
            });

            // Persist score
            await storage.updateLeadEnrichmentScore(
              enrichment.id,
              result.score.score,
              result.score.label,
              result.score.reasoning
            );
          }
        } catch (err) {
          console.error("Auto-enrichment failed for booking", booking.id, err);
        }
      })();

      // Fire-and-forget: if booking is less than 1 hour away, generate brief immediately
      // (the scheduler only checks 1-2 hours ahead, so <1hr bookings would be missed)
      const msUntilStart = startTime.getTime() - Date.now();
      if (msUntilStart < 60 * 60 * 1000) {
        (async () => {
          try {
            // Small delay to allow enrichment to complete first
            await new Promise(resolve => setTimeout(resolve, 5000));

            const details = await storage.getBookingWithDetails(booking.id);
            if (!details || details.status !== "confirmed") return;

            // Skip if brief was already generated
            const existingBrief = await storage.getMeetingBrief(booking.id);
            if (existingBrief) return;

            const docs = await storage.getDocuments(booking.id);

            // Fetch past bookings from same domain
            const domain = booking.guestEmail.split("@")[1];
            let pastBookingsForBrief: { guestName: string; guestEmail: string; startTime: Date; status: string }[] = [];
            if (domain) {
              const domainBookings = await storage.getBookingsByGuestDomain(booking.userId, domain);
              pastBookingsForBrief = domainBookings
                .filter(b => b.id !== booking.id)
                .map(b => ({ guestName: b.guestName, guestEmail: b.guestEmail, startTime: b.startTime, status: b.status }));
            }

            const briefData = await generateMeetingBrief(
              details.guestName,
              details.guestEmail,
              details.guestCompany,
              details.eventType?.name || "Meeting",
              details.eventType?.description || null,
              details.enrichment || null,
              details.notes,
              details.prequalResponse?.chatHistory || null,
              docs.map((d: any) => ({ name: d.name, contentType: d.contentType || "unknown", size: d.size || 0 })),
              pastBookingsForBrief
            );

            await storage.createMeetingBrief({
              bookingId: booking.id,
              summary: briefData.summary,
              talkingPoints: briefData.talkingPoints,
              keyContext: briefData.keyContext,
              documentAnalysis: briefData.documentAnalysis || null,
            });

            console.log(`Immediate brief generated for booking ${booking.id} (starts in <1hr)`);
          } catch (err) {
            console.error("Immediate brief generation failed for booking", booking.id, err);
          }
        })();
      }
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(400).json({ error: "Failed to create booking" });
    }
  });

  app.post("/api/public/chat", async (req, res) => {
    try {
      const { eventTypeSlug, messages, guestInfo } = req.body;

      const eventType = await storage.getEventTypeBySlugWithHost(eventTypeSlug);
      if (!eventType) {
        return res.status(404).json({ error: "Event type not found" });
      }

      // Derive host name server-side (never trust client-provided hostName)
      const hostName = [eventType.host?.firstName, eventType.host?.lastName]
        .filter(Boolean)
        .join(" ") || undefined;

      const response = await processPrequalChat(
        messages,
        eventType.name,
        (eventType.questions as string[]) || [],
        guestInfo,
        hostName
      );

      res.json(response);
    } catch (error) {
      console.error("Error processing chat:", error);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  return httpServer;
}
