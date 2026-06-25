(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;

    const PERSON_FIELDS = ['abridora_operario'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // X PROG (10): P | F_ing_crudo | cliente | OP-PTDA | color | articulo | kg | Turno | Inicio | Status
    const ABRIDORA_XPROG_WIDTHS = [36, 67, 90, 78, 112, 157, 56, 73, 95, 95];
    // PROG   (9):  F_abridora | cliente | OP-PTDA | color | articulo | kg | Turno | Oper | Status
    const ABRIDORA_PROG_WIDTHS  = [67, 90, 78, 112, 280, 56, 73, 123, 95];

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
    }

    function normalizeAbridoraState(record) {
        return String(record.abridora_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const abridoraState = normalizeAbridoraState(record);
            if (abridoraState === 'OK') {
                return true;
            }
            return String(record.tenido_estado || '').trim() === 'OK';
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            const sorted = TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeAbridoraState(record) === 'OK'),
                'abridora_p'
            ).sort((a, b) => {
                const dateA = TintoreriaUtils.parseDateish(a.abridora_fin);
                const dateB = TintoreriaUtils.parseDateish(b.abridora_fin);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                return timeB - timeA;
            });
            return TintoreriaProcessedWindow.filterToWindow('abridora', sorted, getProcessedDate);
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeAbridoraState(record) !== 'OK'),
            'abridora_p'
        ).sort((a, b) => {
            const aHasInicio = Boolean(a.abridora_inicio);
            const bHasInicio = Boolean(b.abridora_inicio);
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

    function getAdjustedAbridoraDate(rawValue) {
        const date = TintoreriaUtils.parseDateish(rawValue);
        if (!date) return null;
        if (date.getHours() < 7) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, date.getHours(), date.getMinutes(), date.getSeconds());
        }
        return date;
    }

    function getProcessedDate(record) {
        return getAdjustedAbridoraDate(record && record.abridora_fin);
    }

    function renderFAbridoraCell(record) {
        const adjusted = getAdjustedAbridoraDate(record.abridora_fin);
        const finLabel = TintoreriaUtils.formatDateDayMonth(adjusted);
        const finFull = TintoreriaUtils.formatProcessDateTimeLabel(record.abridora_fin) || '--';
        const inicioFull = TintoreriaUtils.formatProcessDateTimeLabel(record.abridora_inicio) || '--';
        const filterDate = TintoreriaUtils.formatDateForUi(adjusted) || 'S/Fecha';
        const elapsed = TintoreriaUtils.formatElapsedTime(record.abridora_inicio, record.abridora_fin) || '--:--';
        const [elapsedHrs, elapsedMin] = elapsed.split(':');
        const elapsedLabel = elapsed === '--:--' ? '--:--' : `${elapsedHrs}hr:${elapsedMin}min`;
        const tooltip = `Inicio: ${inicioFull}\nFin: ${finFull}\nTiempo: ${elapsedLabel}`;

        const pill = finLabel
            ? `<span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(tooltip)}">${TintoreriaUtils.escapeHtml(finLabel)}</span>`
            : `<span class="process-pill process-pill-muted" title="${TintoreriaUtils.escapeHtml(tooltip || 'Sin fecha')}">S/Fecha</span>`;

        return `<td data-f-abridora="${TintoreriaUtils.escapeHtml(filterDate)}">${pill}</td>`;
    }

    function updateColumnVisibility() {
        const isXprog = currentFilter !== 'PROG';
        const abridoraTable = document.querySelector('table.abridora-table');

        const pHeader       = document.getElementById('th-abridora-p');
        const fingHeader    = document.getElementById('th-abridora-fing');
        const fabridoraHdr  = document.getElementById('th-abridora-fabridora');
        const operHeader    = document.getElementById('th-abridora-oper');
        const inicioHeader  = document.getElementById('th-abridora-inicio');
        const finHeader     = document.getElementById('th-abridora-fin');

        if (pHeader)      pHeader.hidden      = !isXprog;
        if (fingHeader)   fingHeader.hidden   = !isXprog;
        if (fabridoraHdr) fabridoraHdr.hidden = isXprog;
        if (operHeader)   operHeader.hidden   = isXprog;
        if (inicioHeader) inicioHeader.hidden = !isXprog;
        if (finHeader)    finHeader.hidden    = true;

        if (abridoraTable) {
            abridoraTable.classList.toggle('abridora-xprog', isXprog);
            abridoraTable.classList.toggle('abridora-prog', !isXprog);
        }

        const colgroup = document.getElementById('colgroup-abridora');
        if (colgroup) {
            const widths = isXprog ? ABRIDORA_XPROG_WIDTHS : ABRIDORA_PROG_WIDTHS;
            colgroup.innerHTML = widths.map(w => `<col style="width:${w}px">`).join('');
        }
    }

    function renderEstadoMarkup(record, readOnly = false) {
        const selectedValue = normalizeAbridoraState(record);
        const statusOptions = ABRIDORA_ESTADO_OPTIONS.map((optionValue) => {
            const label = optionValue === 'X PROG' ? 'X PROCESAR' : optionValue === 'PROG' ? 'EN PROCESO' : optionValue;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
        const selectAttrs = readOnly
            ? 'tabindex="-1" style="pointer-events:none;"'
            : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="abridora_estado"`;
        return `<select class="table-select" ${selectAttrs}>${statusOptions}</select>`;
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizeAbridoraState(record) !== 'OK');
        const progRecords  = eligible.filter((record) => normalizeAbridoraState(record) === 'OK');
        const progWindowed = TintoreriaProcessedWindow.filterToWindow('abridora', progRecords, getProcessedDate);

        document.getElementById('count-abridora-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-abridora-prog').textContent  = `${new Set(progWindowed.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-abridora-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-abridora-prog').textContent  = TintoreriaUtils.formatSubtabSummary(progWindowed);
    }

    function getVisibleRecordsFromTable() {
        const tbody = document.getElementById('tbody-abridora');
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
        const countNode   = document.getElementById(isProg ? 'count-abridora-prog'   : 'count-abridora-xprog');
        const summaryNode = document.getElementById(isProg ? 'summary-abridora-prog' : 'summary-abridora-xprog');
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
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.abridora_inicio);
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
        if (!record.abridora_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.abridora_inicio, record.abridora_fin || new Date()) || '00:00';
        if (record.abridora_fin) {
            return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-abridora');
        if (!tbody) {
            return;
        }

        const readOnly = currentFilter === 'PROG';

        updateColumnVisibility();
        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'abridora');
        renderSubtabCounts(records);

        const colCount = currentFilter !== 'PROG' ? 10 : 9;

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="${colCount}">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            TintoreriaApp.refreshViewDecorations('abridora');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.abridora_p) ? ' class="urgent-row"' : ''}>
                ${currentFilter !== 'PROG' ? `<td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.abridora_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="abridora_p">
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `
                <td data-f-ing-crudo="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateForUi(record.F_ing_crudo))}">
                    <span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.F_ing_crudo))}</span>
                </td>` : renderFAbridoraCell(record)}
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none; appearance:none; -webkit-appearance:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="abridora_turno"`}>
                        ${optionMarkup(record.abridora_turno || '', ABRIDORA_TURNO_OPTIONS)}
                    </select>
                </td>
                ${currentFilter === 'PROG' ? `<td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.abridora_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="abridora_operario"${readOnly ? ' readonly' : ''}>
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `<td>${renderStartMarkup(record)}</td>` : ''}
                <td>${currentFilter !== 'PROG' && record.abridora_inicio
                    ? `<select class="table-select" tabindex="-1" style="pointer-events:none;appearance:none;-webkit-appearance:none;"><option selected>EN PROCESO</option></select>`
                    : renderEstadoMarkup(record, currentFilter === 'PROG')
                }</td>
            </tr>
        `).join('');

        syncDurationTimer(records);
        TintoreriaApp.refreshViewDecorations('abridora');
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        const recordId = target.dataset.recordId;
        const field = target.dataset.field;

        if (currentFilter === 'PROG' && field !== 'abridora_estado') {
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

        if (field === 'abridora_p') {
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

        if (field === 'abridora_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['abridora_turno',   'Turno'],
                ['abridora_operario','Oper'],
                ['abridora_inicio',  'Inicio'],
                ['abridora_fin',     'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizeAbridoraState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Abridora',
                message: `Esta seguro que esta OP-Partida ya se proceso en la abridora por completo? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeAbridoraState(currentRecord);
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
            if (currentRecord.abridora_inicio) {
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
                    abridora_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.abridora_inicio) {
                TintoreriaApp.showToast('Debes registrar inicio antes de terminar el proceso.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.abridora_fin) {
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
                    abridora_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.abridora_inicio && !record.abridora_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'abridora') {
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
        document.querySelectorAll('[data-abridora-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.abridoraFilter;
                document.querySelectorAll('[data-abridora-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-abridora');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
        }
    }

    TintoreriaApp.registerView('abridora', {
        init,
        processedDate: { columnLabel: 'F_ABRIDORA', getDate: getProcessedDate },
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).filter((r) => normalizeAbridoraState(r) !== 'OK').length;
        },
        locateRecord(record, state) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            if (normalizeAbridoraState(record) === 'OK') {
                const allProg = getEligibleRecords(state.records || [])
                    .filter((r) => normalizeAbridoraState(r) === 'OK');
                const visible = TintoreriaProcessedWindow.filterToWindow('abridora', allProg, getProcessedDate);
                if (!visible.some((r) => r.id_registro === record.id_registro)) {
                    return null;
                }
                return { filter: 'PROG' };
            }

            return { filter: 'X PROG' };
        }
    });
})();
