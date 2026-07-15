import { z } from 'zod';

export const role = z.enum(['user', 'moderator', 'admin']);
export const publicUser = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  roles: z.array(role),
});
export const registerRequest = z.object({ username: z.string().min(3).max(32), password: z.string().min(8).max(256), email: z.string().email().optional(), displayName: z.string().max(64).optional() });
export const loginRequest = z.object({ username: z.string().min(1), password: z.string().min(1), deviceName: z.string().max(64).optional(), platform: z.enum(['web', 'capacitor']).default('web') });
export const refreshRequest = z.object({ refreshToken: z.string().min(20) });
export const authResponse = z.object({ user: publicUser, session: z.object({ id: z.string().uuid(), deviceName: z.string(), createdAt: z.string().datetime(), lastSeenAt: z.string().datetime(), current: z.boolean() }), accessToken: z.string().optional(), refreshToken: z.string().optional() });
export type RegisterRequest = z.infer<typeof registerRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type PublicUser = z.infer<typeof publicUser>;
export type AuthResponse = z.infer<typeof authResponse>;
