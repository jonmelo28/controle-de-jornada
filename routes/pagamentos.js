const express = require('express');
const router = express.Router();
const db = require('../models/db'); // mysql2/promise com dateStrings:true
const { requireAuth } = require('../middleware/auth'); 

// util
function toCompetenciaPrimeiroDia(yyyyMm) {
  // recebe "2025-06" e volta "2025-06-01"
  if (!yyyyMm) return null;
  const [y, m] = yyyyMm.split('-');
  return `${y}-${m}-01`;
}

// LISTAR + FILTROS
router.get('/', requireAuth, async (req, res) => {
  const { id_funcionario, data_inicio, data_fim } = req.query;

  // Normaliza: cria datas de competência (primeiro dia do mês)
  const compInicio = data_inicio ? `${data_inicio}-01` : null; // ex: 2025-06-01
  const compFimBase = data_fim ? `${data_fim}-01` : null;      // ex: 2025-07-01

  // carregar funcionários para o filtro
  const [funcionarios] = await db.query(
    'SELECT id, nome FROM funcionarios WHERE status = TRUE ORDER BY nome'
  );

  // montar query de pagamentos (opcionalmente filtrada)
  let sql = `
    SELECT p.id, p.funcionario_id, f.nome AS funcionario, 
           DATE_FORMAT(p.competencia, '%Y-%m-01') AS competencia,
           DATE_FORMAT(p.competencia, '%m/%Y') AS competencia_br,
           p.valor_pago, p.obs, p.created_at
      FROM pagamentos_extras p
      JOIN funcionarios f ON f.id = p.funcionario_id
     WHERE 1=1
  `;
  const params = [];

  if (id_funcionario) { sql += ' AND p.funcionario_id = ?'; params.push(id_funcionario); }
  if (compInicio)     { sql += ' AND p.competencia >= ?';   params.push(compInicio); }
  if (compFimBase)    { sql += ' AND p.competencia <= LAST_DAY(?)'; params.push(compFimBase); }

  sql += ' ORDER BY p.competencia DESC, f.nome ASC';

  const [pagamentos] = await db.query(sql, params);

  res.render('pagamentos_list', {
    title: 'Pagamentos de Extras',
    funcionarios,
    pagamentos,
    filtros: { id_funcionario: id_funcionario || '', data_inicio: data_inicio || '', data_fim: data_fim || '' }
  });
});

// FORM NOVO
router.get('/novo', requireAuth, async (req, res) => {
  const [funcionarios] = await db.query(
    'SELECT id, nome FROM funcionarios WHERE status = TRUE ORDER BY nome'
  );
  res.render('pagamentos_form', { title: 'Cadastrar Pagamento', funcionarios, pagamento: null });
});

// CADASTRAR
router.post('/novo', requireAuth, async (req, res) => {
  let { funcionario_id, competencia, valor_pago, obs } = req.body;
  const comp = toCompetenciaPrimeiroDia(competencia);     // "YYYY-MM-01"
  const valor = Number(String(valor_pago).replace(/\./g,'').replace(',', '.')) || 0;

  await db.query(
    'INSERT INTO pagamentos_extras (funcionario_id, competencia, valor_pago, obs) VALUES (?, ?, ?, ?)',
    [funcionario_id, comp, valor, obs || null]
  );
  res.redirect('/pagamentos');
});

// FORM EDITAR
router.get('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const [[pag]] = await db.query(
    `SELECT id, funcionario_id, DATE_FORMAT(competencia, '%Y-%m') AS competencia_mes,
            valor_pago, obs
       FROM pagamentos_extras WHERE id = ?`, [id]
  );
  if (!pag) return res.status(404).send('Pagamento não encontrado.');

  const [funcionarios] = await db.query(
    'SELECT id, nome FROM funcionarios WHERE status = TRUE ORDER BY nome'
  );

  res.render('pagamentos_form', {
    title: 'Editar Pagamento',
    funcionarios,
    pagamento: pag
  });
});

// ATUALIZAR
router.post('/editar/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  let { funcionario_id, competencia, valor_pago, obs } = req.body;

  const comp = toCompetenciaPrimeiroDia(competencia);
  const valor = Number(String(valor_pago).replace(/\./g,'').replace(',', '.')) || 0;

  await db.query(
    'UPDATE pagamentos_extras SET funcionario_id=?, competencia=?, valor_pago=?, obs=? WHERE id=?',
    [funcionario_id, comp, valor, obs || null, id]
  );
  res.redirect('/pagamentos');
});

// EXCLUIR
router.post('/excluir/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM pagamentos_extras WHERE id = ?', [id]);
  res.redirect('/pagamentos');
});

module.exports = router;
