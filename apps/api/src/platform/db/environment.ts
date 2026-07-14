import { config } from 'dotenv';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');

export function loadDatabaseUrl(): string {
  config({ path: process.env.ENV_FILE ?? resolve(repositoryRoot, '.env.v2') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return databaseUrl;
}
