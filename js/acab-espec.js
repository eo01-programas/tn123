(() => {
    let currentFilter = 'POR PROCESAR';
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // P | cliente | tela | OP-PTDA | color | articulo | kg | Tipo | Turno | MAQ | Status
    const ACAB_ESPEC_WIDTHS =           [36, 50, 50, 71, 80, 250, 78, 78, 70, 65, 70];
    // Fecha | cliente | tela | OP-PTDA | color | articulo | kg | Tipo | Turno | MAQ | Status
    const ACAB_ESPEC_WIDTHS_PROCESADO = [75, 50, 50, 71, 80, 250, 78, 78, 70, 65, 70];

    function normalizeAcabadoEspecialState(record) {
        return String(record.acabado_especial_estado || record.acab_espec_estado || 'X PROG').trim() || 'X PROG';
    }

    function getAcabadoEspecialTipo(record) {
        return String(record.acabado_especial_tipo || '').trim();
    }

    function isNoLlevaSpecialType(record) {
        return getAcabadoEspecialTipo(record).toUpperCase() === 'NO LLEVA';
    }

    function getAcabEspecFecha(record) {
        return TintoreriaUtils.parseDateish(record && record.acabado_especial_fecha);
    }

    function getRecordsForTab(filter, records) {
        if (filter === 'POR PROCESAR') {
            return TintoreriaUtils.sortRecordsByPriority(
                records.filter((record) => normalizeAcabadoEspecialState(record) === 'PROG'),
                'acabado_especial_p'
            );
        }
        // PROCESADO: ordenado por fecha desc y limitado a ventana activa
        const sorted = records
            .filter((record) =>
                normalizeAcabadoEspecialState(record) === 'OK' &&
                !isNoLlevaSpecialType(record) &&
                Boolean(getAcabadoEspecialTipo(record))
            )
            .sort((a, b) => {
                const timeA = getAcabEspecFecha(a) ? getAcabEspecFecha(a).getTime() : 0;
                const timeB = getAcabEspecFecha(b) ? getAcabEspecFecha(b).getTime() : 0;
                return timeB - timeA;
            });
        return TintoreriaProcessedWindow.filterToWindow('acab-espec', sorted, getAcabEspecFecha);
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
        const porProcesarRecords = records.filter((r) => normalizeAcabadoEspecialState(r) === 'PROG');
        const procesadoAll = records.filter((r) =>
            normalizeAcabadoEspecialState(r) === 'OK' &&
            !isNoLlevaSpecialType(r) &&
            Boolean(getAcabadoEspecialTipo(r))
        );
        const procesadoRecords = TintoreriaProcessedWindow.filterToWindow('acab-espec', procesadoAll, getAcabEspecFecha);

        document.getElementById('count-acab-espec-xprog').textContent = `${new Set(porProcesarRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-acab-espec-prog').textContent = `${new Set(procesadoRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-acab-espec-xprog').textContent = TintoreriaUtils.formatSubtabSummary(porProcesarRecords);
        document.getElementById('summary-acab-espec-prog').textContent = TintoreriaUtils.formatSubtabSummary(procesadoRecords);
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-acab-espec');
        if (!tbody) {
            return;
        }

        const isProcessado = currentFilter === 'PROCESADO';
        const filtered = TintoreriaUtils.filterRecordsForSearch(getRecordsForTab(currentFilter, records), state, 'acab-espec');
        renderSubtabCounts(records);

        const theadRow = document.getElementById('thead-acab-espec-row');
        const colgroup = document.getElementById('colgroup-acab-espec');
        const widths = isProcessado ? ACAB_ESPEC_WIDTHS_PROCESADO : ACAB_ESPEC_WIDTHS;
        if (colgroup) colgroup.innerHTML = widths.map(w => `<col style="width:${w}px">`).join('');
        if (theadRow) {
            theadRow.innerHTML = isProcessado
                ? `<th>Fecha</th><th>cliente</th><th>tela</th><th>OP-PTDA</th><th>color</th><th>articulo</th><th>kg(crudo)</th><th>Tipo</th><th>Turno</th><th>MAQ</th><th>Status</th>`
                : `<th>P</th><th>cliente</th><th>tela</th><th>OP-PTDA</th><th>color</th><th>articulo</th><th>kg(crudo)</th><th>Tipo</th><th>Turno</th><th>MAQ</th><th>Status</th>`;
        }

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="11">No hay filas para este subtab.</td>
                </tr>
            `;
            TintoreriaApp.refreshViewDecorations('acab-espec');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.acabado_especial_p) ? ' class="urgent-row"' : ''}>
                ${isProcessado
                    ? `<td><span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.acabado_especial_fecha) || '--')}</span></td>`
                    : `<td><input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.acabado_especial_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="acabado_especial_p"></td>`
                }
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
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
        TintoreriaApp.refreshViewDecorations('acab-espec');
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
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-acab-espec');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
        }
    }

    TintoreriaApp.registerView('acab-espec', {
        init,
        processedDate: {
            columnLabel: 'FECHA',
            getDate: getAcabEspecFecha,
            subtabFilter: 'PROCESADO'
        },
        render(records, state) {
            renderTable(records, state);
        },
        count(records) {
            return records.filter((r) => normalizeAcabadoEspecialState(r) === 'PROG').length;
        },
        locateRecord(record, state) {
            const estado = normalizeAcabadoEspecialState(record);
            if (estado === 'PROG') {
                return { filter: 'POR PROCESAR' };
            }
            if (estado === 'OK' && !isNoLlevaSpecialType(record) && Boolean(getAcabadoEspecialTipo(record))) {
                const allProcesado = (state && state.records || []).filter((r) =>
                    normalizeAcabadoEspecialState(r) === 'OK' &&
                    !isNoLlevaSpecialType(r) &&
                    Boolean(getAcabadoEspecialTipo(r))
                );
                const visible = TintoreriaProcessedWindow.filterToWindow('acab-espec', allProcesado, getAcabEspecFecha);
                if (!visible.some((r) => r.id_registro === record.id_registro)) return null;
                return { filter: 'PROCESADO' };
            }
            return null;
        }
    });
})();
