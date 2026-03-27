(() => {
    let currentFilter = 'X PROG';

    function normalizePlegadoState(record) {
        return String(record.plegado_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => {
            const ruta = String(record.ruta || '').trim();
            const inRoute = ruta === 'Termoficado' || ruta === 'Humectado';
            return inRoute && normalizePlegadoState(record) !== 'OK';
        });
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizePlegadoState(record) === 'PROG'),
                'plegado_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizePlegadoState(record) !== 'PROG'),
            'plegado_p'
        );
    }

    function optionMarkup(selectedValue, options) {
        return options.map((optionValue) => {
            const label = optionValue || 'Selec';
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizePlegadoState(record) !== 'PROG');
        const progRecords = eligible.filter((record) => normalizePlegadoState(record) === 'PROG');

        document.getElementById('count-plegado-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-plegado-prog').textContent = String(progRecords.length);
        document.getElementById('summary-plegado-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-plegado-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-plegado');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'plegado');
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
            <tr${TintoreriaUtils.isUrgentPriority(record.plegado_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.plegado_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.ruta || '')}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_turno">
                        ${optionMarkup(record.plegado_turno || '', PLEGADO_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input mono" type="text" value="${TintoreriaUtils.escapeHtml(record.plegado_equipo || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_equipo">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="plegado_estado">
                        ${optionMarkup(normalizePlegadoState(record), PLEGADO_ESTADO_OPTIONS)}
                    </select>
                </td>
            </tr>
        `).join('');
    }

    async function handlePlegadoChange(event) {
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

        if (field === 'plegado_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'plegado_equipo') {
            nextValue = TintoreriaUtils.sanitizePlegadoEquipo(nextValue);
            if (target.value && !TintoreriaUtils.isValidPlegadoEquipo(nextValue)) {
                target.value = currentRecord.plegado_equipo || '';
                TintoreriaApp.showToast('plegado_equipo solo admite letras y un guion, sin espacios.', 'error', 'Dato invalido');
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

                changes.plegado_fecha = TintoreriaUtils.formatDateForUi(new Date());
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
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function init() {
        document.querySelectorAll('[data-plegado-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.plegadoFilter;
                document.querySelectorAll('[data-plegado-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords());
            });
        });

        const tbody = document.getElementById('tbody-plegado');
        if (tbody) {
            tbody.addEventListener('change', handlePlegadoChange);
        }
    }

    TintoreriaApp.registerView('plegado', {
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
                filter: normalizePlegadoState(record) === 'PROG' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
