const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { calcularHorasJornada } = require('../utils/calculos');
const { gerarRelatorioCompleto } = require('../utils/relatorio');

// Página de registro de jornada
router.get('/registrar', async (req, res) => {
  const [funcionarios] = await db.query('SELECT * FROM funcionarios WHERE status = TRUE');
  res.render('registrar_jornada', { funcionarios ,
      title:'Registo de Jornada'});
});

// Registrar jornada
router.post('/registrar', async (req, res) => {
  const { id_funcionario, data, entrada, saida_intervalo, retorno_intervalo, saida } = req.body;
  await db.query(
    'INSERT INTO jornadas (id_funcionario, data, entrada, saida_intervalo, retorno_intervalo, saida) VALUES (?, ?, ?, ?, ?, ?)',
    [id_funcionario, data, entrada, saida_intervalo, retorno_intervalo, saida]
  );
  res.redirect('/jornada/relatorio');
});

router.get('/relatorio', async (req, res) => {
  const { id_funcionario, data_inicio, data_fim } = req.query;

  // carrega funcionários para o filtro
  const [funcionarios] = await db.query('SELECT id, nome FROM funcionarios WHERE status = TRUE');

  // base da query
  let sql = `
    SELECT j.id, j.data, j.entrada, j.saida_intervalo, j.retorno_intervalo, j.saida,
           f.nome AS nome_funcionario
    FROM jornadas j
    JOIN funcionarios f ON f.id = j.id_funcionario
    WHERE 1=1
  `;
  const params = [];

  if (id_funcionario) { sql += ' AND j.id_funcionario = ?'; params.push(id_funcionario); }
  if (data_inicio)    { sql += ' AND j.data >= ?'; params.push(data_inicio); }
  if (data_fim)       { sql += ' AND j.data <= ?'; params.push(data_fim); }

  sql += ' ORDER BY j.data ASC';

  const [jornadas] = await db.query(sql, params);

  res.render('relatorio_jornada', {
    title: 'Jornadas',
    funcionarios,
    jornadas,
    filtros: { id_funcionario, data_inicio, data_fim }
  });
});


// Página de edição de jornada
router.get('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query(`
    SELECT j.*, f.nome AS nome_funcionario
    FROM jornadas j
    JOIN funcionarios f ON j.id_funcionario = f.id
    WHERE j.id = ?
  `, [id]);

  if (rows.length === 0) return res.send('Registro não encontrado.');

  res.render('editar_jornada', {
       jornada: rows[0],
      title:'Editar Jornada' });
});

// Atualizar jornada
router.post('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const { entrada, saida_intervalo, retorno_intervalo, saida } = req.body;

  await db.query(
    `UPDATE jornadas SET entrada = ?, saida_intervalo = ?, retorno_intervalo = ?, saida = ? WHERE id = ?`,
    [entrada, saida_intervalo || null, retorno_intervalo || null, saida, id]
  );

  res.redirect('/jornada/relatorio');
});

// Apagar jornada
router.post('/apagar/:id', async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM jornadas WHERE id = ?', [id]);
  res.redirect('/jornada/relatorio');
});

// Relatório avançado
router.get('/relatorio_avancado', async (req, res) => {
  try {
    const { id_funcionario, data_inicio, data_fim } = req.query;

    // lista de funcionários para o filtro
    const [funcionarios] = await db.query(
      'SELECT * FROM funcionarios WHERE status = TRUE'
    );

    // se filtros não informados, renderiza tela vazia
    if (!id_funcionario || !data_inicio || !data_fim) {
      return res.render('relatorio_estilo_planilha', {
        funcionario: null,
        data_inicio: null,
        data_fim: null,
        relatorio: [],
        resumo: null,
        funcionarios,
        filtros: null,
        title: null
      });
    }

    // funcionário selecionado
    const [funcionarioRes] = await db.query(
      'SELECT * FROM funcionarios WHERE id = ?',
      [id_funcionario]
    );
    const funcionario = funcionarioRes[0];
    if (!funcionario) {
      return res.render('relatorio_estilo_planilha', {
        funcionario: null,
        data_inicio,
        data_fim,
        relatorio: [],
        resumo: null,
        funcionarios,
        filtros: { id_funcionario, data_inicio, data_fim },
        title: 'Jornada funcionário'
      });
    }

    // jornadas do período (datas já formatadas em YYYY-MM-DD)
    const [jornadasDb] = await db.query(
      `
      SELECT 
        id,
        id_funcionario,
        DATE_FORMAT(data, '%Y-%m-%d') as data,
        entrada,
        saida_intervalo,
        retorno_intervalo,
        saida
      FROM jornadas
      WHERE id_funcionario = ? AND data BETWEEN ? AND ?
      ORDER BY data ASC
      `,
      [id_funcionario, data_inicio, data_fim]
    );

    // dias úteis do período
    const [diasUteisDb] = await db.query(
      `
      SELECT DATE_FORMAT(data, "%Y-%m-%d") as data, eh_util
      FROM dias_uteis
      WHERE data BETWEEN ? AND ?
      ORDER BY data ASC
      `,
      [data_inicio, data_fim]
    );

    // folgas por período (por turno)
    const [folgasDb] = await db.query(
      `
      SELECT 
        DATE_FORMAT(data, "%Y-%m-%d") AS data,
        folga_primeiro_periodo,
        folga_segundo_periodo
      FROM folgas
      WHERE id_funcionario = ? AND data BETWEEN ? AND ?
      ORDER BY data ASC
      `,
      [id_funcionario, data_inicio, data_fim]
    );

    // chama o gerador (ele monta o array completo por TODOS os dias)
    const { relatorio, resumo } = gerarRelatorioCompleto(
      formatDataSeguro(data_inicio),
      formatDataSeguro(data_fim),
      jornadasDb,     // jornadas cruas
      funcionario,    // usa salario, jornada_base etc.
      diasUteisDb,    // contem { data: 'YYYY-MM-DD', eh_util: 'S'/'N' }
      folgasDb        // contem { data: 'YYYY-MM-DD', folga_primeiro_periodo, folga_segundo_periodo }
    );

    // render
    return res.render('relatorio_estilo_planilha', {
      funcionario,
      data_inicio: formatDataSeguro(data_inicio),
      data_fim: formatDataSeguro(data_fim),
      relatorio,
      resumo,
      funcionarios,
      filtros: { id_funcionario, data_inicio, data_fim },
      title: 'Jornada funcionário'
    });
  } catch (err) {
    console.error('Erro ao gerar relatório avançado:', err);
    return res.status(500).send('Erro ao gerar relatório');
  }
});
  
  function formatDataSeguro(date) {
    if (date instanceof Date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      //console.log("if" + `${yyyy}-${mm}-${dd}`);
      return `${yyyy}-${mm}-${dd}`;
    } else if (typeof date === 'string') {
      // Verifica se está no formato 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ss'
      const apenasData = date.split('T')[0].split(' ')[0];
      //console.log("else if " + apenasData);
      return apenasData;
      
    } else {
      console.log("else");
      throw new Error(`Formato de data inválido: ${date}`);
    }
  };

module.exports = router;
