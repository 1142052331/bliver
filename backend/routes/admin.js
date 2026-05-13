const express = require('express');
const { auth, admin } = require('../middleware/auth');
const adminService = require('../services/AdminService');
const auditService = require('../services/AuditService');

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
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user });
  auditService.log({ type: 'user_edit', actor: req.user.name, target: result.user.name });
});

// DELETE /api/admin/users/:id
router.delete('/admin/users/:id', async (req, res) => {
  const result = await adminService.deleteUser(req.params.id, req.user.name);
  if (result.error) return res.status(result.status).json({ error: result.error });
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

// POST /api/admin/kick/:userId
router.post('/admin/kick/:userId', async (req, res) => {
  const result = await adminService.kickUser(req.params.userId, req.user.name);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, message: result.message });
});

module.exports = router;
