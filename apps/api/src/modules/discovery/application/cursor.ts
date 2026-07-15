import { decodeSignedCursor, encodeSignedCursor, MAX_CURSOR_LENGTH } from '../../../platform/pagination/cursor.js';

export type DiscoveryCursor = Parameters<typeof encodeSignedCursor>[0];
export const encodeDiscoveryCursor = encodeSignedCursor;
export const decodeDiscoveryCursor = decodeSignedCursor;
export { MAX_CURSOR_LENGTH };
