
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth'); 

// Página de listagem
router.get('/', requireAuth, async (req, res) => {
  const [funcionarios] = await db.query('SELECT * FROM funcionarios');
  res.render('funcionarios', { 
    title: 'Lista de Funcionários', 
    funcionarios 
  });
});

// Página de cadastro
router.get('/novo', requireAuth, async (req, res) => {
  res.render('cadastro_funcionario', { 
    title: 'Cadastrar Funcionário' 
  });
});

// Cadastro
router.post('/novo', requireAuth, async (req, res) => {
  const { nome, email, cargo, jornada_base, salario } = req.body;
  await db.query('INSERT INTO funcionarios (nome, email, cargo, jornada_base, salario) VALUES (?, ?, ?, ?, ?)', [nome, email, cargo, jornada_base, salario]);
  res.redirect('/funcionarios');
});

// Página de edição
router.get('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query('SELECT * FROM funcionarios WHERE id = ?', [id]);

  if (rows.length === 0) {
    return res.send('Funcionário não encontrado.');
  }

  res.render('editar_funcionario', { 
    title: 'Editar Funcionário',
    funcionario: rows[0] 
  });
});

// Atualizar funcionário
router.post('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { nome, email, cargo, jornada_base, salario } = req.body;

  await db.query('UPDATE funcionarios SET nome = ?, email = ?, cargo = ?, jornada_base = ?, salario = ? WHERE id = ?', [nome, email, cargo, jornada_base, salario, id]);

  res.redirect('/funcionarios');
});

// Inativar funcionário
router.post('/inativar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE funcionarios SET status = FALSE WHERE id = ?', [id]);
  res.redirect('/funcionarios');
});

// Ativar funcionário
router.post('/ativar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE funcionarios SET status = TRUE WHERE id = ?', [id]);
  res.redirect('/funcionarios');
});

module.exports = router;
