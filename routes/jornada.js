const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { calcularHorasJornada } = require('../utils/calculos');
const { gerarRelatorioCompleto } = require('../utils/relatorio');

// Página de registro de jornada
router.get('/registrar', async (req, res) => {
  const [funcionarios] = await db.query('SELECT * FROM funcionarios WHERE status = TRUE');
  res.render('registrar_jornada', { funcionarios });
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

// Relatório simples
router.get('/relatorio', async (req, res) => {
  const [jornadas] = await db.query(`
    SELECT j.*, f.nome AS nome_funcionario
    FROM jornadas j
    JOIN funcionarios f ON j.id_funcionario = f.id
    ORDER BY j.data DESC
  `);

  res.render('relatorio_jornada', { jornadas });
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

  res.render('editar_jornada', { jornada: rows[0] });
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
  const { id_funcionario, data_inicio, data_fim } = req.query;
  const [funcionarios] = await db.query('SELECT * FROM funcionarios WHERE status = TRUE');

  if (!id_funcionario || !data_inicio || !data_fim) {
    return res.render('relatorio_estilo_planilha', {
      funcionario: null,
      data_inicio: null,
      data_fim: null,
      relatorio: [],
      resumo: null,
      funcionarios,
      filtros: null
    });
  }

  const [funcionarioRes] = await db.query('SELECT * FROM funcionarios WHERE id = ?', [id_funcionario]);
  const funcionario = funcionarioRes[0];
  const jornadaBase = funcionario.jornada_base || 8;

  const [jornadas] = await db.query(`
    
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
    `, [id_funcionario, data_inicio, data_fim]);

  const [diasUteisDb] = await db.query(
    'SELECT DATE_FORMAT(data, "%Y-%m-%d") as data, eh_util FROM dias_uteis WHERE data BETWEEN ? AND ?',
    [data_inicio, data_fim]
  );

  const diasUteisMap = {};
  diasUteisDb.forEach(d => {
    //const dataFormatada = d.data instanceof Date ? d.data.toISOString().split('T')[0] : d.data;
    const dataFormatada = formatDataSeguro(d.data); 
    diasUteisMap[dataFormatada] = d.eh_util;
  });

  
 const [folgasDb] = await db.query(
  'SELECT DATE_FORMAT(data, "%Y-%m-%d") AS data, folga_primeiro_periodo, folga_segundo_periodo FROM folgas WHERE id_funcionario = ? AND data BETWEEN ? AND ?',
  [id_funcionario, data_inicio, data_fim]
);

const folgasMap = {};
folgasDb.forEach(f => {
    if (!f.data) {
        console.log('⚠️ Folga com data nula ou indefinida:', f);
        return; // Ignora este registro com erro
    }
    const dataFormatada = formatDataSeguro(f.data);
    folgasMap[dataFormatada] = {
        folga_primeiro_periodo: f.folga_primeiro_periodo || 'N',
        folga_segundo_periodo: f.folga_segundo_periodo || 'N'
    };

});

  const jornadasCalculadas = jornadas.map(j => {
     const dataFormatada = formatDataSeguro(j.data);
     const ehUtil = diasUteisMap[dataFormatada] === 'S' ? 'S' : 'N';
      const folga = folgasMap[dataFormatada] || { 
        folga_primeiro_periodo: 'N', 
        folga_segundo_periodo: 'N' 
    };


    const resultado = calcularHorasJornada(
      j.entrada,
      j.saida_intervalo,
      j.retorno_intervalo,
      j.saida,
      dataFormatada,
      jornadaBase,
      ehUtil,
      folga.folga_primeiro_periodo,
      folga.folga_segundo_periodo
    );
    //console.log(resultado);
   


    return { 
        ...j,
        ...resultado,
        ...folga
      };
  });
 console.log(jornadasCalculadas);
    

  const { relatorio, resumo } = gerarRelatorioCompleto(
    data_inicio,
    data_fim,
    jornadasCalculadas,
    funcionario,
    diasUteisDb,
    folgasDb
  );

  res.render('relatorio_estilo_planilha', {
    funcionario,
    data_inicio,
    data_fim,
    relatorio,
    resumo,
    funcionarios,
    filtros: { id_funcionario, data_inicio, data_fim }
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
  }
});

module.exports = router;
