
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getDaysInMonth } = require('../utils/data');
const { format } = require('date-fns');

router.get('/gerenciar', async (req, res) => {
  const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
  const ano = parseInt(req.query.ano) || new Date().getFullYear();

  const diasDoMes = getDaysInMonth(mes, ano);
  const mesFormatado = String(mes).padStart(2, '0');
  const dataInicio = `${ano}-${mesFormatado}-01`;
 const ultimoDia = new Date(ano, mes, 0).getDate();
const dataFim = `${ano}-${mesFormatado}-${String(ultimoDia).padStart(2, '0')}`;

  const [diasExistentes] = await db.query(
    'SELECT data, eh_util FROM dias_uteis WHERE data BETWEEN ? AND ?',
    [dataInicio, dataFim]
  );

const diasMap = {};
diasExistentes.forEach(d => {
  const dataFormatada = typeof d.data === 'string' ? d.data : d.data.toISOString().split('T')[0];
  diasMap[dataFormatada] = d.eh_util;
});

const diasCompletos = diasDoMes.map(d => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dataStr = `${yyyy}-${mm}-${dd}`;
  
  return {
    data: dataStr,
    diaSemana: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
    eh_util: diasMap[dataStr] === 'S' ? 'S' : 'N'
  };

});

  res.render('gerenciar_dias_uteis', { mes, ano, dias: diasCompletos, title:"Dias uteis" });
});

router.post('/salvar', async (req, res) => {
  const { mes, ano, dias_uteis = [] } = req.body;
  const diasSelecionados = Array.isArray(dias_uteis) ? dias_uteis : [dias_uteis];

  const diasDoMes = getDaysInMonth(parseInt(mes), parseInt(ano));

  for (const d of diasDoMes) {
    const dataStr = format(d, 'yyyy-MM-dd');
    const eh_util = diasSelecionados.includes(dataStr) ? 'S' : 'N';

    const [exists] = await db.query('SELECT id FROM dias_uteis WHERE data = ?', [dataStr]);
    if (exists.length > 0) {
      await db.query('UPDATE dias_uteis SET eh_util = ? WHERE data = ?', [eh_util, dataStr]);
    } else {
      await db.query('INSERT INTO dias_uteis (data, eh_util) VALUES (?, ?)', [dataStr, eh_util]);
    }
  }

  res.redirect(`/dias-uteis/gerenciar?mes=${mes}&ano=${ano}`);
});

router.post('/replicar', async (req, res) => {
  const { mesOrigem, anoOrigem, mesDestino, anoDestino } = req.body;
  const diasOrigem = getDaysInMonth(parseInt(mesOrigem), parseInt(anoOrigem));
  const diasDestino = getDaysInMonth(parseInt(mesDestino), parseInt(anoDestino));

  for (let i = 0; i < diasOrigem.length && i < diasDestino.length; i++) {
    const dataOrigemStr = format(diasOrigem[i], 'yyyy-MM-dd');
    const dataDestinoStr = format(diasDestino[i], 'yyyy-MM-dd');

    const [origem] = await db.query('SELECT eh_util FROM dias_uteis WHERE data = ?', [dataOrigemStr]);
    const eh_util = origem.length ? origem[0].eh_util : 'N';

    const [exists] = await db.query('SELECT id FROM dias_uteis WHERE data = ?', [dataDestinoStr]);
    if (exists.length > 0) {
      await db.query('UPDATE dias_uteis SET eh_util = ? WHERE data = ?', [eh_util, dataDestinoStr]);
    } else {
      await db.query('INSERT INTO dias_uteis (data, eh_util) VALUES (?, ?)', [dataDestinoStr, eh_util]);
    }
  }

  res.redirect(`/dias-uteis/gerenciar?mes=${mesDestino}&ano=${anoDestino}`);
});

module.exports = router;
