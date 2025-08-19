const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { calcularHorasJornada } = require('../utils/calculos');
const { gerarRelatorioCompleto } = require('../utils/relatorio');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');


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

     // buscar “descontar”
  const [descontarDb] = await db.query(
  `SELECT 
      DATE_FORMAT(data, "%Y-%m-%d") AS data,
      TRIM(UPPER(periodo))  AS periodo,   -- 'DIA' | 'P1' | 'P2'
      TRIM(UPPER(desconto)) AS desconto   -- 'S' | 'N'
   FROM descontar
   WHERE id_funcionario = ? AND data BETWEEN ? AND ?
   ORDER BY data ASC`,
    [id_funcionario, data_inicio, data_fim]
  );

    // chama o gerador (ele monta o array completo por TODOS os dias)
    const { relatorio, resumo } = gerarRelatorioCompleto(
      formatDataSeguro(data_inicio),
      formatDataSeguro(data_fim),
      jornadasDb,     // jornadas cruas
      funcionario,    // usa salario, jornada_base etc.
      diasUteisDb,    // contem { data: 'YYYY-MM-DD', eh_util: 'S'/'N' }
      folgasDb ,      // contem { data: 'YYYY-MM-DD', folga_primeiro_periodo, folga_segundo_periodo }
      descontarDb       
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

const { getRelatorio } = require('../utils/relatorio');

// ====== EXCEL ======
router.get('/excel', async (req, res) => {
  try {
    const { id_funcionario, data_inicio, data_fim } = req.query;
    const { funcionario, relatorio, resumo } = await getRelatorio(id_funcionario, data_inicio, data_fim);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Relatório', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left:0.3, right:0.3, top:0.4, bottom:0.4 }
      },
      properties: { defaultRowHeight: 18 }
    });

    // Cabeçalho superior
    ws.mergeCells('A1', 'H1'); ws.getCell('A1').value = `Funcionário: ${funcionario?.nome || ''}`;
    ws.mergeCells('A2', 'H2'); ws.getCell('A2').value = `Período: ${dayjs(data_inicio).format('DD/MM/YYYY')} a ${dayjs(data_fim).format('DD/MM/YYYY')}`;
    ws.getCell('A1').font = { bold: true }; ws.getCell('A2').font = { bold: true };

    // Cabeçalho da tabela principal
   const headers = [
  'Data','Dia','Entrada 1ºT','Saída 1ºT','Entrada 2ºT','Saída 2ºT',
  'Horas Trabalhadas','Horas Extras','Horas Restantes','Folga 1ºT','Folga 2ºT'
];
    const startRow = 4;
    ws.getRow(startRow).values = headers;
    ws.getRow(startRow).font = { bold: true };
    ws.getRow(startRow).alignment = { horizontal:'center', vertical:'middle' };

    // Linhas
    // ESPERADO: cada item de relatorio tem { data, dia, e1, s1, e2, s2, ht, he, hr, folga1, folga2 }
    // Linhas (ajuste os nomes para bater com utils/relatorio.js)
relatorio.forEach((r, i) => {
  const row = ws.getRow(startRow + 1 + i);
  row.values = [
    dayjs(r.data).format('DD/MM/YYYY'),
    r.dia,
    r.entrada || '-',
    r.saida_intervalo || '-',
    r.retorno_intervalo || '-',
    r.saida || '-',
    r.horas_trabalhadas || '0:00',
    r.horas_extras || '0:00',
    r.horas_restantes || '0:00',
    r.folga_primeiro_periodo === 'S' ? '✔' : '',
    r.folga_segundo_periodo === 'S' ? '✔' : ''
  ];
  row.alignment = { horizontal:'center', vertical:'middle' };
});


    // Bordas e largura
    const lastRow = startRow + relatorio.length;
    const lastCol = headers.length;
    for (let r = startRow; r <= lastRow; r++) {
      for (let c = 1; c <= lastCol; c++) {
        const cell = ws.getCell(r, c);
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      }
    }
    const widths = [12,16,12,12,12,12,16,14,16,10,10];
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);

    // Resumo “fixo” à DIREITA da tabela
    // colocaremos a partir da coluna L (12)
const colResumo = 13;
const resumoPairs = [
  ['Resumo Geral', ''],
  ['Horas Trabalhadas', resumo.total_trabalhadas || '0:00'],
  ['Horas Extras', resumo.total_extras || '0:00'],
  ['Horas Restantes', resumo.total_restantes || '0:00'],
  ['Saldo (ST)', resumo.saldo || '0:00'],
  ['Salário Base', `R$ ${Number(resumo.salario_base || 0).toFixed(2)}`],
  ['Valor da Hora', `R$ ${Number(resumo.valor_hora || 0).toFixed(2)}`],
  ['Valor Hora Extra', `R$ ${Number(resumo.valor_hora_extra || 0).toFixed(2)}`],
  ['Horas Extras em R$', `R$ ${Number(resumo.valor_horas_extras_rs || 0).toFixed(2)}`],
  ['DSR', `R$ ${Number(resumo.dsr || 0).toFixed(2)}`]
];


    let rr = 1;
    resumoPairs.forEach(([k,v]) => {
      ws.getCell(rr, colResumo).value = k;
      ws.getCell(rr, colResumo+1).value = v;
      ws.getCell(rr, colResumo).font = k==='Resumo Geral' ? { bold:true } : {};
      ws.getCell(rr, colResumo).alignment = { horizontal:'left' };
      ws.getCell(rr, colResumo+1).alignment = { horizontal:'right' };
      // bordas
      [ws.getCell(rr, colResumo), ws.getCell(rr, colResumo+1)].forEach(cell=>{
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });
      rr++;
    });

    ws.getColumn(colResumo).width = 28;
    ws.getColumn(colResumo+1).width = 18;

    // Congelar cabeçalho
    ws.views = [{ state:'frozen', xSplit:0, ySplit:startRow }];

    // Download
    const filename = `relatorio_${funcionario?.nome || 'funcionario'}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar Excel.');
  }
});

// ====== PDF (via Puppeteer “print” da página EJS) ======
// ====== PDF (renderiza EJS em memória e imprime) ======
router.get('/pdf', async (req, res) => {
  try {
    const { id_funcionario, data_inicio, data_fim } = req.query;

    // 1) Pegamos os mesmos dados do relatório
    const { funcionario, relatorio, resumo } =
      await getRelatorio(id_funcionario, data_inicio, data_fim);

    // 2) Renderizamos a MESMA view EJS para string (modo print)
    const viewPath = path.join(__dirname, '../views/relatorio_estilo_planilha.ejs');

    // Dica: se você usa express-ejs-layouts, passe { layout: false }
    const html = await ejs.renderFile(
      viewPath,
      {
        funcionario,
        data_inicio,
        data_fim,
        relatorio,
        resumo,
        funcionarios: [], // se a view esperar
        filtros: { id_funcionario, data_inicio, data_fim },
        print: true, // use isso na EJS para aplicar CSS de impressão
        title:'',
        hideControls: true, // vamos usar na view pra esconder filtros/botões
      },
      { async: false }
    );

    // 3) Gera o PDF a partir do HTML em memória
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Importante: definir o conteúdo direto evita idas/voltas HTTP
    await page.setContent(html, { waitUntil: 'networkidle0' });

     // ✅ faz @media print valer (esconde .no-print, aplica layout de impressão)
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();

    // 4) Envia o PDF correto
    const filename = `relatorio_${dayjs().format('YYYYMMDD_HHmm')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(pdfBuffer);

  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    // Se algo falhar, retorne 500 com texto (não PDF) para facilitar debug
    res.status(500).send('Erro ao gerar PDF. Verifique o log do servidor.');
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
