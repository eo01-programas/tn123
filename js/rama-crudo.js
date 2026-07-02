(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;
    const editingRouteRecordIds = new Set();
    const RAMA_CRUDO_ROUTE_OPTIONS = ['', 'Termofijado', 'Humectado'];
    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // Por procesar (13): P | cliente | tela | OP-PTDA | color | cod_art | articulo | kg | Turno | MAQ | ruta | Inicio | Status
    const RAMA_CRUDO_WIDTHS = [37, 70, 40, 108, 100, 90, 262, 68, 60, 60, 85, 75, 80];
    let detailModalRecordId = null;
    const DETAIL_FIELDS = [
        'ancho_crudo',
        'densidad_crudo',
        'rama_crudo_ancho',
        'rama_crudo_densidad',
        'rama_crudo_temperatura',
        'rama_crudo_velocidad',
        'rama_crudo_alimentacion',
        'rama_crudo_ancho_de_cadena',
        'rama_crudo_orillo_derecho',
        'rama_crudo_orillo_izquierdo',
        'rama_crudo_observaciones'
    ];

    const PERSON_FIELDS = [
        'rama_crudo_operario',
        'rama_crudo_inspector',
        'rama_crudo_supervisor'
    ];

    function normalizeRamaCrudoState(record) {
        return String(record.rama_crudo_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => (
            String(record.plegado_estado || '').trim() === 'OK'
        ));
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            const sorted = eligible
                .filter((record) => ['PROG', 'OK'].includes(normalizeRamaCrudoState(record)))
                .sort((a, b) => {
                    const dateA = TintoreriaUtils.parseDateish(a.rama_crudo_fin);
                    const dateB = TintoreriaUtils.parseDateish(b.rama_crudo_fin);
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateB.getTime() - dateA.getTime();
                });
            return TintoreriaProcessedWindow.filterToWindow('rama-crudo', sorted, getProcessedDate);
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => !['PROG', 'OK'].includes(normalizeRamaCrudoState(record))),
            'rama_crudo_p'
        ).sort((a, b) => {
            const aHasInicio = Boolean(a.rama_crudo_inicio);
            const bHasInicio = Boolean(b.rama_crudo_inicio);
            if (aHasInicio !== bHasInicio) {
                return aHasInicio ? -1 : 1;
            }
            return 0;
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

    function normalizeRamaCrudoRoute(value) {
        const normalized = String(value === undefined || value === null ? '' : value)
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return '';
        }

        if (normalized.toUpperCase() === 'TERMOFICADO') {
            return 'Termofijado';
        }

        return normalized;
    }

    function renderRouteMarkup(record) {
        const normalizedRoute = normalizeRamaCrudoRoute(record.ruta);
        const recordId = TintoreriaUtils.escapeHtml(record.id_registro);

        if (editingRouteRecordIds.has(record.id_registro)) {
            return `
                <select class="table-select route-inline-select" data-record-id="${recordId}" data-field="ruta" data-inline-edit="ruta" autofocus>
                    ${optionMarkup(normalizedRoute, RAMA_CRUDO_ROUTE_OPTIONS)}
                </select>
            `;
        }

        const routeLabel = normalizedRoute || 'Selec';
        let routeClass = 'route-empty';
        if (normalizedRoute) {
            const lowerRoute = normalizedRoute.toLowerCase();
            if (lowerRoute === 'termofijado') {
                routeClass = 'route-termofijado';
            } else if (lowerRoute === 'humectado') {
                routeClass = 'route-humectado';
            } else if (lowerRoute === 'directo') {
                routeClass = 'route-directo';
            } else {
                routeClass = 'route-filled';
            }
        }

        return `
            <span
                class="status-chip ${routeClass} route-readonly-chip"
                data-record-id="${recordId}"
                data-action="edit-route"
                title="Doble clic para cambiar ruta"
            >
                ${TintoreriaUtils.escapeHtml(routeLabel)}
            </span>
        `;
    }

    function sanitizeDigitsInput(value, maxDigits) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/\D/g, '')
            .slice(0, maxDigits);
    }

    function sanitizeDecimalInput(value, maxIntegerDigits, maxDecimalDigits) {
        const rawValue = String(value === undefined || value === null ? '' : value)
            .replace(/,/g, '.')
            .replace(/[^\d.]/g, '');
        const parts = rawValue.split('.');
        const integerPart = (parts.shift() || '').replace(/\D/g, '').slice(0, maxIntegerDigits);
        const decimalPart = parts.join('').replace(/\D/g, '').slice(0, maxDecimalDigits);

        if (!integerPart && !decimalPart) {
            return '';
        }

        if (rawValue.includes('.') && maxDecimalDigits > 0) {
            return `${integerPart || '0'}.${decimalPart}`;
        }

        return integerPart;
    }

    function sanitizeDetailInputValue(field, value) {
        if (
            field === 'ancho_crudo' ||
            field === 'densidad_crudo' ||
            field === 'rama_crudo_ancho' ||
            field === 'rama_crudo_densidad' ||
            field === 'rama_crudo_temperatura' ||
            field === 'rama_crudo_ancho_de_cadena'
        ) {
            return sanitizeDigitsInput(value, 3);
        }

        if (field === 'rama_crudo_alimentacion') {
            return TintoreriaUtils.sanitizeNumericRatio(value);
        }

        if (field === 'rama_crudo_velocidad') {
            return sanitizeDecimalInput(value, 3, 1);
        }

        if (field === 'rama_crudo_orillo_derecho' || field === 'rama_crudo_orillo_izquierdo') {
            return sanitizeDecimalInput(value, 1, 1);
        }

        if (field === 'rama_crudo_observaciones') {
            return TintoreriaUtils.sanitizeUppercaseText(value);
        }

        return String(value === undefined || value === null ? '' : value).trim();
    }

    function getDetailModalElements() {
        return {
            modal: document.getElementById('rama-crudo-detail-modal'),
            form: document.getElementById('rama-crudo-detail-form'),
            title: document.getElementById('rama-crudo-detail-title'),
            subtitle: document.getElementById('rama-crudo-detail-subtitle'),
            close: document.getElementById('rama-crudo-detail-close'),
            clear: document.getElementById('rama-crudo-detail-clear'),
            save: document.getElementById('rama-crudo-detail-save')
        };
    }

    function collectDetailFormValues() {
        const { form } = getDetailModalElements();
        if (!(form instanceof HTMLFormElement)) {
            return {};
        }

        return DETAIL_FIELDS.reduce((changes, field) => {
            const element = form.elements.namedItem(field);
            const rawValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
                ? element.value
                : '';
            const nextValue = sanitizeDetailInputValue(field, rawValue);

            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.value = nextValue;
            }

            changes[field] = nextValue;
            return changes;
        }, {});
    }

    function validateDetailValues(changes) {
        if (changes.ancho_crudo && (!/^\d{2,3}$/.test(changes.ancho_crudo) || Number(changes.ancho_crudo) > 240)) {
            return 'ancho_crudo solo admite 2 a 3 digitos y maximo 240.';
        }

        if (changes.densidad_crudo && !/^\d{2,3}$/.test(changes.densidad_crudo)) {
            return 'densidad_crudo solo admite 2 a 3 digitos.';
        }

        if (changes.rama_crudo_ancho && (!/^\d{2,3}$/.test(changes.rama_crudo_ancho) || Number(changes.rama_crudo_ancho) > 240)) {
            return 'rama_crudo_ancho solo admite 2 a 3 digitos y maximo 240.';
        }

        if (changes.rama_crudo_densidad && !/^\d{2,3}$/.test(changes.rama_crudo_densidad)) {
            return 'rama_crudo_densidad solo admite 2 a 3 digitos.';
        }

        if (changes.rama_crudo_temperatura && !/^\d{3}$/.test(changes.rama_crudo_temperatura)) {
            return 'rama_crudo_temperatura solo admite 3 digitos.';
        }

        if (changes.rama_crudo_velocidad && !/^\d{1,3}(?:\.\d)?$/.test(changes.rama_crudo_velocidad)) {
            return 'rama_crudo_velocidad solo admite hasta 3 digitos con un decimal opcional.';
        }

        if (changes.rama_crudo_alimentacion && !TintoreriaUtils.isValidNumericRatio(changes.rama_crudo_alimentacion, 2)) {
            return 'rama_crudo_alimentacion admite 1 a 2 digitos o formato numero/numero.';
        }

        if (changes.rama_crudo_ancho_de_cadena && (!/^\d{2,3}$/.test(changes.rama_crudo_ancho_de_cadena) || Number(changes.rama_crudo_ancho_de_cadena) > 240)) {
            return 'rama_crudo_ancho_de_cadena solo admite 2 a 3 digitos y maximo 240.';
        }

        if (changes.rama_crudo_orillo_derecho && (!/^\d(?:\.\d)?$/.test(changes.rama_crudo_orillo_derecho) || Number(changes.rama_crudo_orillo_derecho) > 9.9)) {
            return 'rama_crudo_orillo_derecho solo admite un decimal y maximo 9.9.';
        }

        if (changes.rama_crudo_orillo_izquierdo && (!/^\d(?:\.\d)?$/.test(changes.rama_crudo_orillo_izquierdo) || Number(changes.rama_crudo_orillo_izquierdo) > 9.9)) {
            return 'rama_crudo_orillo_izquierdo solo admite un decimal y maximo 9.9.';
        }

        return '';
    }

    function populateDetailForm(record) {
        const { form, title, subtitle } = getDetailModalElements();
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        if (title) {
            title.textContent = `${record.cliente || ''} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${TintoreriaUtils.formatColorLabel(record.color)}`;
        }

        if (subtitle) {
            subtitle.textContent = `${record.cod_art || ''} - ${record.articulo || ''}`;
        }

        DETAIL_FIELDS.forEach((field) => {
            const element = form.elements.namedItem(field);
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.value = sanitizeDetailInputValue(field, record[field] || '');
            }
        });
    }

    function clearDetailForm() {
        const { form } = getDetailModalElements();
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        DETAIL_FIELDS.forEach((field) => {
            const element = form.elements.namedItem(field);
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.value = '';
            }
        });
    }

    function openDetailModal(recordId) {
        const record = TintoreriaApp.findRecord(recordId);
        const { modal, form } = getDetailModalElements();
        if (!record || !(modal instanceof HTMLElement)) {
            return;
        }

        detailModalRecordId = recordId;
        populateDetailForm(record);
        modal.classList.remove('hidden');

        window.requestAnimationFrame(() => {
            if (!(form instanceof HTMLFormElement)) {
                return;
            }

            const firstInput = form.elements.namedItem('ancho_crudo');
            if (firstInput instanceof HTMLInputElement) {
                firstInput.focus();
                firstInput.select();
            }
        });
    }

    function closeDetailModal() {
        const { modal } = getDetailModalElements();
        if (modal) {
            modal.classList.add('hidden');
        }

        detailModalRecordId = null;
    }

    function handleDetailInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !DETAIL_FIELDS.includes(target.name)) {
            return;
        }

        if (target instanceof HTMLTextAreaElement && target.name === 'rama_crudo_observaciones') {
            return;
        }

        target.value = sanitizeDetailInputValue(target.name, target.value);
    }

    async function handleDetailSave() {
        if (!detailModalRecordId) {
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(detailModalRecordId);
        if (!currentRecord) {
            closeDetailModal();
            return;
        }

        const changes = collectDetailFormValues();
        const validationMessage = validateDetailValues(changes);
        if (validationMessage) {
            TintoreriaApp.showToast(validationMessage, 'error', 'Dato invalido');
            return;
        }

        const hasChanges = DETAIL_FIELDS.some((field) => String(currentRecord[field] || '') !== String(changes[field] || ''));
        if (!hasChanges) {
            closeDetailModal();
            return;
        }

        try {
            await TintoreriaApp.saveRecordChanges(detailModalRecordId, changes, {
                successTitle: 'Rama Crudo',
                successMessage: 'Los datos del formulario se guardaron correctamente.'
            });
            closeDetailModal();
        } catch (error) {
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el formulario.', 'error', 'Error al guardar');
        }
    }

    function handleDetailBackdropClick(event) {
        const { modal } = getDetailModalElements();
        if (event.target === modal) {
            closeDetailModal();
        }
    }

    function handleDetailKeydown(event) {
        const { modal } = getDetailModalElements();
        if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeDetailModal();
        }
    }

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => !['PROG', 'OK'].includes(normalizeRamaCrudoState(record)));
        const progRecords = eligible.filter((record) => ['PROG', 'OK'].includes(normalizeRamaCrudoState(record)));
        const progWindowed = TintoreriaProcessedWindow.filterToWindow('rama-crudo', progRecords, getProcessedDate);

        document.getElementById('count-rama-crudo-xprog').textContent = `${new Set(xprogRecords.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('count-rama-crudo-prog').textContent = `${new Set(progWindowed.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        document.getElementById('summary-rama-crudo-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-rama-crudo-prog').textContent = TintoreriaUtils.formatSubtabSummary(progWindowed);
    }

    const RAMA_CRUDO_WIDTHS_PROCESADO = [64, 52, 40, 70, 87, 70, 183, 55, 50, 87, 62, 75, 74, 74, 60];

    function renderTheadForFilter() {
        const theadTr = document.getElementById('thead-tr-rama-crudo');
        const colgroup = document.getElementById('colgroup-rama-crudo');
        if (!theadTr || !colgroup) return;

        if (currentFilter === 'PROG') {
            theadTr.innerHTML = `
                <th>Fin</th>
                <th>cliente</th>
                <th>tela</th>
                <th>OP-PTDA</th>
                <th>color</th>
                <th>cod_art</th>
                <th>articulo</th>
                <th>kg(crudo)</th>
                <th>Turno</th>
                <th>Oper</th>
                <th>MAQ</th>
                <th>ruta</th>
                <th>Insp</th>
                <th>Superv</th>
                <th>Status</th>
            `;
            colgroup.innerHTML = RAMA_CRUDO_WIDTHS_PROCESADO.map(w => `<col style="width:${w}px">`).join('');
        } else {
            theadTr.innerHTML = `
                <th>P</th>
                <th>cliente</th>
                <th>tela</th>
                <th>OP-PTDA</th>
                <th>color</th>
                <th>cod_art</th>
                <th>articulo</th>
                <th>kg(crudo)</th>
                <th>Turno</th>
                <th>MAQ</th>
                <th>ruta</th>
                <th>Inicio</th>
                <th>Status</th>
            `;
            colgroup.innerHTML = RAMA_CRUDO_WIDTHS.map(w => `<col style="width:${w}px">`).join('');
        }
        const rcTable = document.querySelector('table.rama-crudo-table');
        if (rcTable) {
            rcTable.classList.toggle('rama-crudo-xprog', currentFilter !== 'PROG');
            rcTable.classList.toggle('rama-crudo-prog', currentFilter === 'PROG');
        }
    }

    function getAdjustedRamaCrudoDate(rawValue) {
        const date = TintoreriaUtils.parseDateish(rawValue);
        if (!date) return null;
        if (date.getHours() < 7) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, date.getHours(), date.getMinutes(), date.getSeconds());
        }
        return date;
    }

    function getProcessedDate(record) {
        return getAdjustedRamaCrudoDate(record && record.rama_crudo_fin);
    }

    function renderRowProcesado(record) {
        const adjusted = getAdjustedRamaCrudoDate(record.rama_crudo_fin);
        const finDate = TintoreriaUtils.formatDateDayMonth(adjusted) || '--';
        const inicioLabel = TintoreriaUtils.formatProcessDateTimeLabel(record.rama_crudo_inicio) || '--';
        const finLabel = TintoreriaUtils.formatProcessDateTimeLabel(record.rama_crudo_fin) || '--';
        const elapsed = TintoreriaUtils.formatElapsedTime(record.rama_crudo_inicio, record.rama_crudo_fin) || '--:--';
        const [elapsedHrs, elapsedMin] = elapsed.split(':');
        const elapsedLabel = elapsed === '--:--' ? '--:--' : `${elapsedHrs}hr:${elapsedMin}min`;
        const tooltip = `Inicio: ${inicioLabel}\nFin: ${finLabel}\nTiempo: ${elapsedLabel}`;

        return `
            <tr${TintoreriaUtils.isUrgentPriority(record.rama_crudo_p) ? ' class="urgent-row"' : ''}>
                <td><span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(tooltip)}">${TintoreriaUtils.escapeHtml(finDate)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                <td>
                    <div class="op-action-cell">
                        <button class="edit-detail-button" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="open-detail-modal" title="Editar datos de Rama Crudo">&#9998;</button>
                        <span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span>
                    </div>
                </td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_turno">
                        ${optionMarkup(record.rama_crudo_turno || '', RAMA_CRUDO_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_crudo_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_operario">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_maquina">
                        ${optionMarkup(record.rama_crudo_maquina || '', RAMA_CRUDO_MAQUINA_OPTIONS)}
                    </select>
                </td>
                <td>${renderRouteMarkup(record)}</td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_crudo_inspector || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_inspector">
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_crudo_supervisor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_supervisor">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_estado">
                        ${optionMarkup(normalizeRamaCrudoState(record), RAMA_CRUDO_ESTADO_OPTIONS)}
                    </select>
                </td>
            </tr>
        `;
    }

    function getVisibleRecordsFromTable() {
        const tbody = document.getElementById('tbody-rama-crudo');
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
        const countNode = document.getElementById(isProg ? 'count-rama-crudo-prog' : 'count-rama-crudo-xprog');
        const summaryNode = document.getElementById(isProg ? 'summary-rama-crudo-prog' : 'summary-rama-crudo-xprog');
        if (!countNode || !summaryNode) {
            return;
        }

        const visibleRecords = getVisibleRecordsFromTable();
        const uniquePartidas = new Set(
            visibleRecords.map((record) => TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))
        );

        countNode.textContent = `${uniquePartidas.size} ptds`;
        summaryNode.textContent = TintoreriaUtils.formatSubtabSummary(visibleRecords);
    }

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.rama_crudo_inicio);
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
        if (!record.rama_crudo_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.rama_crudo_inicio, record.rama_crudo_fin || new Date()) || '00:00';
        if (record.rama_crudo_fin) {
            return `<span class="process-pill process-pill-finished">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-rama-crudo');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'rama-crudo');
        renderSubtabCounts(records);
        renderTheadForFilter();

        const isProcesado = currentFilter === 'PROG';

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="${isProcesado ? 15 : 13}">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            TintoreriaApp.refreshViewDecorations('rama-crudo');
            return;
        }

        if (isProcesado) {
            tbody.innerHTML = filtered.map((record) => renderRowProcesado(record)).join('');
        } else {
            tbody.innerHTML = filtered.map((record) => `
                <tr${TintoreriaUtils.isUrgentPriority(record.rama_crudo_p) ? ' class="urgent-row"' : ''}>
                    <td>
                        <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.rama_crudo_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_p">
                    </td>
                    <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                    <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela || '')}</span></td>
                    <td>
                        <div class="op-action-cell">
                            <button class="edit-detail-button" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="open-detail-modal" title="Editar datos de Rama Crudo">&#9998;</button>
                            <span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span>
                        </div>
                    </td>
                    <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                    <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                    <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                    <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                    <td>
                        <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_turno">
                            ${optionMarkup(record.rama_crudo_turno || '', RAMA_CRUDO_TURNO_OPTIONS)}
                        </select>
                    </td>
                    <td>
                        <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_maquina">
                            ${optionMarkup(record.rama_crudo_maquina || '', RAMA_CRUDO_MAQUINA_OPTIONS)}
                        </select>
                    </td>
                    <td>${renderRouteMarkup(record)}</td>
                    <td>
                        ${record.rama_crudo_inicio
                            ? `<span class="process-pill process-pill-info" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatProcessDateTimeLabel(record.rama_crudo_inicio) || '')}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatProcessDateTimeLabel(record.rama_crudo_inicio) || '')}</span>`
                            : `<span class="cell-text">—</span>`
                        }
                    </td>
                    <td>
                        ${record.rama_crudo_inicio
                            ? `<select class="table-select" tabindex="-1" style="pointer-events:none;appearance:none;-webkit-appearance:none;"><option selected>EN PROCESO</option></select>`
                            : `<select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_crudo_estado">
                                   ${RAMA_CRUDO_ESTADO_OPTIONS.map((v) => {
                                       const label = v === 'X PROG' ? 'X PROCESAR' : (v || 'Selec');
                                       const selected = normalizeRamaCrudoState(record) === v ? 'selected' : '';
                                       return `<option value="${TintoreriaUtils.escapeHtml(v)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
                                   }).join('')}
                               </select>`
                        }
                    </td>
                </tr>
            `).join('');
        }

        syncDurationTimer(records);
        TintoreriaApp.refreshViewDecorations('rama-crudo');
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

        if (field === 'rama_crudo_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'ruta') {
            nextValue = normalizeRamaCrudoRoute(nextValue);
            editingRouteRecordIds.delete(recordId);
        }

        if (PERSON_FIELDS.includes(field)) {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
            if (nextValue && !TintoreriaUtils.isValidPersonName(nextValue)) {
                target.value = currentRecord[field] || '';
                TintoreriaApp.showToast('Solo se admiten letras y una separacion maxima entre 2 palabras.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'rama_crudo_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['rama_crudo_turno', 'Turno'],
                ['rama_crudo_operario', 'Oper'],
                ['rama_crudo_maquina', 'MAQ'],
                ['rama_crudo_inspector', 'Insp'],
                ['rama_crudo_supervisor', 'Superv'],
                ['rama_crudo_inicio', 'Inicio'],
                ['rama_crudo_fin', 'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizeRamaCrudoState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Rama Crudo',
                message: `Esta seguro que esta OP-Partida ya se paso por rama? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeRamaCrudoState(currentRecord);
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
            if (field === 'ruta') {
                editingRouteRecordIds.add(recordId);
            }
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

        if (action === 'open-detail-modal') {
            openDetailModal(recordId);
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(recordId);
        if (!currentRecord) {
            return;
        }

        if (action === 'start') {
            if (currentRecord.rama_crudo_inicio) {
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
                    rama_crudo_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.rama_crudo_inicio) {
                TintoreriaApp.showToast('Debes registrar inicio antes de terminar el proceso.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.rama_crudo_fin) {
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
                    rama_crudo_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function handleDoubleClick(event) {
        const trigger = event.target.closest('[data-action="edit-route"]');
        if (!trigger) {
            return;
        }

        const { recordId } = trigger.dataset;
        if (!recordId || editingRouteRecordIds.has(recordId)) {
            return;
        }

        editingRouteRecordIds.add(recordId);
        renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);

        window.requestAnimationFrame(() => {
            const tbody = document.getElementById('tbody-rama-crudo');
            const editor = tbody
                ? Array.from(tbody.querySelectorAll('select[data-inline-edit="ruta"]')).find((candidate) => (
                    candidate instanceof HTMLSelectElement &&
                    String(candidate.dataset.recordId || '').trim() === String(recordId).trim()
                ))
                : null;

            if (editor instanceof HTMLSelectElement) {
                editor.focus();
                editor.click();
            }
        });
    }

    function handleFocusOut(event) {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement) || target.dataset.inlineEdit !== 'ruta') {
            return;
        }

        const { recordId } = target.dataset;
        if (!recordId || !editingRouteRecordIds.has(recordId)) {
            return;
        }

        window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLSelectElement && activeElement.dataset.recordId === recordId && activeElement.dataset.inlineEdit === 'ruta') {
                return;
            }

            editingRouteRecordIds.delete(recordId);
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
        }, 0);
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.rama_crudo_inicio && !record.rama_crudo_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'rama-crudo') {
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
        document.querySelectorAll('[data-rama-crudo-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.ramaCrudoFilter;
                document.querySelectorAll('[data-rama-crudo-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-rama-crudo');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
            tbody.addEventListener('dblclick', handleDoubleClick);
            tbody.addEventListener('focusout', handleFocusOut);
        }

        const { modal, form, close, clear, save } = getDetailModalElements();
        if (form) {
            form.addEventListener('input', handleDetailInput);
        }

        if (close) {
            close.addEventListener('click', closeDetailModal);
        }

        if (clear) {
            clear.addEventListener('click', clearDetailForm);
        }

        if (save) {
            save.addEventListener('click', handleDetailSave);
        }

        if (modal) {
            modal.addEventListener('click', handleDetailBackdropClick);
        }

        document.addEventListener('keydown', handleDetailKeydown);
    }

    TintoreriaApp.registerView('rama-crudo', {
        init,
        processedDate: { columnLabel: 'FIN', getDate: getProcessedDate },
        render(records, state) {
            renderTable(records, state);
        },
        syncVisibleSummary() {
            syncVisibleSubtabSummary();
        },
        count(records) {
            return getEligibleRecords(records).length;
        },
        locateRecord(record, state) {
            if (!getEligibleRecords([record]).length) {
                return null;
            }

            const ramaCrudoState = normalizeRamaCrudoState(record);
            if (['PROG', 'OK'].includes(ramaCrudoState)) {
                const allProg = getEligibleRecords(state.records || [])
                    .filter((r) => ['PROG', 'OK'].includes(normalizeRamaCrudoState(r)));
                const visible = TintoreriaProcessedWindow.filterToWindow('rama-crudo', allProg, getProcessedDate);
                if (!visible.some((r) => r.id_registro === record.id_registro)) {
                    return null;
                }
                return { filter: 'PROG' };
            }

            return { filter: 'X PROG' };
        }
    });
})();
