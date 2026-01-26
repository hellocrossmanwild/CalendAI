import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventTypeSchema, insertBookingSchema } from "@shared/schema";
import { enrichLead, generateMeetingBrief, processPrequalChat } from "./ai-service";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { addHours, addMinutes, setHours, setMinutes, format, startOfDay, isBefore } from "date-fns";

const objectStorageService = new ObjectStorageService();

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
  // Auth routes - user info
  app.get("/api/auth/user", async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json(req.user);
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

  // Calendar Integration (stub - would need real Google OAuth)
  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const token = await storage.getCalendarToken(req.user!.id);
      res.json({
        connected: !!token,
        email: token ? `${req.user!.email}` : undefined,
      });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  app.get("/api/calendar/connect", requireAuth, async (req, res) => {
    // In production, this would redirect to Google OAuth
    // For now, simulate connection by creating a placeholder token
    try {
      await storage.upsertCalendarToken({
        userId: req.user!.id,
        accessToken: "placeholder_token",
        refreshToken: null,
        expiresAt: null,
        calendarId: "primary",
      });
      res.json({ connected: true, message: "Calendar connected successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to connect calendar" });
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
      
      // Generate available time slots (simplified - in production would check calendar)
      const slots: { time: string; available: boolean }[] = [];
      const startHour = 9;
      const endHour = 17;
      const interval = 30;

      for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += interval) {
          const slotTime = setMinutes(setHours(date, hour), minute);
          
          // Don't show past times
          if (isBefore(slotTime, new Date())) {
            continue;
          }

          slots.push({
            time: format(slotTime, "h:mm a"),
            available: true,
          });
        }
      }

      res.json(slots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/public/book", async (req, res) => {
    try {
      const { eventTypeSlug, date, time, name, email, company, notes, chatHistory, documents } = req.body;

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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

      res.status(201).json(booking);
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
