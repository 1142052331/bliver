import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
config({ path: process.env.ENV_FILE ?? resolve(repositoryRoot, '.env.v2') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle commands');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
