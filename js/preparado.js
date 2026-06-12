(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;
    const editingRouteRecordIds = new Set();
    const ROUTE_OPTIONS = ['', 'Termofijado', 'Humectado'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // X PROG (12): P | F_ing_crudo | cliente | OP-PTDA | color | articulo | kg | ruta | Turno | Tipo | Inicio | Status
    const PREPARADO_XPROG_WIDTHS = [36, 67, 90, 78, 151, 290, 56, 67, 73, 118, 75, 101];
    // PROG  (12): F_preparado | cliente | OP-PTDA | color | articulo | kg | ruta | Turno | Responsable | Equipo | Tipo | Status
    const PREPARADO_PROG_WIDTHS  = [67, 56, 78, 101, 280, 56, 56, 45, 112, 90, 101, 45];

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
    }

    function normalizePreparadoState(record) {
        return String(record.preparado_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const preparadoState = normalizePreparadoState(record);
            if (preparadoState === 'OK') {
                return true;
            }

            const isReadyFromRama = String(record.rama_crudo_estado || '').trim() === 'OK';
            const isDirectRoute = String(record.ruta || '').trim() === 'Directo';

            return isReadyFromRama || isDirectRoute;
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizePreparadoState(record) === 'OK'),
                'preparado_p'
            ).sort((a, b) => {
                const dateA = TintoreriaUtils.parseDateish(a.preparado_fin);
                const dateB = TintoreriaUtils.parseDateish(b.preparado_fin);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                return timeB - timeA;
            });
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizePreparadoState(record) !== 'OK'),
            'preparado_p'
        ).sort((a, b) => {
            const aHasInicio = Boolean(a.preparado_inicio);
            const bHasInicio = Boolean(b.preparado_inicio);
            if (aHasInicio !== bHasInicio) {
                return aHasInicio ? -1 : 1;
            }
            const dateA = TintoreriaUtils.parseDateish(a.F_ing_crudo);
            const dateB = TintoreriaUtils.parseDateish(b.F_ing_crudo);
            const timeA = dateA ? dateA.getTime() : 0;
            const timeB = dateB ? dateB.getTime() : 0;
            return timeB - timeA;
        });
    }

    function optionMarkup(selectedValue, options, emptyLabel = 'Selec') {
        const values = [...options];
        if (selectedValue && !values.includes(selectedValue)) {
            values.push(selectedValue);
        }

        return values.map((optionValue) => {
            const label = optionValue || emptyLabel;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function normalizePreparadoTipo(value) {
        const normalized = String(value === undefined || value === null ? '' : value)
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return '';
        }

        const upperValue = normalized.toUpperCase();
        if (upperValue === 'DESC') {
            return 'Descosido';
        }

        if (upperValue === 'D+COS') {
            return 'Desc+Costura';
        }

        if (upperValue === 'VOLT') {
            return 'Volteado';
        }

        return normalized;
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
                    ${optionMarkup(normalizedRoute, ROUTE_OPTIONS, '')}
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

    function updateColumnVisibility() {
        const isXprog = currentFilter !== 'PROG';
        const preparadoTable = document.querySelector('table.preparado-table');

        const pHeader = document.getElementById('th-preparado-p');
        const fingHeader = document.getElementById('th-preparado-fing');
        const fprepHeader = document.getElementById('th-preparado-fprep');
        const supervisorHeader = document.getElementById('th-preparado-supervisor');
        const equipoHeader = document.getElementById('th-preparado-equipo');
        const inicioHeader = document.getElementById('th-preparado-inicio');
        const finHeader = document.getElementById('th-preparado-fin');

        if (pHeader) pHeader.hidden = !isXprog;
        if (fingHeader) fingHeader.hidden = !isXprog;
        if (fprepHeader) fprepHeader.hidden = isXprog;
        if (supervisorHeader) supervisorHeader.hidden = isXprog;
        if (equipoHeader) equipoHeader.hidden = isXprog;
        if (inicioHeader) inicioHeader.hidden = !isXprog;
        if (finHeader) finHeader.hidden = true;

        if (preparadoTable) {
            preparadoTable.classList.toggle('preparado-xprog', isXprog);
            preparadoTable.classList.toggle('preparado-prog', !isXprog);
        }
        const colgroup = document.getElementById('colgroup-preparado');
        if (colgroup) {
            const widths = isXprog ? PREPARADO_XPROG_WIDTHS : PREPARADO_PROG_WIDTHS;
            colgroup.innerHTML = widths.map(w => `<col style="width:${w}px">`).join('');
        }
    }

    function getAdjustedPreparadoDate(rawValue) {
        const date = TintoreriaUtils.parseDateish(rawValue);
        if (!date) return null;
        if (date.getHours() < 7) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, date.getHours(), date.getMinutes(), date.getSeconds());
        }
        return date;
    }

    function renderFPreparadoCell(record) {
        const adjusted = getAdjustedPreparadoDate(record.preparado_fin);
        const finLabel = TintoreriaUtils.formatDateDayMonth(adjusted);
        const finFull = TintoreriaUtils.formatProcessDateTimeLabel(record.preparado_fin) || '--';
        const inicioFull = TintoreriaUtils.formatProcessDateTimeLabel(record.preparado_inicio) || '--';
        const filterDate = TintoreriaUtils.formatDateForUi(adjusted) || 'S/Fecha';
        const elapsed = TintoreriaUtils.formatElapsedTime(record.preparado_inicio, record.preparado_fin) || '--:--';
        const [elapsedHrs, elapsedMin] = elapsed.split(':');
        const elapsedLabel = elapsed === '--:--' ? '--:--' : `${elapsedHrs}hr:${elapsedMin}min`;
        const tooltip = `Inicio: ${inicioFull}\nFin: ${finFull}\nTiempo: ${elapsedLabel}`;

        const pill = finLabel
            ? `<span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(tooltip)}">${TintoreriaUtils.escapeHtml(finLabel)}</span>`
            : `<span class="process-pill process-pill-muted" title="${TintoreriaUtils.escapeHtml(tooltip || 'Sin fecha')}">S/Fecha</span>`;

        return `<td data-f-preparado="${TintoreriaUtils.escapeHtml(filterDate)}">${pill}</td>`;
    }

    function renderEstadoMarkup(record, readOnly = false) {
        const selectedValue = normalizePreparadoState(record);
        const statusOptions = PREPARADO_ESTADO_OPTIONS.map((optionValue) => {
            const label = optionValue === 'X PROG' ? 'X PROCESAR' : optionValue === 'PROG' ? 'EN PROCESO' : optionValue;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
        const selectAttrs = readOnly
            ? 'tabindex="-1" style="pointer-events:none;"'
            : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_estado"`;
        return `<select class="table-select" ${selectAttrs}>${statusOptions}</select>`;
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizePreparadoState(record) !== 'OK');
        const progRecords = eligible.filter((record) => normalizePreparadoState(record) === 'OK');

        document.getElementById('count-preparado-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-preparado-prog').textContent = `${new Set(progRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-preparado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-preparado-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function getVisibleRecordsFromTable() {
        const tbody = document.getElementById('tbody-preparado');
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
        const countNode = document.getElementById(isProg ? 'count-preparado-prog' : 'count-preparado-xprog');
        const summaryNode = document.getElementById(isProg ? 'summary-preparado-prog' : 'summary-preparado-xprog');
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

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.preparado_inicio);
        if (label) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(label)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="start">
                click
            </button>
        `;
    }

    function renderFinishMarkup(record) {
        if (!record.preparado_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.preparado_inicio, record.preparado_fin || new Date()) || '00:00';
        if (record.preparado_fin) {
            return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-preparado');
        if (!tbody) {
            return;
        }

        const readOnly = currentFilter === 'PROG' && isPcpTextilUser();

        updateColumnVisibility();
        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'preparado');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="12">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            TintoreriaApp.refreshViewDecorations('preparado');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.preparado_p) ? ' class="urgent-row"' : ''}>
                ${currentFilter !== 'PROG' ? `<td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.preparado_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_p">
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `
                <td data-f-ing-crudo="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}">
                    <span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.F_ing_crudo))}</span>
                </td>` : renderFPreparadoCell(record)}
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>${renderRouteMarkup(record)}</td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_turno"`}>
                        ${optionMarkup(record.preparado_turno || '', PREPARADO_TURNO_OPTIONS)}
                    </select>
                </td>
                ${currentFilter === 'PROG' ? `
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.preparado_supervisor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_supervisor"${readOnly ? ' readonly' : ''}>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.preparado_equipo || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_equipo"${readOnly ? ' readonly' : ''}>
                </td>` : ''}
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_tipo"`}>
                        ${optionMarkup(normalizePreparadoTipo(record.preparado_tipo), PREPARADO_TIPO_OPTIONS, 'Seleccionar')}
                    </select>
                </td>
                ${currentFilter !== 'PROG' ? `<td>
                    ${record.preparado_inicio
                        ? `<span class="process-pill process-pill-info" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatProcessDateTimeLabel(record.preparado_inicio) || '')}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatProcessDateTimeLabel(record.preparado_inicio) || '')}</span>`
                        : `<span class="cell-text">—</span>`
                    }
                </td>` : ''}
                <td>${renderEstadoMarkup(record, readOnly)}</td>
            </tr>
        `).join('');

        syncDurationTimer(records);
        TintoreriaApp.refreshViewDecorations('preparado');
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        if (currentFilter === 'PROG' && isPcpTextilUser()) {
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

        if (field === 'preparado_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'ruta') {
            nextValue = normalizeRoute(nextValue);
            editingRouteRecordIds.delete(recordId);
        }

        if (field === 'preparado_supervisor') {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
            if (nextValue && !TintoreriaUtils.isValidPersonName(nextValue)) {
                target.value = currentRecord.preparado_supervisor || '';
                TintoreriaApp.showToast('Solo se admiten letras y una separacion maxima entre 2 palabras.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'preparado_equipo') {
            nextValue = TintoreriaUtils.sanitizePlegadoEquipo(nextValue);
            if (target.value && !TintoreriaUtils.isValidPlegadoEquipo(nextValue)) {
                target.value = currentRecord.preparado_equipo || '';
                TintoreriaApp.showToast('preparado_equipo solo admite letras y un guion, sin espacios.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'preparado_tipo') {
            nextValue = normalizePreparadoTipo(nextValue);
        }

        if (field === 'preparado_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['preparado_turno', 'Turno'],
                ['preparado_equipo', 'Equipo'],
                ['preparado_tipo', 'Tipo'],
                ['preparado_inicio', 'Inicio'],
                ['preparado_fin', 'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizePreparadoState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Preparado',
                message: `Esta seguro que esta OP-Partida ya termino de preparse? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizePreparadoState(currentRecord);
                return;
            }
        }

        if (String(currentRecord[field] || '') === String(nextValue || '')) {
            target.value = nextValue;
            return;
        }

        target.value = nextValue;

        try {
            await TintoreriaApp.saveRecordChanges(recordId, { [field]: nextValue }, { silent: true });
        } catch (error) {
            if (field === 'ruta') {
                editingRouteRecordIds.add(recordId);
            }
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function handleDoubleClick(event) {
        if (currentFilter === 'PROG' && isPcpTextilUser()) {
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
            const tbody = document.getElementById('tbody-preparado');
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

    async function handleActionClick(event) {
        const trigger = event.target.closest('button[data-action]');
        if (!(trigger instanceof HTMLButtonElement)) {
            return;
        }

        const recordId = trigger.dataset.recordId;
        const action = trigger.dataset.action;
        if (!recordId || !action) {
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(recordId);
        if (!currentRecord) {
            return;
        }

        if (action === 'start') {
            if (currentRecord.preparado_inicio) {
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Inicio de proceso?',
                message: `${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                return;
            }

            try {
                await TintoreriaApp.saveRecordChanges(recordId, {
                    preparado_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.preparado_inicio) {
                TintoreriaApp.showToast('Debes registrar inicio antes de terminar el proceso.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.preparado_fin) {
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Termino el proceso?',
                message: `${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                return;
            }

            try {
                await TintoreriaApp.saveRecordChanges(recordId, {
                    preparado_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.preparado_inicio && !record.preparado_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'preparado') {
                    return;
                }

                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            }, 60000);
            return;
        }

        if (!shouldRun && durationTimer) {
            window.clearInterval(durationTimer);
            durationTimer = null;
        }
    }

    function init() {
        document.querySelectorAll('[data-preparado-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.preparadoFilter;
                document.querySelectorAll('[data-preparado-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-preparado');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
            tbody.addEventListener('dblclick', handleDoubleClick);
            tbody.addEventListener('focusout', handleFocusOut);
        }
    }

    TintoreriaApp.registerView('preparado', {
        init,
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).filter((r) => normalizePreparadoState(r) !== 'OK').length;
        },
        locateRecord(record) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            return {
                filter: normalizePreparadoState(record) === 'OK' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
