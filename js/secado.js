(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;

    const PERSON_FIELDS = ['secado_operario'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // X PROG (10): P | F_ing_crudo | cliente | OP-PTDA | color | articulo | kg | Turno | Inicio | Status
    const SECADO_XPROG_WIDTHS = [36, 67, 90, 78, 112, 157, 56, 73, 95, 95];
    // PROG   (9):  F_secado | cliente | OP-PTDA | color | articulo | kg | Turno | Oper | Status
    const SECADO_PROG_WIDTHS  = [67, 90, 78, 112, 280, 56, 73, 123, 95];

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
    }

    function normalizeSecadoState(record) {
        return String(record.secado_estado || 'X PROG').trim() || 'X PROG';
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
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeSecadoState(record) === 'OK'),
                'secado_p'
            ).sort((a, b) => {
                const dateA = TintoreriaUtils.parseDateish(a.secado_fin);
                const dateB = TintoreriaUtils.parseDateish(b.secado_fin);
                const timeA = dateA ? dateA.getTime() : 0;
                const timeB = dateB ? dateB.getTime() : 0;
                return timeB - timeA;
            });
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeSecadoState(record) !== 'OK'),
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
        const statusOptions = SECADO_ESTADO_OPTIONS.map((optionValue) => {
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
        const xprogRecords = eligible.filter((record) => normalizeSecadoState(record) !== 'OK');
        const progRecords  = eligible.filter((record) => normalizeSecadoState(record) === 'OK');

        document.getElementById('count-secado-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-secado-prog').textContent  = `${new Set(progRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-secado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-secado-prog').textContent  = TintoreriaUtils.formatSubtabSummary(progRecords);
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

        const readOnly = currentFilter === 'PROG' && isPcpTextilUser();

        updateColumnVisibility();
        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'secado');
        renderSubtabCounts(records);

        const colCount = currentFilter !== 'PROG' ? 10 : 9;

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
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_turno"`}>
                        ${optionMarkup(record.secado_turno || '', SECADO_TURNO_OPTIONS)}
                    </select>
                </td>
                ${currentFilter === 'PROG' ? `<td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.secado_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="secado_operario"${readOnly ? ' readonly' : ''}>
                </td>` : ''}
                ${currentFilter !== 'PROG' ? `<td>${renderStartMarkup(record)}</td>` : ''}
                <td>${renderEstadoMarkup(record, readOnly)}</td>
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
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).filter((r) => normalizeSecadoState(r) !== 'OK').length;
        },
        locateRecord(record) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            return {
                filter: normalizeSecadoState(record) === 'OK' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
