require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../models/db');

async function criarAdmin() {
  const nome = 'Admin';
  const email = 'admin@admin.com';
  const senha = 'admin';
  const nivel = 'admin';

  const hashedPassword = await bcrypt.hash(senha, 10);

  try {
    await db.query('INSERT INTO usuarios (nome, email, senha, nivel) VALUES (?, ?, ?, ?)', [nome, email, hashedPassword, nivel]);
    console.log('Usuário admin criado com sucesso!');
  } catch (error) {
    console.error('Erro ao criar usuário admin:', error);
  } finally {
    process.exit();
  }
}

criarAdmin();
