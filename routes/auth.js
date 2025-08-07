
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../models/db');

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body; try {
    // Buscar o usuário pelo email
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.send('Usuário não encontrado.');
    }

    const user = rows[0];

    // Verificar a senha
    const match = await bcrypt.compare(senha, user.senha);

    if (!match) {
      return res.send('Senha incorreta.');
    }

    // Salvar informações na sessão
    req.session.userId = user.id;
    req.session.userNivel = user.nivel;

    // Redirecionar para a dashboard ou página principal
    res.redirect('/funcionarios'); // ou outra página que preferir
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
router.get('/cadastro', (req, res) => {
  res.render('cadastro_usuario');
});

// Cadastro de usuário
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, nivel } = req.body;

  // Criptografar a senha
  const hashedPassword = await bcrypt.hash(senha, 10);

  // Salvar no banco
  try {
    await db.query('INSERT INTO usuarios (nome, email, senha, nivel) VALUES (?, ?, ?, ?)', [nome, email, hashedPassword, nivel]);
    res.redirect('/auth/login');
  } catch (error) {
    console.error(error);
    res.send('Erro ao cadastrar usuário.');
  }
});

module.exports = router;
