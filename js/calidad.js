(() => {
    let currentFilter = 'ACTIVE';
    let durationTimer = null;
    let initialOrderSnapshot = new Map();

    const PERSON_FIELDS = ['calidad_auditor'];
    const CALIDAD_UNPROGRAMMED_STATES = new Set(['', 'X PROG']);
    const QUALITY_EXPORT_COLUMNS = [
        { key: 'calidad_p', header: 'P', width: 6, align: 'center' },
        { key: 'cliente', header: 'cliente', width: 12 },
        { key: 'op_ptda', header: 'OP-PTDA', width: 14 },
        { key: 'cod_color', header: 'cod_color', width: 13 },
        { key: 'color', header: 'color', width: 20 },
        { key: 'cod_art', header: 'cod_art', width: 14 },
        { key: 'articulo', header: 'articulo', width: 34 },
        { key: 'peso_kg_crudo', header: 'kg(crudo)', width: 11, align: 'center' },
        { key: 'cantidad_crudo', header: '#rollos/cntd', width: 12, align: 'center' },
        { key: 'calidad_auditor', header: 'Auditor', width: 18 },
        { key: 'calidad_turno', header: 'Turno', width: 10, align: 'center' },
        { key: 'calidad_inicio', header: 'Inicio', width: 12, align: 'center' },
        { key: 'calidad_fin', header: 'Fin', width: 12, align: 'center' },
        { key: 'calidad_estado', header: 'Status', width: 14, align: 'center' }
    ];

    function normalizeCalidadState(record) {
        return String(record.calidad_estado || '').trim().toUpperCase();
    }

    function getDisplayCalidadState(record) {
        const state = normalizeCalidadState(record);

        if (CALIDAD_UNPROGRAMMED_STATES.has(state)) {
            return '';
        }

        if (state === 'PROG') {
            return 'AUDITANDO';
        }

        return state;
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

    function hasAuditorValue(record) {
        return Boolean(String(record && record.calidad_auditor ? record.calidad_auditor : '').trim());
    }

    function resetInitialOrderSnapshot(records) {
        initialOrderSnapshot = new Map();

        (records || []).forEach((record, index) => {
            if (!record || !record.id_registro) {
                return;
            }

            initialOrderSnapshot.set(String(record.id_registro), index);
        });
    }

    function ensureInitialOrderSnapshot(records) {
        if (!initialOrderSnapshot.size) {
            resetInitialOrderSnapshot(records);
        }
    }

    function isRejectedRecord(record) {
        return normalizeCalidadState(record) === 'RECHAZADO';
    }

    function getActiveRecords(records) {
        return getEligibleRecords(records).filter((record) => !isRejectedRecord(record));
    }

    function getRejectedRecords(records) {
        return getEligibleRecords(records).filter((record) => isRejectedRecord(record));
    }

    function shouldPinRecordAtTop(record) {
        const displayState = getDisplayCalidadState(record);
        return displayState !== '' && displayState !== 'RECHAZADO' && displayState !== 'OK';
    }

    function getVisibleRecords(records, filter = currentFilter) {
        const sourceRecords = filter === 'REJECTED'
            ? getRejectedRecords(records)
            : getActiveRecords(records);

        ensureInitialOrderSnapshot(records);

        const compareByInitialOrder = (left, right) => {
            const leftOrder = initialOrderSnapshot.has(String(left.id_registro))
                ? initialOrderSnapshot.get(String(left.id_registro))
                : Number.MAX_SAFE_INTEGER;
            const rightOrder = initialOrderSnapshot.has(String(right.id_registro))
                ? initialOrderSnapshot.get(String(right.id_registro))
                : Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return String(left.id_registro || '').localeCompare(String(right.id_registro || ''), 'es', {
                numeric: true,
                sensitivity: 'base'
            });
        };

        const auditorRecords = sourceRecords.filter((record) => hasAuditorValue(record));
        const remainingRecords = sourceRecords.filter((record) => !hasAuditorValue(record));

        return [
            ...auditorRecords.sort(compareByInitialOrder),
            ...remainingRecords.sort(compareByInitialOrder)
        ];
    }

    function normalizeClientFilterValue(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function normalizeClientFilterKey(value) {
        return normalizeClientFilterValue(value).toUpperCase();
    }

    function filterRecordsForClient(records, state) {
        const selectedValue = normalizeClientFilterValue(state && state.clientFilters && state.clientFilters.calidad);
        const selectedKey = normalizeClientFilterKey(selectedValue);

        if (!selectedKey) {
            return [...(records || [])];
        }

        return (records || []).filter((record) => (
            normalizeClientFilterKey(record && record.cliente) === selectedKey
        ));
    }

    function getTurnoExportLabel(record) {
        return String(record && record.calidad_turno ? record.calidad_turno : '').trim() || 'Selec';
    }

    function getStatusExportLabel(record) {
        return getDisplayCalidadState(record) || 'SELEC';
    }

    function getStartExportLabel(record) {
        return TintoreriaUtils.formatProcessDateTimeLabel(record && record.calidad_inicio) || 'click';
    }

    function getFinishExportLabel(record) {
        if (!record || !record.calidad_inicio) {
            return '--:--';
        }

        return TintoreriaUtils.formatElapsedTime(record.calidad_inicio, record.calidad_fin || new Date()) || '00:00';
    }

    function getExportRows(records, state, filter) {
        const visibleRecords = getVisibleRecords(records, filter);
        const searchedRecords = TintoreriaUtils.filterRecordsForSearch(visibleRecords, state, 'calidad');
        const clientFilteredRecords = filterRecordsForClient(searchedRecords, state);

        return clientFilteredRecords.map((record) => ({
            urgent: TintoreriaUtils.isUrgentPriority(record.calidad_p),
            cells: [
                record.calidad_p || '',
                record.cliente || '',
                TintoreriaUtils.formatOpPartida(record.op_tela, record.partida),
                record.cod_color || '',
                TintoreriaUtils.formatColorLabel(record.color),
                record.cod_art || '',
                record.articulo || '',
                record.peso_kg_crudo || '',
                record.cantidad_crudo || '',
                record.calidad_auditor || '',
                getTurnoExportLabel(record),
                getStartExportLabel(record),
                getFinishExportLabel(record),
                getStatusExportLabel(record)
            ]
        }));
    }

    function buildExportFileName() {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        return `calidad_${year}${month}${day}_${hours}${minutes}.xlsx`;
    }

    function exportCalidadWorkbook() {
        if (!window.TintoreriaExcelExport || typeof TintoreriaExcelExport.downloadStyledWorkbook !== 'function') {
            TintoreriaApp.showToast('La utilidad de exportacion no esta disponible.', 'error', 'Exportacion fallida');
            return;
        }

        try {
            const records = TintoreriaApp.getRecords();
            const state = TintoreriaApp.state;

            TintoreriaExcelExport.downloadStyledWorkbook({
                filename: buildExportFileName(),
                sheets: [
                    {
                        name: 'En_calidad',
                        columns: QUALITY_EXPORT_COLUMNS,
                        rows: getExportRows(records, state, 'ACTIVE')
                    },
                    {
                        name: 'PTDAS_RECHAZADAS',
                        columns: QUALITY_EXPORT_COLUMNS,
                        rows: getExportRows(records, state, 'REJECTED')
                    }
                ]
            });

            TintoreriaApp.showToast('Se descargo el Excel de Calidad con 2 hojas.', 'success', 'Exportacion completada');
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo exportar el archivo Excel.', 'error', 'Exportacion fallida');
        }
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
        const activeRecords = getActiveRecords(records);
        const rejectedRecords = getRejectedRecords(records);

        const activeCount = document.getElementById('count-calidad-active');
        const rejectedCount = document.getElementById('count-calidad-rejected');
        const activeSummary = document.getElementById('summary-calidad-active');
        const rejectedSummary = document.getElementById('summary-calidad-rejected');

        if (activeCount) {
            activeCount.textContent = String(activeRecords.length);
        }

        if (rejectedCount) {
            rejectedCount.textContent = String(rejectedRecords.length);
        }

        if (activeSummary) {
            activeSummary.textContent = TintoreriaUtils.formatSubtabSummary(activeRecords);
        }

        if (rejectedSummary) {
            rejectedSummary.textContent = TintoreriaUtils.formatSubtabSummary(rejectedRecords);
        }
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

        const filtered = TintoreriaUtils.filterRecordsForSearch(getVisibleRecords(records), state, 'calidad');
        renderSubtabCounts(records);

        if (!filtered.length) {
            const emptyLabel = currentFilter === 'REJECTED'
                ? 'No hay partidas rechazadas.'
                : 'No hay filas en Calidad.';

            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="14">${emptyLabel}</td>
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
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cantidad_crudo)}</span></td>
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
                        ${optionMarkup(getDisplayCalidadState(record), CALIDAD_ESTADO_OPTIONS, 'SELEC')}
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
                target.value = getDisplayCalidadState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Calidad',
                message: `Esta seguro que esta OP-Partida ya se audito y esta lista para pasar a embalaje tela? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = getDisplayCalidadState(currentRecord);
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
            target.value = field === 'calidad_estado'
                ? getDisplayCalidadState(currentRecord)
                : (currentRecord[field] || '');
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
        const shouldRun = getVisibleRecords(records).some((record) => record.calidad_inicio && !record.calidad_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'calidad') {
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
        document.querySelectorAll('[data-calidad-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.calidadFilter || 'ACTIVE';
                document.querySelectorAll('[data-calidad-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-calidad');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
        }

        const exportButton = document.getElementById('btn-export-calidad-excel');
        if (exportButton) {
            exportButton.addEventListener('click', exportCalidadWorkbook);
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
                filter: isRejectedRecord(record) ? 'REJECTED' : 'ACTIVE'
            };
        }
    });

    window.TintoreriaCalidad = {
        resetInitialOrderSnapshot
    };
})();
