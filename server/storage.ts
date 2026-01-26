import { db } from "./db";
import { eq, and, desc, gte, asc } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type EventType,
  type InsertEventType,
  type Booking,
  type InsertBooking,
  type LeadEnrichment,
  type InsertLeadEnrichment,
  type PrequalResponse,
  type InsertPrequalResponse,
  type Document,
  type InsertDocument,
  type MeetingBrief,
  type InsertMeetingBrief,
  type CalendarToken,
  type InsertCalendarToken,
  eventTypes,
  bookings,
  leadEnrichments,
  prequalResponses,
  documents,
  meetingBriefs,
  calendarTokens,
} from "@shared/schema";
import { users } from "@shared/models/auth";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(userData: { username: string; password: string; firstName?: string | null; lastName?: string | null }): Promise<User>;
  upsertUser(user: InsertUser): Promise<User>;
  
  getEventTypes(userId: string): Promise<EventType[]>;
  getEventType(id: number): Promise<EventType | undefined>;
  getEventTypeBySlug(slug: string): Promise<EventType | undefined>;
  createEventType(data: InsertEventType): Promise<EventType>;
  updateEventType(id: number, data: Partial<InsertEventType>): Promise<EventType | undefined>;
  deleteEventType(id: number): Promise<void>;

  getBookings(userId: string): Promise<Booking[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  getBookingWithDetails(id: number): Promise<any>;
  getBookingsWithDetails(userId: string): Promise<any[]>;
  createBooking(data: InsertBooking): Promise<Booking>;
  updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined>;
  deleteBooking(id: number): Promise<void>;

  getLeadEnrichment(bookingId: number): Promise<LeadEnrichment | undefined>;
  createLeadEnrichment(data: InsertLeadEnrichment): Promise<LeadEnrichment>;
  updateLeadEnrichment(id: number, data: Partial<InsertLeadEnrichment>): Promise<LeadEnrichment | undefined>;

  getPrequalResponse(bookingId: number): Promise<PrequalResponse | undefined>;
  createPrequalResponse(data: InsertPrequalResponse): Promise<PrequalResponse>;

  getDocuments(bookingId: number): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  getMeetingBrief(bookingId: number): Promise<MeetingBrief | undefined>;
  createMeetingBrief(data: InsertMeetingBrief): Promise<MeetingBrief>;
  updateMeetingBrief(id: number, data: Partial<InsertMeetingBrief>): Promise<MeetingBrief | undefined>;

  getCalendarToken(userId: string): Promise<CalendarToken | undefined>;
  upsertCalendarToken(data: InsertCalendarToken): Promise<CalendarToken>;
  deleteCalendarToken(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(userData: { username: string; password: string; firstName?: string | null; lastName?: string | null }): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async upsertUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getEventTypes(userId: string): Promise<EventType[]> {
    return db.select().from(eventTypes).where(eq(eventTypes.userId, userId)).orderBy(desc(eventTypes.createdAt));
  }

  async getEventType(id: number): Promise<EventType | undefined> {
    const [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.id, id)).limit(1);
    return eventType;
  }

  async getEventTypeBySlug(slug: string): Promise<EventType | undefined> {
    const [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.slug, slug)).limit(1);
    return eventType;
  }

  async createEventType(data: InsertEventType): Promise<EventType> {
    const [eventType] = await db.insert(eventTypes).values(data).returning();
    return eventType;
  }

  async updateEventType(id: number, data: Partial<InsertEventType>): Promise<EventType | undefined> {
    const [eventType] = await db
      .update(eventTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(eventTypes.id, id))
      .returning();
    return eventType;
  }

  async deleteEventType(id: number): Promise<void> {
    await db.delete(eventTypes).where(eq(eventTypes.id, id));
  }

  async getBookings(userId: string): Promise<Booking[]> {
    return db.select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.startTime));
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return booking;
  }

  async getBookingWithDetails(id: number): Promise<any> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!booking) return undefined;

    const [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.id, booking.eventTypeId)).limit(1);
    const [enrichment] = await db.select().from(leadEnrichments).where(eq(leadEnrichments.bookingId, id)).limit(1);
    const [prequalResponse] = await db.select().from(prequalResponses).where(eq(prequalResponses.bookingId, id)).limit(1);
    const docs = await db.select().from(documents).where(eq(documents.bookingId, id));
    const [brief] = await db.select().from(meetingBriefs).where(eq(meetingBriefs.bookingId, id)).limit(1);

    return {
      ...booking,
      eventType,
      enrichment,
      prequalResponse,
      documents: docs,
      brief,
    };
  }

  async getBookingsWithDetails(userId: string): Promise<any[]> {
    const userBookings = await db.select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.startTime));
    
    const bookingsWithDetails = await Promise.all(
      userBookings.map(async (booking) => {
        const [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.id, booking.eventTypeId)).limit(1);
        const [enrichment] = await db.select().from(leadEnrichments).where(eq(leadEnrichments.bookingId, booking.id)).limit(1);
        const [brief] = await db.select().from(meetingBriefs).where(eq(meetingBriefs.bookingId, booking.id)).limit(1);

        return {
          ...booking,
          eventType,
          enrichment,
          brief,
        };
      })
    );

    return bookingsWithDetails;
  }

  async createBooking(data: InsertBooking): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(data).returning();
    return booking;
  }

  async updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings).set(data).where(eq(bookings.id, id)).returning();
    return booking;
  }

  async deleteBooking(id: number): Promise<void> {
    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id));
  }

  async getLeadEnrichment(bookingId: number): Promise<LeadEnrichment | undefined> {
    const [enrichment] = await db.select().from(leadEnrichments).where(eq(leadEnrichments.bookingId, bookingId)).limit(1);
    return enrichment;
  }

  async createLeadEnrichment(data: InsertLeadEnrichment): Promise<LeadEnrichment> {
    const [enrichment] = await db.insert(leadEnrichments).values(data).returning();
    return enrichment;
  }

  async updateLeadEnrichment(id: number, data: Partial<InsertLeadEnrichment>): Promise<LeadEnrichment | undefined> {
    const [enrichment] = await db.update(leadEnrichments).set(data).where(eq(leadEnrichments.id, id)).returning();
    return enrichment;
  }

  async getPrequalResponse(bookingId: number): Promise<PrequalResponse | undefined> {
    const [response] = await db.select().from(prequalResponses).where(eq(prequalResponses.bookingId, bookingId)).limit(1);
    return response;
  }

  async createPrequalResponse(data: InsertPrequalResponse): Promise<PrequalResponse> {
    const [response] = await db.insert(prequalResponses).values(data).returning();
    return response;
  }

  async getDocuments(bookingId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.bookingId, bookingId));
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getMeetingBrief(bookingId: number): Promise<MeetingBrief | undefined> {
    const [brief] = await db.select().from(meetingBriefs).where(eq(meetingBriefs.bookingId, bookingId)).limit(1);
    return brief;
  }

  async createMeetingBrief(data: InsertMeetingBrief): Promise<MeetingBrief> {
    const [brief] = await db.insert(meetingBriefs).values(data).returning();
    return brief;
  }

  async updateMeetingBrief(id: number, data: Partial<InsertMeetingBrief>): Promise<MeetingBrief | undefined> {
    const [brief] = await db.update(meetingBriefs).set(data).where(eq(meetingBriefs.id, id)).returning();
    return brief;
  }

  async getCalendarToken(userId: string): Promise<CalendarToken | undefined> {
    const [token] = await db.select().from(calendarTokens).where(eq(calendarTokens.userId, userId)).limit(1);
    return token;
  }

  async upsertCalendarToken(data: InsertCalendarToken): Promise<CalendarToken> {
    const [token] = await db
      .insert(calendarTokens)
      .values(data)
      .onConflictDoUpdate({
        target: calendarTokens.userId,
        set: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          calendarId: data.calendarId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return token;
  }

  async deleteCalendarToken(userId: string): Promise<void> {
    await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
  }
}

export const storage = new DatabaseStorage();
