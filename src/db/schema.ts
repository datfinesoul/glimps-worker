import { pgTable, uuid, timestamp, text, jsonb, integer, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  originalPath: text("original_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id),
  type: varchar("type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
