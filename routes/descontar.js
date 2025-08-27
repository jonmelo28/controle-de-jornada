// routes/descontar.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth, requirePermission  } = require('../middleware/auth');

// LISTAR (mostra todos se não filtrar)
router.get('/', requireAuth,  async (req, res) => {
  const { id_funcionario, data_inicio, data_fim } = req.query;

  const [funcs] = await db.query(
    'SELECT id, nome FROM funcionarios WHERE status = TRUE ORDER BY nome'
  );

  let sql = `
    SELECT d.id, d.id_funcionario, f.nome AS funcionario,
           DATE_FORMAT(d.data, '%Y-%m-%d') AS data,
           d.periodo, d.desconto
    FROM descontar d
    JOIN funcionarios f ON f.id = d.id_funcionario
  `;
  const where = [];
  const params = [];

  if (id_funcionario) { where.push('d.id_funcionario = ?'); params.push(id_funcionario); }
  if (data_inicio && data_fim) { where.push('d.data BETWEEN ? AND ?'); params.push(data_inicio, data_fim); }
  else if (data_inicio) { where.push('d.data >= ?'); params.push(data_inicio); }
  else if (data_fim) { where.push('d.data <= ?'); params.push(data_fim); }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY d.data DESC, f.nome ASC, FIELD(d.periodo,"DIA","P1","P2") LIMIT 1000';

  const [rows] = await db.query(sql, params);

  res.render('descontar_listar', {
    title: 'Descontar',
    funcionarios: funcs,
    itens: rows,
    filtros: { id_funcionario, data_inicio, data_fim },
    title: 'Descontar' 
  });
});

// UPSERT
router.post('/salvar', requireAuth, async (req, res) => {
  const { id_funcionario, data, periodo, desconto } = req.body; // periodo: DIA|P1|P2, desconto: S|N
  await db.query(
    `INSERT INTO descontar (id_funcionario, data, periodo, desconto)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE desconto = VALUES(desconto)`,
    [id_funcionario, data, (periodo || 'DIA'), (desconto === 'S' ? 'S' : 'N')]
  );
  res.redirect('/descontar', { title: 'Descontar' });
});

// REMOVER
router.post('/remover/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { id_funcionario, data_inicio, data_fim } = req.body;
  await db.query('DELETE FROM descontar WHERE id = ?', [id]);
  res.redirect('/descontar', { title: 'Descontar' });
});

module.exports = router;
