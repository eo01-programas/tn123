(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;

    function normalizePreparadoState(record) {
        return String(record.preparado_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const preparadoState = normalizePreparadoState(record);
            if (preparadoState === 'OK') {
                return false;
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
                eligible.filter((record) => normalizePreparadoState(record) === 'PROG'),
                'preparado_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizePreparadoState(record) !== 'PROG'),
            'preparado_p'
        );
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

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizePreparadoState(record) !== 'PROG');
        const progRecords = eligible.filter((record) => normalizePreparadoState(record) === 'PROG');

        document.getElementById('count-preparado-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-preparado-prog').textContent = String(progRecords.length);
        document.getElementById('summary-preparado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-preparado-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
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
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
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

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'preparado');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="13">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.preparado_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.preparado_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.ruta || '')}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_turno">
                        ${optionMarkup(record.preparado_turno || '', PREPARADO_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.preparado_equipo || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_equipo">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_tipo">
                        ${optionMarkup(normalizePreparadoTipo(record.preparado_tipo), PREPARADO_TIPO_OPTIONS, 'Seleccionar')}
                    </select>
                </td>
                <td>${renderStartMarkup(record)}</td>
                <td>${renderFinishMarkup(record)}</td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="preparado_estado">
                        ${optionMarkup(normalizePreparadoState(record), PREPARADO_ESTADO_OPTIONS)}
                    </select>
                </td>
            </tr>
        `).join('');

        syncDurationTimer(records);
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
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
        }
    }

    TintoreriaApp.registerView('preparado', {
        init,
        render(records, state) {
            renderTable(records, state);
        },
        count(records) {
            return getEligibleRecords(records).length;
        },
        locateRecord(record) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            return {
                filter: normalizePreparadoState(record) === 'PROG' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
