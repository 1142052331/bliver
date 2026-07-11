const { z } = require('zod');
const AppError = require('../middleware/AppError');

const normalizedCode = (max) => z.string().trim().min(1).max(max)
  .transform((value) => value.toUpperCase());

const mapQuerySchema = z.object({
  scope: z.enum(['smart', 'region', 'country', 'global']).default('smart'),
  relationship: z.enum(['all', 'self', 'friends', 'public']).default('all'),
  period: z.enum(['24h', '7d', 'year']).default('7d'),
  content: z.enum(['all', 'photo', 'unread']).default('all'),
  query: z.string().trim().max(80).default(''),
  countryCode: normalizedCode(8).optional(),
  regionCode: normalizedCode(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
}).superRefine((value, context) => {
  if (value.scope === 'region' && !value.regionCode) {
    context.addIssue({ code: 'custom', path: ['regionCode'], message: 'Region code is required' });
  }
  if (value.scope === 'country' && !value.countryCode) {
    context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is required' });
  }
});

function normalizeMapQuery(input) {
  const result = mapQuerySchema.safeParse(input);
  if (!result.success) throw new AppError(400, 'Invalid map query');
  return result.data;
}

module.exports = { normalizeMapQuery };
