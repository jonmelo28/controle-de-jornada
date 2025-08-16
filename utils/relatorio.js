const { calcularHorasJornada, fromDecimal, toDecimal } = require('./calculos');

function gerarRelatorioCompleto(data_inicio, data_fim, jornadasDb, funcionario, diasUteisDb, folgasDb) {
  // Helpers de data
  const parseDate = (dateStr) => {
    const [yyyy, mm, dd] = String(dateStr).split('-').map(Number);
    return new Date(yyyy, mm - 1, dd);
  };

  const formatDateToYMD = (date) => {
    if (typeof date === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const isEhUtilTrue = (val) => (val === 'S' || val === '1' || val === 1 || val === true);

  // Map de dias úteis
  const diasUteisMap = {};
  (diasUteisDb || []).forEach(d => {
    const dataFormatada = typeof d.data === 'string' ? d.data : formatDateToYMD(new Date(d.data));
    diasUteisMap[dataFormatada] = isEhUtilTrue(d.eh_util);
  });

  // Map de folgas (usar exatamente os nomes das colunas do banco)
  const folgasMap = {};
  (folgasDb || []).forEach(f => {
    if (!f || !f.data) return;
    const dataFormatada = typeof f.data === 'string' ? f.data : formatDateToYMD(new Date(f.data));
    if (!folgasMap[dataFormatada]) folgasMap[dataFormatada] = { primeiro: false, segundo: false };
    folgasMap[dataFormatada].primeiro = folgasMap[dataFormatada].primeiro || (f.folga_primeiro_periodo === 'S');
    folgasMap[dataFormatada].segundo  = folgasMap[dataFormatada].segundo  || (f.folga_segundo_periodo  === 'S');
  });

  // Index de jornadas por data (se houver mais de uma no dia, a última prevalece)
  const index = {};
  (jornadasDb || []).forEach(j => {
    const dataFormatada = typeof j.data === 'string' ? j.data : formatDateToYMD(new Date(j.data));
    index[dataFormatada] = j;
  });

  const relatorio = [];
  let totalTrabalhadas = 0;
  let totalExtras = 0;
  let totalRestantes = 0;
  let diasUteis = 0;
  let diasNaoUteis = 0;
  let totalDias = 0;

  const dataInicioObj = parseDate(data_inicio);
  const dataFimObj = parseDate(data_fim);
  dataInicioObj.setHours(0, 0, 0, 0);
  dataFimObj.setHours(0, 0, 0, 0);

  for (let d = new Date(dataInicioObj); d <= dataFimObj; d.setDate(d.getDate() + 1)) {
    d.setHours(0, 0, 0, 0);

    const dataStr = formatDateToYMD(d);
    const diaSemana = d.toLocaleDateString('pt-BR', { weekday: 'long' });

    totalDias++;

    const isDiaUtil = !!diasUteisMap[dataStr]; // default false se não houver registro
    if (isDiaUtil) diasUteis++; else diasNaoUteis++;

    // folgas do dia (sempre S/N para o EJS)
    const folgaPrimeiro = folgasMap[dataStr]?.primeiro ? 'S' : 'N';
    const folgaSegundo  = folgasMap[dataStr]?.segundo  ? 'S' : 'N';

    const j = index[dataStr];

    if (j) {
      // repassa 'S' ou null para o cálculo (conforme sua função espera)
      const resultado = calcularHorasJornada(
        j.entrada,
        j.saida_intervalo,
        j.retorno_intervalo,
        j.saida,
        dataStr,
        funcionario.jornada_base,
        isDiaUtil ? 'S' : 'N',
        folgaPrimeiro === 'S' ? 'S' : null,
        folgaSegundo  === 'S' ? 'S' : null
      );

      const ht = toDecimal(resultado.horas_trabalhadas);
      const he = toDecimal(resultado.horas_extras);
      const hf = toDecimal(resultado.horas_restantes);

      totalTrabalhadas += ht;
      totalExtras += he;
      totalRestantes += hf;

      relatorio.push({
        data: dataStr,
        dia: diaSemana,
        entrada: j.entrada || null,
        saida_intervalo: j.saida_intervalo || null,
        retorno_intervalo: j.retorno_intervalo || null,
        saida: j.saida || null,
        horas_trabalhadas: resultado.horas_trabalhadas,
        horas_extras: resultado.horas_extras,
        horas_restantes: resultado.horas_restantes,
        folga_primeiro_periodo: folgaPrimeiro,
        folga_segundo_periodo:  folgaSegundo
      });
    } else {
      // Sem jornada, mas ainda assim mostrar a folga marcada no dia
      relatorio.push({
        data: dataStr,
        dia: diaSemana,
        entrada: null,
        saida_intervalo: null,
        retorno_intervalo: null,
        saida: null,
        horas_trabalhadas: fromDecimal(0),
        horas_extras: fromDecimal(0),
        horas_restantes: fromDecimal(0),
        folga_primeiro_periodo: folgaPrimeiro,
        folga_segundo_periodo:  folgaSegundo
      });
    }
  }

  // Cálculos financeiros
  const salarioBase = parseFloat(funcionario.salario || 0);
  const valorHora = salarioBase / 220;                 // valor base da hora
  const valorHoraExtra = valorHora + (valorHora / 2);  // +50% (N20 + N20/2)

  const saldoHoras = totalExtras - totalRestantes;     // saldo já em horas decimais

  const valorExtrasRS = totalExtras * valorHoraExtra;

  // DSR em R$ com a sua fórmula: (((saldo*24)*valorHoraExtra)/diasUteis)*diasNaoUteis
  // Como saldo já está em HORAS, o *24 do Excel (que converte dias->horas) não é necessário:
  // (((saldoHoras)*valorHoraExtra)/diasUteis)*diasNaoUteis
  const dsrRS = (saldoHoras > 0 && diasUteis > 0)
    ? ((saldoHoras * valorHoraExtra) / diasUteis) * diasNaoUteis
    : 0;

  const resumo = {
    total_trabalhadas: fromDecimal(totalTrabalhadas),
    total_extras: fromDecimal(totalExtras),
    total_restantes: fromDecimal(totalRestantes),
    saldo: fromDecimal(saldoHoras),
    total_dias: totalDias,
    dias_uteis: diasUteis,
    dias_nao_uteis: diasNaoUteis,
    salario_base: salarioBase.toFixed(2),
    valor_hora: valorHora.toFixed(2),
    valor_hora_extra: valorHoraExtra.toFixed(2),
    valor_horas_extras_rs: valorExtrasRS.toFixed(2),
    dsr: dsrRS.toFixed(2) // em R$
  };
 return { relatorio, resumo };
}

module.exports = { gerarRelatorioCompleto };