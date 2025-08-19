function calcularHorasJornada(
    entrada,
    saidaIntervalo,
    retornoIntervalo,
    saida,
    data,
    jornadaBase,
    eh_util, // 'S' ou 'N'
    folgaPrimeiroPeriodo = 'N',
    folgaSegundoPeriodo = 'N'
) {
    const TOLERANCIA_MINUTOS = 5;

    const dia = getDiaSemana(data);
    const isSabado = dia === 6;
    const isDomingo = dia === 0;
    const ehFeriadoOuNaoUtil = eh_util !== 'S';

    // 🚩 Se for folga nos dois períodos, já retorna 8h
    if (folgaPrimeiroPeriodo === 'S' && folgaSegundoPeriodo === 'S') {
        return {
            horas_trabalhadas: '8:00',
            horas_extras: '0:00',
            horas_restantes: '0:00'
        };
    }

    // 🚩 Cálculo dos períodos
    const getMinutos = (hora) => {
        if (!hora || hora === '00:00' || hora === '-') return null;
        const [h, m] = hora.split(':').map(Number);
        return h * 60 + m;
    };

    const periodo1 = (getMinutos(entrada) !== null && getMinutos(saidaIntervalo) !== null)
        ? getMinutos(saidaIntervalo) - getMinutos(entrada)
        : 0;

    const periodo2 = (getMinutos(retornoIntervalo) !== null && getMinutos(saida) !== null)
        ? getMinutos(saida) - getMinutos(retornoIntervalo)
        : 0;

    const totalMin = Math.max(periodo1, 0) + Math.max(periodo2, 0);
    const totalHoras = totalMin / 60;

    // 🚩 Jornada padrão (8h ou 4h se sábado)
    let jornadaMinutos = isSabado ? 240 : jornadaBase * 60;

    // 🚩 Desconta folgas parciais (4h cada)
    if (folgaPrimeiroPeriodo === 'S') jornadaMinutos -= 240;
    if (folgaSegundoPeriodo === 'S') jornadaMinutos -= 240;
    if (jornadaMinutos < 0) jornadaMinutos = 0;

    // 🚩 Se for domingo ou feriado → tudo vira hora extra
    if (isDomingo || ehFeriadoOuNaoUtil) {
        return {
            horas_trabalhadas: fromDecimal(totalHoras),
            horas_extras: fromDecimal(totalHoras),
            horas_restantes: '0:00'
        };
    }

    // 🚩 Diferença
    const diferenca = totalMin - jornadaMinutos;

    let horasExtras = 0;
    let horasRestantes = 0;

    if (Math.abs(diferenca) <= TOLERANCIA_MINUTOS) {
        horasExtras = 0;
        horasRestantes = 0;
    } else if (diferenca > 0) {
        horasExtras = diferenca;
    } else {
        horasRestantes = Math.abs(diferenca);
    }

    return {
        horas_trabalhadas: fromDecimal(totalHoras),
        horas_extras: fromDecimalMin(horasExtras),
        horas_restantes: fromDecimalMin(horasRestantes)
    };
}


// ✅ Utilitários
function fromDecimal(decimal) {
     if (decimal == null || isNaN(decimal)) return '0:00';

     const neg = decimal < 0;
    const totalMinutes = Math.round(Math.abs(decimal) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
     if (m === 60) { h += 1; m   = 0; }
      const mm = String(m).padStart(2, '0');
  return `${neg ? '-' : ''}${h}:${mm}`;
}

function fromDecimalMin(decimal) {
    const totalMinutes = Math.round(decimal);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
}

function toDecimal(horaStr) {
    if (!horaStr || horaStr === '-' || horaStr === '00:00') return 0;
    const [h, m] = horaStr.split(':').map(Number);
    return h + (m / 60);
}

function getDiaSemana(dataStr) {
    const [yyyy, mm, dd] = dataStr.split('-').map(Number);
    const dataObj = new Date(yyyy, mm - 1, dd);
    return dataObj.getDay(); // 0=domingo, 6=sábado
}


module.exports = { calcularHorasJornada, fromDecimal, toDecimal, getDiaSemana };
