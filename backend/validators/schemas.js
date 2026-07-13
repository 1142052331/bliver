const { z } = require('zod');

const requestBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']),
]).transform((value) => value === true || value === 'true');

const messageSchema = {
  tooLong: (n) => `不能超过${n}字`,
  required: (f) => `请提供${f}`,
  empty: '内容不能为空',
};

const checkin = z.object({
  lat: z.coerce.number({ required_error: '请提供纬度' }),
  lng: z.coerce.number({ required_error: '请提供经度' }),
  message: z.string().max(1000, messageSchema.tooLong(1000)).optional(),
  mood: z.string().max(10).optional(),
  precise: requestBoolean.optional(),
  visibility: z.enum(['public', 'friends', 'private']).optional(),
  locationPrecision: z.enum(['approximate', 'precise']).optional(),
}).strict().superRefine(({ lat, lng }, ctx) => {
  if (lat < -90 || lat > 90) {
    ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Invalid latitude' });
  }
  if (lng < -180 || lng > 180) {
    ctx.addIssue({ code: 'custom', path: ['lng'], message: 'Invalid longitude' });
  }
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

const comment = z.object({
  content: z.string().trim().min(1, messageSchema.empty).max(500, messageSchema.tooLong(500)),
  parentCommentId: objectId.optional(),
  replyToCommentId: objectId.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.replyToCommentId && !value.parentCommentId) {
    ctx.addIssue({
      code: 'custom',
      path: ['parentCommentId'],
      message: 'Reply parent is required',
    });
  }
});

const message = z.object({
  content: z.string().trim().min(1, messageSchema.empty).max(1000, messageSchema.tooLong(1000)),
});

const reaction = z.object({
  emoji: z.string().min(1, '请选择表情').max(10, '表情过长'),
});

const report = z.object({
  targetType: z.enum(['footprint', 'comment']),
  targetId: objectId,
  footprintId: objectId.optional(),
  reason: z.enum(['spam', 'harassment', 'privacy', 'illegal', 'other']),
  details: z.string().trim().max(500).optional(),
}).strict();

const reportResolution = z.object({
  resolution: z.enum(['dismiss', 'delete']),
}).strict();

const register = z.object({
  name: z.string().trim().min(1, '请提供用户名').max(30, '用户名过长'),
  password: z.string().min(1, '请提供密码').max(128, '密码过长'),
});

const login = z.object({
  name: z.string().min(1, '请提供用户名'),
  password: z.string().min(1, '请提供密码'),
});

const profileUpdate = z.object({
  name: z.string().trim().min(1, '用户名不能为空').max(30, '用户名过长').optional(),
});

const announcement = z.object({
  title: z.string().trim().max(100, '标题过长').optional(),
  content: z.string().trim().min(1, messageSchema.empty).max(500, messageSchema.tooLong(500)),
});

module.exports = {
  checkin,
  comment,
  message,
  reaction,
  report,
  reportResolution,
  register,
  login,
  profileUpdate,
  announcement,
};
