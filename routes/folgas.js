const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Listar folgas
router.get('/listar', async (req, res) => {
  const [folgas] = await db.query(`
    SELECT f.*, func.nome AS nome_funcionario
    FROM folgas f
    JOIN funcionarios func ON f.id_funcionario = func.id
    ORDER BY f.data DESC
  `);

  res.render('listar_folgas', { folgas, title:"Folga"});
});

// Página de cadastro
router.get('/cadastrar', async (req, res) => {
  const [funcionarios] = await db.query('SELECT * FROM funcionarios WHERE status = 1');
  res.render('gerenciar_folgas', { folga: null, funcionarios, title:"Folga"});
});

// Cadastro
router.post('/cadastrar', async (req, res) => {
  const { id_funcionario, data } = req.body;
  const folga_primeiro_periodo = req.body.folga_primeiro_periodo ? 'S' : null;
  const folga_segundo_periodo = req.body.folga_segundo_periodo ? 'S' : null;

  await db.query(
    'INSERT INTO folgas (id_funcionario, data, folga_primeiro_periodo, folga_segundo_periodo) VALUES (?, ?, ?, ?)',
    [id_funcionario, data, folga_primeiro_periodo, folga_segundo_periodo]
  );

  res.redirect('/folgas/listar');
});

// Página de edição
router.get('/editar/:id', async (req, res) => {
  const { id } = req.params;

  const [folgas] = await db.query('SELECT * FROM folgas WHERE id = ?', [id]);
  const folga = folgas[0];

  const [funcionarios] = await db.query('SELECT * FROM funcionarios WHERE status = 1');

  res.render('gerenciar_folgas', { folga, funcionarios, title:"Folga" });
});

// Edição
router.post('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const { id_funcionario, data } = req.body;

  const folga_primeiro_periodo = req.body.folga_primeiro_periodo === 'S' ? 'S' : 'N';
  const folga_segundo_periodo = req.body.folga_segundo_periodo === 'S' ? 'S' : 'N';

  await db.query(
    'UPDATE folgas SET id_funcionario = ?, data = ?, folga_primeiro_periodo = ?, folga_segundo_periodo = ? WHERE id = ?',
    [id_funcionario, data, folga_primeiro_periodo, folga_segundo_periodo, id]
  );

  res.redirect('/folgas/listar');
});

// Excluir
router.post('/excluir/:id', async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM folgas WHERE id = ?', [id]);
  res.redirect('/folgas/listar');
});

module.exports = router;
