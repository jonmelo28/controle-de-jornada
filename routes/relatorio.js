
const express = require('express');
const router = express.Router();
const db = require('../db');
const { gerarRelatorioCompleto } = require('../utils/relatorio');
const { gerarPDF } = require('../utils/exportPdf');
const { gerarExcel } = require('../utils/exportExcel');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const puppeteer = require('puppeteer');

router.get('/', async (req, res) => {
    const [funcionarios] = await db.query('SELECT * FROM funcionarios');

    const { id_funcionario, mes, ano } = req.query;

    if (!id_funcionario || !mes || !ano) {
        return res.render('relatorio', { funcionarios, relatorio: [], resumo: null, filtros: null, title: null });
    }

    const mesFormatado = String(mes).padStart(2, '0');
    const dataInicio = `${ano}-${mesFormatado}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${mesFormatado}-${String(ultimoDia).padStart(2, '0')}`;

    const [[funcionario]] = await db.query('SELECT * FROM funcionarios WHERE id = ?', [id_funcionario]);
    const [jornadasDb] = await db.query(
        'SELECT * FROM jornadas WHERE id_funcionario = ? AND data BETWEEN ? AND ?',
        [id_funcionario, dataInicio, dataFim]
    );
    const [diasUteisDb] = await db.query(
        'SELECT data, eh_util FROM dias_uteis WHERE data BETWEEN ? AND ?',
        [dataInicio, dataFim]
    );

    const { relatorio, resumo } = gerarRelatorioCompleto(dataInicio, dataFim, jornadasDb, funcionario, diasUteisDb);

    res.render('relatorio', { funcionarios, relatorio, resumo, filtros: { id_funcionario, mes, ano }, title });
});

router.get('/pdf', gerarPDF);
router.get('/excel', gerarExcel);

module.exports = router;
