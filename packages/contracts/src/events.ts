import { isUuidV7, parseEventId } from '@bliver/domain';
import { z } from './zod.js';

import type { EventId } from '@bliver/domain';

export const visibility = z.enum(['public', 'friends', 'private']);
export type Visibility = z.infer<typeof visibility>;

export const locationPrecision = z.enum(['precise', 'approximate']);
export type LocationPrecision = z.infer<typeof locationPrecision>;

export interface EventEnvelope<TType extends string, TPayload> {
  readonly id: EventId;
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

export function eventEnvelope<
  const TType extends string,
  TPayloadSchema extends z.ZodType,
>(type: TType, payload: TPayloadSchema) {
  return z
    .object({
      id: z.string().refine(isUuidV7, 'Event id must be a UUIDv7').transform(parseEventId),
      type: z.literal(type),
      occurredAt: z.iso.datetime({ offset: true }),
      payload,
    })
    .strict();
}
