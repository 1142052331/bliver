const User = require('../models/User');
const Footprint = require('../models/Footprint');
const AuditLog = require('../models/AuditLog');
const { connectDB, disconnectDB, clearDB } = require('./setup');
const reportService = require('../services/ReportService');

describe('ReportService', () => {
  let owner;
  let viewer;
  let admin;
  let footprint;

  beforeAll(connectDB);
  afterAll(disconnectDB);
  afterEach(clearDB);

  beforeEach(async () => {
    [owner, viewer, admin] = await Promise.all([
      User.create({ name: 'owner', password: 'hash' }),
      User.create({ name: 'viewer', password: 'hash' }),
      User.create({ name: 'admin', password: 'hash', role: 'admin' }),
    ]);
    footprint = await Footprint.create({
      userId: owner._id,
      location: { lat: 31.23, lng: 121.47 },
      visibility: 'public',
      discoveryExpiresAt: new Date(Date.now() + 86400000),
      message: 'reportable',
    });
  });

  const actor = (user) => ({ id: user.id, name: user.name, role: user.role });

  test('returns the same pending report for duplicate submissions', async () => {
    const first = await reportService.submit({
      viewer: actor(viewer), targetType: 'footprint', targetId: footprint.id, reason: 'spam',
    });
    const second = await reportService.submit({
      viewer: actor(viewer), targetType: 'footprint', targetId: footprint.id, reason: 'spam',
    });

    expect(second.created).toBe(false);
    expect(second.report.id).toBe(first.report.id);
  });

  test('rejects self reporting and unreadable targets', async () => {
    await expect(reportService.submit({
      viewer: actor(owner), targetType: 'footprint', targetId: footprint.id, reason: 'spam',
    })).rejects.toMatchObject({ statusCode: 400 });

    footprint.visibility = 'private';
    await footprint.save();
    await expect(reportService.submit({
      viewer: actor(viewer), targetType: 'footprint', targetId: footprint.id, reason: 'spam',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('requires an explicit admin resolution and records audit', async () => {
    const { report } = await reportService.submit({
      viewer: actor(viewer), targetType: 'footprint', targetId: footprint.id, reason: 'spam',
    });
    const resolved = await reportService.resolve({
      reportId: report.id, reviewer: actor(admin), resolution: 'dismiss',
    });

    expect(resolved.report.status).toBe('dismissed');
    expect(await AuditLog.findOne({ type: 'report_dismiss' })).toMatchObject({ actor: 'admin' });
  });
});
