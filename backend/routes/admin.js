const express = require('express');
const { auth, admin } = require('../middleware/auth');
const adminService = require('../services/AdminService');
const auditService = require('../services/AuditService');
const reportService = require('../services/ReportService');
const validate = require('../middleware/validate');
const { reportResolution } = require('../validators/schemas');

const router = express.Router();

// All /admin routes require auth + admin
router.use('/admin', auth, admin);

// GET /api/admin/online
router.get('/admin/online', async (req, res) => {
  const online = await adminService.listOnlineUsers();
  res.json({ online });
});

// GET /api/admin/users
router.get('/admin/users', async (req, res) => {
  const users = await adminService.listUsers();
  res.json({ users });
});

// PUT /api/admin/users/:id
router.put('/admin/users/:id', async (req, res) => {
  const result = await adminService.updateUser(req.params.id, req.body);
  res.json({ user: result.user });
  auditService.log({ type: 'user_edit', actor: req.user.name, target: result.user.name });
});

// DELETE /api/admin/users/:id
router.delete('/admin/users/:id', async (req, res) => {
  const result = await adminService.deleteUser(req.params.id, req.user.name);
  res.json({ ok: true, message: result.message });
});

// GET /api/admin/clones
router.get('/admin/clones', async (req, res) => {
  const result = await adminService.detectClones();
  res.json(result);
});

// GET /api/admin/audit — persisted audit log (most recent first)
router.get('/admin/audit', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const docs = await auditService.query({ limit, before: req.query.before || null });
  res.json({ logs: docs });
});

router.get('/admin/reports', async (req, res) => {
  const reports = await reportService.listPending({ limit: req.query.limit });
  res.json({ reports });
});

router.put('/admin/reports/:id', validate(reportResolution), async (req, res) => {
  const result = await reportService.resolve({
    reportId: req.params.id,
    reviewer: req.user,
    resolution: req.body.resolution,
  });
  res.json({ report: result.report });
});

// POST /api/admin/kick/:userId
router.post('/admin/kick/:userId', async (req, res) => {
  const result = await adminService.kickUser(req.params.userId, req.user.name);
  res.json({ ok: true, message: result.message });
});

module.exports = router;
