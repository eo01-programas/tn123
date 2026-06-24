(() => {
    // ── helpers de fecha diaria ──────────────────────────────────────────────

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    // Corte de jornada: lo registrado antes de las 7am cuenta como el día anterior
    // (mismo criterio que las vistas de proceso, corte único porque este reporte
    // no incluye datos de Calidad).
    function toBusinessDate(value) {
        const d = TintoreriaUtils.parseDateish(value);
        if (!d) return null;
        if (d.getHours() < 7) {
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

    function accumulateRecord(record, dayMap, weekMap) {
        const kg = TintoreriaUtils.toNumber(record.peso_kg_crudo);
        if (!kg) return;

        const ruta              = String(record.ruta              || '').trim();
        const ramaCrudoEstado   = String(record.rama_crudo_estado  || '').trim();
        const ramaTenidoEstado  = String(record.rama_tenido_estado || '').trim();
        const ramaTenidoProceso = String(record.rama_tenido_proceso || '').trim().toUpperCase();

        function addToDay(dateValue, field) {
            const key = toDateKey(dateValue);
            if (key && dayMap[key]) dayMap[key][field] += kg;
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
        days.forEach(d => { dayMap[d] = { termofijado: 0, humectado: 0, secado: 0, acabado: 0, reproceso: 0 }; });

        const weeks = getLast5Weeks();
        const weekMap = {};
        weeks.forEach(w => { weekMap[w.key] = 0; });

        records.forEach(r => accumulateRecord(r, dayMap, weekMap));

        const todayKey = dateKey(new Date());
        const rows = days
            .map(key => {
                const row = dayMap[key];
                const total = row.termofijado + row.humectado + row.secado + row.acabado + row.reproceso;
                return { key, ...row, total };
            })
            .filter(row => row.total > 0 || row.key === todayKey);

        return { rows, weekMap, weeks };
    }

    function fmt(value) {
        if (!value) return '<span class="rr-empty">—</span>';
        return `<strong>${TintoreriaUtils.formatNumber(value)}</strong><span class="rr-unit"> kg</span>`;
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
                <td class="rr-value">${fmt(row.termofijado)}</td>
                <td class="rr-value">${fmt(row.humectado)}</td>
                <td class="rr-value">${fmt(row.secado)}</td>
                <td class="rr-value">${fmt(row.acabado)}</td>
                <td class="rr-value">${fmt(row.reproceso)}</td>
                <td class="rr-total">${fmt(row.total)}</td>
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
        days.forEach(d => {
            map[d] = { plegado: 0, preparado: 0, abridora: 0, secado: 0, acabEspec: 0, embalaje: 0 };
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
                if (key && map[key]) map[key].plegado += kg;
            }
            if (preparadoEstado === 'OK') {
                const key = toDateKey(record.preparado_fin);
                if (key && map[key]) map[key].preparado += kg;
            }
            if (abridoraEstado === 'OK') {
                const key = toDateKey(record.abridora_fin);
                if (key && map[key]) map[key].abridora += kg;
            }
            if (secadoEstado === 'OK') {
                const key = toDateKey(record.secado_fin);
                if (key && map[key]) map[key].secado += kg;
            }
            if (acabEspecEstado === 'OK') {
                const key = toDateKey(record.acabado_especial_fecha);
                if (key && map[key]) map[key].acabEspec += kg;
            }
            if (embalajeEstado === 'OK') {
                const key = toDateKey(record.embalaje_fecha);
                if (key && map[key]) map[key].embalaje += kg;
            }
        });

        const todayKey = dateKey(new Date());
        return days
            .map(key => ({ key, ...map[key] }))
            .filter(row => {
                const total = row.plegado + row.preparado + row.abridora + row.secado + row.acabEspec + row.embalaje;
                return total > 0 || row.key === todayKey;
            });
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
                <td class="rr-value">${fmt(row.plegado)}</td>
                <td class="rr-value">${fmt(row.preparado)}</td>
                <td class="rr-value">${fmt(row.abridora)}</td>
                <td class="rr-value">${fmt(row.secado)}</td>
                <td class="rr-value">${fmt(row.acabEspec)}</td>
                <td class="rr-total">${fmt(row.embalaje)}</td>
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

        const dayKeys = getLast7DayKeys();
        const kgByDay = {};
        rows.forEach(r => { kgByDay[r.key] = r.kg; });
        const chartData = dayKeys.map(key => ({ key, kg: kgByDay[key] || 0 })).filter(d => d.kg > 0);

        const maxVal = Math.max(...chartData.map(d => d.kg), 0);
        const yMax = niceMax(maxVal) || 1000;
        const Y_TICKS = 4;

        const barSlot = cW / chartData.length;
        const barW = barSlot * 0.58;
        const barOffset = (barSlot - barW) / 2;
        const todayKey = dateKey(new Date());

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

    // ── render principal ─────────────────────────────────────────────────────

    function render(records) {
        const { rows, weekMap, weeks } = buildDailyReport(records);
        renderTable(rows);
        renderWeeklyChart(weeks, weekMap);
        renderProcessTable(buildProcessReport(records));
        renderEmbalajeChart(buildEmbalajeReport(records));
    }

    TintoreriaApp.registerView('reporte-ramas', {
        init() {},
        render
    });
})();
