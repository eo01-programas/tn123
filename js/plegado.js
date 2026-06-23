(() => {
    let currentFilter = 'X PROG';
    const editingRouteRecordIds = new Set();
    const ROUTE_OPTIONS = ['', 'Termofijado', 'Humectado'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // X PROG (11): P | F_ing_crudo | cliente | OP-PTDA | color | articulo | kg | ruta | #dias | Turno | Status
    const PLEGADO_XPROG_WIDTHS = [34, 56, 90, 84, 115, 289, 58, 65, 78, 58, 76];
    // PROG  (13): F_ing_crudo | F_plegado | cliente | OP-PTDA | color | articulo | kg | ruta | #dias | Turno | Supervisor | Equipo | Status
    const PLEGADO_PROG_WIDTHS  = [56, 90, 90, 84, 84, 179, 58, 90, 101, 58, 90, 84, 45];

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
    }

    function normalizePlegadoState(record) {
        return String(record.plegado_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const ruta = normalizeRoute(record.ruta);
            const inRoute = ruta === 'Termofijado' || ruta === 'Humectado';
            return inRoute;
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            const sorted = TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizePlegadoState(record) === 'OK'),
                'plegado_p'
            ).sort((a, b) => {
                const dateA = TintoreriaUtils.parseDateish(a.plegado_fecha);
                const dateB = TintoreriaUtils.parseDateish(b.plegado_fecha);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                return timeB - timeA;
            });
            return TintoreriaProcessedWindow.filterToWindow('plegado', sorted, getProcessedDate);
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizePlegadoState(record) !== 'OK'),
            'plegado_p'
        ).sort((left, right) => {
            const leftDays = calculateElapsedDays(left && left.F_ing_crudo, null) ?? -1;
            const rightDays = calculateElapsedDays(right && right.F_ing_crudo, null) ?? -1;
            return rightDays - leftDays;
        });
    }

    function optionMarkup(selectedValue, options) {
        return options.map((optionValue) => {
            const label = optionValue || 'Selec';
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function getVisibleColumnCount() {
        return currentFilter === 'PROG' ? 13 : 11;
    }

    function updateColumnVisibility() {
        const pHeader = document.getElementById('th-plegado-p');
        const supervisorHeader = document.getElementById('th-plegado-supervisor');
        const equipoHeader = document.getElementById('th-plegado-equipo');
        const fechaHeader = document.getElementById('th-plegado-fecha');
        const plegadoTable = document.querySelector('table.plegado-table');
        if (pHeader) {
            pHeader.hidden = currentFilter === 'PROG';
        }
        if (supervisorHeader) {
            supervisorHeader.hidden = currentFilter !== 'PROG';
        }
        if (equipoHeader) {
            equipoHeader.hidden = currentFilter !== 'PROG';
        }
        if (fechaHeader) {
            fechaHeader.hidden = currentFilter !== 'PROG';
        }
        if (plegadoTable) {
            plegadoTable.classList.toggle('plegado-xprog', currentFilter !== 'PROG');
            plegadoTable.classList.toggle('plegado-prog', currentFilter === 'PROG');
        }
        const colgroup = document.getElementById('colgroup-plegado');
        if (colgroup) {
            const widths = currentFilter === 'PROG' ? PLEGADO_PROG_WIDTHS : PLEGADO_XPROG_WIDTHS;
            colgroup.innerHTML = widths.map(w => `<col style="width:${w}px">`).join('');
        }
    }

    function normalizeRoute(value) {
        const normalized = String(value === undefined || value === null ? '' : value)
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return '';
        }

        if (normalized.toUpperCase() === 'TERMOFICADO') {
            return 'Termofijado';
        }

        return normalized;
    }

    function renderRouteMarkup(record) {
        const normalizedRoute = normalizeRoute(record.ruta);
        const recordId = TintoreriaUtils.escapeHtml(record.id_registro);

        if (editingRouteRecordIds.has(record.id_registro)) {
            return `
                <select class="table-select route-inline-select" data-record-id="${recordId}" data-field="ruta" data-inline-edit="ruta" autofocus>
                    ${optionMarkup(normalizedRoute, ROUTE_OPTIONS)}
                </select>
            `;
        }

        const routeLabel = normalizedRoute || 'Selec';
        let routeClass = 'route-empty';
        if (normalizedRoute) {
            const lowerRoute = normalizedRoute.toLowerCase();
            if (lowerRoute === 'termofijado') {
                routeClass = 'route-termofijado';
            } else if (lowerRoute === 'humectado') {
                routeClass = 'route-humectado';
            } else if (lowerRoute === 'directo') {
                routeClass = 'route-directo';
            } else {
                routeClass = 'route-filled';
            }
        }

        return `
            <span
                class="status-chip ${routeClass} route-readonly-chip"
                data-record-id="${recordId}"
                data-action="edit-route"
                title="Doble clic para cambiar ruta"
            >
                ${TintoreriaUtils.escapeHtml(routeLabel)}
            </span>
        `;
    }

    function calculateElapsedDays(startValue, endValue) {
        const startDate = TintoreriaUtils.parseDateish(startValue);
        const endDate = TintoreriaUtils.parseDateish(endValue) || new Date();
        if (!startDate || !endDate) {
            return null;
        }

        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const diffMs = Math.max(0, endDay.getTime() - startDay.getTime());
        return Math.round(diffMs / 86400000);
    }

    function renderElapsedDaysMarkup(record) {
        if (currentFilter === 'PROG' && !TintoreriaUtils.parseDateish(record.plegado_fecha)) {
            return '<span class="process-pill process-pill-muted">--</span>';
        }

        const endValue = currentFilter === 'PROG' ? record.plegado_fecha : null;
        const elapsedDays = calculateElapsedDays(record.F_ing_crudo, endValue);
        if (elapsedDays === null) {
            return '<span class="process-pill process-pill-muted">--</span>';
        }

        const pillClass = elapsedDays > 7 ? 'process-pill-danger' : 'process-pill-info';
        const dayLabel = `${elapsedDays} dia${elapsedDays === 1 ? '' : 's'}`;
        return `<span class="process-pill ${pillClass}">${TintoreriaUtils.escapeHtml(dayLabel)}</span>`;
    }

    function renderStatusMarkup(record, readOnly = false) {
        const selectedValue = normalizePlegadoState(record);
        const statusOptions = PLEGADO_ESTADO_OPTIONS.map((optionValue) => {
            const label = optionValue === 'X PROG' ? 'X PROCESAR' : optionValue;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');

        const selectAttrs = readOnly
            ? 'tabindex="-1" style="pointer-events:none; appearance:none; -webkit-appearance:none;"'
            : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_estado"`;

        return `
            <select class="table-select" ${selectAttrs}>
                ${statusOptions}
            </select>
        `;
    }

    function getAdjustedPlegadoDate(rawValue) {
        const date = TintoreriaUtils.parseDateish(rawValue);
        if (!date) return null;
        if (date.getHours() < 7) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, date.getHours(), date.getMinutes(), date.getSeconds());
        }
        return date;
    }

    function getProcessedDate(record) {
        return getAdjustedPlegadoDate(record && record.plegado_fecha);
    }

    function renderPlegadoDateMarkup(record) {
        const adjustedDate = getAdjustedPlegadoDate(record.plegado_fecha);
        const dateLabel = TintoreriaUtils.formatDateDayMonth(adjustedDate);
        const fullLabel = TintoreriaUtils.formatProcessDateTimeLabel(record.plegado_fecha);
        const filterDate = TintoreriaUtils.formatDateForUi(adjustedDate) || 'S/Fecha';

        const pill = dateLabel
            ? `<span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(fullLabel || '')}">${TintoreriaUtils.escapeHtml(dateLabel)}</span>`
            : `<span class="process-pill process-pill-muted" title="Sin fecha">S/Fecha</span>`;

        return `<td data-f-plegado="${TintoreriaUtils.escapeHtml(filterDate)}">${pill}</td>`;
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizePlegadoState(record) !== 'OK');
        const progRecords = eligible.filter((record) => normalizePlegadoState(record) === 'OK');
        const progWindowed = TintoreriaProcessedWindow.filterToWindow('plegado', progRecords, getProcessedDate);

        document.getElementById('count-plegado-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-plegado-prog').textContent = `${new Set(progWindowed.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-plegado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-plegado-prog').textContent = TintoreriaUtils.formatSubtabSummary(progWindowed);
    }

    function getVisibleRecordsFromTable() {
        const tbody = document.getElementById('tbody-plegado');
        if (!(tbody instanceof HTMLTableSectionElement)) {
            return [];
        }

        return Array.from(tbody.rows)
            .filter((row) => (
                row instanceof HTMLTableRowElement &&
                !row.hidden &&
                row.style.display !== 'none' &&
                !row.classList.contains('empty-state') &&
                !row.classList.contains('client-filter-empty-state') &&
                !row.classList.contains('op-search-empty-state')
            ))
            .map((row) => {
                const recordId = String(
                    row.dataset.recordRowId ||
                    row.querySelector('[data-record-id]')?.dataset.recordId ||
                    ''
                ).trim();

                return recordId ? TintoreriaApp.findRecord(recordId) : null;
            })
            .filter(Boolean);
    }

    function syncVisibleSubtabSummary() {
        const isProg = currentFilter === 'PROG';
        const countNode = document.getElementById(isProg ? 'count-plegado-prog' : 'count-plegado-xprog');
        const summaryNode = document.getElementById(isProg ? 'summary-plegado-prog' : 'summary-plegado-xprog');
        if (!countNode || !summaryNode) {
            return;
        }

        const visibleRecords = getVisibleRecordsFromTable();
        const uniquePartidas = new Set(
            visibleRecords.map((record) => TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))
        );

        countNode.textContent = `${uniquePartidas.size} ptds`;
        summaryNode.textContent = TintoreriaUtils.formatSubtabSummary(visibleRecords);
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-plegado');
        if (!tbody) {
            return;
        }

        const readOnly = currentFilter === 'PROG';

        updateColumnVisibility();
        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'plegado');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="${getVisibleColumnCount()}">No hay filas para este subtab.</td>
                </tr>
            `;
            TintoreriaApp.refreshViewDecorations('plegado');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.plegado_p) ? ' class="urgent-row"' : ''}>
                ${currentFilter !== 'PROG' ? `<td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.plegado_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_p">
                </td>` : ''}
                <td data-f-ing-crudo="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}">
                    <span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.F_ing_crudo))}</span>
                </td>
                ${currentFilter === 'PROG' ? renderPlegadoDateMarkup(record) : ''}
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>${renderRouteMarkup(record)}</td>
                <td>${renderElapsedDaysMarkup(record)}</td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none; appearance:none; -webkit-appearance:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_turno"`}>
                        ${optionMarkup(record.plegado_turno || '', PLEGADO_TURNO_OPTIONS)}
                    </select>
                </td>
                ${currentFilter === 'PROG' ? `
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.plegado_supervisor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_supervisor"${readOnly ? ' readonly' : ''}>
                </td>
                <td>
                    <input class="table-input mono" type="text" value="${TintoreriaUtils.escapeHtml(record.plegado_equipo || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_equipo"${readOnly ? ' readonly' : ''}>
                </td>` : ''}
                <td>${renderStatusMarkup(record, readOnly)}</td>
            </tr>
        `).join('');
        TintoreriaApp.refreshViewDecorations('plegado');
    }

    async function handlePlegadoChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        if (currentFilter === 'PROG') {
            return;
        }

        const recordId = target.dataset.recordId;
        const field = target.dataset.field;
        if (!recordId || !field) {
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(recordId);
        if (!currentRecord) {
            return;
        }

        let nextValue = target.value;
        const changes = {};

        if (field === 'plegado_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'ruta') {
            nextValue = normalizeRoute(nextValue);
            editingRouteRecordIds.delete(recordId);
            changes.ruta = nextValue;
        }

        if (field === 'plegado_equipo') {
            nextValue = TintoreriaUtils.sanitizePlegadoEquipo(nextValue);
            if (target.value && !TintoreriaUtils.isValidPlegadoEquipo(nextValue)) {
                target.value = currentRecord.plegado_equipo || '';
                TintoreriaApp.showToast('plegado_equipo solo admite letras y un guion, sin espacios.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'plegado_supervisor') {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
            if (nextValue && !TintoreriaUtils.isValidPersonName(nextValue)) {
                target.value = currentRecord.plegado_supervisor || '';
                TintoreriaApp.showToast('Solo se admiten letras y una separacion maxima entre 2 palabras.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'plegado_estado') {
            if (nextValue === 'OK') {
                const turnoValue = String(currentRecord.plegado_turno || '').trim();
                const equipoValue = String(currentRecord.plegado_equipo || '').trim();

                if (!turnoValue || !equipoValue) {
                    target.value = normalizePlegadoState(currentRecord);
                    TintoreriaApp.showToast('Para marcar OK, las columnas Turno y Equipo deben tener datos.', 'error', 'Datos incompletos');
                    return;
                }

                const confirmed = await TintoreriaApp.confirmAction({
                    title: 'Confirmar plegado',
                    message: `Esta seguro que esta OP-Partida ya se Plego? ${currentRecord.op_tela}-${currentRecord.partida}`
                });

                if (!confirmed) {
                    target.value = normalizePlegadoState(currentRecord);
                    return;
                }

                changes.plegado_fecha = TintoreriaUtils.formatProcessDateTime(new Date());
            } else {
                changes.plegado_fecha = '';
            }
        }

        if (String(currentRecord[field] || '') === String(nextValue || '') && !Object.keys(changes).length) {
            target.value = nextValue;
            return;
        }

        target.value = nextValue;
        changes[field] = nextValue;

        try {
            await TintoreriaApp.saveRecordChanges(recordId, changes, { silent: true });
            if (field === 'plegado_estado' && nextValue === 'OK') {
                TintoreriaApp.showToast('La fila fue marcada como plegada.', 'success', 'Plegado completado');
            }
        } catch (error) {
            if (field === 'ruta') {
                editingRouteRecordIds.add(recordId);
            }
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function handleDoubleClick(event) {
        if (currentFilter === 'PROG') {
            return;
        }

        const trigger = event.target.closest('[data-action="edit-route"]');
        if (!trigger) {
            return;
        }

        const { recordId } = trigger.dataset;
        if (!recordId || editingRouteRecordIds.has(recordId)) {
            return;
        }

        editingRouteRecordIds.add(recordId);
        renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);

        window.requestAnimationFrame(() => {
            const tbody = document.getElementById('tbody-plegado');
            const editor = tbody
                ? Array.from(tbody.querySelectorAll('select[data-inline-edit="ruta"]')).find((candidate) => (
                    candidate instanceof HTMLSelectElement &&
                    String(candidate.dataset.recordId || '').trim() === String(recordId).trim()
                ))
                : null;

            if (editor instanceof HTMLSelectElement) {
                editor.focus();
                editor.click();
            }
        });
    }

    function handleFocusOut(event) {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement) || target.dataset.inlineEdit !== 'ruta') {
            return;
        }

        const { recordId } = target.dataset;
        if (!recordId || !editingRouteRecordIds.has(recordId)) {
            return;
        }

        window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLSelectElement && activeElement.dataset.recordId === recordId && activeElement.dataset.inlineEdit === 'ruta') {
                return;
            }

            editingRouteRecordIds.delete(recordId);
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }, 0);
    }

    function init() {
        document.querySelectorAll('[data-plegado-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.plegadoFilter;
                document.querySelectorAll('[data-plegado-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-plegado');
        if (tbody) {
            tbody.addEventListener('change', handlePlegadoChange);
            tbody.addEventListener('dblclick', handleDoubleClick);
            tbody.addEventListener('focusout', handleFocusOut);
        }
    }

    TintoreriaApp.registerView('plegado', {
        init,
        processedDate: { columnLabel: 'F_PLEGADO', getDate: getProcessedDate },
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).filter((r) => normalizePlegadoState(r) !== 'OK').length;
        },
        locateRecord(record, state) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            if (normalizePlegadoState(record) === 'OK') {
                const allProg = getEligibleRecords(state.records || [])
                    .filter((r) => normalizePlegadoState(r) === 'OK');
                const visible = TintoreriaProcessedWindow.filterToWindow('plegado', allProg, getProcessedDate);
                if (!visible.some((r) => r.id_registro === record.id_registro)) {
                    return null;
                }
                return { filter: 'PROG' };
            }

            return { filter: 'X PROG' };
        }
    });
})();
