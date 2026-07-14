import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform');

export const systemMarkers = platformSchema.table('system_markers', {
  id: text().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
