
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.send('Usuário não encontrado.');
    }
    const user = rows[0];

    const match = await bcrypt.compare(senha, user.senha);
    if (!match) {
      return res.send('Senha incorreta.');
    }

    // sessão
    req.session.userId = user.id;
    req.session.userNivel = user.nivel;

    // IMPORTANTE: limpa cache para o attachUserAndPerms recarregar dados/permissões
    delete req.session.user;
    delete req.session.permissoes;

    res.redirect('/auth/home');
  } catch (error) {
    console.error(error);
    res.send('Erro interno.');
  }
});


// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

// Página de cadastro de usuário
router.get('/cadastro', requireAuth, (req, res) => {
  res.render('cadastro_usuario',{
    title: "Usuários"
  });
});

// Cadastro de usuário
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, nivel } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(senha, 10);

    // 1) INSERT e pega o ID gerado
    const [insertResult] = await db.query(
      'INSERT INTO usuarios (nome, email, senha, nivel) VALUES (?, ?, ?, ?)',
      [nome, email, hashedPassword, nivel || 'comum']
    );
    const novoId = insertResult.insertId; // <-- AQUI está o ID

    // 2) Busca (ou cria) o role correspondente
    const [roleRows] = await db.query('SELECT id FROM roles WHERE nome=?', [nivel || 'comum']);
    let roleId;
    if (roleRows.length) {
      roleId = roleRows[0].id;
    } else {
      const [roleInsert] = await db.query(
        'INSERT INTO roles (nome, descricao) VALUES (?, ?)',
        [nivel || 'comum', 'Criado automaticamente']
      );
      roleId = roleInsert.insertId;
    }

    // 3) Vincula usuário ao role
    await db.query(
      'INSERT IGNORE INTO usuario_roles (usuario_id, role_id) VALUES (?, ?)',
      [novoId, roleId]
    );

    return res.redirect('/usuarios');
  } catch (error) {
    console.error(error);
    return res.send('Erro ao cadastrar usuário.');
  }
});


router.get('/home', requireAuth, (req, res) => {
  res.render('home', { title: 'Home - JM Systems' });
});

module.exports = router;
