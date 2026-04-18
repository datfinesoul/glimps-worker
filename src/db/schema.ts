import { pgTable, uuid, timestamp, text, jsonb, integer, varchar, index, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    originalPath: text("original_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    animatedThumbnailPath: text("animated_thumbnail_path"),
    previewPath: text("preview_path"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    type: varchar("type", { length: 16 }).notNull().default("image"),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    metadata: jsonb("metadata"),
    shardPath: text("shard_path").notNull(),
    sensitive: boolean("sensitive").notNull().default(false),
    favorited: boolean("favorited").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("media_user_id_idx").on(table.userId),
    index("media_status_idx").on(table.status),
    index("media_created_at_idx").on(table.createdAt),
    index("media_deleted_at_idx").on(table.deletedAt),
  ]
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id),
    type: varchar("type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_media_id_idx").on(table.mediaId),
    index("jobs_status_idx").on(table.status),
  ]
);