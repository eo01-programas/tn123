(() => {
    let currentFilter = 'X PROG';

    function normalizeAcabadoEspecialState(record) {
        return String(record.acabado_especial_estado || record.acab_espec_estado || 'X PROG').trim() || 'X PROG';
    }

    function getAcabadoEspecialTipo(record) {
        return String(record.acabado_especial_tipo || '').trim();
    }

    function hasSelectedSpecialType(record) {
        const tipo = getAcabadoEspecialTipo(record);
        return Boolean(tipo) && tipo !== 'NO LLEVA';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const pendingState = normalizeAcabadoEspecialState(record) !== 'OK';
            const readyFromRamaTenido = String(record.rama_tenido_estado || '').trim() === 'OK';
            const selectedSpecialType = hasSelectedSpecialType(record);
            return pendingState && (readyFromRamaTenido || selectedSpecialType);
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeAcabadoEspecialState(record) === 'PROG'),
                'acabado_especial_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeAcabadoEspecialState(record) !== 'PROG'),
            'acabado_especial_p'
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
        const xprogRecords = eligible.filter((record) => normalizeAcabadoEspecialState(record) !== 'PROG');
        const progRecords = eligible.filter((record) => normalizeAcabadoEspecialState(record) === 'PROG');

        document.getElementById('count-acab-espec-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-acab-espec-prog').textContent = String(progRecords.length);
        document.getElementById('summary-acab-espec-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-acab-espec-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-acab-espec');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'acab-espec');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="10">No hay filas para este subtab.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.acabado_especial_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.acabado_especial_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_tipo">
                        ${optionMarkup(record.acabado_especial_tipo || '', ACABADO_ESPECIAL_TIPO_OPTIONS, 'LLEVA?')}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_turno">
                        ${optionMarkup(record.acabado_especial_turno || '', ACABADO_ESPECIAL_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_maquina">
                        ${optionMarkup(record.acabado_especial_maquina || '', ACABADO_ESPECIAL_MAQUINA_OPTIONS)}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_estado">
                        ${optionMarkup(normalizeAcabadoEspecialState(record), ACABADO_ESPECIAL_ESTADO_OPTIONS, 'X PROG')}
                    </select>
                </td>
            </tr>
        `).join('');
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
        const changes = {};

        if (field === 'acabado_especial_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'acabado_especial_estado') {
            if (nextValue === 'OK') {
                const requiredFields = [
                    ['acabado_especial_tipo', 'Tipo'],
                    ['acabado_especial_turno', 'Turno'],
                    ['acabado_especial_maquina', 'MAQ']
                ];

                const missingLabels = requiredFields
                    .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                    .map(([, label]) => label);

                if (missingLabels.length) {
                    target.value = normalizeAcabadoEspecialState(currentRecord);
                    TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                    return;
                }

                const confirmed = await TintoreriaApp.confirmAction({
                    title: 'Confirmar Acabado Especial',
                    message: `Esta seguro que esta OP-Partida ya se proceso completamenta? ${currentRecord.op_tela}-${currentRecord.partida}`
                });

                if (!confirmed) {
                    target.value = normalizeAcabadoEspecialState(currentRecord);
                    return;
                }

                changes.acabado_especial_fecha = TintoreriaUtils.formatDateForUi(new Date());
            } else {
                changes.acabado_especial_fecha = '';
            }

            changes.acab_espec_estado = nextValue;
        }

        if (String(currentRecord[field] || '') === String(nextValue || '') && !Object.keys(changes).length) {
            target.value = nextValue;
            return;
        }

        target.value = nextValue;
        changes[field] = nextValue;

        try {
            await TintoreriaApp.saveRecordChanges(recordId, changes, { silent: true });
        } catch (error) {
            if (field === 'acabado_especial_estado') {
                target.value = normalizeAcabadoEspecialState(currentRecord);
            } else {
                target.value = currentRecord[field] || '';
            }
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function init() {
        document.querySelectorAll('[data-acab-espec-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.acabEspecFilter;
                document.querySelectorAll('[data-acab-espec-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords());
            });
        });

        const tbody = document.getElementById('tbody-acab-espec');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
        }
    }

    TintoreriaApp.registerView('acab-espec', {
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
                filter: normalizeAcabadoEspecialState(record) === 'PROG' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
