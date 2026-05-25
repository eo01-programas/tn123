(() => {
    let currentFilter = 'ACTIVE';
    let durationTimer = null;
    let currentRejectRecordId = null;
    let qualityLookupQuery = '';
    let qualityLookupCommittedQuery = '';

    const PERSON_FIELDS = [
        'calidad_auditor',
        'supervisor_aprobacion',
        'supervisor_rechazo_1',
        'supervisor_rechazo_2',
        'supervisor_rechazo_3',
        'supervisor_rechazo_4'
    ];
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
        { key: 'supervisor_calidad', header: 'Supervisor', width: 18 },
        { key: 'calidad_turno', header: 'Turno', width: 10, align: 'center' },
        { key: 'calidad_inicio', header: 'Inicio', width: 12, align: 'center' },
        { key: 'calidad_fin', header: 'Fin', width: 12, align: 'center' },
        { key: 'calidad_estado', header: 'Status', width: 14, align: 'center' }
    ];

    function getCurrentUsername() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return '';
        }

        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim();
    }

    function isCalidadUser() {
        return getCurrentUsername() === 'Calidad';
    }

    function isPcpTextilUser() {
        return getCurrentUsername() === 'Pcp_textil';
    }

    function isPcpTextilQualityReadonly() {
        return isPcpTextilUser();
    }

    function syncAuditoriaButtonVisibility() {
        const button = document.getElementById('btn-auditoria-calidad');
        if (button) {
            button.classList.toggle('hidden', !isCalidadUser());
        }
    }

    function getQualityReadonlyControlAttrs(isReadonly) {
        return isReadonly
            ? ' disabled aria-disabled="true" tabindex="-1"'
            : '';
    }

    function getQualityControlClass(baseClassName, isReadonly) {
        return isReadonly
            ? `${baseClassName} quality-readonly-control`
            : baseClassName;
    }

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

        if (state === 'RECHAZADO' || state === '1ER RECHAZO') return '1er RECHAZO';
        if (state === '2DO RECHAZO') return '2do RECHAZO';
        if (state === '3ER RECHAZO') return '3er RECHAZO';
        if (state === '4TO RECHAZO') return '4to RECHAZO';

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

    function isRejectedRecord(record) {
        const state = normalizeCalidadState(record);
        return state === 'RECHAZADO' || state.includes('RECHAZO');
    }

    function getActiveRecords(records) {
        return getEligibleRecords(records).filter((record) => !isRejectedRecord(record));
    }

    function getRejectedRecords(records) {
        return getEligibleRecords(records).filter((record) => isRejectedRecord(record));
    }

    function getApprovedRecords(records) {
        return records.filter((record) => normalizeCalidadState(record) === 'OK');
    }

    function getVisibleRecords(records, filter = currentFilter) {
        if (filter === 'REJECTED') {
            return getRejectedRecords(records);
        }

        if (filter === 'APPROVED') {
            return getApprovedRecords(records);
        }

        return getActiveRecords(records);
    }

    function normalizeQualityLookupQuery(value) {
        return TintoreriaUtils.normalizeOpPartidaSearchValue(value);
    }

    function filterRecordsForQualityLookup(records, query = qualityLookupQuery, options = {}) {
        const { exact = false } = options;
        const normalizedQuery = normalizeQualityLookupQuery(query);
        if (!normalizedQuery) {
            return [...(records || [])];
        }

        return (records || []).filter((record) => {
            const opPartida = TintoreriaUtils.formatOpPartida(record && record.op_tela, record && record.partida);
            const normalizedOpPartida = normalizeQualityLookupQuery(opPartida);
            return exact
                ? normalizedOpPartida === normalizedQuery
                : normalizedOpPartida.includes(normalizedQuery);
        });
    }

    function setCurrentFilter(filter, options = {}) {
        const { rerender = true } = options;
        currentFilter = ['ACTIVE', 'REJECTED', 'APPROVED'].includes(filter) ? filter : 'ACTIVE';

        document.querySelectorAll('[data-calidad-filter]').forEach((node) => {
            node.classList.toggle('active', node.dataset.calidadFilter === currentFilter);
        });

        syncQualityPriorityColumnVisibility();

        if (rerender) {
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }
    }

    function syncQualityPriorityColumnVisibility() {
        const table = document.querySelector('table.quality-table');
        if (!table) {
            return;
        }

        table.classList.toggle('quality-table-hide-priority', currentFilter === 'APPROVED');
    }

    function clearQualityLookup(options = {}) {
        const { rerender = true } = options;
        qualityLookupQuery = '';
        qualityLookupCommittedQuery = '';
        if (rerender) {
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }
    }

    function getQualityLookupMatches(records, query) {
        const activeMatches = filterRecordsForQualityLookup(getActiveRecords(records), query, { exact: true });
        const rejectedMatches = filterRecordsForQualityLookup(getRejectedRecords(records), query, { exact: true });
        const approvedMatches = filterRecordsForQualityLookup(getApprovedRecords(records), query, { exact: true });

        return {
            activeMatches,
            rejectedMatches,
            approvedMatches
        };
    }

    function applyQualityLookup(query, options = {}) {
        const { silentNoMatch = false, cycleOnRepeat = false, markCommitted = false } = options;
        const normalizedQuery = normalizeQualityLookupQuery(query);
        if (!normalizedQuery) {
            clearQualityLookup();
            return true;
        }

        const records = TintoreriaApp.getRecords();
        const { activeMatches, rejectedMatches, approvedMatches } = getQualityLookupMatches(records, normalizedQuery);
        const hasActiveMatches = activeMatches.length > 0;
        const hasRejectedMatches = rejectedMatches.length > 0;
        const hasApprovedMatches = approvedMatches.length > 0;

        if (!hasActiveMatches && !hasRejectedMatches && !hasApprovedMatches) {
            if (markCommitted) {
                qualityLookupCommittedQuery = '';
            }
            if (!silentNoMatch) {
                TintoreriaApp.showToast(`No se encontro la partida ${query}.`, 'error', 'Sin resultados');
            }
            return false;
        }

        qualityLookupQuery = query.trim();

        const matchingFilters = [];
        if (hasActiveMatches) matchingFilters.push('ACTIVE');
        if (hasRejectedMatches) matchingFilters.push('REJECTED');
        if (hasApprovedMatches) matchingFilters.push('APPROVED');

        let targetFilter = matchingFilters[0] || 'ACTIVE';
        const shouldCycle = cycleOnRepeat
            && qualityLookupCommittedQuery === normalizedQuery
            && matchingFilters.length > 1;

        if (shouldCycle) {
            const currentIndex = matchingFilters.indexOf(currentFilter);
            targetFilter = matchingFilters[(currentIndex + 1) % matchingFilters.length];
        }

        if (markCommitted) {
            qualityLookupCommittedQuery = normalizedQuery;
        }

        setCurrentFilter(targetFilter);
        return true;
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

    function getSupervisorCalidadLabel(record) {
        const approvalSupervisor = String(record && record.supervisor_aprobacion ? record.supervisor_aprobacion : '').trim();
        if (approvalSupervisor) {
            return approvalSupervisor;
        }

        for (let index = 4; index >= 1; index -= 1) {
            const rejectionSupervisor = String(record && record[`supervisor_rechazo_${index}`] ? record[`supervisor_rechazo_${index}`] : '').trim();
            if (rejectionSupervisor) {
                return rejectionSupervisor;
            }
        }

        return '';
    }

    function getStatusExportLabel(record) {
        return getDisplayCalidadState(record) || 'SELEC';
    }

    function getStartExportLabel(record) {
        return TintoreriaUtils.formatProcessDateTimeLabel(record && record.calidad_inicio) || 'click';
    }

    function getFinishExportLabel(record, filter) {
        if (!record || !record.calidad_inicio) {
            return '--:--';
        }

        if (filter === 'APPROVED' && record.calidad_fin) {
            return TintoreriaUtils.formatProcessDateTimeLabel(record.calidad_fin) || '--:--';
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
                getSupervisorCalidadLabel(record),
                getTurnoExportLabel(record),
                getStartExportLabel(record),
                getFinishExportLabel(record, filter),
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
                    },
                    {
                        name: 'PTDAS_APROBADAS',
                        columns: QUALITY_EXPORT_COLUMNS,
                        rows: getExportRows(records, state, 'APPROVED')
                    }
                ]
            });

            TintoreriaApp.showToast('Se descargo el Excel de Calidad con 3 hojas.', 'success', 'Exportacion completada');
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

    function datalistOptionMarkup(options) {
        return (options || [])
            .filter((optionValue) => String(optionValue || '').trim() !== '')
            .map((optionValue) => `<option value="${TintoreriaUtils.escapeHtml(optionValue)}"></option>`)
            .join('');
    }

    function normalizeApprovalType(value) {
        return String(value || '').trim().toUpperCase();
    }

    function renderSubtabCounts(records) {
        const activeRecords = getActiveRecords(records);
        const rejectedRecords = getRejectedRecords(records);
        const approvedRecords = getApprovedRecords(records);

        const activeCount = document.getElementById('count-calidad-active');
        const rejectedCount = document.getElementById('count-calidad-rejected');
        const approvedCount = document.getElementById('count-calidad-approved');
        const activeSummary = document.getElementById('summary-calidad-active');
        const rejectedSummary = document.getElementById('summary-calidad-rejected');
        const approvedSummary = document.getElementById('summary-calidad-approved');

        if (activeCount) {
            activeCount.textContent = String(activeRecords.length);
        }

        if (rejectedCount) {
            rejectedCount.textContent = String(rejectedRecords.length);
        }

        if (approvedCount) {
            approvedCount.textContent = String(approvedRecords.length);
        }

        if (activeSummary) {
            activeSummary.textContent = TintoreriaUtils.formatSubtabSummary(activeRecords);
        }

        if (rejectedSummary) {
            rejectedSummary.textContent = TintoreriaUtils.formatSubtabSummary(rejectedRecords);
        }

        if (approvedSummary) {
            approvedSummary.textContent = TintoreriaUtils.formatSubtabSummary(approvedRecords);
        }
    }

    function renderStartMarkup(record, isReadonly = false) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.calidad_inicio);
        if (label) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(label)}</span>`;
        }

        if (isReadonly) {
            return '<span class="process-pill process-pill-muted">Pendiente</span>';
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="start">
                click
            </button>
        `;
    }

    function renderFinishMarkup(record, isReadonly = false) {
        if (!record.calidad_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.calidad_inicio, record.calidad_fin || new Date()) || '00:00';
        if (record.calidad_fin) {
            if (currentFilter === 'APPROVED') {
                const finishLabel = TintoreriaUtils.formatProcessDateTimeLabel(record.calidad_fin);
                return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(finishLabel || '--:--')}</span>`;
            }

            return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        if (isReadonly) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderInfoButtonMarkup(record) {
        return `
            <button
                class="ghost-button icon-only-button quality-info-button"
                type="button"
                data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}"
                data-action="show-info"
                title="Ver informaciÃ³n de calidad"
                aria-label="Ver informaciÃ³n de calidad"
            >
                <i class="ph ph-eye"></i>
            </button>
        `;
    }

    function renderTable(records, state) {
        syncAuditoriaButtonVisibility();

        const tbody = document.getElementById('tbody-calidad');
        if (!tbody) {
            return;
        }

        const isReadonly = isPcpTextilQualityReadonly();
        const readonlyAttrs = getQualityReadonlyControlAttrs(isReadonly);
        const priorityInputClass = getQualityControlClass('table-input mono', isReadonly);
        const textInputClass = getQualityControlClass('table-input', isReadonly);
        const selectClass = getQualityControlClass('table-select', isReadonly);

        const filtered = filterRecordsForQualityLookup(
            TintoreriaUtils.filterRecordsForSearch(getVisibleRecords(records), state, 'calidad')
        );
        renderSubtabCounts(records);

        if (!filtered.length) {
            const emptyLabel = qualityLookupQuery
                ? `No se encontraron filas para ${TintoreriaUtils.escapeHtml(qualityLookupQuery)} en este subtab.`
                : (currentFilter === 'REJECTED'
                    ? 'No hay partidas rechazadas.'
                    : (currentFilter === 'APPROVED'
                        ? 'No hay partidas aprobadas.'
                        : 'No hay filas en Calidad.'));

            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="15">${emptyLabel}</td>
                </tr>
            `;
            syncDurationTimer(records);
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.calidad_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="${priorityInputClass}" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.calidad_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_p"${readonlyAttrs}>
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td>
                    <div class="quality-op-cell">
                        ${currentFilter === 'REJECTED' ? renderInfoButtonMarkup(record) : ''}
                        <span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span>
                    </div>
                </td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cantidad_crudo)}</span></td>
                <td>
                    <input class="${textInputClass}" type="text" value="${TintoreriaUtils.escapeHtml(record.calidad_auditor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_auditor"${readonlyAttrs}>
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(getSupervisorCalidadLabel(record) || '--')}</span></td>
                <td>
                    <select class="${selectClass}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_turno"${readonlyAttrs}>
                        ${optionMarkup(record.calidad_turno || '', CALIDAD_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>${renderStartMarkup(record, isReadonly)}</td>
                <td>${renderFinishMarkup(record, isReadonly)}</td>
                <td>
                    <select class="${selectClass}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="calidad_estado"${readonlyAttrs}>
                        ${optionMarkup(getDisplayCalidadState(record), currentFilter === 'REJECTED' ? TintoreriaConfig.CALIDAD_ESTADO_RECHAZADAS_OPTIONS : TintoreriaConfig.CALIDAD_ESTADO_OPTIONS, 'SELEC')}
                    </select>
                </td>
            </tr>
        `).join('');

        syncDurationTimer(records);
    }

    async function handleEditableChange(event) {
        if (isPcpTextilQualityReadonly()) {
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            return;
        }

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
        let isRejectionStatus = false;
        let rejectNumber = 1;
        let finalStatus = nextValue;

        if (nextValue === '1er RECHAZO') {
            finalStatus = 'RECHAZADO';
            isRejectionStatus = true;
            rejectNumber = 1;
        } else if (nextValue === 'RECHAZADO') {
            isRejectionStatus = true;
            rejectNumber = 1;
        } else if (nextValue === '2do RECHAZO') {
            isRejectionStatus = true;
            rejectNumber = 2;
        } else if (nextValue === '3er RECHAZO') {
            isRejectionStatus = true;
            rejectNumber = 3;
        } else if (nextValue === '4to RECHAZO') {
            isRejectionStatus = true;
            rejectNumber = 4;
        }

        let oldRejectNumber = 0;
        const currentEstado = currentRecord.calidad_estado;
        if (currentEstado === 'RECHAZADO') oldRejectNumber = 1;
        else if (currentEstado === '2do RECHAZO') oldRejectNumber = 2;
        else if (currentEstado === '3er RECHAZO') oldRejectNumber = 3;
        else if (currentEstado === '4to RECHAZO') oldRejectNumber = 4;

        if (field === 'calidad_estado' && isRejectionStatus && rejectNumber !== oldRejectNumber) {
            openRejectModal(currentRecord, rejectNumber, finalStatus);
            return;
        }

        if (field === 'calidad_estado') {
            nextValue = finalStatus;
        }

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

            openApproveModal(currentRecord);
            return;
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

        if (isPcpTextilQualityReadonly() && trigger.dataset.action !== 'show-info') {
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

        if (action === 'show-info') {
            openInfoModal(currentRecord);
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

    let currentRejectNumber = 1;
    let currentRejectStatus = 'RECHAZADO';

    function getInfoModalElements() {
        return {
            modal: document.getElementById('calidad-info-modal'),
            title: document.getElementById('calidad-info-title'),
            subtitle: document.getElementById('calidad-info-subtitle'),
            closeBtn: document.getElementById('calidad-info-close'),
            cantidadRechazos: document.getElementById('calidad-info-cantidad-rechazos'),
            motivosBlock: document.getElementById('calidad-info-motivos-block'),
            motivos: document.getElementById('calidad-info-motivos'),
            observacion: document.getElementById('calidad-info-observacion')
        };
    }

    function getRejectReasonEntries(record) {
        return [1, 2, 3, 4]
            .map((index) => {
                const value = String(record && record[`motivo_rechazo_${index}`] || '').trim();
                if (!value) {
                    return null;
                }

                const supervisor = String(record && record[`supervisor_rechazo_${index}`] || '').trim();

                return {
                    label: `Motivo ${index}`,
                    value,
                    supervisor
                };
            })
            .filter(Boolean);
    }

    function openInfoModal(record) {
        const {
            modal,
            title,
            subtitle,
            cantidadRechazos,
            motivosBlock,
            motivos,
            observacion
        } = getInfoModalElements();

        if (!record || !(modal instanceof HTMLElement)) {
            return;
        }

        if (title) title.textContent = `${record.cliente || ''} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${TintoreriaUtils.formatColorLabel(record.color)}`;
        if (subtitle) subtitle.textContent = `${record.cod_art || ''} - ${record.articulo || ''}`;
        if (cantidadRechazos) {
            cantidadRechazos.textContent = String(record.cantidad_rechazos || '0').trim() || '0';
        }

        const reasonEntries = getRejectReasonEntries(record);
        if (motivosBlock instanceof HTMLElement) {
            motivosBlock.classList.toggle('hidden', reasonEntries.length === 0);
        }
        if (motivos) {
            motivos.innerHTML = reasonEntries.map((entry) => `
                <div>
                    <strong>${TintoreriaUtils.escapeHtml(entry.label)}:</strong>
                    <span>${TintoreriaUtils.escapeHtml(entry.value)}</span>
                    ${entry.supervisor ? `
                        <span> &rarr; <strong>Supervisor:</strong> ${TintoreriaUtils.escapeHtml(entry.supervisor)}</span>
                    ` : ''}
                </div>
            `).join('');
        }

        if (observacion) {
            observacion.textContent = String(record.observacion_calidad || '').trim() || 'Sin observaciones registradas.';
        }

        modal.classList.remove('hidden');
    }

    function closeInfoModal() {
        const { modal } = getInfoModalElements();
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    function getRejectModalElements() {
        return {
            modal: document.getElementById('calidad-reject-modal'),
            title: document.getElementById('calidad-reject-title'),
            subtitle: document.getElementById('calidad-reject-subtitle'),
            form: document.getElementById('calidad-reject-form'),
            closeBtn: document.getElementById('calidad-reject-close'),
            clearBtn: document.getElementById('calidad-reject-clear'),
            saveBtn: document.getElementById('calidad-reject-save'),
            voiceBtn: document.getElementById('calidad-voice-btn'),
            supervisorInput: document.getElementById('calidad-supervisor-rechazo'),
            observacion: document.getElementById('calidad-observacion'),
            motivoInput: document.getElementById('calidad-motivo-rechazo'),
            motivoList: document.getElementById('calidad-motivo-rechazo-list')
        };
    }

    function openRejectModal(record, rejectNumber = 1, finalStatus = 'RECHAZADO') {
        const { modal, title, subtitle, form, motivoInput, motivoList, observacion, supervisorInput } = getRejectModalElements();
        if (!record || !(modal instanceof HTMLElement)) {
            return;
        }

        currentRejectRecordId = record.id_registro;
        currentRejectNumber = rejectNumber;
        currentRejectStatus = finalStatus;

        if (title) title.textContent = `${record.cliente || ''} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${TintoreriaUtils.formatColorLabel(record.color)}`;
        if (subtitle) subtitle.textContent = `${record.cod_art || ''} - ${record.articulo || ''}`;

        if (motivoInput) {
            motivoInput.name = `motivo_rechazo_${rejectNumber}`;
            motivoInput.value = record[`motivo_rechazo_${rejectNumber}`] || '';
        }

        if (motivoList) {
            motivoList.innerHTML = datalistOptionMarkup(TintoreriaConfig.MOTIVOS_RECHAZO_OPTIONS || []);
        }

        if (observacion) {
            observacion.name = 'observacion_calidad';
        }

        if (supervisorInput) {
            supervisorInput.name = `supervisor_rechazo_${rejectNumber}`;
        }

        if (form instanceof HTMLFormElement) {
            form.reset();
            const formData = new FormData(form);
            for (const key of formData.keys()) {
                const input = form.elements.namedItem(key);
                if (input && 'value' in input) {
                    input.value = record[key] || '';
                }
            }
        }

        modal.classList.remove('hidden');
    }

    function closeRejectModal() {
        const { modal, form } = getRejectModalElements();
        if (modal) {
            modal.classList.add('hidden');
        }
        if (form instanceof HTMLFormElement) {
            form.reset();
        }
        currentRejectRecordId = null;
        
        renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
    }

    async function handleRejectSave() {
        if (!currentRejectRecordId) return;

        const { form } = getRejectModalElements();
        if (!(form instanceof HTMLFormElement)) return;

        const formData = new FormData(form);
        const updates = {
            calidad_estado: currentRejectStatus,
            cantidad_rechazos: String(currentRejectNumber)
        };
        const rejectTurnoField = getRejectTurnoField(currentRejectNumber);

        if (rejectTurnoField) {
            updates[rejectTurnoField] = TintoreriaUtils.calculateProductionTurno();
        }

        for (const [key, value] of formData.entries()) {
            const trimmedValue = String(value).trim();
            if (key.startsWith('motivo_rechazo_')) {
                updates[key] = trimmedValue.toUpperCase();
                continue;
            }

            updates[key] = PERSON_FIELDS.includes(key)
                ? TintoreriaUtils.sanitizePersonName(trimmedValue)
                : trimmedValue;
        }

        const recordId = currentRejectRecordId;
        closeRejectModal();

        try {
            await TintoreriaApp.saveRecordChanges(recordId, updates);
            TintoreriaApp.showToast('Rechazo registrado exitosamente.', 'success', 'Operacion completada');
        } catch (error) {
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el rechazo.', 'error', 'Error al guardar');
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }
    }

    function handleVoiceDictation() {
        const { observacion } = getRejectModalElements();
        if (!observacion) return;

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            TintoreriaApp.showToast('Tu navegador no soporta el reconocimiento de voz.', 'error', 'FunciÃ³n no disponible');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() {
            TintoreriaApp.showToast('Escuchando... Habla ahora.', 'info', 'MicrÃ³fono activo');
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            const currentValue = observacion.value;
            observacion.value = currentValue ? `${currentValue} ${transcript}` : transcript;
        };

        recognition.onerror = function(event) {
            TintoreriaApp.showToast(`Error de reconocimiento: ${event.error}`, 'error', 'Error');
        };

        recognition.start();
        recognition.start();
    }

    function getRejectTurnoField(rejectNumber) {
        const normalizedRejectNumber = Number.parseInt(rejectNumber, 10);
        if (normalizedRejectNumber < 1 || normalizedRejectNumber > 4) {
            return '';
        }

        return `turno_rechazo_${normalizedRejectNumber}`;
    }

    let currentApproveRecordId = null;

    function getApproveModalElements() {
        return {
            modal: document.getElementById('calidad-approve-modal'),
            title: document.getElementById('calidad-approve-title'),
            subtitle: document.getElementById('calidad-approve-subtitle'),
            form: document.getElementById('calidad-approve-form'),
            closeBtn: document.getElementById('calidad-approve-close'),
            clearBtn: document.getElementById('calidad-approve-clear'),
            saveBtn: document.getElementById('calidad-approve-save'),
            voiceBtn: document.getElementById('calidad-approve-voice-btn'),
            supervisorInput: document.getElementById('calidad-supervisor-aprobacion'),
            observacion: document.getElementById('calidad-approve-observacion'),
            tipoSelect: document.getElementById('calidad-tipo-aprobacion'),
            quienSelect: document.getElementById('calidad-quien-aprobo')
        };
    }

    function openApproveModal(record) {
        const { modal, title, subtitle, form, tipoSelect, quienSelect, observacion, supervisorInput } = getApproveModalElements();
        if (!record || !(modal instanceof HTMLElement)) {
            return;
        }

        currentApproveRecordId = record.id_registro;

        if (title) title.textContent = `${record.cliente || ''} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${TintoreriaUtils.formatColorLabel(record.color)}`;
        if (subtitle) subtitle.textContent = `${record.cod_art || ''} - ${record.articulo || ''}`;

        if (tipoSelect) {
            tipoSelect.innerHTML = optionMarkup(normalizeApprovalType(record.tipo_aprobacion), TintoreriaConfig.TIPO_APROBACION_OPTIONS || [], 'Seleccionar tipo...');
        }
        if (quienSelect) {
            quienSelect.innerHTML = optionMarkup(record.quien_aprobo || '', TintoreriaConfig.QUIEN_APROBO_OPTIONS || [], 'Seleccionar quiÃ©n...');
        }

        if (form instanceof HTMLFormElement) {
            form.reset();
            const formData = new FormData(form);
            for (const key of formData.keys()) {
                const input = form.elements.namedItem(key);
                if (input && 'value' in input) {
                    input.value = record[key] || '';
                }
            }
        }

        modal.classList.remove('hidden');
    }

    function closeApproveModal() {
        const { modal, form } = getApproveModalElements();
        if (modal) {
            modal.classList.add('hidden');
        }
        if (form instanceof HTMLFormElement) {
            form.reset();
        }
        currentApproveRecordId = null;
        
        renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
    }

    async function handleApproveSave() {
        if (!currentApproveRecordId) return;

        const { form } = getApproveModalElements();
        if (!(form instanceof HTMLFormElement)) return;

        const formData = new FormData(form);
        const updates = {
            calidad_estado: 'OK',
            turno_aprobacion: TintoreriaUtils.calculateProductionTurno()
        };

        for (const [key, value] of formData.entries()) {
            const trimmedValue = String(value).trim();
            if (key.startsWith('motivo_rechazo_')) {
                updates[key] = trimmedValue.toUpperCase();
                continue;
            }

            updates[key] = PERSON_FIELDS.includes(key)
                ? TintoreriaUtils.sanitizePersonName(trimmedValue)
                : trimmedValue;
        }

        const recordId = currentApproveRecordId;
        closeApproveModal();

        try {
            await TintoreriaApp.saveRecordChanges(recordId, updates);
            TintoreriaApp.showToast('Aprobacion registrada exitosamente.', 'success', 'Operacion completada');
        } catch (error) {
            TintoreriaApp.showToast(error.message || 'No se pudo guardar la aprobaciÃ³n.', 'error', 'Error al guardar');
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }
    }

    function handleApproveVoiceDictation() {
        const { observacion } = getApproveModalElements();
        if (!observacion) return;

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            TintoreriaApp.showToast('Tu navegador no soporta el reconocimiento de voz.', 'error', 'FunciÃ³n no disponible');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() {
            TintoreriaApp.showToast('Escuchando... Habla ahora.', 'info', 'MicrÃ³fono activo');
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            const currentValue = observacion.value;
            observacion.value = currentValue ? `${currentValue} ${transcript}` : transcript;
        };

        recognition.onerror = function(event) {
            TintoreriaApp.showToast(`Error de reconocimiento: ${event.error}`, 'error', 'Error');
        };

        recognition.start();
    }

    function getAuditoriaModalElements() {
        return {
            modal: document.getElementById('calidad-auditoria-modal'),
            closeBtn: document.getElementById('calidad-auditoria-close'),
            searchInput: document.getElementById('calidad-auditoria-search'),
            searchBtn: document.getElementById('calidad-auditoria-search-btn'),
            tbody: document.getElementById('calidad-auditoria-tbody'),
            selectAll: document.getElementById('calidad-auditoria-select-all'),
            form: document.getElementById('calidad-auditoria-form'),
            turnoSelect: document.getElementById('calidad-auditoria-turno'),
            auditorInput: document.getElementById('calidad-auditoria-auditor'),
            actions: document.getElementById('calidad-auditoria-actions'),
            clearBtn: document.getElementById('calidad-auditoria-clear'),
            saveBtn: document.getElementById('calidad-auditoria-save')
        };
    }

    function isAuditoriaAlreadyRegistered(record) {
        return Boolean(record && String(record.calidad_inicio || '').trim());
    }

    function getAuditoriaRegisteredStatus(record) {
        if (!isAuditoriaAlreadyRegistered(record)) {
            return 'Pendiente';
        }

        if (normalizeCalidadState(record) === 'OK') {
            return 'YA FUE REGISTRADO: APROBADO';
        }

        if (isRejectedRecord(record)) {
            const reasons = getRejectReasonEntries(record);
            const reasonLabel = reasons.length
                ? ` - ${reasons.map((entry) => `${entry.label}: ${entry.value}`).join(' | ')}`
                : '';
            return `YA FUE REGISTRADO: ${getDisplayCalidadState(record).toUpperCase()}${reasonLabel}`;
        }

        return 'YA FUE REGISTRADO: AUDITANDO';
    }

    function openAuditoriaModal() {
        if (!isCalidadUser()) {
            return;
        }

        const els = getAuditoriaModalElements();
        if (!els.modal) return;
        
        els.searchInput.value = '';
        els.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray-500);">Realiza una busqueda para ver resultados</td></tr>';
        els.form.classList.add('hidden');
        els.actions.classList.add('hidden');
        els.selectAll.checked = false;
        
        els.turnoSelect.value = TintoreriaUtils.calculateProductionTurno();
        els.auditorInput.value = '';

        els.modal.classList.remove('hidden');
        els.searchInput.focus();
    }

    function closeAuditoriaModal() {
        const els = getAuditoriaModalElements();
        if (els.modal) els.modal.classList.add('hidden');
    }

    function renderAuditoriaTable(query) {
        const els = getAuditoriaModalElements();
        if (!query.trim()) {
            els.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray-500);">Realiza una busqueda para ver resultados</td></tr>';
            els.form.classList.add('hidden');
            els.actions.classList.add('hidden');
            return;
        }

        const records = TintoreriaApp.getRecords();
        const normalizedQuery = TintoreriaUtils.normalizeOpPartidaSearchValue(query);

        const filtered = records.filter(record => {
            const opPartida = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
            return TintoreriaUtils.normalizeOpPartidaSearchValue(opPartida) === normalizedQuery;
        });

        if (filtered.length === 0) {
            els.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray-500);">No se encontraron partidas</td></tr>';
            els.form.classList.add('hidden');
            els.actions.classList.add('hidden');
            return;
        }

        els.tbody.innerHTML = filtered.map(record => `
            <tr>
                <td style="text-align: center;">${isAuditoriaAlreadyRegistered(record)
                    ? '<span class="cell-text" style="font-size:12px; color: var(--gray-500);">Registrado</span>'
                    : `<input type="checkbox" class="auditoria-row-checkbox" value="${TintoreriaUtils.escapeHtml(record.id_registro)}">`
                }</td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.cliente || '')}">${TintoreriaUtils.escapeHtml(record.cliente || '')}</span></td>
                <td><strong class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</strong></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo || '')}">${TintoreriaUtils.escapeHtml(record.articulo || '')}</span></td>
                <td>${TintoreriaUtils.escapeHtml(record.peso_kg_crudo || '0')}</td>
                <td>${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</td>
            </tr>
        `).join('');

        els.selectAll.checked = false;
        els.form.classList.add('hidden');
        els.actions.classList.add('hidden');
    }

    function handleAuditoriaSearch() {
        const els = getAuditoriaModalElements();
        renderAuditoriaTable(els.searchInput.value);
    }

    function updateAuditoriaFormVisibility() {
        const els = getAuditoriaModalElements();
        const anyChecked = Array.from(els.tbody.querySelectorAll('.auditoria-row-checkbox')).some(cb => cb.checked);
        if (anyChecked) {
            els.form.classList.remove('hidden');
            els.actions.classList.remove('hidden');
        } else {
            els.form.classList.add('hidden');
            els.actions.classList.add('hidden');
        }
    }

    async function handleAuditoriaSave() {
        const els = getAuditoriaModalElements();
        const selectedIds = Array.from(els.tbody.querySelectorAll('.auditoria-row-checkbox:checked')).map(cb => cb.value);
        
        if (selectedIds.length === 0) return;
        
        const turno = els.turnoSelect.value;
        const auditor = els.auditorInput.value.trim().toUpperCase();

        if (!auditor) {
            TintoreriaApp.showToast('Por favor ingresa el nombre del Auditor.', 'error', 'Falta Auditor');
            els.auditorInput.focus();
            return;
        }

        els.saveBtn.disabled = true;
        els.saveBtn.textContent = 'Guardando...';

        try {
            const promises = selectedIds.map(id => {
                const record = TintoreriaApp.findRecord(id);
                if (!record) return Promise.resolve();

                const updates = {
                    calidad_turno: turno,
                    calidad_auditor: auditor,
                    calidad_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                };

                const ruta = String(record.ruta || '').toUpperCase();

                if (ruta.includes('HUMECT') || ruta.includes('TERMOFI')) {
                    updates.plegado_estado = 'OK';
                    updates.rama_crudo_estado = 'OK';
                    updates.preparado_estado = 'OK';
                    updates.tenido_estado = 'OK';
                    updates.abridora_estado = 'OK';
                    updates.rama_tenido_estado = 'OK';
                    updates.acabado_especial_estado = 'OK';
                    updates.acab_espec_estado = 'OK';
                } else if (ruta.includes('DIRECTO')) {
                    updates.preparado_estado = 'OK';
                    updates.tenido_estado = 'OK';
                    updates.abridora_estado = 'OK';
                    updates.rama_tenido_estado = 'OK';
                    updates.acabado_especial_estado = 'OK';
                    updates.acab_espec_estado = 'OK';
                }

                return TintoreriaApp.saveRecordChanges(id, updates, { silent: true });
            });
            await Promise.all(promises);

            TintoreriaApp.showToast(`Auditoria guardada exitosamente en ${selectedIds.length} partida(s).`, 'success', 'Operacion completada');
            closeAuditoriaModal();
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        } catch (error) {
            TintoreriaApp.showToast(error.message || 'Error al guardar la auditoria.', 'error', 'Error');
        } finally {
            els.saveBtn.disabled = false;
            els.saveBtn.textContent = 'Guardar Auditoria';
        }
    }

    function init() {
        syncAuditoriaButtonVisibility();

        document.querySelectorAll('[data-calidad-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                setCurrentFilter(button.dataset.calidadFilter || 'ACTIVE');
            });
        });

        const tbody = document.getElementById('tbody-calidad');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
        }

        const qualitySearchInput = document.getElementById('calidad-toolbar-search');
        if (qualitySearchInput) {
            qualitySearchInput.addEventListener('input', () => {
                const nextValue = qualitySearchInput.value;
                if (!nextValue.trim()) {
                    clearQualityLookup();
                    return;
                }

                qualityLookupCommittedQuery = '';
                qualityLookupQuery = nextValue.trim();
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });

            qualitySearchInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                const applied = applyQualityLookup(qualitySearchInput.value, {
                    cycleOnRepeat: true,
                    markCommitted: true
                });
                if (!applied) {
                    qualityLookupQuery = qualitySearchInput.value.trim();
                    renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
                }
            });
        }

        const exportButton = document.getElementById('btn-export-calidad-excel');
        if (exportButton) {
            exportButton.addEventListener('click', exportCalidadWorkbook);
        }

        const { modal, closeBtn, clearBtn, saveBtn, voiceBtn, form } = getRejectModalElements();
        if (closeBtn) closeBtn.addEventListener('click', closeRejectModal);
        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (form) form.reset();
        });
        if (saveBtn) saveBtn.addEventListener('click', handleRejectSave);
        if (voiceBtn) voiceBtn.addEventListener('click', handleVoiceDictation);
        
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeRejectModal();
            });
        }

        document.addEventListener('keydown', (event) => {
            const { modal: rejectModal } = getRejectModalElements();
            if (event.key === 'Escape' && rejectModal && !rejectModal.classList.contains('hidden')) {
                closeRejectModal();
            }
            const { modal: approveModal } = getApproveModalElements();
            if (event.key === 'Escape' && approveModal && !approveModal.classList.contains('hidden')) {
                closeApproveModal();
            }
            const { modal: auditoriaModal } = getAuditoriaModalElements();
            if (event.key === 'Escape' && auditoriaModal && !auditoriaModal.classList.contains('hidden')) {
                closeAuditoriaModal();
            }
            const { modal: infoModal } = getInfoModalElements();
            if (event.key === 'Escape' && infoModal && !infoModal.classList.contains('hidden')) {
                closeInfoModal();
            }
        });

        const { modal: approveModal, closeBtn: approveCloseBtn, clearBtn: approveClearBtn, saveBtn: approveSaveBtn, voiceBtn: approveVoiceBtn, form: approveForm } = getApproveModalElements();
        if (approveCloseBtn) approveCloseBtn.addEventListener('click', closeApproveModal);
        if (approveClearBtn) approveClearBtn.addEventListener('click', () => {
            if (approveForm) approveForm.reset();
        });
        if (approveSaveBtn) approveSaveBtn.addEventListener('click', handleApproveSave);
        if (approveVoiceBtn) approveVoiceBtn.addEventListener('click', handleApproveVoiceDictation);
        
        if (approveModal) {
            approveModal.addEventListener('click', (event) => {
                if (event.target === approveModal) closeApproveModal();
            });
        }

        const { modal: infoModal, closeBtn: infoCloseBtn } = getInfoModalElements();
        if (infoCloseBtn) infoCloseBtn.addEventListener('click', closeInfoModal);
        if (infoModal) {
            infoModal.addEventListener('click', (event) => {
                if (event.target === infoModal) closeInfoModal();
            });
        }

        const btnAuditoria = document.getElementById('btn-auditoria-calidad');
        if (btnAuditoria) {
            btnAuditoria.addEventListener('click', openAuditoriaModal);
        }

        const elsAud = getAuditoriaModalElements();
        if (elsAud.closeBtn) elsAud.closeBtn.addEventListener('click', closeAuditoriaModal);
        if (elsAud.clearBtn) elsAud.clearBtn.addEventListener('click', () => {
            elsAud.selectAll.checked = false;
            elsAud.tbody.querySelectorAll('.auditoria-row-checkbox').forEach(cb => cb.checked = false);
            updateAuditoriaFormVisibility();
        });
        if (elsAud.searchBtn) elsAud.searchBtn.addEventListener('click', handleAuditoriaSearch);
        if (elsAud.searchInput) {
            elsAud.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleAuditoriaSearch();
            });
        }
        if (elsAud.saveBtn) elsAud.saveBtn.addEventListener('click', handleAuditoriaSave);
        
        if (elsAud.selectAll) {
            elsAud.selectAll.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                elsAud.tbody.querySelectorAll('.auditoria-row-checkbox').forEach(cb => cb.checked = isChecked);
                updateAuditoriaFormVisibility();
            });
        }
        
        if (elsAud.tbody) {
            elsAud.tbody.addEventListener('change', (e) => {
                if (e.target.classList.contains('auditoria-row-checkbox')) {
                    const allCbs = Array.from(elsAud.tbody.querySelectorAll('.auditoria-row-checkbox'));
                    elsAud.selectAll.checked = allCbs.length > 0 && allCbs.every(cb => cb.checked);
                    updateAuditoriaFormVisibility();
                }
            });
        }
        
        if (elsAud.modal) {
            elsAud.modal.addEventListener('click', (event) => {
                if (event.target === elsAud.modal) closeAuditoriaModal();
            });
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
            if (normalizeCalidadState(record) === 'OK') {
                return {
                    filter: 'APPROVED'
                };
            }

            if (!getEligibleRecords([record]).length) {
                return null;
            }

            return {
                filter: isRejectedRecord(record) ? 'REJECTED' : 'ACTIVE'
            };
        }
    });

    function sortRecordsForPageLoad(records) {
        const source = [...(records || [])];

        return source
            .map((record, index) => ({
                record,
                index,
                hasAuditor: Boolean(String(record && record.calidad_auditor ? record.calidad_auditor : '').trim())
            }))
            .sort((left, right) => {
                if (left.hasAuditor !== right.hasAuditor) {
                    return left.hasAuditor ? -1 : 1;
                }

                return left.index - right.index;
            })
            .map((entry) => entry.record);
    }

    window.TintoreriaCalidad = {
        sortRecordsForPageLoad
    };
})();

