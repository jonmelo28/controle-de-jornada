const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth'); 

// Listar todos os horários
router.get('/', requireAuth, async (req, res) => {
  const [horarios] = await db.query('SELECT * FROM horarios_padrao');
  res.render('horarios', { horarios, title:"horário" });
});

// Página de cadastro
router.get('/novo', requireAuth, async (req, res) => {
  res.render('cadastro_horario',{title:"Cadastrar Horário" });
});

// Cadastro
router.post('/novo', requireAuth, async (req, res) => {
  const {descricao, dia_da_semana, entrada, saida_intervalo, retorno_intervalo, saida } = req.body;

  // Se for sábado, limpar intervalos
  let saidaInt = saida;
  let retornoInt = retorno_intervalo;
  if (dia_da_semana === 'sabado') {
    saidaInt = null;
    retornoInt = null;
  }

  await db.query(
    'INSERT INTO horarios_padrao (descricao, dia_da_semana, entrada, saida_intervalo, retorno_intervalo, saida) VALUES (?, ?, ?, ?, ?, ?)',
    [descricao, dia_da_semana, entrada, saida_intervalo, retornoInt, saidaInt]
  );
  res.redirect('/horarios');
});

// Página de edição
router.get('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query('SELECT * FROM horarios_padrao WHERE id = ?', [id]);

  if (rows.length === 0) {
    return res.send('Horário padrão não encontrado.');
  }

  res.render('editar_horario', { horario: rows[0], title:"Cadastrar Horário" });
});

// Atualizar
router.post('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { descricao, dia_da_semana, entrada, saida_intervalo, retorno_intervalo, saida } = req.body;

  let saidaInt = saida;
  let retornoInt = retorno_intervalo;
  if (dia_da_semana === 'sabado') {
    saidaInt = null;
    retornoInt = null;
  }

  await db.query(
    'UPDATE horarios_padrao SET descricao = ?, dia_da_semana = ?, entrada = ?, saida_intervalo = ?, retorno_intervalo = ?, saida = ? WHERE id = ?',
    [descricao, dia_da_semana, entrada, saida_intervalo, retornoInt, saidaInt, id]
  );

  res.redirect('/horarios');
});

// Inativar
router.post('/inativar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE horarios_padrao SET status = FALSE WHERE id = ?', [id]);
  res.redirect('/horarios');
});

// Ativar
router.post('/ativar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query('UPDATE horarios_padrao SET status = TRUE WHERE id = ?', [id]);
  res.redirect('/horarios');
});

module.exports = router;
