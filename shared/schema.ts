import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

// Event Types - customizable meeting types users can create
export const eventTypes = pgTable("event_types", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  duration: integer("duration").notNull().default(30),
  bufferBefore: integer("buffer_before").default(0),
  bufferAfter: integer("buffer_after").default(0),
  color: text("color").default("#6366f1"),
  isActive: boolean("is_active").default(true),
  questions: jsonb("questions").$type<string[]>().default([]),
  location: text("location"),                    // e.g. "google-meet", "zoom:https://...", "phone:+44...", "in-person:123 Main St", "custom:https://..."
  logo: text("logo"),                            // URL to logo image
  primaryColor: text("primary_color"),           // hex color e.g. "#6366f1"
  secondaryColor: text("secondary_color"),       // hex color
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Bookings - scheduled meetings
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  eventTypeId: integer("event_type_id").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  guestCompany: text("guest_company"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("confirmed"),
  timezone: text("timezone").notNull().default("UTC"),
  notes: text("notes"),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Lead Enrichment - AI-powered research data
export const leadEnrichments = pgTable("lead_enrichments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  companyInfo: jsonb("company_info").$type<{
    name?: string;
    industry?: string;
    size?: string;
    website?: string;
    description?: string;
    recentNews?: string[];
  }>(),
  personalInfo: jsonb("personal_info").$type<{
    role?: string;
    linkedInUrl?: string;
    bio?: string;
    interests?: string[];
  }>(),
  enrichedAt: timestamp("enriched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Pre-qualification Responses - conversational form data
export const prequalResponses = pgTable("prequal_responses", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  chatHistory: jsonb("chat_history").$type<{ role: string; content: string }[]>().default([]),
  extractedData: jsonb("extracted_data").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Documents - uploaded files for meetings
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedAt: timestamp("uploaded_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Meeting Prep Briefs - AI-generated summaries
export const meetingBriefs = pgTable("meeting_briefs", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  summary: text("summary"),
  talkingPoints: jsonb("talking_points").$type<string[]>(),
  keyContext: jsonb("key_context").$type<string[]>(),
  documentAnalysis: text("document_analysis"),
  generatedAt: timestamp("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Availability Rules - configurable working hours per user
export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  weeklyHours: jsonb("weekly_hours").$type<{
    [day: string]: { start: string; end: string }[] | null;
  }>().default({
    monday: [{ start: "09:00", end: "17:00" }],
    tuesday: [{ start: "09:00", end: "17:00" }],
    wednesday: [{ start: "09:00", end: "17:00" }],
    thursday: [{ start: "09:00", end: "17:00" }],
    friday: [{ start: "09:00", end: "17:00" }],
    saturday: null,
    sunday: null,
  }),
  minNotice: integer("min_notice").default(1440),        // minutes (default 24h)
  maxAdvance: integer("max_advance").default(60),         // days (default 60)
  defaultBufferBefore: integer("default_buffer_before").default(0),
  defaultBufferAfter: integer("default_buffer_after").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Google Calendar Tokens - OAuth storage
export const calendarTokens = pgTable("calendar_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  calendarId: text("calendar_id").default("primary"),
  selectedCalendars: jsonb("selected_calendars").$type<string[]>().default(["primary"]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Relations
export const eventTypesRelations = relations(eventTypes, ({ many }) => ({
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  eventType: one(eventTypes, {
    fields: [bookings.eventTypeId],
    references: [eventTypes.id],
  }),
  enrichment: one(leadEnrichments),
  prequalResponse: one(prequalResponses),
  documents: many(documents),
  brief: one(meetingBriefs),
}));

export const leadEnrichmentsRelations = relations(leadEnrichments, ({ one }) => ({
  booking: one(bookings, {
    fields: [leadEnrichments.bookingId],
    references: [bookings.id],
  }),
}));

export const prequalResponsesRelations = relations(prequalResponses, ({ one }) => ({
  booking: one(bookings, {
    fields: [prequalResponses.bookingId],
    references: [bookings.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  booking: one(bookings, {
    fields: [documents.bookingId],
    references: [bookings.id],
  }),
}));

export const meetingBriefsRelations = relations(meetingBriefs, ({ one }) => ({
  booking: one(bookings, {
    fields: [meetingBriefs.bookingId],
    references: [bookings.id],
  }),
}));

// Zod schemas
export const insertEventTypeSchema = createInsertSchema(eventTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const phoneRegex = /^\+?[\d\s\-()]+$/;

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
}).extend({
  guestPhone: z.string().regex(phoneRegex, "Invalid phone number format").nullish(),
});

export const insertLeadEnrichmentSchema = createInsertSchema(leadEnrichments).omit({
  id: true,
  enrichedAt: true,
});

export const insertPrequalResponseSchema = createInsertSchema(prequalResponses).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertMeetingBriefSchema = createInsertSchema(meetingBriefs).omit({
  id: true,
  generatedAt: true,
});

export const insertAvailabilityRulesSchema = createInsertSchema(availabilityRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCalendarTokenSchema = createInsertSchema(calendarTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type EventType = typeof eventTypes.$inferSelect;
export type InsertEventType = z.infer<typeof insertEventTypeSchema>;

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;

export type LeadEnrichment = typeof leadEnrichments.$inferSelect;
export type InsertLeadEnrichment = z.infer<typeof insertLeadEnrichmentSchema>;

export type PrequalResponse = typeof prequalResponses.$inferSelect;
export type InsertPrequalResponse = z.infer<typeof insertPrequalResponseSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type MeetingBrief = typeof meetingBriefs.$inferSelect;
export type InsertMeetingBrief = z.infer<typeof insertMeetingBriefSchema>;

export type AvailabilityRules = typeof availabilityRules.$inferSelect;
export type InsertAvailabilityRules = z.infer<typeof insertAvailabilityRulesSchema>;

export type CalendarToken = typeof calendarTokens.$inferSelect;
export type InsertCalendarToken = z.infer<typeof insertCalendarTokenSchema>;

// Host info exposed on public booking pages (safe fields only)
export type EventTypeHost = {
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

// Event type with host info for public booking pages
export type EventTypeWithHost = EventType & {
  host: EventTypeHost;
};

// Extended types for API responses
export type BookingWithDetails = Booking & {
  eventType?: EventType;
  enrichment?: LeadEnrichment;
  prequalResponse?: PrequalResponse;
  documents?: Document[];
  brief?: MeetingBrief;
};
