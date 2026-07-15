import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEPLOY_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  RELEASE_SHA: z.string().min(1).default('local'),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5100),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
});

export type ApiConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  deployEnv: 'local' | 'test' | 'staging' | 'production';
  releaseSha: string;
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  cloudinary:
    | Readonly<{
        cloudName: string;
        apiKey: string;
        apiSecret: string;
      }>
    | undefined;
  push: Readonly<{ publicKey: string; privateKey: string; subject: string }> | undefined;
}>;

export function createConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = environmentSchema.parse(environment);
  const cloudinary =
    parsed.CLOUDINARY_CLOUD_NAME &&
    parsed.CLOUDINARY_API_KEY &&
    parsed.CLOUDINARY_API_SECRET
      ? {
          cloudName: parsed.CLOUDINARY_CLOUD_NAME,
          apiKey: parsed.CLOUDINARY_API_KEY,
          apiSecret: parsed.CLOUDINARY_API_SECRET,
        }
      : undefined;
  const push = parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY && parsed.VAPID_SUBJECT ? { publicKey: parsed.VAPID_PUBLIC_KEY, privateKey: parsed.VAPID_PRIVATE_KEY, subject: parsed.VAPID_SUBJECT } : undefined;

  return {
    nodeEnv: parsed.NODE_ENV,
    deployEnv: parsed.DEPLOY_ENV,
    releaseSha: parsed.RELEASE_SHA,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    port: parsed.PORT,
    cloudinary,
    push,
  };
}
