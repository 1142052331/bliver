const { z } = require('zod');
const AppError = require('../middleware/AppError');
const { decodeActivityCursor } = require('../services/ActivityCursor');

const ALLOWED_QUERY_FIELDS = new Set(['scope', 'countryCode', 'regionCode', 'limit', 'cursor']);

const normalizedCode = (max, pattern) => z.string().trim().min(1).max(max).regex(pattern)
  .transform((value) => value.toUpperCase());

const countryCodeSchema = normalizedCode(2, /^[A-Za-z]{2}$/);
const regionCodeSchema = normalizedCode(40, /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/);

const limitSchema = z.union([
  z.number(),
  z.string().regex(/^\d+$/).transform(Number),
]).pipe(z.number().int().min(1).max(50)).default(20);

const cursorSchema = z.string().max(256).superRefine((value, context) => {
  try {
    decodeActivityCursor(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid activity cursor' });
  }
});

const activityQuerySchema = z.object({
  scope: z.enum(['smart', 'region', 'country', 'global']).default('smart'),
  countryCode: countryCodeSchema.optional(),
  regionCode: regionCodeSchema.optional(),
  limit: limitSchema,
  cursor: cursorSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.scope === 'region') {
    if (!value.countryCode) {
      context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is required' });
    }
    if (!value.regionCode) {
      context.addIssue({ code: 'custom', path: ['regionCode'], message: 'Region code is required' });
    }
  }
  if (value.scope === 'smart' && value.regionCode && !value.countryCode) {
    context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is required' });
  }
  if (value.scope === 'country') {
    if (!value.countryCode) {
      context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is required' });
    }
    if (value.regionCode) {
      context.addIssue({ code: 'custom', path: ['regionCode'], message: 'Region code is not allowed' });
    }
  }
  if (value.scope === 'global' && (value.countryCode || value.regionCode)) {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Geography is not allowed' });
  }
});

function normalizeActivityQuery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(400, 'Invalid activity query');
  }
  const prototype = Object.getPrototypeOf(input);
  if ((prototype !== Object.prototype && prototype !== null)
    || Object.keys(input).some((key) => !ALLOWED_QUERY_FIELDS.has(key))) {
    throw new AppError(400, 'Invalid activity query');
  }
  const ownInput = Object.fromEntries(Object.keys(input).map((key) => [key, input[key]]));
  const result = activityQuerySchema.safeParse(ownInput);
  if (!result.success) throw new AppError(400, 'Invalid activity query');
  return result.data;
}

module.exports = { normalizeActivityQuery };
