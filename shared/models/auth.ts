import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  companyName: varchar("company_name"),
  websiteUrl: varchar("website_url"),
  timezone: varchar("timezone").default("UTC"),
  defaultLogo: varchar("default_logo"),
  defaultPrimaryColor: varchar("default_primary_color"),
  defaultSecondaryColor: varchar("default_secondary_color"),
  emailVerified: boolean("email_verified").default(false),
  // Onboarding fields
  onboardingStep: integer("onboarding_step").default(0),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  roleTitle: varchar("role_title"), // e.g., "Founder", "Sales Lead", "Coach"
  businessDescription: varchar("business_description"),
  industry: varchar("industry"),
  bookingHeadline: varchar("booking_headline"),
  bookingWelcomeMessage: varchar("booking_welcome_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Magic link tokens
export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Onboarding drafts - temporary state for multi-step onboarding
export const onboardingDrafts = pgTable("onboarding_drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  step: integer("step").default(1),
  data: jsonb("data").$type<{
    // Step 1: About You
    firstName?: string;
    lastName?: string;
    roleTitle?: string;
    companyName?: string;
    websiteUrl?: string;
    timezone?: string;
    // Step 2: Business
    businessDescription?: string;
    industry?: string;
    services?: string[];
    bookingHeadline?: string;
    // Step 3: Event Types
    eventTypes?: {
      name: string;
      duration: number;
      description: string;
      selected: boolean;
    }[];
    // Step 4: Availability
    weeklyHours?: Record<string, { start: string; end: string }[] | null>;
    minNotice?: number;
    maxAdvance?: number;
    calendarConnected?: boolean;
    // Step 5: Branding
    brandColor?: string;
    logo?: string;
    bookingWelcomeMessage?: string;
  }>(),
  aiSuggestions: jsonb("ai_suggestions").$type<{
    businessDescription?: string;
    industry?: string;
    services?: string[];
    headline?: string;
    eventTypes?: { name: string; duration: number; description: string }[];
    brandColor?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type OnboardingDraft = typeof onboardingDrafts.$inferSelect;
export type InsertOnboardingDraft = typeof onboardingDrafts.$inferInsert;
