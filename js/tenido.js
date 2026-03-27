(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;
    let detailModalRecordId = null;
    const DETAIL_FIELDS = [
        'tenido_rb',
        'tenido_volumen',
        'tenido_observaciones'
    ];

    const PERSON_FIELDS = [
        'tenido_operario',
        'tenido_controlador',
        'tenido_supervisor'
    ];

    function normalizeTenidoState(record) {
        return String(record.tenido_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => (
            String(record.preparado_estado || '').trim() === 'OK' &&
            normalizeTenidoState(record) !== 'OK'
        ));
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeTenidoState(record) === 'PROG'),
                'tenido_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeTenidoState(record) !== 'PROG'),
            'tenido_p'
        );
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

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const xprogRecords = eligible.filter((record) => normalizeTenidoState(record) !== 'PROG');
        const progRecords = eligible.filter((record) => normalizeTenidoState(record) === 'PROG');

        document.getElementById('count-tenido-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-tenido-prog').textContent = String(progRecords.length);
        document.getElementById('summary-tenido-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-tenido-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function getTenidoKgField(processValue) {
        const process = String(processValue || '').trim();
        if (process === 'Pre-tratamiento') {
            return 'tenido_kg_pre_tratamiento';
        }

        if (process === 'Post-tratamiento') {
            return 'tenido_kg_post_tratamiento';
        }

        if (process === 'Matizado') {
            return 'tenido_kg_reproceso';
        }

        if (process === 'Tenido') {
            return 'tenido_kg';
        }

        return '';
    }

    function getTenidoKgValue(record) {
        const mappedField = getTenidoKgField(record.tenido_proceso);
        if (mappedField) {
            return String(record[mappedField] || '');
        }

        return String(
            record.tenido_kg ||
            record.tenido_kg_pre_tratamiento ||
            record.tenido_kg_post_tratamiento ||
            record.tenido_kg_reproceso ||
            ''
        );
    }

    function sanitizeTenidoKg(value) {
        const cleaned = String(value === undefined || value === null ? '' : value)
            .replace(/,/g, '.')
            .replace(/[^0-9.]/g, '');

        if (!cleaned) {
            return '';
        }

        const parts = cleaned.split('.');
        const integerPart = (parts.shift() || '').slice(0, 3);
        const decimalPart = parts.join('').slice(0, 2);

        if (!integerPart) {
            return decimalPart ? `0.${decimalPart}` : '';
        }

        return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    }

    function isValidTenidoKg(value) {
        if (!value) {
            return true;
        }

        return /^\d{2,3}\.\d{1,2}$/.test(value);
    }

    function sanitizeTenidoRb(value) {
        const digits = String(value === undefined || value === null ? '' : value)
            .replace(/\D/g, '')
            .slice(0, 2);

        if (!digits) {
            return '';
        }

        const normalizedNumber = String(Number(digits));
        return `1:${normalizedNumber}`;
    }

    function sanitizeTenidoVolumen(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/\D/g, '')
            .slice(0, 4);
    }

    function sanitizeTenidoObservation(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function getDetailModalElements() {
        return {
            modal: document.getElementById('tenido-detail-modal'),
            form: document.getElementById('tenido-detail-form'),
            title: document.getElementById('tenido-detail-title'),
            subtitle: document.getElementById('tenido-detail-subtitle'),
            close: document.getElementById('tenido-detail-close'),
            clear: document.getElementById('tenido-detail-clear'),
            save: document.getElementById('tenido-detail-save')
        };
    }

    function sanitizeDetailInputValue(field, value) {
        if (field === 'tenido_rb') {
            return sanitizeTenidoRb(value);
        }

        if (field === 'tenido_volumen') {
            return sanitizeTenidoVolumen(value);
        }

        if (field === 'tenido_observaciones') {
            return sanitizeTenidoObservation(value);
        }

        return String(value === undefined || value === null ? '' : value).trim();
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
        if (changes.tenido_rb && !/^1:\d{1,2}$/.test(changes.tenido_rb)) {
            return 'tenido_rb debe guardarse como 1: seguido de un entero de 1 a 2 digitos.';
        }

        if (changes.tenido_volumen && !/^\d{3,4}$/.test(changes.tenido_volumen)) {
            return 'tenido_volumen solo admite 3 a 4 digitos.';
        }

        return '';
    }

    function populateDetailForm(record) {
        const { form, title, subtitle } = getDetailModalElements();
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        if (title) {
            title.textContent = `${record.cliente || ''} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${record.color || ''}`;
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

            const firstInput = form.elements.namedItem('tenido_rb');
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

        if (target instanceof HTMLTextAreaElement && target.name === 'tenido_observaciones') {
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
                successTitle: 'Tenido',
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

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.tenido_inicio);
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
        if (!record.tenido_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.tenido_inicio, record.tenido_fin || new Date()) || '00:00';
        if (record.tenido_fin) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-tenido');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'tenido');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="17">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.tenido_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.tenido_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td>
                    <div class="op-action-cell">
                        <button class="edit-detail-button" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="open-detail-modal" title="Editar datos de Tenido">&#9998;</button>
                        <span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span>
                    </div>
                </td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_turno">
                        ${optionMarkup(record.tenido_turno || '', TENIDO_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.tenido_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_operario">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_maquina">
                        ${optionMarkup(record.tenido_maquina || '', TENIDO_MAQUINA_OPTIONS)}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_proceso">
                        ${optionMarkup(record.tenido_proceso || '', TENIDO_PROCESO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_tipo_proceso">
                        ${optionMarkup(record.tenido_tipo_proceso || '', TENIDO_TIPO_PROCESO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input mono" type="text" inputmode="decimal" value="${TintoreriaUtils.escapeHtml(getTenidoKgValue(record))}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_kg_input">
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.tenido_controlador || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_controlador">
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.tenido_supervisor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_supervisor">
                </td>
                <td>${renderStartMarkup(record)}</td>
                <td>${renderFinishMarkup(record)}</td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="tenido_estado">
                        ${optionMarkup(normalizeTenidoState(record), TENIDO_ESTADO_OPTIONS)}
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
        let changes = null;

        if (field === 'tenido_p') {
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

        if (field === 'tenido_kg_input') {
            nextValue = sanitizeTenidoKg(nextValue);

            if (nextValue && !isValidTenidoKg(nextValue)) {
                target.value = getTenidoKgValue(currentRecord);
                TintoreriaApp.showToast('tenido_kg solo admite 2 a 3 digitos con decimal.', 'error', 'Dato invalido');
                return;
            }

            const kgField = getTenidoKgField(currentRecord.tenido_proceso);
            if (nextValue && !kgField) {
                target.value = getTenidoKgValue(currentRecord);
                TintoreriaApp.showToast('Selecciona tenido_proceso antes de registrar kg.', 'error', 'Dato invalido');
                return;
            }

            if (!kgField) {
                target.value = nextValue;
                return;
            }

            if (String(currentRecord[kgField] || '') === String(nextValue || '')) {
                target.value = nextValue;
                return;
            }

            changes = { [kgField]: nextValue };
            target.value = nextValue;
        }

        if (field === 'tenido_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['tenido_turno', 'Turno'],
                ['tenido_operario', 'Oper'],
                ['tenido_maquina', 'MAQ'],
                ['tenido_proceso', 'Proceso'],
                ['tenido_tipo_proceso', 'Tipo proceso'],
                ['tenido_controlador', 'Control@'],
                ['tenido_supervisor', 'Superv'],
                ['tenido_inicio', 'Inicio'],
                ['tenido_fin', 'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (!String(getTenidoKgValue(currentRecord) || '').trim()) {
                missingLabels.push('Kg(teñido)');
            }

            if (missingLabels.length) {
                target.value = normalizeTenidoState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Tenido',
                message: `Esta seguro que esta OP-Partida ya se a tenido por completo? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeTenidoState(currentRecord);
                return;
            }
        }

        if (!changes) {
            if (String(currentRecord[field] || '') === String(nextValue || '')) {
                target.value = nextValue;
                return;
            }

            changes = { [field]: nextValue };
            target.value = nextValue;
        }

        try {
            await TintoreriaApp.saveRecordChanges(recordId, changes, { silent: true });
        } catch (error) {
            if (field === 'tenido_kg_input') {
                target.value = getTenidoKgValue(currentRecord);
            } else {
                target.value = currentRecord[field] || '';
            }
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
            if (currentRecord.tenido_inicio) {
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
                    tenido_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.tenido_inicio) {
                TintoreriaApp.showToast('Debes registrar inicio antes de terminar el proceso.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.tenido_fin) {
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
                    tenido_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.tenido_inicio && !record.tenido_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'tenido') {
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
        document.querySelectorAll('[data-tenido-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.tenidoFilter;
                document.querySelectorAll('[data-tenido-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords());
            });
        });

        const tbody = document.getElementById('tbody-tenido');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('click', handleActionClick);
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

    TintoreriaApp.registerView('tenido', {
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
                filter: normalizeTenidoState(record) === 'PROG' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
