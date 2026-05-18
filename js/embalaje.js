(() => {
    let embalajeContextMenuRefs = null;

    function isCalidadUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }

        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Calidad';
    }

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

    function ensureEmbalajeContextMenu() {
        if (embalajeContextMenuRefs && embalajeContextMenuRefs.root instanceof HTMLElement) {
            return embalajeContextMenuRefs;
        }

        const root = document.createElement('div');
        root.id = 'embalaje-context-menu';
        root.className = 'embalaje-context-menu hidden';
        root.innerHTML = `
            <div class="embalaje-context-menu-title">Acciones</div>
            <button class="embalaje-context-menu-action" type="button">Devolver a Calidad</button>
        `;

        const actionButton = root.querySelector('.embalaje-context-menu-action');
        if (!(actionButton instanceof HTMLButtonElement)) {
            throw new Error('No se pudo construir el menu de Embalaje.');
        }

        actionButton.addEventListener('click', async () => {
            const recordId = String(root.dataset.recordId || '').trim();
            hideEmbalajeContextMenu();

            if (!recordId) {
                return;
            }

            const currentRecord = TintoreriaApp.findRecord(recordId);
            if (!currentRecord) {
                return;
            }

            const confirmed = await TintoreriaApp.confirmAction({
                title: 'Devolver a Calidad',
                message: `Esta seguro de devolver la partida ${currentRecord.partida} a Calidad?`
            });

            if (!confirmed) {
                return;
            }

            try {
                await TintoreriaApp.saveRecordChanges(recordId, {
                    calidad_estado: 'AUDITANDO'
                }, {
                    silent: false,
                    successTitle: 'Calidad actualizada',
                    successMessage: 'La partida fue devuelta a Calidad.',
                    permissionViewId: 'calidad'
                });
            } catch (error) {
                console.error(error);
                TintoreriaApp.showToast(error.message || 'No se pudo devolver la partida a Calidad.', 'error', 'Operacion fallida');
            }
        });

        root.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        document.body.appendChild(root);

        embalajeContextMenuRefs = {
            root,
            actionButton
        };

        return embalajeContextMenuRefs;
    }

    function hideEmbalajeContextMenu() {
        if (!embalajeContextMenuRefs || !(embalajeContextMenuRefs.root instanceof HTMLElement)) {
            return;
        }

        embalajeContextMenuRefs.root.classList.add('hidden');
        embalajeContextMenuRefs.root.removeAttribute('data-record-id');
    }

    function positionEmbalajeContextMenu(menuRoot, clientX, clientY) {
        menuRoot.classList.remove('hidden');
        menuRoot.style.left = '12px';
        menuRoot.style.top = '12px';

        const bounds = menuRoot.getBoundingClientRect();
        const maxLeft = Math.max(12, window.innerWidth - bounds.width - 12);
        const maxTop = Math.max(12, window.innerHeight - bounds.height - 12);
        const nextLeft = Math.min(Math.max(12, clientX), maxLeft);
        const nextTop = Math.min(Math.max(12, clientY), maxTop);

        menuRoot.style.left = `${nextLeft}px`;
        menuRoot.style.top = `${nextTop}px`;
    }

    function openEmbalajeContextMenu(recordId, clientX, clientY) {
        const menu = ensureEmbalajeContextMenu();
        menu.root.dataset.recordId = recordId;
        positionEmbalajeContextMenu(menu.root, clientX, clientY);
        menu.actionButton.focus();
    }

    function handleEmbalajeContextMenu(event) {
        const target = event.target;
        if (!(target instanceof Element) || !isCalidadUser()) {
            return;
        }

        const cell = target.closest('td');
        if (!(cell instanceof HTMLTableCellElement) || cell.cellIndex !== 5) {
            return;
        }

        const row = cell.closest('tr');
        if (!(row instanceof HTMLTableRowElement)) {
            return;
        }

        const recordId = String(
            row.dataset.recordRowId ||
            row.querySelector('[data-record-id]')?.dataset.recordId ||
            ''
        ).trim();
        if (!recordId) {
            return;
        }

        event.preventDefault();
        openEmbalajeContextMenu(recordId, event.clientX, event.clientY);
    }

    function handleEmbalajeDocumentClick(event) {
        if (!embalajeContextMenuRefs || !(embalajeContextMenuRefs.root instanceof HTMLElement)) {
            return;
        }

        const menuRoot = embalajeContextMenuRefs.root;
        if (menuRoot.classList.contains('hidden')) {
            return;
        }

        const target = event.target;
        if (target instanceof Node && menuRoot.contains(target)) {
            return;
        }

        hideEmbalajeContextMenu();
    }

    function handleEmbalajeKeydown(event) {
        if (event.key === 'Escape') {
            hideEmbalajeContextMenu();
        }
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-embalaje');
        if (!tbody) {
            return;
        }

        hideEmbalajeContextMenu();

        const filtered = TintoreriaUtils.filterRecordsForSearch(
            TintoreriaUtils.sortRecordsByPriority(getEligibleRecords(records), 'embalaje_p'),
            state,
            'embalaje'
        );

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="8">No hay filas visibles en Embalaje.</td>
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
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cantidad_crudo)}</span></td>
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
            tbody.addEventListener('contextmenu', handleEmbalajeContextMenu);
        }

        document.addEventListener('click', handleEmbalajeDocumentClick);
        document.addEventListener('keydown', handleEmbalajeKeydown);
        document.addEventListener('scroll', hideEmbalajeContextMenu, true);
        window.addEventListener('resize', hideEmbalajeContextMenu);
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
