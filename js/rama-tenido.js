(() => {
    let currentFilter = 'X PROG';
    let durationTimer = null;
    let detailModalRecordId = null;
    const DETAIL_FIELDS = [
        'rama_tenido_ancho',
        'rama_tenido_densidad',
        'rama_tenido_temperatura',
        'rama_tenido_velocidad',
        'rama_tenido_alimentacion',
        'rama_tenido_ancho_de_cadena',
        'rama_tenido_orillo_derecho',
        'rama_tenido_orillo_izquierdo',
        'rama_tenido_observaciones'
    ];

    const PERSON_FIELDS = [
        'rama_tenido_inspector',
        'rama_tenido_supervisor'
    ];

    function normalizeRamaTenidoState(record) {
        return String(record.rama_tenido_estado || 'X PROG').trim() || 'X PROG';
    }

    function getEligibleRecords(records) {
        return records.filter((record) => (
            String(record.abridora_estado || '').trim() === 'OK' &&
            normalizeRamaTenidoState(record) !== 'OK'
        ));
    }

    function getFilteredRecords(records) {
        const eligible = getEligibleRecords(records);
        if (currentFilter === 'PROG') {
            return TintoreriaUtils.sortRecordsByPriority(
                eligible.filter((record) => normalizeRamaTenidoState(record) === 'PROG'),
                'rama_tenido_p'
            );
        }

        return TintoreriaUtils.sortRecordsByPriority(
            eligible.filter((record) => normalizeRamaTenidoState(record) !== 'PROG'),
            'rama_tenido_p'
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
        if (field === 'rama_tenido_ancho' || field === 'rama_tenido_densidad' || field === 'rama_tenido_temperatura' || field === 'rama_tenido_ancho_de_cadena') {
            return sanitizeDigitsInput(value, 3);
        }

        if (field === 'rama_tenido_alimentacion') {
            return sanitizeDigitsInput(value, 2);
        }

        if (field === 'rama_tenido_velocidad') {
            return sanitizeDecimalInput(value, 3, 1);
        }

        if (field === 'rama_tenido_orillo_derecho' || field === 'rama_tenido_orillo_izquierdo') {
            return sanitizeDecimalInput(value, 1, 1);
        }

        if (field === 'rama_tenido_observaciones') {
            return TintoreriaUtils.sanitizeUppercaseText(value);
        }

        return String(value === undefined || value === null ? '' : value).trim();
    }

    function getDetailModalElements() {
        return {
            modal: document.getElementById('rama-tenido-detail-modal'),
            form: document.getElementById('rama-tenido-detail-form'),
            title: document.getElementById('rama-tenido-detail-title'),
            subtitle: document.getElementById('rama-tenido-detail-subtitle'),
            close: document.getElementById('rama-tenido-detail-close'),
            clear: document.getElementById('rama-tenido-detail-clear'),
            save: document.getElementById('rama-tenido-detail-save')
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
        if (changes.rama_tenido_ancho && (!/^\d{2,3}$/.test(changes.rama_tenido_ancho) || Number(changes.rama_tenido_ancho) > 240)) {
            return 'rama_tenido_ancho solo admite 2 a 3 digitos y maximo 240.';
        }

        if (changes.rama_tenido_densidad && !/^\d{2,3}$/.test(changes.rama_tenido_densidad)) {
            return 'rama_tenido_densidad solo admite 2 a 3 digitos.';
        }

        if (changes.rama_tenido_temperatura && !/^\d{3}$/.test(changes.rama_tenido_temperatura)) {
            return 'rama_tenido_temperatura solo admite 3 digitos.';
        }

        if (changes.rama_tenido_velocidad && !/^\d{1,3}(?:\.\d)?$/.test(changes.rama_tenido_velocidad)) {
            return 'rama_tenido_velocidad solo admite hasta 3 digitos con un decimal opcional.';
        }

        if (changes.rama_tenido_alimentacion && !/^\d{1,2}$/.test(changes.rama_tenido_alimentacion)) {
            return 'rama_tenido_alimentacion solo admite 1 a 2 digitos.';
        }

        if (changes.rama_tenido_ancho_de_cadena && (!/^\d{2,3}$/.test(changes.rama_tenido_ancho_de_cadena) || Number(changes.rama_tenido_ancho_de_cadena) > 240)) {
            return 'rama_tenido_ancho_de_cadena solo admite 2 a 3 digitos y maximo 240.';
        }

        if (changes.rama_tenido_orillo_derecho && (!/^\d(?:\.\d)?$/.test(changes.rama_tenido_orillo_derecho) || Number(changes.rama_tenido_orillo_derecho) > 9.9)) {
            return 'rama_tenido_orillo_derecho solo admite un decimal y maximo 9.9.';
        }

        if (changes.rama_tenido_orillo_izquierdo && (!/^\d(?:\.\d)?$/.test(changes.rama_tenido_orillo_izquierdo) || Number(changes.rama_tenido_orillo_izquierdo) > 9.9)) {
            return 'rama_tenido_orillo_izquierdo solo admite un decimal y maximo 9.9.';
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

            const firstInput = form.elements.namedItem('rama_tenido_ancho');
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

        if (target instanceof HTMLTextAreaElement && target.name === 'rama_tenido_observaciones') {
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
                successTitle: 'Rama Tenido',
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
        const xprogRecords = eligible.filter((record) => normalizeRamaTenidoState(record) !== 'PROG');
        const progRecords = eligible.filter((record) => normalizeRamaTenidoState(record) === 'PROG');

        document.getElementById('count-rama-tenido-xprog').textContent = String(xprogRecords.length);
        document.getElementById('count-rama-tenido-prog').textContent = String(progRecords.length);
        document.getElementById('summary-rama-tenido-xprog').textContent = TintoreriaUtils.formatSubtabSummary(xprogRecords);
        document.getElementById('summary-rama-tenido-prog').textContent = TintoreriaUtils.formatSubtabSummary(progRecords);
    }

    function renderStartMarkup(record) {
        const label = TintoreriaUtils.formatProcessDateTimeLabel(record.rama_tenido_inicio);
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
        if (!record.rama_tenido_inicio) {
            return '<span class="process-pill process-pill-muted">--:--</span>';
        }

        const durationLabel = TintoreriaUtils.formatElapsedTime(record.rama_tenido_inicio, record.rama_tenido_fin || new Date()) || '00:00';
        if (record.rama_tenido_fin) {
            return `<span class="process-pill process-pill-info">${TintoreriaUtils.escapeHtml(durationLabel)}</span>`;
        }

        return `
            <button class="process-pill process-pill-action" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="finish">
                ${TintoreriaUtils.escapeHtml(durationLabel)}
            </button>
        `;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-rama-tenido');
        if (!tbody) {
            return;
        }

        const filtered = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'rama-tenido');
        renderSubtabCounts(records);

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="16">No hay filas para este subtab.</td>
                </tr>
            `;
            syncDurationTimer(records);
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.rama_tenido_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.rama_tenido_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_p">
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td>
                    <div class="op-action-cell">
                        <button class="edit-detail-button" type="button" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-action="open-detail-modal" title="Editar datos de Rama Tenido">&#9998;</button>
                        <span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span>
                    </div>
                </td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_turno">
                        ${optionMarkup(record.rama_tenido_turno || '', RAMA_TENIDO_TURNO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_tenido_operario || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_operario">
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_maquina">
                        ${optionMarkup(record.rama_tenido_maquina || '', RAMA_TENIDO_MAQUINA_OPTIONS)}
                    </select>
                </td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_proceso">
                        ${optionMarkup(record.rama_tenido_proceso || '', RAMA_TENIDO_PROCESO_OPTIONS)}
                    </select>
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_tenido_inspector || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_inspector">
                </td>
                <td>
                    <input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record.rama_tenido_supervisor || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_supervisor">
                </td>
                <td>${renderStartMarkup(record)}</td>
                <td>${renderFinishMarkup(record)}</td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="rama_tenido_estado">
                        ${optionMarkup(normalizeRamaTenidoState(record), RAMA_TENIDO_ESTADO_OPTIONS)}
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

        if (field === 'rama_tenido_p') {
            nextValue = TintoreriaUtils.sanitizePlegadoP(nextValue);
        }

        if (field === 'rama_tenido_operario') {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
        }

        if (PERSON_FIELDS.includes(field)) {
            nextValue = TintoreriaUtils.sanitizePersonName(nextValue);
            if (nextValue && !TintoreriaUtils.isValidPersonName(nextValue)) {
                target.value = currentRecord[field] || '';
                TintoreriaApp.showToast('Solo se admiten letras y una separacion maxima entre 2 palabras.', 'error', 'Dato invalido');
                return;
            }
        }

        if (field === 'rama_tenido_estado' && nextValue === 'OK') {
            const requiredFields = [
                ['rama_tenido_turno', 'Turno'],
                ['rama_tenido_operario', 'Oper'],
                ['rama_tenido_maquina', 'MAQ'],
                ['rama_tenido_proceso', 'Proceso'],
                ['rama_tenido_inspector', 'Insp@'],
                ['rama_tenido_supervisor', 'Superv'],
                ['rama_tenido_inicio', 'Inicio'],
                ['rama_tenido_fin', 'Fin']
            ];

            const missingLabels = requiredFields
                .filter(([fieldName]) => !String(currentRecord[fieldName] || '').trim())
                .map(([, label]) => label);

            if (missingLabels.length) {
                target.value = normalizeRamaTenidoState(currentRecord);
                TintoreriaApp.showToast(`Para marcar OK, completa: ${missingLabels.join(', ')}.`, 'error', 'Datos incompletos');
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Confirmar Rama Tenido',
                message: `Esta seguro que esta OP-Partida ya se pas\u00f3 por rama como tela te\u00f1ida? ${currentRecord.op_tela}-${currentRecord.partida}`
            });

            if (!confirmed) {
                target.value = normalizeRamaTenidoState(currentRecord);
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

        if (action === 'open-detail-modal') {
            openDetailModal(recordId);
            return;
        }

        const currentRecord = TintoreriaApp.findRecord(recordId);
        if (!currentRecord) {
            return;
        }

        if (action === 'start') {
            if (currentRecord.rama_tenido_inicio) {
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
                    rama_tenido_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el inicio.', 'error', 'Error al guardar');
            }

            return;
        }

        if (action === 'finish') {
            if (!currentRecord.rama_tenido_inicio) {
                TintoreriaApp.showToast('No existe rama_tenido_inicio para calcular el tiempo transcurrido.', 'error', 'Dato invalido');
                return;
            }

            if (currentRecord.rama_tenido_fin) {
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
                    rama_tenido_fin: TintoreriaUtils.formatProcessDateTime(new Date())
                }, { silent: true });
            } catch (error) {
                TintoreriaApp.showToast(error.message || 'No se pudo registrar el fin.', 'error', 'Error al guardar');
            }
        }
    }

    function syncDurationTimer(records) {
        const shouldRun = getEligibleRecords(records).some((record) => record.rama_tenido_inicio && !record.rama_tenido_fin);

        if (shouldRun && !durationTimer) {
            durationTimer = window.setInterval(() => {
                if (TintoreriaApp.state.activeView !== 'rama-tenido') {
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
        document.querySelectorAll('[data-rama-tenido-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                currentFilter = button.dataset.ramaTenidoFilter;
                document.querySelectorAll('[data-rama-tenido-filter]').forEach((node) => {
                    node.classList.toggle('active', node === button);
                });
                renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            });
        });

        const tbody = document.getElementById('tbody-rama-tenido');
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

    TintoreriaApp.registerView('rama-tenido', {
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
                filter: normalizeRamaTenidoState(record) === 'PROG' ? 'PROG' : 'X PROG'
            };
        }
    });
})();
