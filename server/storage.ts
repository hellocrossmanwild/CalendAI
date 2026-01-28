import { db } from "./db";
import { eq, and, desc, gte, asc, lt, sql } from "drizzle-orm";
import {
  type User,
  type UpsertUser,
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
  type AvailabilityRules,
  type InsertAvailabilityRules,
  type CalendarToken,
  type InsertCalendarToken,
  type NotificationPreferences,
  type InsertNotificationPreferences,
  type EventTypeWithHost,
  eventTypes,
  bookings,
  leadEnrichments,
  prequalResponses,
  documents,
  meetingBriefs,
  availabilityRules,
  calendarTokens,
  notificationPreferences,
} from "@shared/schema";
import { users, passwordResetTokens, magicLinkTokens, emailVerificationTokens, onboardingDrafts, type OnboardingDraft, type InsertOnboardingDraft } from "@shared/models/auth";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: { email: string; password: string; firstName?: string | null; lastName?: string | null }): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  deleteUserAndData(userId: string): Promise<void>;

  // Password reset tokens
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ id: number; userId: string; token: string; expiresAt: Date; used: boolean | null } | undefined>;
  markPasswordResetTokenUsed(id: number): Promise<void>;

  // Magic link tokens
  createMagicLinkToken(email: string, token: string, expiresAt: Date): Promise<void>;
  getMagicLinkToken(token: string): Promise<{ id: number; email: string; token: string; expiresAt: Date; used: boolean | null } | undefined>;
  markMagicLinkTokenUsed(id: number): Promise<void>;

  // Email verification tokens
  createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void>;
  getEmailVerificationToken(token: string): Promise<{ id: number; userId: string; token: string; expiresAt: Date; used: boolean | null } | undefined>;
  markEmailVerificationTokenUsed(id: number): Promise<void>;

  getEventTypes(userId: string): Promise<EventType[]>;
  getEventType(id: number): Promise<EventType | undefined>;
  getEventTypeBySlug(slug: string): Promise<EventType | undefined>;
  getEventTypeBySlugWithHost(slug: string): Promise<EventTypeWithHost | undefined>;
  createEventType(data: InsertEventType): Promise<EventType>;
  updateEventType(id: number, data: Partial<InsertEventType>): Promise<EventType | undefined>;
  deleteEventType(id: number): Promise<void>;

  getBookings(userId: string): Promise<Booking[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  getBookingWithDetails(id: number): Promise<any>;
  getBookingsWithDetails(userId: string): Promise<any[]>;
  getBookingsByDateRange(userId: string, startDate: Date, endDate: Date): Promise<Booking[]>;
  getUpcomingBookingsWithoutBriefs(startDate: Date, endDate: Date): Promise<Booking[]>;
  getBookingsByGuestDomain(userId: string, domain: string): Promise<Booking[]>;
  createBooking(data: InsertBooking): Promise<Booking>;
  updateBooking(id: number, data: Partial<InsertBooking>): Promise<Booking | undefined>;
  deleteBooking(id: number): Promise<void>;

  getLeadEnrichment(bookingId: number): Promise<LeadEnrichment | undefined>;
  createLeadEnrichment(data: InsertLeadEnrichment): Promise<LeadEnrichment>;
  updateLeadEnrichment(id: number, data: Partial<InsertLeadEnrichment>): Promise<LeadEnrichment | undefined>;
  updateLeadEnrichmentScore(id: number, score: number, label: string, reasoning: string): Promise<LeadEnrichment | undefined>;

  getPrequalResponse(bookingId: number): Promise<PrequalResponse | undefined>;
  createPrequalResponse(data: InsertPrequalResponse): Promise<PrequalResponse>;

  getDocuments(bookingId: number): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  getMeetingBrief(bookingId: number): Promise<MeetingBrief | undefined>;
  createMeetingBrief(data: InsertMeetingBrief): Promise<MeetingBrief>;
  updateMeetingBrief(id: number, data: Partial<InsertMeetingBrief>): Promise<MeetingBrief | undefined>;
  deleteMeetingBrief(bookingId: number): Promise<void>;
  markBriefAsRead(bookingId: number): Promise<MeetingBrief | undefined>;
  getUnreadBriefsCount(userId: string): Promise<number>;

  getAvailabilityRules(userId: string): Promise<AvailabilityRules | undefined>;
  upsertAvailabilityRules(data: InsertAvailabilityRules): Promise<AvailabilityRules>;

  getCalendarToken(userId: string): Promise<CalendarToken | undefined>;
  upsertCalendarToken(data: InsertCalendarToken): Promise<CalendarToken>;
  deleteCalendarToken(userId: string): Promise<void>;

  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;

  // Booking token lookups
  getBookingByRescheduleToken(token: string): Promise<Booking | undefined>;
  getBookingByCancelToken(token: string): Promise<Booking | undefined>;

  // Notification preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(data: InsertNotificationPreferences): Promise<NotificationPreferences>;

  // Onboarding drafts
  getOnboardingDraft(userId: string): Promise<OnboardingDraft | undefined>;
  upsertOnboardingDraft(userId: string, data: Partial<InsertOnboardingDraft>): Promise<OnboardingDraft>;
  deleteOnboardingDraft(userId: string): Promise<void>;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async createUser(userData: { email: string; password: string; firstName?: string | null; lastName?: string | null }): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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

  async deleteUserAndData(userId: string): Promise<void> {
    // Get all bookings for this user to cascade child records
    const userBookings = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.userId, userId));
    const bookingIds = userBookings.map((b) => b.id);

    if (bookingIds.length > 0) {
      // Delete booking child records
      for (const bookingId of bookingIds) {
        await db.delete(meetingBriefs).where(eq(meetingBriefs.bookingId, bookingId));
        await db.delete(leadEnrichments).where(eq(leadEnrichments.bookingId, bookingId));
        await db.delete(prequalResponses).where(eq(prequalResponses.bookingId, bookingId));
        await db.delete(documents).where(eq(documents.bookingId, bookingId));
      }
      // Delete bookings
      await db.delete(bookings).where(eq(bookings.userId, userId));
    }

    // Delete event types
    await db.delete(eventTypes).where(eq(eventTypes.userId, userId));

    // Delete user config records
    await db.delete(availabilityRules).where(eq(availabilityRules.userId, userId));
    await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));

    // Delete auth tokens
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

    // Delete magic link tokens by user's email
    const [userData] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (userData?.email) {
      await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, userData.email));
    }

    // Finally delete the user
    await db.delete(users).where(eq(users.id, userId));
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

  async getEventTypeBySlugWithHost(slug: string): Promise<EventTypeWithHost | undefined> {
    const [eventType] = await db.select().from(eventTypes).where(eq(eventTypes.slug, slug)).limit(1);
    if (!eventType) return undefined;

    const [user] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        defaultLogo: users.defaultLogo,
        defaultPrimaryColor: users.defaultPrimaryColor,
        defaultSecondaryColor: users.defaultSecondaryColor,
      })
      .from(users)
      .where(eq(users.id, eventType.userId))
      .limit(1);

    return {
      ...eventType,
      host: {
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        profileImageUrl: user?.profileImageUrl ?? null,
        defaultLogo: user?.defaultLogo ?? null,
        defaultPrimaryColor: user?.defaultPrimaryColor ?? null,
        defaultSecondaryColor: user?.defaultSecondaryColor ?? null,
      },
    };
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

  async getBookingsByDateRange(userId: string, startDate: Date, endDate: Date): Promise<Booking[]> {
    return db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          gte(bookings.startTime, startDate),
          lt(bookings.startTime, endDate),
          eq(bookings.status, "confirmed")
        )
      )
      .orderBy(asc(bookings.startTime));
  }

  async getUpcomingBookingsWithoutBriefs(startDate: Date, endDate: Date): Promise<Booking[]> {
    return db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "confirmed"),
          gte(bookings.startTime, startDate),
          lt(bookings.startTime, endDate),
          sql`${bookings.id} NOT IN (SELECT booking_id FROM meeting_briefs)`
        )
      )
      .orderBy(asc(bookings.startTime));
  }

  async getBookingsByGuestDomain(userId: string, domain: string): Promise<Booking[]> {
    return db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          sql`${bookings.guestEmail} LIKE ${'%@' + domain}`
        )
      )
      .orderBy(desc(bookings.startTime))
      .limit(5);
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

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const [booking] = await db
      .update(bookings)
      .set({ status })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
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

  async updateLeadEnrichmentScore(id: number, score: number, label: string, reasoning: string): Promise<LeadEnrichment | undefined> {
    const [enrichment] = await db
      .update(leadEnrichments)
      .set({
        leadScore: score,
        leadScoreLabel: label,
        leadScoreReasoning: reasoning,
      })
      .where(eq(leadEnrichments.id, id))
      .returning();
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

  async deleteMeetingBrief(bookingId: number): Promise<void> {
    await db.delete(meetingBriefs).where(eq(meetingBriefs.bookingId, bookingId));
  }

  async markBriefAsRead(bookingId: number): Promise<MeetingBrief | undefined> {
    const [brief] = await db
      .update(meetingBriefs)
      .set({ readAt: new Date() })
      .where(eq(meetingBriefs.bookingId, bookingId))
      .returning();
    return brief;
  }

  async getUnreadBriefsCount(userId: string): Promise<number> {
    const result = await db
      .select()
      .from(meetingBriefs)
      .innerJoin(bookings, eq(meetingBriefs.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.userId, userId),
          sql`${meetingBriefs.readAt} IS NULL`
        )
      );
    return result.length;
  }

  async getAvailabilityRules(userId: string): Promise<AvailabilityRules | undefined> {
    const [rules] = await db.select().from(availabilityRules).where(eq(availabilityRules.userId, userId)).limit(1);
    return rules;
  }

  async upsertAvailabilityRules(data: InsertAvailabilityRules): Promise<AvailabilityRules> {
    const [rules] = await db
      .insert(availabilityRules)
      .values(data)
      .onConflictDoUpdate({
        target: availabilityRules.userId,
        set: {
          timezone: data.timezone,
          weeklyHours: data.weeklyHours,
          minNotice: data.minNotice,
          maxAdvance: data.maxAdvance,
          defaultBufferBefore: data.defaultBufferBefore,
          defaultBufferAfter: data.defaultBufferAfter,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rules;
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

  // Password reset tokens
  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string) {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
    return row;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, id));
  }

  // Magic link tokens
  async createMagicLinkToken(email: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(magicLinkTokens).values({ email, token, expiresAt });
  }

  async getMagicLinkToken(token: string) {
    const [row] = await db.select().from(magicLinkTokens).where(eq(magicLinkTokens.token, token)).limit(1);
    return row;
  }

  async markMagicLinkTokenUsed(id: number): Promise<void> {
    await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, id));
  }

  // Email verification tokens
  async createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
  }

  async getEmailVerificationToken(token: string) {
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
    return row;
  }

  async markEmailVerificationTokenUsed(id: number): Promise<void> {
    await db.update(emailVerificationTokens).set({ used: true }).where(eq(emailVerificationTokens.id, id));
  }

  // Booking token lookups
  async getBookingByRescheduleToken(token: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.rescheduleToken, token)).limit(1);
    return booking;
  }

  async getBookingByCancelToken(token: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.cancelToken, token)).limit(1);
    return booking;
  }

  // Notification preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    return prefs;
  }

  async upsertNotificationPreferences(data: InsertNotificationPreferences): Promise<NotificationPreferences> {
    const [prefs] = await db
      .insert(notificationPreferences)
      .values(data)
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          newBookingEmail: data.newBookingEmail,
          meetingBriefEmail: data.meetingBriefEmail,
          dailyDigest: data.dailyDigest,
          cancellationEmail: data.cancellationEmail,
          updatedAt: new Date(),
        },
      })
      .returning();
    return prefs;
  }

  // Onboarding drafts
  async getOnboardingDraft(userId: string): Promise<OnboardingDraft | undefined> {
    const [draft] = await db
      .select()
      .from(onboardingDrafts)
      .where(eq(onboardingDrafts.userId, userId))
      .limit(1);
    return draft;
  }

  async upsertOnboardingDraft(userId: string, data: Partial<InsertOnboardingDraft>): Promise<OnboardingDraft> {
    const existing = await this.getOnboardingDraft(userId);

    if (existing) {
      // Merge the existing data with the new data
      const mergedData = {
        ...existing.data,
        ...(data.data || {}),
      };
      const mergedAiSuggestions = {
        ...existing.aiSuggestions,
        ...(data.aiSuggestions || {}),
      };

      const [draft] = await db
        .update(onboardingDrafts)
        .set({
          step: data.step ?? existing.step,
          data: mergedData,
          aiSuggestions: mergedAiSuggestions,
          updatedAt: new Date(),
        })
        .where(eq(onboardingDrafts.userId, userId))
        .returning();
      return draft;
    } else {
      const [draft] = await db
        .insert(onboardingDrafts)
        .values({
          userId,
          step: data.step ?? 1,
          data: data.data || {},
          aiSuggestions: data.aiSuggestions || {},
        })
        .returning();
      return draft;
    }
  }

  async deleteOnboardingDraft(userId: string): Promise<void> {
    await db.delete(onboardingDrafts).where(eq(onboardingDrafts.userId, userId));
  }
}

export const storage = new DatabaseStorage();
