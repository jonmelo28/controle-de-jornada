const express = require('express');
const router = express.Router();
const db = require('../models/db'); // mysql2/promise pool com dateStrings:true
const { requireAuth } = require('../middleware/auth'); 

// util
const toBR = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const minToH = m => (Number(m||0)/60);

async function resumoPorCargo(cargo, { data_inicio, data_fim }) {
  // 1) Dias úteis no período
  const [[{ qnt_uteis }]] = await db.query(
    `SELECT COUNT(*) AS qnt_uteis
       FROM dias_uteis
      WHERE eh_util='S' AND data BETWEEN ? AND ?`,
    [data_inicio, data_fim]
  );

  // 2) Dias de calendário e descanso (para DSR)
  const [[{ dias_periodo }]] = await db.query(
    `SELECT DATEDIFF(?, ?)+1 AS dias_periodo`,
    [data_fim, data_inicio]
  );
  const dias_descanso = Math.max(0, dias_periodo - (qnt_uteis || 0));

  const sql = `
SELECT 
  f.id,
  f.nome,
  f.salario,
  f.jornada_base,
  f.cargo,

  COALESCE(SUM(w.worked_min_day), 0) AS worked_min,

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
        -- FRANQUIA de 15 min em dias úteis de seg–sex
        - CASE 
            WHEN du.eh_util = 'S' AND DAYOFWEEK(w.data) BETWEEN 2 AND 6 THEN 15
            ELSE 0
          END
      ) - w.worked_min_day,
      0
    )
  ), 0) AS restantes_min,

  COUNT(*) AS dias_com_apont

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
GROUP BY f.id, f.nome, f.salario, f.jornada_base, f.cargo
ORDER BY f.nome ASC;

`;

// 3) Agregado de jornadas por colaborador
const [rows] = await db.query(sql, [cargo, data_inicio, data_fim]);

  // 4) Pagamentos por competência (mês/ano) dentro do intervalo
  const [pagos] = await db.query(
    `
    SELECT funcionario_id, SUM(valor_pago) AS valor_pago
    FROM pagamentos_extras
    WHERE competencia BETWEEN DATE_FORMAT(?,'%Y-%m-01') AND LAST_DAY(?)
    GROUP BY funcionario_id
    `,
    [data_inicio, data_fim]
  );
  const valorPagoPorFunc = new Map(pagos.map(p => [p.funcionario_id, Number(p.valor_pago)]));

  // Formata número para padrão BR (R$ 1.234,56)
function fmtBR(valor) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// Converte minutos para horas (float)
function minToHours(minutos) {
  return Number(minutos || 0) / 60;
}
  
// Arredonda com 2 casas
function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

const data = rows.map(r => {
    // 1) Salário base e cálculos
  const salarioBase = parseFloat(r.salario || 0);
  const valorHora = salarioBase / 220;            // sem arredondar ainda
  const valorHoraExtra = valorHora * 1.5;         // +50%

  // 2) Totais em horas
  const totalExtras     = minToHours(r.extras_min);      // minutos -> horas
  const totalRestantes  = minToHours(r.restantes_min);   // minutos -> horas
  const saldoHoras     = round2(totalExtras - totalRestantes);

   //const valorExtrasRS  = round2(Math.max(0, saldoHoras) * valorHoraExtra);

  // 3) Financeiro conforme sua planilha
  //const valorExtrasRS = round2(totalExtras * valorHoraExtra);
  
  // 3) Valor de horas extras
  const valorExtrasRS = saldoHoras > 0 ? saldoHoras * valorHoraExtra : 0;

  // 4) DSR
  const diasUteis = Number(qnt_uteis || 0);
  const diasNaoUteis = Number(dias_descanso || 0);
  const dsrRS = (saldoHoras > 0 && diasUteis > 0)
    ? (saldoHoras * valorHoraExtra / diasUteis) * diasNaoUteis
    : 0;

  // 4) Valor pago (por competência) e diferença
  const valorPago = Number(valorPagoPorFunc.get(r.id) || 0);
  //correto 
  //const totalDevido = round2(valorExtrasRS + dsrRS);
  //Padrão Empresa
  const totalDevido = valorExtrasRS;
  const diferenca   = totalDevido - valorPago;

  // 6) Retorno formatado para exibição
  return {
    id: r.id,
    nome: r.nome,
    salario_base: fmtBR(salarioBase),
    valor_hora: fmtBR(valorHora),
    valor_hora_extra: fmtBR(valorHoraExtra),
    horas_extras_rs: fmtBR(valorExtrasRS),
    dsr: fmtBR(dsrRS),
    valor_pago: fmtBR(valorPago),
    diferenca: fmtBR(diferenca)
  };
});

  return { data, qnt_uteis, dias_descanso };
}

// AJUDANTES
router.get('/ajudantes', requireAuth, async (req, res) => {
  const { data_inicio, data_fim } = req.query;
  if (!data_inicio || !data_fim) {
    return res.render('resumo_cargo_filtro', { title: 'Ajudantes', cargo: 'ajudante' });
  }
  const { data, qnt_uteis, dias_descanso } = await resumoPorCargo('ajudante', { data_inicio, data_fim });
  res.render('resumo_cargo', {
    title: 'Valor Geral Ajudantes',
    cargo: 'Ajudantes',
    periodo: { data_inicio, data_fim, qnt_uteis, dias_descanso },
    linhas: data,
    active: 'relatorios'
  });
});

// MOTORISTAS
router.get('/motoristas', requireAuth, async (req, res) => {
  const { data_inicio, data_fim } = req.query;
  if (!data_inicio || !data_fim) {
    return res.render('resumo_cargo_filtro', { title: 'Motoristas', cargo: 'motorista' });
  }
  const { data, qnt_uteis, dias_descanso } = await resumoPorCargo('motorista', { data_inicio, data_fim });
  res.render('resumo_cargo', {
    title: 'Valor Geral Motoristas',
    cargo: 'Motoristas',
    periodo: { data_inicio, data_fim, qnt_uteis, dias_descanso },
    linhas: data,
    active: 'relatorios'
  });
});

module.exports = router;
