(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;

    const PERSON_FIELDS = ['secado_operario'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // X PROG (11): P | F_ing_crudo | cliente | tela | OP-PTDA | color | articulo | kg | Turno | Inicio | Status
    const SECADO_XPROG_WIDTHS = [36, 67, 70, 50, 78, 112, 225, 56, 73, 70, 70];
    // PROG   (10):  F_secado | cliente | tela | OP-PTDA | color | articulo | kg | Turno | Oper | Status
    const SECADO_PROG_WIDTHS  = [67, 70, 50, 70, 110, 330, 56, 73, 120, 70];

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
    }

    function normalizeSecadoState(record) {
        return String(record.secado_estado || '').trim();
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const secadoState = normalizeSecadoState(record);
            if (secadoState === 'OK') {
                return true;
            }
            return String(record.tenido_estado || '').trim() === 'OK';
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            const sorted = TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeSecadoState(record) === 'OK'),
                'secado_p'
            ).sort((a, b) => {
                const dateA = TintoreriaUtils.parseDateish(a.secado_fin);
                const dateB = TintoreriaUtils.parseDateish(b.secado_fin);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                return timeB - timeA;
            });
            return TintoreriaProcessedWindow.filterToWindow('secado', sorted, getProcessedDate);
        }

        // Por procesar: solo registros enrutados explícitamente desde abridora_mobile
        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeSecadoState(record) === 'X PROCESAR'),
            'secado_p'
        ).sort((a, b) => {
            const aHasInicio = Boolean(a.secado_inicio);
            const bHasInicio = Boolean(b.secado_inicio);
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

    function optionMarkup(selectedValue, options) {
        const values = [...options];
        if (selectedValue && !values.includes(selectedValue)) {
            values.push(selectedValue);
        }

        return values.map((optionValue) => {
            const label = optionValue || 'Selec';
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function getAdjustedSecadoDate(rawValue) {
        const date = TintoreriaUtils.parseDateish(rawValue);
        if (!date) return null;
        if (date.getHours() < 7) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, date.getHours(), date.getMinutes(), date.getSeconds());
        }
        return date;
    }

    function getProcessedDate(record) {
        return getAdjustedSecadoDate(record && record.secado_fin);
    }

    function renderFSecadoCell(record) {
        const adjusted = getAdjustedSecadoDate(record.secado_fin);
        const finLabel = TintoreriaUtils.formatDateDayMonth(adjusted);
        const finFull = TintoreriaUtils.formatProcessDateTimeLabel(record.secado_fin) || '--';
        const inicioFull = TintoreriaUtils.formatProcessDateTimeLabel(record.secado_inicio) || '--';
        const filterDate = TintoreriaUtils.formatDateForUi(adjusted) || 'S/Fecha';
        const elapsed = TintoreriaUtils.formatElapsedTime(record.secado_inicio, record.secado_fin) || '--:--';
        const [elapsedHrs, elapsedMin] = elapsed.split(':');
        const elapsedLabel = elapsed === '--:--' ? '--:--' : `${elapsedHrs}hr:${elapsedMin}min`;
        const tooltip = `Inicio: ${inicioFull}\nFin: ${finFull}\nTiempo: ${elapsedLabel}`;

        const pill = finLabel
            ? `<span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(tooltip)}">${TintoreriaUtils.escapeHtml(finLabel)}</span>`
            : `<span class="process-pill process-pill-muted" title="${TintoreriaUtils.escapeHtml(tooltip || 'Sin fecha')}">S/Fecha</span>`;

        return `<td data-f-secado="${TintoreriaUtils.escapeHtml(filterDate)}">${pill}</td>`;
    }

    function updateColumnVisibility() {
        const isXprog = currentFilter !== 'PROG';
        const secadoTable = document.querySelector('table.secado-table');

        const pHeader      = document.getElementById('th-secado-p');
        const fingHeader   = document.getElementById('th-secado-fing');
        const fsecadoHdr   = document.getElementById('th-secado-fsecado');
        const operHeader   = document.getElementById('th-secado-oper');
        const inicioHeader = document.getElementById('th-secado-inicio');
        const finHeader    = document.getElementById('th-secado-fin');

        if (pHeader)      pHeader.hidden      = !isXprog;
        if (fingHeader)   fingHeader.hidden   = !isXprog;
        if (fsecadoHdr)   fsecadoHdr.hidden   = isXprog;
        if (operHeader)   operHeader.hidden   = isXprog;
        if (inicioHeader) inicioHeader.hidden = !isXprog;
        if (finHeader)    finHeader.hidden    = true;

        if (secadoTable) {
            secadoTable.classList.toggle('secado-xprog', isXprog);
            secadoTable.classList.toggle('secado-prog', !isXprog);
        }

        const colgroup = document.getElementById('colgroup-secado');
        if (colgroup) {
            const widths = isXprog ? SECADO_XPROG_WIDTHS : SECADO_PROG_WIDTHS;
            colgroup.innerHTML = widths.map(w => `<col style="width:${w}px">`).join('');
        }
    }

    function renderEstadoMarkup(record, readOnly = false) {
        const selectedValue = normalizeSecadoState(record);
        const optionValues = [...SECADO_ESTADO_OPTIONS];
        if (selectedValue && !optionValues.includes(selectedValue)) {
            optionValues.unshift(selectedValue);
        }
        const statusOptions = optionValues.map((optionValue) => {
            const label = optionValue === 'X PROG' ? 'X PROCESAR' : optionValue === 'PROG' ? 'EN PROCESO' : optionValue;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
        const selectAttrs = readOnly
            ? 'tabindex="-1" style="pointer-events:none;"'
            : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_estado"`;
        return `<select class="table-select" ${selectAttrs}>${statusOptions}</select>`;
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizeSecadoState(record) === 'X PROCESAR');
        const progRecords  = eligible.filter((record) => normalizeSecadoState(record) === 'OK');
        const progWindowed = TintoreriaProcessedWindow.filterToWindow('secado', progRecords, getProcessedDate);

        document.getElementById('count-secado-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-secado-prog').textContent  = `${new Set(progWindowed.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-secado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-secado-prog').textContent  = TintoreriaUtils.formatSubtabSummary(progWindowed);
    }

    function getVisibleRecordsFromTable() {
        const tbody = document.getElementById('tbody-secado');
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
        const countNode   = document.getElementById(isProg ? 'count-secado-prog'   : 'count-secado-xprog');
        const summaryNode = document.getElementById(isProg ? 'summary-secado-prog' : 'summary-secado-xprog');
        if (!countNode || !summaryNode) {
            return;
        }

        const visibleRecords = getVisibleRecordsFromTable();
        const uniquePartidas = new Set(
            visibleRecords.map((record) => TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))
        );

        countNode.textContent   = `${uniquePartidas.size} ptds`;
        summaryNode.textContent = TintoreriaUtils.formatSubtabSummary(visibleRecords);
    }

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.secado_inicio);
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
        if (!record.secado_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.secado_inicio, record.secado_fin || new Date()) || '00:00';
        if (record.secado_fin) {
            return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-secado');
        if (!tbody) {
            return;
        }

        const readOnly = currentFilter === 'PROG';

        updateColumnVisibility();
        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'secado');
        renderSubtabCounts(records);

        const colCount = currentFilter !== 'PROG' ? 11 : 10;

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="${colCount}">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            TintoreriaApp.refreshViewDecorations('secado');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.secado_p) ? ' class="urgent-row"' : ''}>
                ${currentFilter !== 'PROG' ? `<td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.secado_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_p">
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `
                <td data-f-ing-crudo="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}">
                    <span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.F_ing_crudo))}</span>
                </td>` : renderFSecadoCell(record)}
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none; appearance:none; -webkit-appearance:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_turno"`}>
                        ${optionMarkup(record.secado_turno || '', SECADO_TURNO_OPTIONS)}
                    </select>
                </td>
                ${currentFilter === 'PROG' ? `<td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.secado_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_operario"${readOnly ? ' readonly' : ''}>
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `<td>${renderStartMarkup(record)}</td>` : ''}
                <td>${currentFilter !== 'PROG' && record.secado_inicio
                    ? `<select class="table-select" tabindex="-1" style="pointer-events:none;appearance:none;-webkit-appearance:none;"><option selected>EN PROCESO</option></select>`
                    : renderEstadoMarkup(record, currentFilter === 'PROG')
                }</td>
            </tr>
        `).join('');

        syncDurationTimer(records);
        TintoreriaApp.refreshViewDecorations('secado');
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        const recordId = target.dataset.recordId;
        const field = target.dataset.field;

        if (currentFilter === 'PROG' && field !== 'secado_estado') {
            return;
        }
        if (!recordId || !field) {
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(recordId);
        if (!currentRecord) {
            return;
        }

        let nextValue = target.value;

        if (field === 'secado_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (PERSON_FIELDS.includes(field)) {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
            if (nextValue && !TintoreriaUtils.isValidPersonName(nextValue)) {
                target.value = currentRecord[field] || '';
                TintoreriaApp.showToast('Solo se admiten letras y una separacion maxima entre 2 palabras.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'secado_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['secado_turno',   'Turno'],
                ['secado_operario','Oper'],
                ['secado_inicio',  'Inicio'],
                ['secado_fin',     'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizeSecadoState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Secado',
                message: `Esta seguro que esta OP-Partida ya se proceso en el secado por completo? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeSecadoState(currentRecord);
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
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
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
            if (currentRecord.secado_inicio) {
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
                    secado_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.secado_inicio) {
                TintoreriaApp.showToast('Debes registrar inicio antes de terminar el proceso.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.secado_fin) {
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
                    secado_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.secado_inicio && !record.secado_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'secado') {
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
        document.querySelectorAll('[data-secado-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.secadoFilter;
                document.querySelectorAll('[data-secado-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-secado');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
        }
    }

    TintoreriaApp.registerView('secado', {
        init,
        processedDate: { columnLabel: 'F_SECADO', getDate: getProcessedDate },
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).filter((r) => normalizeSecadoState(r) === 'X PROCESAR').length;
        },
        locateRecord(record, state) {
            const secadoState = normalizeSecadoState(record);
            if (secadoState === 'OK') {
                const allProg = getEligibleRecords(state.records || [])
                    .filter((r) => normalizeSecadoState(r) === 'OK');
                const visible = TintoreriaProcessedWindow.filterToWindow('secado', allProg, getProcessedDate);
                if (!visible.some((r) => r.id_registro === record.id_registro)) {
                    return null;
                }
                return { filter: 'PROG' };
            }
            if (secadoState === 'X PROCESAR') {
                return { filter: 'X PROG' };
            }
            return null;
        }
    });
})();
