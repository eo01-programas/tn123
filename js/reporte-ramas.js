(() => {
    // ── helpers de fecha diaria ──────────────────────────────────────────────

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function toDateKey(value) {
        const d = TintoreriaUtils.parseDateish(value);
        return d ? dateKey(d) : null;
    }

    function formatDateLabel(isoKey) {
        const [y, m, d] = isoKey.split('-').map(Number);
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const days   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const dow = new Date(y, m - 1, d).getDay();
        return `${days[dow]} ${String(d).padStart(2, '0')}/${months[m - 1]}`;
    }

    function getLast7DayKeys() {
        const today = new Date();
        const days = [];
        for (let i = 6; i >= 0; i--) {
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
            const d = TintoreriaUtils.parseDateish(dateValue);
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
        const days = getLast7DayKeys();
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

        const VW = 420, VH = 230;
        const pad = { top: 28, right: 18, bottom: 44, left: 56 };
        const cW = VW - pad.left - pad.right;
        const cH = VH - pad.top - pad.bottom;

        const weekData = weeks.map(w => ({ ...w, total: weekMap[w.key] || 0 }));
        const maxVal = Math.max(...weekData.map(w => w.total));
        const yMax = niceMax(maxVal);
        const Y_TICKS = 4;

        const barSlot = cW / weekData.length;
        const barW = barSlot * 0.52;
        const barOffset = (barSlot - barW) / 2;

        let html = '';

        // grid lines + Y labels
        for (let i = 0; i <= Y_TICKS; i++) {
            const val = (yMax / Y_TICKS) * i;
            const y = pad.top + cH - (val / yMax) * cH;
            html += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${VW - pad.right}" y2="${y.toFixed(1)}" stroke="#dde8d9" stroke-width="1"/>`;
            const lbl = val >= 1000 ? `${Math.round(val / 1000)}k` : `${Math.round(val)}`;
            html += `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#667466" font-size="10">${lbl}</text>`;
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
                html += `<text x="${xCenter.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" fill="#2f3b2f" font-size="9.5" font-weight="600">${shortKg(week.total)}</text>`;
            } else {
                html += `<rect x="${bx.toFixed(1)}" y="${(pad.top + cH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2" fill="#dde8d9" rx="1"/>`;
            }

            const lx = xCenter.toFixed(1);
            const ly = (pad.top + cH + 15).toFixed(1);
            const fw = week.isCurrent ? '700' : '400';
            const fc = week.isCurrent ? '#2f3b2f' : '#667466';
            html += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${fc}" font-size="11" font-weight="${fw}">${week.label}</text>`;
        });

        // ejes
        html += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;
        html += `<line x1="${pad.left}" y1="${(pad.top + cH).toFixed(1)}" x2="${VW - pad.right}" y2="${(pad.top + cH).toFixed(1)}" stroke="#a9bf9a" stroke-width="1.5"/>`;

        // etiqueta Y
        html += `<text x="10" y="${(pad.top + cH / 2).toFixed(1)}" text-anchor="middle" fill="#667466" font-size="9.5" transform="rotate(-90,10,${(pad.top + cH / 2).toFixed(1)})">kg</text>`;

        svg.innerHTML = html;
    }

    // ── render principal ─────────────────────────────────────────────────────

    function render(records) {
        const { rows, weekMap, weeks } = buildDailyReport(records);
        renderTable(rows);
        renderWeeklyChart(weeks, weekMap);
    }

    TintoreriaApp.registerView('reporte-ramas', {
        init() {},
        render
    });
})();
