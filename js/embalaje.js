(() => {
    function normalizeEmbalajeState(record) {
        return String(record.embalaje_estado || '').trim();
    }

    function getEligibleRecords(records) {
        return records.filter((record) => (
            String(record.calidad_estado || '').trim() === 'OK' &&
            normalizeEmbalajeState(record) !== 'OK'
        ));
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

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-embalaje');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(
            TintoreriaUtils.sortRecordsByPriority(getEligibleRecords(records), 'embalaje_p'),
            state,
            'embalaje'
        );

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="7">No hay filas visibles en Embalaje.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.embalaje_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.embalaje_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="embalaje_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="embalaje_estado">
                        ${optionMarkup(normalizeEmbalajeState(record), EMBALAJE_ESTADO_OPTIONS)}
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

        if (field === 'embalaje_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'embalaje_estado') {
            if (nextValue === 'OK') {
                const confirmed = await TintoreriaApp.confirmAction({
                    title: 'Confirmar Embalaje',
                    message: `Esta seguro que esta OP-Partida ya se embalo? ${currentRecord.op_tela}-${currentRecord.partida}`
                });

                if (!confirmed) {
                    target.value = normalizeEmbalajeState(currentRecord);
                    return;
                }

                changes.embalaje_fecha = TintoreriaUtils.formatDateForUi(new Date());
            } else {
                changes.embalaje_fecha = '';
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
        } catch (error) {
            if (field === 'embalaje_estado') {
                target.value = normalizeEmbalajeState(currentRecord);
            } else {
                target.value = currentRecord[field] || '';
            }
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function init() {
        const tbody = document.getElementById('tbody-embalaje');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
        }
    }

    TintoreriaApp.registerView('embalaje', {
        init,
        render(records, state) {
            renderTable(records, state);
        },
        count(records) {
            return getEligibleRecords(records).length;
        },
        locateRecord(record) {
            return getEligibleRecords([record]).length ? {} : null;
        }
    });
})();
