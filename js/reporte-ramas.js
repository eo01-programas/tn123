(() => {
    // ── helpers de fecha diaria ──────────────────────────────────────────────

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    // ¿El valor crudo trae hora? Los campos de solo fecha (embalaje_fecha,
    // acabado_especial_fecha → formatDateForUi) no tienen componente horario y
    // por tanto no se les debe aplicar el corte de jornada.
    function hasTimeComponent(value) {
        return /\d{1,2}:\d{2}/.test(String(value == null ? '' : value));
    }

    // Corte de jornada: lo registrado antes de las 7am cuenta como el día anterior
    // (mismo criterio que las vistas de proceso, corte único porque este reporte
    // no incluye datos de Calidad). Solo aplica a campos que guardan hora; los de
    // solo fecha se respetan tal cual (de lo contrario medianoche caería siempre
    // en el día anterior).
    function toBusinessDate(value) {
        const d = TintoreriaUtils.parseDateish(value);
        if (!d) return null;
        if (hasTimeComponent(value) && d.getHours() < 7) {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, d.getHours(), d.getMinutes(), d.getSeconds());
        }
        return d;
    }

    function toDateKey(value) {
        const d = toBusinessDate(value);
        return d ? dateKey(d) : null;
    }

    const MONTHS_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const DAYS_ABBR   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    function formatDateLabel(isoKey) {
        const [y, m, d] = isoKey.split('-').map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        return `${DAYS_ABBR[dow]} ${String(d).padStart(2, '0')}/${MONTHS_ABBR[m - 1]}`;
    }

    function getLast7DayKeys(n = 7) {
        const today = new Date();
        const days = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            days.push(dateKey(d));
        }
        return days;
    }

    // ── helpers de semana ISO ────────────────────────────────────────────────

    function isoWeekKey(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const isoYear = d.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { key: `${isoYear}-W${String(weekNum).padStart(2, '0')}`, weekNum };
    }

    function getLast5Weeks() {
        const today = new Date();
        const dow = today.getDay() || 7;
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow + 1);

        const weeks = [];
        for (let i = 4; i >= 0; i--) {
            const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
            const { key, weekNum } = isoWeekKey(start);
            weeks.push({ key, weekNum, label: `Sem${weekNum}`, isCurrent: i === 0 });
        }
        return weeks;
    }

    // ── helpers de mes ───────────────────────────────────────────────────────

    function monthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function getLastNMonths(n = 5) {
        const today = new Date();
        const months = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push({
                key: monthKey(d),
                labelLines: [MONTHS_ABBR[d.getMonth()], String(d.getFullYear())],
                isCurrent: i === 0
            });
        }
        return months;
    }

    // ── lógica de datos compartida ───────────────────────────────────────────

    // Índices de registros que sustentan cada celda numérica, usados para
    // abrir el modal de detalle al hacer click. Se repueblan en cada render().
    let dailyRecordsIndex = {};
    let processRecordsIndex = {};

    const FIELD_LABELS = {
        termofijado: 'Termofijado',
        humectado: 'Humectado',
        secado: 'Secado',
        acabado: 'Acabado',
        reproceso: 'Reproceso',
        total: 'Total',
        plegado: 'Plegado',
        preparado: 'Preparado',
        abridora: 'Abridora',
        acabEspec: 'Acab. Especial',
        embalaje: 'Embalaje'
    };

    function accumulateRecord(record, dayMap, chartEvents, dayRecordsIndex) {
        const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
        if (!kg) return;

        const ruta              = String(record.ruta              || '').trim();
        const ramaCrudoEstado   = String(record.rama_crudo_estado  || '').trim();
        const ramaTenidoEstado  = String(record.rama_tenido_estado || '').trim();
        // Proceso del ultimo pase (ramas_mobile acumula pases separados por coma).
        const ramaTenidoProceso = TintoreriaUtils.lastPassValue(record.rama_tenido_proceso).toUpperCase();

        function addToDay(dateValue, field) {
            const key = toDateKey(dateValue);
            if (key && dayMap[key]) {
                dayMap[key][field] += kg;
                if (dayRecordsIndex[key]) dayRecordsIndex[key][field].push(record);
            }
        }

        // Evento crudo {fecha, kg, turno, maquina, opPartida} para el gráfico;
        // el bucketing por día/semana/mes se hace después según el período
        // elegido y turno/máquina alimentan el tooltip de cada barra.
        const opPartida = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
        function addToChart(dateValue, turno, maquina) {
            const d = toBusinessDate(dateValue);
            if (d) chartEvents.push({ date: d, kg, turno, maquina, opPartida });
        }

        const ramaCrudoFin     = TintoreriaUtils.lastPassValue(record.rama_crudo_fin);
        const ramaTenidoFin    = TintoreriaUtils.lastPassValue(record.rama_tenido_fin);
        const crudoTurno       = TintoreriaUtils.lastPassValue(record.rama_crudo_turno);
        const crudoMaquina     = TintoreriaUtils.lastPassValue(record.rama_crudo_maquina);
        const tenidoTurno      = TintoreriaUtils.lastPassValue(record.rama_tenido_turno);
        const tenidoMaquina    = TintoreriaUtils.lastPassValue(record.rama_tenido_maquina);

        if (ramaCrudoEstado === 'OK' && ruta === 'Termofijado') {
            addToDay(ramaCrudoFin, 'termofijado');
            addToChart(ramaCrudoFin, crudoTurno, crudoMaquina);
        }
        if (ramaCrudoEstado === 'OK' && ruta === 'Humectado') {
            addToDay(ramaCrudoFin, 'humectado');
            addToChart(ramaCrudoFin, crudoTurno, crudoMaquina);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'SECADO') {
            addToDay(ramaTenidoFin, 'secado');
            addToChart(ramaTenidoFin, tenidoTurno, tenidoMaquina);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'ACABADO') {
            addToDay(ramaTenidoFin, 'acabado');
            addToChart(ramaTenidoFin, tenidoTurno, tenidoMaquina);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'REPROCESO') {
            addToDay(ramaTenidoFin, 'reproceso');
            addToChart(ramaTenidoFin, tenidoTurno, tenidoMaquina);
        }
    }

    // ── tabla diaria ─────────────────────────────────────────────────────────

    function buildDailyReport(records) {
        const days = getLast7DayKeys(7);
        const dayMap = {};
        const dayRecordsIndex = {};
        days.forEach(d => {
            dayMap[d] = { termofijado: 0, humectado: 0, secado: 0, acabado: 0, reproceso: 0 };
            dayRecordsIndex[d] = { termofijado: [], humectado: [], secado: [], acabado: [], reproceso: [] };
        });

        const chartEvents = [];
        records.forEach(r => accumulateRecord(r, dayMap, chartEvents, dayRecordsIndex));

        const rows = days
            .map(key => {
                const row = dayMap[key];
                const total = row.termofijado + row.humectado + row.secado + row.acabado + row.reproceso;
                return { key, ...row, total };
            });

        return { rows, chartEvents, recordsIndex: dayRecordsIndex };
    }

    function cellButton(inner, source, day, field) {
        return `<button type="button" class="rr-cell-btn" data-source="${source}" data-day="${day}" data-field="${field}">${inner}</button>`;
    }

    function fmt(value, source, day, field) {
        if (!value) return '<span class="rr-empty">—</span>';
        const inner = `<strong>${TintoreriaUtils.formatNumber(value)}</strong><span class="rr-unit"> kg</span>`;
        return cellButton(inner, source, day, field);
    }

    function fmtPct(value, total, source, day, field) {
        if (!value) return '<span class="rr-empty">—</span>';
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const inner = `<strong>${TintoreriaUtils.formatNumber(value)}</strong><span class="rr-unit"> kg (${pct}%)</span>`;
        return cellButton(inner, source, day, field);
    }

    function renderTable(rows) {
        const tbody = document.getElementById('tbody-reporte-ramas');
        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="rr-no-data">Sin datos en los últimos 7 días.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td class="rr-fecha">${formatDateLabel(row.key)}</td>
                <td class="rr-value">${fmtPct(row.termofijado, row.total, 'daily', row.key, 'termofijado')}</td>
                <td class="rr-value">${fmtPct(row.humectado, row.total, 'daily', row.key, 'humectado')}</td>
                <td class="rr-value">${fmtPct(row.secado, row.total, 'daily', row.key, 'secado')}</td>
                <td class="rr-value">${fmtPct(row.acabado, row.total, 'daily', row.key, 'acabado')}</td>
                <td class="rr-value">${fmtPct(row.reproceso, row.total, 'daily', row.key, 'reproceso')}</td>
                <td class="rr-total">${fmt(row.total, 'daily', row.key, 'total')}</td>
            </tr>
        `).join('');
    }

    // ── gráficos (día / semana / mes) ────────────────────────────────────────

    function niceMax(val) {
        if (val <= 0) return 10000;
        const mag = Math.pow(10, Math.floor(Math.log10(val)));
        return Math.ceil(val / mag) * mag;
    }

    function shortKg(val) {
        if (val >= 1000) {
            const k = Math.round((val / 1000) * 10) / 10;
            return `${k}k`;
        }
        return `${Math.round(val)}`;
    }

    // Serie de barras para el período elegido a partir de eventos {date, kg}.
    // Cada barra: { key, labelLines, isCurrent, total }.
    function buildChartSeries(events, period) {
        let buckets;
        if (period === 'dia') {
            const todayKey = dateKey(new Date());
            buckets = getLast7DayKeys().map(key => ({
                key,
                labelLines: formatDateLabel(key).split(' '),
                isCurrent: key === todayKey
            }));
        } else if (period === 'mes') {
            buckets = getLastNMonths(5);
        } else {
            buckets = getLast5Weeks().map(w => ({ key: w.key, labelLines: [w.label], isCurrent: w.isCurrent }));
        }

        const byKey = {};
        buckets.forEach(b => { byKey[b.key] = { total: 0, events: [] }; });
        events.forEach(ev => {
            const k = period === 'dia' ? dateKey(ev.date)
                : period === 'mes' ? monthKey(ev.date)
                : isoWeekKey(ev.date).key;
            if (byKey[k]) {
                byKey[k].total += ev.kg;
                byKey[k].events.push(ev);
            }
        });

        return buckets.map(b => ({ ...b, total: byKey[b.key].total, events: byKey[b.key].events }));
    }

    function renderBarChart(svgId, data) {
        const svg = document.getElementById(svgId);
        if (!svg || !data.length) return;

        const twoLine = data.some(d => d.labelLines.length > 1);

        const VW = svg.clientWidth || 420;
        const VH = svg.clientHeight || 220;
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const pad = { top: 14, right: 10, bottom: twoLine ? 54 : 44, left: 64 };
        const cW = VW - pad.left - pad.right;
        const cH = VH - pad.top - pad.bottom;

        const maxVal = Math.max(...data.map(d => d.total));
        const yMax = niceMax(maxVal);
        const Y_TICKS = 4;

        const barSlot = cW / data.length;
        const barW = barSlot * 0.58;
        const barOffset = (barSlot - barW) / 2;

        let html = '';

        // grid lines + Y labels
        for (let i = 0; i <= Y_TICKS; i++) {
            const val = (yMax / Y_TICKS) * i;
            const y = pad.top + cH - (val / yMax) * cH;
            html += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${VW - pad.right}" y2="${y.toFixed(1)}" stroke="#dde8d9" stroke-width="1"/>`;
            html += `<text x="${pad.left - 7}" y="${(y + 5).toFixed(1)}" text-anchor="end" fill="#111" font-size="13" font-weight="700">${shortKg(val)}</text>`;
        }

        // barras + etiquetas X
        data.forEach((item, i) => {
            const bx = pad.left + i * barSlot + barOffset;
            const barH = item.total > 0 ? (item.total / yMax) * cH : 0;
            const by = pad.top + cH - barH;
            const fill = item.isCurrent ? '#4f8f62' : '#8fc4a0';
            const xCenter = bx + barW / 2;

            if (barH > 0) {
                html += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" rx="3"/>`;
                html += `<text x="${xCenter.toFixed(1)}" y="${(by - 6).toFixed(1)}" text-anchor="middle" fill="#111" font-size="13" font-weight="700">${shortKg(item.total)}</text>`;
            } else {
                html += `<rect x="${bx.toFixed(1)}" y="${(pad.top + cH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2" fill="#dde8d9" rx="1"/>`;
            }

            const lx = xCenter.toFixed(1);
            const fc = item.isCurrent ? '#000' : '#333';
            if (twoLine) {
                const ly1 = (pad.top + cH + 17).toFixed(1);
                const ly2 = (pad.top + cH + 33).toFixed(1);
                html += `<text x="${lx}" y="${ly1}" text-anchor="middle" fill="${fc}" font-size="14" font-weight="700">${item.labelLines[0]}</text>`;
                html += `<text x="${lx}" y="${ly2}" text-anchor="middle" fill="${fc}" font-size="14" font-weight="700">${item.labelLines[1] || ''}</text>`;
            } else {
                const ly = (pad.top + cH + 18).toFixed(1);
                html += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${fc}" font-size="15" font-weight="700">${item.labelLines[0]}</text>`;
            }
        });

        // ejes
        html += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;
        html += `<line x1="${pad.left}" y1="${(pad.top + cH).toFixed(1)}" x2="${VW - pad.right}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;

        // etiqueta Y
        html += `<text x="13" y="${(pad.top + cH / 2).toFixed(1)}" text-anchor="middle" fill="#333" font-size="13" font-weight="700" transform="rotate(-90,13,${(pad.top + cH / 2).toFixed(1)})">kg</text>`;

        // zonas de hover (una franja por barra, encima de todo) para el tooltip
        data.forEach((item, i) => {
            html += `<rect data-bar="${i}" x="${(pad.left + i * barSlot).toFixed(1)}" y="${pad.top}" width="${barSlot.toFixed(1)}" height="${(cH + (twoLine ? 36 : 22)).toFixed(1)}" fill="transparent"/>`;
        });

        svg.innerHTML = html;
    }

    // Estado de los gráficos: eventos {date, kg} de cada uno, período elegido
    // en su dropdown flotante y la serie renderizada (para el tooltip).
    let ramasChartEvents = [];
    let embalajeChartEvents = [];
    const chartPeriods = { ramas: 'sem', embalaje: 'dia' };
    const chartSeries = { ramas: [], embalaje: [] };

    function renderRamasChart() {
        chartSeries.ramas = buildChartSeries(ramasChartEvents, chartPeriods.ramas);
        renderBarChart('rr-weekly-chart', chartSeries.ramas);
    }

    function renderEmbalajeChart() {
        let data = buildChartSeries(embalajeChartEvents, chartPeriods.embalaje);
        // En vista diaria solo días con datos + siempre el día actual.
        if (chartPeriods.embalaje === 'dia') {
            data = data.filter(d => d.total > 0 || d.isCurrent);
        }
        chartSeries.embalaje = data;
        renderBarChart('rr-embalaje-chart', data);
    }

    // ── tooltip por barra ────────────────────────────────────────────────────

    const TURNO_TIP_LABELS = { '1T': '1er Turno', '2T': '2do Turno', '3T': '3er Turno' };

    function chartTooltipContent(bucket, mode) {
        const label = bucket.labelLines.join(' ');
        let html = `<div class="rr-tip-title">${TintoreriaUtils.escapeHtml(label)} · ${TintoreriaUtils.formatNumber(bucket.total)} kg</div>`;

        if (!bucket.events.length) {
            return html + '<div class="rr-tip-empty">Sin registros</div>';
        }

        // Desglose por cliente (gráfico de embalaje).
        if (mode === 'cliente') {
            const clientes = new Map();
            bucket.events.forEach(ev => {
                const key = ev.cliente || '—';
                if (!clientes.has(key)) clientes.set(key, { kg: 0, partidas: new Set() });
                const cliente = clientes.get(key);
                cliente.kg += ev.kg;
                cliente.partidas.add(ev.opPartida);
            });

            html += [...clientes.entries()]
                .sort((a, b) => b[1].kg - a[1].kg)
                .map(([key, cliente]) => {
                    const pct = bucket.total > 0 ? Math.round((cliente.kg / bucket.total) * 100) : 0;
                    return `<div class="rr-tip-turno"><span>${TintoreriaUtils.escapeHtml(key)}</span><span>${cliente.partidas.size} ptda${cliente.partidas.size === 1 ? '' : 's'} · ${TintoreriaUtils.formatNumber(cliente.kg)} kg <span class="rr-tip-pct">${pct}%</span></span></div>`;
                }).join('');

            return html;
        }

        // Jerarquía turno → máquinas: total por turno y desglose por máquina.
        const turnos = new Map();
        bucket.events.forEach(ev => {
            const turnoKey = ev.turno || '';
            if (!turnos.has(turnoKey)) turnos.set(turnoKey, { kg: 0, partidas: new Set(), maquinas: new Map() });
            const turno = turnos.get(turnoKey);
            turno.kg += ev.kg;
            turno.partidas.add(ev.opPartida);

            const maquinaKey = ev.maquina || '—';
            if (!turno.maquinas.has(maquinaKey)) turno.maquinas.set(maquinaKey, { kg: 0, partidas: new Set() });
            const maquina = turno.maquinas.get(maquinaKey);
            maquina.kg += ev.kg;
            maquina.partidas.add(ev.opPartida);
        });

        html += [...turnos.entries()]
            .sort((a, b) => {
                if (!a[0]) return 1;
                if (!b[0]) return -1;
                return a[0].localeCompare(b[0], 'es', { numeric: true });
            })
            .map(([turnoKey, turno]) => {
                const turnoLabel = TURNO_TIP_LABELS[turnoKey] || turnoKey || 'Sin turno';
                const pct = bucket.total > 0 ? Math.round((turno.kg / bucket.total) * 100) : 0;
                let block = `<div class="rr-tip-turno"><span>${TintoreriaUtils.escapeHtml(turnoLabel)}</span><span>${turno.partidas.size} ptda${turno.partidas.size === 1 ? '' : 's'} · ${TintoreriaUtils.formatNumber(turno.kg)} kg <span class="rr-tip-pct">${pct}%</span></span></div>`;
                block += [...turno.maquinas.entries()]
                    .sort((a, b) => b[1].kg - a[1].kg)
                    .map(([maquinaKey, maquina]) =>
                        `<div class="rr-tip-maquina"><span>${TintoreriaUtils.escapeHtml(maquinaKey)}</span><span>${maquina.partidas.size} ptda${maquina.partidas.size === 1 ? '' : 's'} · ${TintoreriaUtils.formatNumber(maquina.kg)} kg</span></div>`
                    ).join('');
                return block;
            }).join('');

        return html;
    }

    function bindChartTooltips() {
        [
            { svgId: 'rr-weekly-chart', chart: 'ramas', mode: 'turnoMaquina' },
            { svgId: 'rr-embalaje-chart', chart: 'embalaje', mode: 'cliente' }
        ].forEach(({ svgId, chart, mode }) => {
            const svg = document.getElementById(svgId);
            const card = svg ? svg.closest('.rr-chart-card') : null;
            if (!svg || !card) return;

            const tip = document.createElement('div');
            tip.className = 'rr-chart-tooltip hidden';
            card.appendChild(tip);

            svg.addEventListener('mousemove', (event) => {
                const zone = event.target.closest('[data-bar]');
                const bucket = zone ? chartSeries[chart][Number(zone.getAttribute('data-bar'))] : null;
                if (!bucket) {
                    tip.classList.add('hidden');
                    return;
                }

                tip.innerHTML = chartTooltipContent(bucket, mode);
                tip.classList.remove('hidden');

                const cardRect = card.getBoundingClientRect();
                let x = event.clientX - cardRect.left + 14;
                let y = event.clientY - cardRect.top + 14;
                if (x + tip.offsetWidth > cardRect.width - 8) {
                    x = event.clientX - cardRect.left - tip.offsetWidth - 14;
                }
                x = Math.max(8, x);
                y = Math.min(y, cardRect.height - tip.offsetHeight - 8);
                tip.style.left = `${x}px`;
                tip.style.top = `${Math.max(8, y)}px`;
            });

            svg.addEventListener('mouseleave', () => tip.classList.add('hidden'));
        });
    }

    // ── tabla de procesos generales ──────────────────────────────────────────

    function buildProcessReport(records) {
        const days = getLast7DayKeys(7);
        const map = {};
        const recordsIndex = {};
        days.forEach(d => {
            map[d] = { plegado: 0, preparado: 0, abridora: 0, secado: 0, acabEspec: 0, embalaje: 0 };
            recordsIndex[d] = { plegado: [], preparado: [], abridora: [], secado: [], acabEspec: [], embalaje: [] };
        });

        records.forEach(record => {
            const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
            if (!kg) return;

            const plegadoEstado   = String(record.plegado_estado           || '').trim();
            const preparadoEstado = String(record.preparado_estado         || '').trim();
            const abridoraEstado  = String(record.abridora_estado          || '').trim();
            const secadoEstado    = String(record.secado_estado            || '').trim();
            const acabEspecEstado = String(record.acabado_especial_estado  || '').trim();
            const embalajeEstado  = String(record.embalaje_estado          || '').trim();

            if (plegadoEstado === 'OK') {
                const key = toDateKey(record.plegado_fecha);
                if (key && map[key]) { map[key].plegado += kg; recordsIndex[key].plegado.push(record); }
            }
            if (preparadoEstado === 'OK') {
                const key = toDateKey(TintoreriaUtils.lastPassValue(record.preparado_fin));
                if (key && map[key]) { map[key].preparado += kg; recordsIndex[key].preparado.push(record); }
            }
            if (abridoraEstado === 'OK') {
                const key = toDateKey(record.abridora_fin);
                if (key && map[key]) { map[key].abridora += kg; recordsIndex[key].abridora.push(record); }
            }
            if (secadoEstado === 'OK') {
                const key = toDateKey(record.secado_fin);
                if (key && map[key]) { map[key].secado += kg; recordsIndex[key].secado.push(record); }
            }
            if (acabEspecEstado === 'OK') {
                const key = toDateKey(record.acabado_especial_fecha);
                if (key && map[key]) { map[key].acabEspec += kg; recordsIndex[key].acabEspec.push(record); }
            }
            if (embalajeEstado === 'OK') {
                const key = toDateKey(record.embalaje_fecha);
                if (key && map[key]) { map[key].embalaje += kg; recordsIndex[key].embalaje.push(record); }
            }
        });

        return { rows: days.map(key => ({ key, ...map[key] })), recordsIndex };
    }

    function renderProcessTable(rows) {
        const tbody = document.getElementById('tbody-procesos');
        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="rr-no-data">Sin datos en los últimos 7 días.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td class="rr-fecha">${formatDateLabel(row.key)}</td>
                <td class="rr-value">${fmt(row.plegado, 'process', row.key, 'plegado')}</td>
                <td class="rr-value">${fmt(row.preparado, 'process', row.key, 'preparado')}</td>
                <td class="rr-value">${fmt(row.abridora, 'process', row.key, 'abridora')}</td>
                <td class="rr-value">${fmt(row.secado, 'process', row.key, 'secado')}</td>
                <td class="rr-value">${fmt(row.acabEspec, 'process', row.key, 'acabEspec')}</td>
                <td class="rr-total">${fmt(row.embalaje, 'process', row.key, 'embalaje')}</td>
            </tr>
        `).join('');
    }

    // ── embalaje OK: eventos para su gráfico ─────────────────────────────────

    function buildEmbalajeEvents(records) {
        const events = [];
        records.forEach(record => {
            const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
            if (!kg) return;
            if (String(record.embalaje_estado || '').trim() !== 'OK') return;
            const d = toBusinessDate(record.embalaje_fecha);
            if (d) {
                events.push({
                    date: d,
                    kg,
                    opPartida: TintoreriaUtils.formatOpPartida(record.op_tela, record.partida),
                    cliente: String(record.cliente || '').trim()
                });
            }
        });
        return events;
    }

    // ── modal de detalle (drill-down por celda) ─────────────────────────────

    // Campos de turno/máquina que respaldan cada columna del reporte, para
    // mostrarlos en el modal de detalle. Los campos de rama acumulan pases
    // separados por coma, por eso se toma el último pase (igual que el fin
    // usado para fechar el registro). Embalaje no registra turno.
    const DETAIL_TURNO_FIELDS = {
        daily: {
            termofijado: { turno: 'rama_crudo_turno',  maquina: 'rama_crudo_maquina' },
            humectado:   { turno: 'rama_crudo_turno',  maquina: 'rama_crudo_maquina' },
            secado:      { turno: 'rama_tenido_turno', maquina: 'rama_tenido_maquina' },
            acabado:     { turno: 'rama_tenido_turno', maquina: 'rama_tenido_maquina' },
            reproceso:   { turno: 'rama_tenido_turno', maquina: 'rama_tenido_maquina' }
        },
        process: {
            plegado:   { turno: 'plegado_turno' },
            preparado: { turno: 'preparado_turno' },
            abridora:  { turno: 'abridora_turno' },
            secado:    { turno: 'secado_turno' },
            acabEspec: { turno: 'acabado_especial_turno' }
        }
    };

    function toDetailItem(record, source, field) {
        const cols = (DETAIL_TURNO_FIELDS[source] || {})[field] || {};
        return {
            record,
            turno: cols.turno ? TintoreriaUtils.lastPassValue(record[cols.turno]) : '',
            maquina: cols.maquina ? TintoreriaUtils.lastPassValue(record[cols.maquina]) : ''
        };
    }

    function getCellDetailItems(source, day, field) {
        if (source === 'daily') {
            const bucket = dailyRecordsIndex[day];
            if (!bucket) return [];
            // En "total" cada registro conserva el turno/máquina del proceso
            // por el que sumó ese día.
            const fields = field === 'total'
                ? ['termofijado', 'humectado', 'secado', 'acabado', 'reproceso']
                : [field];
            return fields.reduce((acc, f) =>
                acc.concat((bucket[f] || []).map(r => toDetailItem(r, source, f))), []);
        }
        if (source === 'process') {
            const bucket = processRecordsIndex[day];
            return ((bucket && bucket[field]) || []).map(r => toDetailItem(r, source, field));
        }
        return [];
    }

    function getDetailModalElements() {
        return {
            modal: document.getElementById('rr-detail-modal'),
            title: document.getElementById('rr-detail-title'),
            pills: document.getElementById('rr-detail-pills'),
            headRow: document.getElementById('rr-detail-head-row'),
            tbody: document.getElementById('rr-detail-tbody'),
            close: document.getElementById('rr-detail-close')
        };
    }

    // Pills de resumen en la cabecera del modal: #partidas (OP-PTDA únicas) y
    // kg sumados por máquina+turno (tabla de ramas) o por turno (procesos).
    function renderDetailPills(items, showTurno, showMaquina) {
        if ((!showTurno && !showMaquina) || !items.length) return '';

        const groups = new Map();
        items.forEach(item => {
            const parts = [];
            if (showMaquina) parts.push(item.maquina || '');
            if (showTurno) parts.push(item.turno || '');
            const key = parts.join('|');
            if (!groups.has(key)) groups.set(key, { parts, kg: 0, partidas: new Set() });
            const group = groups.get(key);
            group.kg += TintoreriaUtils.toNumber(item.record.peso_kg_crudo);
            group.partidas.add(TintoreriaUtils.formatOpPartida(item.record.op_tela, item.record.partida));
        });

        const totalKg = [...groups.values()].reduce((sum, group) => sum + group.kg, 0);

        return [...groups.values()]
            .sort((a, b) => a.parts.join('|').localeCompare(b.parts.join('|'), 'es', { numeric: true }))
            .map(group => {
                const label = group.parts.map(part => part || '—').join(' · ');
                const count = group.partidas.size;
                const pct = totalKg > 0 ? Math.round((group.kg / totalKg) * 100) : 0;
                return `<span class="rr-detail-pill"><strong>${TintoreriaUtils.escapeHtml(label)}</strong><span>${count} ptda${count === 1 ? '' : 's'} · ${TintoreriaUtils.formatNumber(group.kg)} kg</span><span class="rr-detail-pill-pct">${pct}%</span></span>`;
            }).join('');
    }

    function renderDetailHead(showTurno, showMaquina) {
        return `
            ${showTurno ? '<th style="width: 60px;">turno</th>' : ''}
            ${showMaquina ? '<th style="width: 90px;">maquina</th>' : ''}
            <th style="width: 70px;">cliente</th>
            <th style="width: 70px;">tipo_tela</th>
            <th style="width: 120px;">OP-PTDA</th>
            <th style="width: 190px;">color</th>
            <th style="min-width: 150px;">articulo</th>
            <th style="width: 88px;">kg(crudo)</th>
            <th style="width: 108px;">#rollos/cntd</th>
        `;
    }

    // Mismo botón/ícono que el "ver información de calidad" del subtab AUDITADAS
    // en Calidad (calidad.js renderInfoButtonMarkup), para abrir el modal idéntico.
    function renderQualityEyeButton(record) {
        return `
            <button
                class="ghost-button icon-only-button quality-info-button"
                type="button"
                data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}"
                data-action="rr-show-quality-info"
                title="Ver información de calidad"
                aria-label="Ver información de calidad"
            >
                <i class="ph ph-eye"></i>
            </button>
        `;
    }

    function renderDetailRows(items, showQualityEye, showTurno, showMaquina) {
        const colCount = 7 + (showTurno ? 1 : 0) + (showMaquina ? 1 : 0);
        if (!items.length) {
            return `<tr><td colspan="${colCount}" class="rr-no-data">Sin registros.</td></tr>`;
        }

        // Agrupadas por OP-PTDA para que la pintura de filas (igual que en las
        // vistas principales) resalte cada partida como bloque continuo.
        const sorted = [...items].sort((a, b) => {
            const opA = TintoreriaUtils.formatOpPartida(a.record.op_tela, a.record.partida);
            const opB = TintoreriaUtils.formatOpPartida(b.record.op_tela, b.record.partida);
            return opA.localeCompare(opB, 'es', { numeric: true });
        });

        let previousOp = null;
        let groupIndex = -1;

        return sorted.map(item => {
            const record = item.record;
            const opPartida = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
            if (opPartida !== previousOp) {
                groupIndex += 1;
                previousOp = opPartida;
            }
            const groupClass = groupIndex % 2 === 0 ? 'op-group-plain' : 'op-group-painted';

            return `
            <tr class="${groupClass}">
                ${showTurno ? `<td style="text-align:center">${item.turno ? TintoreriaUtils.escapeHtml(item.turno) : '<span class="rr-empty">—</span>'}</td>` : ''}
                ${showMaquina ? `<td style="text-align:center">${item.maquina ? TintoreriaUtils.escapeHtml(item.maquina) : '<span class="rr-empty">—</span>'}</td>` : ''}
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente || '')}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                <td>
                    <div class="quality-op-cell">
                        ${showQualityEye ? renderQualityEyeButton(record) : ''}
                        <strong class="cell-text">${TintoreriaUtils.escapeHtml(opPartida)}</strong>
                    </div>
                </td>
                <td class="rr-detail-color-cell">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo || '')}">${TintoreriaUtils.escapeHtml(record.articulo || '')}</span></td>
                <td style="text-align:right">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatNumber(record.peso_kg_crudo))}</td>
                <td style="text-align:center">${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</td>
            </tr>
        `;
        }).join('');
    }

    function openDetailModal(titleText, items, { showQualityEye, showTurno, showMaquina }) {
        const { modal, title, pills, headRow, tbody } = getDetailModalElements();
        if (!modal) return;
        if (title) title.textContent = titleText;
        if (pills) pills.innerHTML = renderDetailPills(items, showTurno, showMaquina);
        if (headRow) headRow.innerHTML = renderDetailHead(showTurno, showMaquina);
        if (tbody) tbody.innerHTML = renderDetailRows(items, showQualityEye, showTurno, showMaquina);
        modal.classList.remove('hidden');
    }

    function closeDetailModal() {
        const { modal } = getDetailModalElements();
        if (modal) modal.classList.add('hidden');
    }

    function handleCellClick(event) {
        const button = event.target.closest('.rr-cell-btn');
        if (!button) return;
        const { source, day, field } = button.dataset;
        const items = getCellDetailItems(source, day, field);
        const label = FIELD_LABELS[field] || field;
        const showQualityEye = source === 'process' && field === 'embalaje';
        const showTurno = source === 'daily' || (source === 'process' && field !== 'embalaje');
        const showMaquina = source === 'daily';
        openDetailModal(`${label} · ${formatDateLabel(day)}`, items, { showQualityEye, showTurno, showMaquina });
    }

    function handleDetailQualityEyeClick(event) {
        const button = event.target.closest('[data-action="rr-show-quality-info"]');
        if (!button) return;
        const record = TintoreriaApp.findRecord(button.dataset.recordId);
        if (record && window.TintoreriaCalidad && typeof window.TintoreriaCalidad.openInfoModal === 'function') {
            window.TintoreriaCalidad.openInfoModal(record);
        }
    }

    function bindDetailModal() {
        document.getElementById('tbody-reporte-ramas')?.addEventListener('click', handleCellClick);
        document.getElementById('tbody-procesos')?.addEventListener('click', handleCellClick);
        document.getElementById('rr-detail-tbody')?.addEventListener('click', handleDetailQualityEyeClick);

        const { modal, close } = getDetailModalElements();
        if (close) close.addEventListener('click', closeDetailModal);
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeDetailModal();
            });
        }
        document.addEventListener('keydown', (event) => {
            const { modal: currentModal } = getDetailModalElements();
            if (event.key === 'Escape' && currentModal && !currentModal.classList.contains('hidden')) {
                closeDetailModal();
            }
        });
    }

    // ── dropdown flotante de período por gráfico ─────────────────────────────

    const PERIOD_LABELS = { dia: 'Día', sem: 'Sem', mes: 'Mes' };

    function closeChartMenus(except) {
        document.querySelectorAll('.rr-chart-menu-list').forEach(list => {
            if (list !== except) list.classList.add('hidden');
        });
    }

    function bindChartMenus() {
        document.querySelectorAll('.rr-chart-menu').forEach(menu => {
            const chart = menu.dataset.chart;
            const button = menu.querySelector('.rr-chart-menu-btn');
            const list = menu.querySelector('.rr-chart-menu-list');
            if (!chart || !button || !list) return;

            function syncMenu() {
                button.textContent = PERIOD_LABELS[chartPeriods[chart]];
                list.querySelectorAll('.rr-chart-menu-option').forEach(option => {
                    option.classList.toggle('active', option.dataset.period === chartPeriods[chart]);
                });
            }
            syncMenu();

            button.addEventListener('click', (event) => {
                event.stopPropagation();
                closeChartMenus(list);
                list.classList.toggle('hidden');
            });

            list.querySelectorAll('.rr-chart-menu-option').forEach(option => {
                option.addEventListener('click', (event) => {
                    event.stopPropagation();
                    chartPeriods[chart] = option.dataset.period;
                    syncMenu();
                    list.classList.add('hidden');
                    if (chart === 'ramas') renderRamasChart();
                    else renderEmbalajeChart();
                });
            });
        });

        document.addEventListener('click', () => closeChartMenus());
    }

    // ── render principal ─────────────────────────────────────────────────────

    function render(records) {
        const daily = buildDailyReport(records);
        dailyRecordsIndex = daily.recordsIndex;
        renderTable(daily.rows);
        ramasChartEvents = daily.chartEvents;
        renderRamasChart();

        const process = buildProcessReport(records);
        processRecordsIndex = process.recordsIndex;
        renderProcessTable(process.rows);

        embalajeChartEvents = buildEmbalajeEvents(records);
        renderEmbalajeChart();
    }

    TintoreriaApp.registerView('reporte-ramas', {
        init() {
            bindDetailModal();
            bindChartMenus();
            bindChartTooltips();
        },
        render
    });
})();
