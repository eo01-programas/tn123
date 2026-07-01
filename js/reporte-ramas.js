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

    function formatDateLabel(isoKey) {
        const [y, m, d] = isoKey.split('-').map(Number);
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const days   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dow = new Date(y, m - 1, d).getDay();
        return `${days[dow]} ${String(d).padStart(2, '0')}/${months[m - 1]}`;
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

    function accumulateRecord(record, dayMap, weekMap, dayRecordsIndex) {
        const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
        if (!kg) return;

        const ruta              = String(record.ruta              || '').trim();
        const ramaCrudoEstado   = String(record.rama_crudo_estado  || '').trim();
        const ramaTenidoEstado  = String(record.rama_tenido_estado || '').trim();
        const ramaTenidoProceso = String(record.rama_tenido_proceso || '').trim().toUpperCase();

        function addToDay(dateValue, field) {
            const key = toDateKey(dateValue);
            if (key && dayMap[key]) {
                dayMap[key][field] += kg;
                if (dayRecordsIndex[key]) dayRecordsIndex[key][field].push(record);
            }
        }

        function addToWeek(dateValue) {
            const d = toBusinessDate(dateValue);
            if (!d) return;
            const { key } = isoWeekKey(d);
            if (weekMap[key] !== undefined) weekMap[key] += kg;
        }

        if (ramaCrudoEstado === 'OK' && ruta === 'Termofijado') {
            addToDay(record.rama_crudo_fin, 'termofijado');
            addToWeek(record.rama_crudo_fin);
        }
        if (ramaCrudoEstado === 'OK' && ruta === 'Humectado') {
            addToDay(record.rama_crudo_fin, 'humectado');
            addToWeek(record.rama_crudo_fin);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'SECADO') {
            addToDay(record.rama_tenido_fin, 'secado');
            addToWeek(record.rama_tenido_fin);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'ACABADO') {
            addToDay(record.rama_tenido_fin, 'acabado');
            addToWeek(record.rama_tenido_fin);
        }
        if (ramaTenidoEstado === 'OK' && ramaTenidoProceso === 'REPROCESO') {
            addToDay(record.rama_tenido_fin, 'reproceso');
            addToWeek(record.rama_tenido_fin);
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

        const weeks = getLast5Weeks();
        const weekMap = {};
        weeks.forEach(w => { weekMap[w.key] = 0; });

        records.forEach(r => accumulateRecord(r, dayMap, weekMap, dayRecordsIndex));

        const rows = days
            .map(key => {
                const row = dayMap[key];
                const total = row.termofijado + row.humectado + row.secado + row.acabado + row.reproceso;
                return { key, ...row, total };
            });

        return { rows, weekMap, weeks, recordsIndex: dayRecordsIndex };
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

    // ── gráfico semanal ──────────────────────────────────────────────────────

    function niceMax(val) {
        if (val <= 0) return 10000;
        const mag = Math.pow(10, Math.floor(Math.log10(val)));
        return Math.ceil(val / mag) * mag;
    }

    function shortKg(val) {
        if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
        return `${Math.round(val)}`;
    }

    function renderWeeklyChart(weeks, weekMap) {
        const svg = document.getElementById('rr-weekly-chart');
        if (!svg) return;

        const VW = svg.clientWidth || 420;
        const VH = svg.clientHeight || 230;
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const pad = { top: 14, right: 10, bottom: 44, left: 64 };
        const cW = VW - pad.left - pad.right;
        const cH = VH - pad.top - pad.bottom;

        const weekData = weeks.map(w => ({ ...w, total: weekMap[w.key] || 0 }));
        const maxVal = Math.max(...weekData.map(w => w.total));
        const yMax = niceMax(maxVal);
        const Y_TICKS = 4;

        const barSlot = cW / weekData.length;
        const barW = barSlot * 0.58;
        const barOffset = (barSlot - barW) / 2;

        let html = '';

        // grid lines + Y labels
        for (let i = 0; i <= Y_TICKS; i++) {
            const val = (yMax / Y_TICKS) * i;
            const y = pad.top + cH - (val / yMax) * cH;
            html += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${VW - pad.right}" y2="${y.toFixed(1)}" stroke="#dde8d9" stroke-width="1"/>`;
            const lbl = val >= 1000 ? `${Math.round(val / 1000)}k` : `${Math.round(val)}`;
            html += `<text x="${pad.left - 7}" y="${(y + 5).toFixed(1)}" text-anchor="end" fill="#111" font-size="13" font-weight="700">${lbl}</text>`;
        }

        // barras + etiquetas X
        weekData.forEach((week, i) => {
            const bx = pad.left + i * barSlot + barOffset;
            const barH = week.total > 0 ? (week.total / yMax) * cH : 0;
            const by = pad.top + cH - barH;
            const fill = week.isCurrent ? '#4f8f62' : '#8fc4a0';
            const xCenter = bx + barW / 2;

            if (barH > 0) {
                html += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" rx="3"/>`;
                html += `<text x="${xCenter.toFixed(1)}" y="${(by - 6).toFixed(1)}" text-anchor="middle" fill="#111" font-size="13" font-weight="700">${shortKg(week.total)}</text>`;
            } else {
                html += `<rect x="${bx.toFixed(1)}" y="${(pad.top + cH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2" fill="#dde8d9" rx="1"/>`;
            }

            const lx = xCenter.toFixed(1);
            const ly = (pad.top + cH + 18).toFixed(1);
            const fc = week.isCurrent ? '#000' : '#333';
            html += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${fc}" font-size="15" font-weight="700">${week.label}</text>`;
        });

        // ejes
        html += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;
        html += `<line x1="${pad.left}" y1="${(pad.top + cH).toFixed(1)}" x2="${VW - pad.right}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;

        // etiqueta Y
        html += `<text x="13" y="${(pad.top + cH / 2).toFixed(1)}" text-anchor="middle" fill="#333" font-size="13" font-weight="700" transform="rotate(-90,13,${(pad.top + cH / 2).toFixed(1)})">kg</text>`;

        svg.innerHTML = html;
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
                const key = toDateKey(record.preparado_fin);
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

    // ── tabla embalaje OK por día ────────────────────────────────────────────

    function buildEmbalajeReport(records) {
        const days = getLast7DayKeys();
        const map = {};
        days.forEach(d => { map[d] = 0; });

        records.forEach(record => {
            const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
            if (!kg) return;
            if (String(record.embalaje_estado || '').trim() !== 'OK') return;
            const key = toDateKey(record.embalaje_fecha);
            if (key && map[key] !== undefined) map[key] += kg;
        });

        const todayKey = dateKey(new Date());
        return days
            .map(key => ({ key, kg: map[key] }))
            .filter(row => row.kg > 0 || row.key === todayKey);
    }

    function renderEmbalajeChart(rows) {
        const svg = document.getElementById('rr-embalaje-chart');
        if (!svg) return;

        const VW = svg.clientWidth || 420;
        const VH = svg.clientHeight || 200;
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const pad = { top: 14, right: 10, bottom: 54, left: 64 };
        const cW = VW - pad.left - pad.right;
        const cH = VH - pad.top - pad.bottom;

        const todayKey = dateKey(new Date());
        const dayKeys = getLast7DayKeys();
        const kgByDay = {};
        rows.forEach(r => { kgByDay[r.key] = r.kg; });
        // Días con datos + siempre el día actual (aunque reporte 0).
        const chartData = dayKeys
            .map(key => ({ key, kg: kgByDay[key] || 0 }))
            .filter(d => d.kg > 0 || d.key === todayKey);

        const maxVal = Math.max(...chartData.map(d => d.kg), 0);
        const yMax = niceMax(maxVal) || 1000;
        const Y_TICKS = 4;

        const barSlot = cW / chartData.length;
        const barW = barSlot * 0.58;
        const barOffset = (barSlot - barW) / 2;

        let html = '';

        for (let i = 0; i <= Y_TICKS; i++) {
            const val = (yMax / Y_TICKS) * i;
            const y = pad.top + cH - (val / yMax) * cH;
            html += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${VW - pad.right}" y2="${y.toFixed(1)}" stroke="#dde8d9" stroke-width="1"/>`;
            html += `<text x="${pad.left - 7}" y="${(y + 5).toFixed(1)}" text-anchor="end" fill="#111" font-size="13" font-weight="700">${shortKg(val)}</text>`;
        }

        chartData.forEach((day, i) => {
            const bx = pad.left + i * barSlot + barOffset;
            const barH = day.kg > 0 ? (day.kg / yMax) * cH : 0;
            const by = pad.top + cH - barH;
            const isCurrent = day.key === todayKey;
            const fill = isCurrent ? '#4f8f62' : '#8fc4a0';
            const xCenter = bx + barW / 2;

            if (barH > 0) {
                html += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" rx="3"/>`;
                html += `<text x="${xCenter.toFixed(1)}" y="${(by - 6).toFixed(1)}" text-anchor="middle" fill="#111" font-size="13" font-weight="700">${shortKg(day.kg)}</text>`;
            } else {
                html += `<rect x="${bx.toFixed(1)}" y="${(pad.top + cH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2" fill="#dde8d9" rx="1"/>`;
            }

            const parts = formatDateLabel(day.key).split(' ');
            const lx = xCenter.toFixed(1);
            const ly1 = (pad.top + cH + 17).toFixed(1);
            const ly2 = (pad.top + cH + 33).toFixed(1);
            const fc = isCurrent ? '#000' : '#333';
            html += `<text x="${lx}" y="${ly1}" text-anchor="middle" fill="${fc}" font-size="14" font-weight="700">${parts[0]}</text>`;
            html += `<text x="${lx}" y="${ly2}" text-anchor="middle" fill="${fc}" font-size="14" font-weight="700">${parts[1] || ''}</text>`;
        });

        html += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;
        html += `<line x1="${pad.left}" y1="${(pad.top + cH).toFixed(1)}" x2="${VW - pad.right}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;
        html += `<text x="13" y="${(pad.top + cH / 2).toFixed(1)}" text-anchor="middle" fill="#333" font-size="13" font-weight="700" transform="rotate(-90,13,${(pad.top + cH / 2).toFixed(1)})">kg</text>`;

        svg.innerHTML = html;
    }

    // ── modal de detalle (drill-down por celda) ─────────────────────────────

    function getCellRecords(source, day, field) {
        if (source === 'daily') {
            const bucket = dailyRecordsIndex[day];
            if (!bucket) return [];
            if (field === 'total') {
                return ['termofijado', 'humectado', 'secado', 'acabado', 'reproceso']
                    .reduce((acc, f) => acc.concat(bucket[f] || []), []);
            }
            return bucket[field] || [];
        }
        if (source === 'process') {
            const bucket = processRecordsIndex[day];
            return (bucket && bucket[field]) || [];
        }
        return [];
    }

    function getDetailModalElements() {
        return {
            modal: document.getElementById('rr-detail-modal'),
            title: document.getElementById('rr-detail-title'),
            tbody: document.getElementById('rr-detail-tbody'),
            close: document.getElementById('rr-detail-close')
        };
    }

    function renderDetailRows(records) {
        if (!records.length) {
            return '<tr><td colspan="7" class="rr-no-data">Sin registros.</td></tr>';
        }

        // Agrupadas por OP-PTDA para que la pintura de filas (igual que en las
        // vistas principales) resalte cada partida como bloque continuo.
        const sorted = [...records].sort((a, b) => {
            const opA = TintoreriaUtils.formatOpPartida(a.op_tela, a.partida);
            const opB = TintoreriaUtils.formatOpPartida(b.op_tela, b.partida);
            return opA.localeCompare(opB, 'es', { numeric: true });
        });

        let previousOp = null;
        let groupIndex = -1;

        return sorted.map(record => {
            const opPartida = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
            if (opPartida !== previousOp) {
                groupIndex += 1;
                previousOp = opPartida;
            }
            const groupClass = groupIndex % 2 === 0 ? 'op-group-plain' : 'op-group-painted';

            return `
            <tr class="${groupClass}">
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente || '')}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                <td><strong class="cell-text">${TintoreriaUtils.escapeHtml(opPartida)}</strong></td>
                <td class="rr-detail-color-cell">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo || '')}">${TintoreriaUtils.escapeHtml(record.articulo || '')}</span></td>
                <td style="text-align:right">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatNumber(record.peso_kg_crudo))}</td>
                <td style="text-align:center">${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</td>
            </tr>
        `;
        }).join('');
    }

    function openDetailModal(titleText, records) {
        const { modal, title, tbody } = getDetailModalElements();
        if (!modal) return;
        if (title) title.textContent = titleText;
        if (tbody) tbody.innerHTML = renderDetailRows(records);
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
        const records = getCellRecords(source, day, field);
        const label = FIELD_LABELS[field] || field;
        openDetailModal(`${label} · ${formatDateLabel(day)}`, records);
    }

    function bindDetailModal() {
        document.getElementById('tbody-reporte-ramas')?.addEventListener('click', handleCellClick);
        document.getElementById('tbody-procesos')?.addEventListener('click', handleCellClick);

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

    // ── render principal ─────────────────────────────────────────────────────

    function render(records) {
        const daily = buildDailyReport(records);
        dailyRecordsIndex = daily.recordsIndex;
        renderTable(daily.rows);
        renderWeeklyChart(daily.weeks, daily.weekMap);

        const process = buildProcessReport(records);
        processRecordsIndex = process.recordsIndex;
        renderProcessTable(process.rows);

        renderEmbalajeChart(buildEmbalajeReport(records));
    }

    TintoreriaApp.registerView('reporte-ramas', {
        init: bindDetailModal,
        render
    });
})();
