const express = require('express');
const router = express.Router();
const db = require('../models/db'); // ajuste o caminho se necessário

// helper para primeiro e último dia do mês atual (ISO)
function intervaloPadrao() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-11
  const ini = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return { data_inicio: iso(ini), data_fim: iso(fim) };
}

// converte minutos -> "HH:MM" com sinal
function minToHHMM(minTotal) {
  const sign = minTotal < 0 ? '-' : '';
  const m = Math.abs(Math.round(minTotal));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// mesma lógica de apuração (sábados, não-úteis, folga meia/inteira, sábado 2º turno = HE)
// retorna [{ id, nome, saldo_min }]
async function saldoPorCargo(cargo, data_inicio, data_fim) {
  const sql = `
  SELECT 
    f.id,
    f.nome,
    -- extras (min)
    COALESCE(SUM(
      GREATEST(
        w.worked_min_day - 
        (
          CASE 
            WHEN du.eh_util = 'S' THEN 
              CASE 
                WHEN DAYOFWEEK(w.data) = 7 THEN 
                  CASE 
                    WHEN fg.folga_primeiro_periodo = 'S' THEN 0
                    ELSE 240
                  END
                ELSE 
                  (COALESCE(f.jornada_base,0) * 60) *
                  CASE 
                    WHEN (fg.folga_primeiro_periodo = 'S' AND fg.folga_segundo_periodo = 'S') THEN 0
                    WHEN (fg.folga_primeiro_periodo = 'S' OR  fg.folga_segundo_periodo = 'S') THEN 0.5
                    ELSE 1
                  END
              END
            ELSE 0
          END
        ),
        0
      )
    ), 0) AS extras_min,

    -- restantes (min)
    COALESCE(SUM(
      GREATEST(
        (
          CASE 
            WHEN du.eh_util = 'S' THEN 
              CASE 
                WHEN DAYOFWEEK(w.data) = 7 THEN 0
                ELSE 
                  (COALESCE(f.jornada_base,0) * 60) *
                  CASE 
                    WHEN (fg.folga_primeiro_periodo = 'S' AND fg.folga_segundo_periodo = 'S') THEN 0
                    WHEN (fg.folga_primeiro_periodo = 'S' OR  fg.folga_segundo_periodo = 'S') THEN 0.5
                    ELSE 1
                  END
              END
            ELSE 0
          END
          - CASE 
              WHEN du.eh_util = 'S' AND DAYOFWEEK(w.data) BETWEEN 2 AND 6 THEN 15
              ELSE 0
            END
        ) - w.worked_min_day,
        0
      )
    ), 0) AS restantes_min

  FROM (
    SELECT 
      j.id_funcionario,
      j.data,
      COALESCE(SUM(
        GREATEST(
          COALESCE(TIME_TO_SEC(TIMEDIFF(j.saida, j.entrada)) / 60, 0)
          - COALESCE(TIME_TO_SEC(TIMEDIFF(j.retorno_intervalo, j.saida_intervalo)) / 60, 0),
          0
        )
      ), 0) AS worked_min_day
    FROM jornadas j
    WHERE j.entrada IS NOT NULL
      AND j.saida   IS NOT NULL
    GROUP BY j.id_funcionario, j.data
  ) w
  JOIN funcionarios f ON f.id = w.id_funcionario
  LEFT JOIN dias_uteis du ON du.data = w.data
  LEFT JOIN folgas fg ON fg.id_funcionario = w.id_funcionario AND fg.data = w.data
  WHERE f.cargo = ?
    AND w.data BETWEEN ? AND ?
  GROUP BY f.id, f.nome
  ORDER BY f.nome ASC;
  `;

  const [rows] = await db.query(sql, [cargo, data_inicio, data_fim]);

  // saldo = extras - restantes (minutos)
  return rows.map(r => ({
    id: r.id,
    nome: r.nome,
    saldo_min: Number(r.extras_min || 0) - Number(r.restantes_min || 0)
  }));
}

router.get('/saldo-total', async (req, res) => {
  const { data_inicio, data_fim } = req.query.data_inicio && req.query.data_fim
    ? { data_inicio: req.query.data_inicio, data_fim: req.query.data_fim }
    : intervaloPadrao();

  const [motoristas, ajudantes] = await Promise.all([
    saldoPorCargo('motorista', data_inicio, data_fim),
    saldoPorCargo('ajudante',  data_inicio, data_fim)
  ]);

  // Formata para HH:MM já no controller (pode formatar na view também, se preferir)
  const motoristasFmt = motoristas.map(m => ({ ...m, saldo_hhmm: minToHHMM(m.saldo_min) }));
  const ajudantesFmt  = ajudantes.map(a => ({ ...a, saldo_hhmm: minToHHMM(a.saldo_min) }));

  res.render('saldo_total', {
    filtros: { data_inicio, data_fim },
    motoristas: motoristasFmt,
    ajudantes: ajudantesFmt,
    title: 'Saldo',
    active: 'relatorios'
  });
});

module.exports = router;
