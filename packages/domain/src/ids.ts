import { validate, v7, version } from 'uuid';

declare const userIdBrand: unique symbol;
declare const footprintIdBrand: unique symbol;
declare const conversationIdBrand: unique symbol;
declare const eventIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: true };
export type FootprintId = string & { readonly [footprintIdBrand]: true };
export type ConversationId = string & { readonly [conversationIdBrand]: true };
export type EventId = string & { readonly [eventIdBrand]: true };

export function isUuidV7(value: string): boolean {
  return validate(value) && version(value) === 7;
}

function parseUuidV7<T extends string>(value: string, typeName: string): T {
  if (!isUuidV7(value)) {
    throw new TypeError(`${typeName} must be a UUIDv7`);
  }

  return value as T;
}

export const createUserId = (): UserId => parseUserId(v7());
export const createFootprintId = (): FootprintId => parseFootprintId(v7());
export const createConversationId = (): ConversationId =>
  parseConversationId(v7());
export const createEventId = (): EventId => parseEventId(v7());

export const parseUserId = (value: string): UserId =>
  parseUuidV7<UserId>(value, 'UserId');
export const parseFootprintId = (value: string): FootprintId =>
  parseUuidV7<FootprintId>(value, 'FootprintId');
export const parseConversationId = (value: string): ConversationId =>
  parseUuidV7<ConversationId>(value, 'ConversationId');
export const parseEventId = (value: string): EventId =>
  parseUuidV7<EventId>(value, 'EventId');
