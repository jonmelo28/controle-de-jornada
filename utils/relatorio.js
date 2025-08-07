const { calcularHorasJornada, fromDecimal, toDecimal } = require('./calculos');

function gerarRelatorioCompleto(data_inicio, data_fim, jornadasDb, funcionario, diasUteisDb, folgasDb) {
    const parseDate = (dateStr) => {
        const [yyyy, mm, dd] = dateStr.split('-').map(Number);
        return new Date(yyyy, mm - 1, dd);
    };

    const formatDateToYMD = (date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const diasUteisMap = {};
    diasUteisDb.forEach(d => {
        const dataFormatada = typeof d.data === 'string' ? d.data : formatDateToYMD(new Date(d.data));
        diasUteisMap[dataFormatada] = d.eh_util === 'S';
    });

    const folgasMap = {};
    folgasDb.forEach(f => {
        const dataFormatada = typeof f.data === 'string' ? f.data : formatDateToYMD(new Date(f.data));
        folgasMap[dataFormatada] = {
            primeiro: f.folga_primeiro === 'S',
            segundo: f.folga_segundo === 'S'
        };
    });

    const index = {};
    jornadasDb.forEach(j => {
        const dataFormatada = typeof j.data === 'string' ? j.data : formatDateToYMD(new Date(j.data));
        index[dataFormatada] = j;
    });

    const relatorio = [];
    let totalTrabalhadas = 0;
    let totalExtras = 0;
    let totalRestantes = 0;
    let diasUteis = 0;
    let diasNaoUteis = 0;
    let domingosOuSabados = 0;
    let totalDias = 0;

    const dataInicioObj = parseDate(data_inicio);
    const dataFimObj = parseDate(data_fim);
    dataFimObj.setHours(0, 0, 0, 0);
    dataInicioObj.setHours(0, 0, 0, 0);

    for (let d = new Date(dataInicioObj); d <= dataFimObj; d.setDate(d.getDate() + 1)) {
        d.setHours(0, 0, 0, 0);

        const dataStr = formatDateToYMD(d);
        const diaSemana = d.toLocaleDateString('pt-BR', { weekday: 'long' });

        totalDias++;

        const isDiaUtil = diasUteisMap[dataStr] === true;
        const diaJs = d.getDay();
        const isSabado = diaJs === 6;
        const isDomingo = diaJs === 0;

        if (isDiaUtil) {
            diasUteis++;
        } else {
            diasNaoUteis++;
            if (isDomingo || isSabado) domingosOuSabados++;
        }

        const folga_primeiro_periodo = folgasMap[dataStr]?.primeiro ? 'S' : null;
        const folga_segundo_periodo = folgasMap[dataStr]?.segundo ? 'S' : null;

        const j = index[dataStr];

        if (j) {
            const resultado = calcularHorasJornada(
                j.entrada,
                j.saida_intervalo,
                j.retorno_intervalo,
                j.saida,
                dataStr,
                funcionario.jornada_base,
                isDiaUtil ? 'S' : 'N',
                folga_primeiro_periodo,
                folga_segundo_periodo
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
                entrada: j.entrada,
                saida_intervalo: j.saida_intervalo,
                retorno_intervalo: j.retorno_intervalo,
                saida: j.saida,
                horas_trabalhadas: resultado.horas_trabalhadas,
                horas_extras: resultado.horas_extras,
                horas_restantes: resultado.horas_restantes,
                folga_primeiro_periodo: 'N',
                folga_segundo_periodo: 'N'
            });
        } else {
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
                folga_primeiro_periodo: 'N',
                folga_segundo_periodo: 'N'
            });
        }
    }

    const salarioBase = parseFloat(funcionario.salario || 0);
    const valorHora = salarioBase / 220;
    const valorHoraExtra = valorHora * 1.5;
    const valorExtrasRS = totalExtras * valorHoraExtra;
    const dsr = (totalExtras / (diasUteis || 1)) * domingosOuSabados;

    const resumo = {
        total_trabalhadas: fromDecimal(totalTrabalhadas),
        total_extras: fromDecimal(totalExtras),
        total_restantes: fromDecimal(totalRestantes),
        saldo: fromDecimal(totalExtras - totalRestantes),
        total_dias: totalDias,
        dias_uteis: diasUteis,
        dias_nao_uteis: diasNaoUteis,
        salario_base: salarioBase.toFixed(2),
        valor_hora: valorHora.toFixed(2),
        valor_hora_extra: valorHoraExtra.toFixed(2),
        valor_horas_extras_rs: valorExtrasRS.toFixed(2),
        dsr: valorExtrasRS > 0 ? dsr.toFixed(2) : "0.00"
    };

    return { relatorio, resumo };
}

module.exports = { gerarRelatorioCompleto };
