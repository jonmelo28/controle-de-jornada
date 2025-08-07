const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../models/db');

// Listar usuários
router.get('/', async (req, res) => {
  const [usuarios] = await db.query('SELECT * FROM usuarios');
  res.render('usuarios', { usuarios });
});

// Página de edição
router.get('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query('SELECT * FROM usuarios WHERE id = ?', [id]);

  if (rows.length === 0) {
    return res.send('Usuário não encontrado.');
  }

  res.render('editar_usuario', { usuario: rows[0] });
});

// Atualizar usuário
router.post('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, email, nivel } = req.body;

  await db.query('UPDATE usuarios SET nome = ?, email = ?, nivel = ? WHERE id = ?', [nome, email, nivel, id]);

  res.redirect('/usuarios');
});

// Inativar usuário
router.post('/inativar/:id', async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE usuarios SET status = FALSE WHERE id = ?', [id]);
  res.redirect('/usuarios');
});

// Ativar usuário
router.post('/ativar/:id', async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE usuarios SET status = TRUE WHERE id = ?', [id]);
  res.redirect('/usuarios');
});

// Página de atualização de senha
router.get('/senha/:id', async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query('SELECT * FROM usuarios WHERE id = ?', [id]);

  if (rows.length === 0) {
    return res.send('Usuário não encontrado.');
  }

  res.render('atualizar_senha', { usuario: rows[0] });
});

// Atualizar senha
router.post('/senha/:id', async (req, res) => {
  const { id } = req.params;
  const { novaSenha } = req.body;

  const hashedPassword = await bcrypt.hash(novaSenha, 10);

  await db.query('UPDATE usuarios SET senha = ? WHERE id = ?', [hashedPassword, id]);

  res.redirect('/usuarios');
});


module.exports = router;
