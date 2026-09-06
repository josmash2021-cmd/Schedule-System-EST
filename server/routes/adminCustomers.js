/* Clientes: /x/s/customers — base de datos de compradores (desde facturas).
   Solo lectura y solo admin: las fichas se generan solas al emitir facturas. */
const express = require('express');
const customers = require('../models/customers');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser);

router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ customers: await customers.listAll() });
  } catch (err) {
    console.error('customers list error:', err.message);
    res.status(500).json({ error: 'Error al listar los clientes.' });
  }
});

module.exports = router;
