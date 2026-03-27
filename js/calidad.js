(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;

    const PERSON_FIELDS = ['calidad_auditor'];

    function normalizeCalidadState(record) {
        return String(record.calidad_estado || 'X PROG').trim() || 'X PROG';
    }

    function isProgrammedState(record) {
        return normalizeCalidadState(record) !== 'X PROG';
    }

    function isReadyForCalidad(record) {
        const acabadoTipo = String(record.acabado_especial_tipo || '').trim();
        const acabadoEstado = String(record.acabado_especial_estado || record.acab_espec_estado || '').trim();

        return acabadoTipo === 'NO LLEVA'
            || acabadoTipo === 'OK'
            || acabadoEstado === 'OK';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => (
            isReadyForCalidad(record) &&
            normalizeCalidadState(record) !== 'OK'
        ));
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => isProgrammedState(record)),
                'calidad_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => !isProgrammedState(record)),
            'calidad_p'
        );
    }

    function optionMarkup(selectedValue, options, defaultLabel = 'Selec') {
        const values = [...options];
        if (selectedValue && !values.includes(selectedValue)) {
            values.push(selectedValue);
        }

        return values.map((optionValue) => {
            const label = optionValue || defaultLabel;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => !isProgrammedState(record));
        const progRecords = eligible.filter((record) => isProgrammedState(record));

        document.getElementById('count-calidad-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-calidad-prog').textContent = String(progRecords.length);
        document.getElementById('summary-calidad-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-calidad-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.calidad_inicio);
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
        if (!record.calidad_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.calidad_inicio, record.calidad_fin || new Date()) || '00:00';
        if (record.calidad_fin) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-calidad');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'calidad');
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
            <tr${TintoreriaUtils.isUrgentPriority(record.calidad_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.calidad_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.calidad_auditor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_auditor">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_turno">
                        ${optionMarkup(record.calidad_turno || '', CALIDAD_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>${renderStartMarkup(record)}</td>
                <td>${renderFinishMarkup(record)}</td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_estado">
                        ${optionMarkup(normalizeCalidadState(record), CALIDAD_ESTADO_OPTIONS, 'X PROG')}
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

        if (field === 'calidad_p') {
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

        if (field === 'calidad_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['calidad_auditor', 'Auditor'],
                ['calidad_turno', 'Turno'],
                ['calidad_inicio', 'Inicio'],
                ['calidad_fin', 'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizeCalidadState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Calidad',
                message: `Esta seguro que esta OP-Partida ya se audito y esta lista para pasar a embalaje tela? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeCalidadState(currentRecord);
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
            if (currentRecord.calidad_inicio) {
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
                    calidad_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.calidad_inicio) {
                TintoreriaApp.showToast('No existe calidad_inicio para calcular el tiempo transcurrido.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.calidad_fin) {
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Termino la auditoria?',
                message: `${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                return;
            }

            try {
                await TintoreriaApp.saveRecordChanges(recordId, {
                    calidad_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.calidad_inicio && !record.calidad_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'calidad') {
                    return;
                }

                renderTable(TintoreriaApp.getRecords());
            }, 60000);
            return;
        }

        if (!shouldRun && durationTimer) {
            window.clearInterval(durationTimer);
            durationTimer = null;
        }
    }

    function init() {
        document.querySelectorAll('[data-calidad-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.calidadFilter;
                document.querySelectorAll('[data-calidad-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords());
            });
        });

        const tbody = document.getElementById('tbody-calidad');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
        }
    }

    TintoreriaApp.registerView('calidad', {
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
                filter: isProgrammedState(record) ? 'PROG' : 'X PROG'
            };
        }
    });
})();
