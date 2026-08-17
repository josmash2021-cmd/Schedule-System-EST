/* Gastos del negocio: /x/s/expenses (admin). */
const express = require('express');
const expenses = require('../models/expenses');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser, requireRole('admin'));

router.get('/', async (_req, res) => {
  try {
    res.json({ expenses: await expenses.listAll() });
  } catch (err) {
    console.error('expenses list error:', err.message);
    res.status(500).json({ error: 'Error al listar los gastos.' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const description = String(b.description || '').trim();
  if (!description) return res.status(400).json({ error: 'La descripción es obligatoria.' });
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0.' });
  const category = String(b.category || '').trim().slice(0, 60) || null;

  try {
    const row = await expenses.create({ description: description.slice(0, 200), category, amount }, req.user.id);
    audit.logAction(req.user.id, 'expense.create', { targetType: 'expense', targetId: String(row.id), ip: getClientIp(req), metadata: { amount } });
    res.status(201).json({ expense: row });
  } catch (err) {
    console.error('expense create error:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el gasto.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Gasto no encontrado.' });
  try {
    const ok = await expenses.remove(id);
    if (!ok) return res.status(404).json({ error: 'Gasto no encontrado.' });
    audit.logAction(req.user.id, 'expense.delete', { targetType: 'expense', targetId: String(id), ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('expense delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el gasto.' });
  }
});

module.exports = router;
