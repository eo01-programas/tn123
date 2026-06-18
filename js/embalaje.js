(() => {
    let embalajeContextMenuRefs = null;
    let embalajeCalidadFinMenuRefs = null;
    let embalajeCalidadFinFilter = null;
    let embalajeLastRecords = null;
    let embalajeLastState = null;

    // ── Anchos de columnas (px) — editar aquí ──────────────────────────
    // P | calidad_fin | cliente | OP-PTDA | color | articulo | kg(crudo) | #rollos/cntd | Status
    const EMBALAJE_WIDTHS = [42, 72, 120, 120, 190, 350, 92, 92, 110];

    function isCalidadUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }

        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Calidad';
    }

    function isPcpTextilUser() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.getSession !== 'function') {
            return false;
        }
        const session = TintoreriaAuth.getSession();
        return String(session && session.username ? session.username : '').trim() === 'Pcp_textil';
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

    function renderSubtabCounts(records) {
        const eligible = getEligibleRecords(records);
        const uniquePartidas = new Set(
            eligible.map((record) => TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))
        ).size;

        const countNode = document.getElementById('count-embalaje-pending');
        const summaryNode = document.getElementById('summary-embalaje-pending');

        if (countNode) {
            countNode.textContent = `${uniquePartidas} ptds`;
        }

        if (summaryNode) {
            summaryNode.textContent = TintoreriaUtils.formatSubtabSummary(eligible);
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

    // ── "Devolver a Calidad" context menu ────────────────────────────────

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

    function positionContextMenu(menuRoot, clientX, clientY) {
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
        positionContextMenu(menu.root, clientX, clientY);
        menu.actionButton.focus();
    }

    // ── calidad_fin filter context menu ──────────────────────────────────

    function ensureCalidadFinFilterMenu() {
        if (embalajeCalidadFinMenuRefs && embalajeCalidadFinMenuRefs.root instanceof HTMLElement) {
            return embalajeCalidadFinMenuRefs;
        }

        const root = document.createElement('div');
        root.id = 'embalaje-calidad-fin-filter-menu';
        root.className = 'embalaje-context-menu hidden';
        root.innerHTML = '<div class="embalaje-context-menu-title">Filtrar fecha fin</div><div class="embalaje-calidad-fin-options"></div>';

        const optionsContainer = root.querySelector('.embalaje-calidad-fin-options');

        root.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        document.body.appendChild(root);

        embalajeCalidadFinMenuRefs = { root, optionsContainer };
        return embalajeCalidadFinMenuRefs;
    }

    function hideCalidadFinFilterMenu() {
        if (!embalajeCalidadFinMenuRefs || !(embalajeCalidadFinMenuRefs.root instanceof HTMLElement)) {
            return;
        }

        embalajeCalidadFinMenuRefs.root.classList.add('hidden');
    }

    function openCalidadFinFilterMenu(clientX, clientY) {
        const menu = ensureCalidadFinFilterMenu();

        const eligible = embalajeLastRecords ? getEligibleRecords(embalajeLastRecords) : [];
        const uniqueValues = [...new Set(
            eligible.map((r) => TintoreriaUtils.formatDateDayMonth(r.calidad_fin)).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'es'));

        menu.optionsContainer.innerHTML = ['Todos', ...uniqueValues].map((val) => {
            const isActive = val === 'Todos' ? !embalajeCalidadFinFilter : embalajeCalidadFinFilter === val;
            const prefix = isActive ? '&#x25BA; ' : '';
            return `<button class="embalaje-context-menu-action" data-filter-value="${TintoreriaUtils.escapeHtml(val)}" type="button">${prefix}${TintoreriaUtils.escapeHtml(val)}</button>`;
        }).join('');

        menu.optionsContainer.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.filterValue;
                embalajeCalidadFinFilter = val === 'Todos' ? null : val;
                hideCalidadFinFilterMenu();
                if (embalajeLastRecords) {
                    renderTable(embalajeLastRecords, embalajeLastState);
                }
            });
        });

        positionContextMenu(menu.root, clientX, clientY);
    }

    // ── Context menu event handling ───────────────────────────────────────

    function handleEmbalajeContextMenu(event) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const cell = target.closest('td');
        if (!(cell instanceof HTMLTableCellElement)) {
            return;
        }

        const cellIndex = cell.cellIndex;

        // calidad_fin column (index 1) — filter for all users
        if (cellIndex === 1) {
            event.preventDefault();
            hideEmbalajeContextMenu();
            openCalidadFinFilterMenu(event.clientX, event.clientY);
            return;
        }

        // kg(crudo) column (index 6) — devolver a Calidad, only for Calidad user
        if (cellIndex === 6 && isCalidadUser()) {
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
            hideCalidadFinFilterMenu();
            openEmbalajeContextMenu(recordId, event.clientX, event.clientY);
        }
    }

    function handleEmbalajeDocumentClick(event) {
        const target = event.target;

        if (embalajeContextMenuRefs && embalajeContextMenuRefs.root instanceof HTMLElement) {
            const menuRoot = embalajeContextMenuRefs.root;
            if (!menuRoot.classList.contains('hidden') && !(target instanceof Node && menuRoot.contains(target))) {
                hideEmbalajeContextMenu();
            }
        }

        if (embalajeCalidadFinMenuRefs && embalajeCalidadFinMenuRefs.root instanceof HTMLElement) {
            const menuRoot = embalajeCalidadFinMenuRefs.root;
            if (!menuRoot.classList.contains('hidden') && !(target instanceof Node && menuRoot.contains(target))) {
                hideCalidadFinFilterMenu();
            }
        }
    }

    function handleEmbalajeKeydown(event) {
        if (event.key === 'Escape') {
            hideEmbalajeContextMenu();
            hideCalidadFinFilterMenu();
        }
    }

    function updateCalidadFinHeader() {
        const th = document.getElementById('th-embalaje-calidad-fin');
        if (th) {
            th.textContent = embalajeCalidadFinFilter
                ? `calidad_fin [${embalajeCalidadFinFilter}]`
                : 'calidad_fin';
        }
    }

    function renderTable(records, state) {
        embalajeLastRecords = records;
        embalajeLastState = state;

        const readOnly = isPcpTextilUser();

        const tbody = document.getElementById('tbody-embalaje');
        if (!tbody) {
            return;
        }
        const colgroup = document.getElementById('colgroup-embalaje');
        if (colgroup) colgroup.innerHTML = EMBALAJE_WIDTHS.map(w => `<col style="width:${w}px">`).join('');

        updateCalidadFinHeader();
        hideEmbalajeContextMenu();
        hideCalidadFinFilterMenu();
        renderSubtabCounts(records);

        let filtered = TintoreriaUtils.filterRecordsForSearch(
            TintoreriaUtils.sortRecordsByPriority(getEligibleRecords(records), 'embalaje_p'),
            state,
            'embalaje'
        );

        if (embalajeCalidadFinFilter) {
            filtered = filtered.filter(
                (r) => TintoreriaUtils.formatDateDayMonth(r.calidad_fin) === embalajeCalidadFinFilter
            );
        }

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="9">No hay filas visibles en Embalaje.</td>
                </tr>
            `;
            TintoreriaApp.refreshViewDecorations('embalaje');
            return;
        }

        tbody.innerHTML = filtered.map((record) => `
            <tr${TintoreriaUtils.isUrgentPriority(record.embalaje_p) ? ' class="urgent-row"' : ''}>
                <td>
                    <input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(record.embalaje_p || '')}" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="embalaje_p"${readOnly ? ' readonly' : ''}>
                </td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.calidad_fin))}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cantidad_crudo)}</span></td>
                <td>
                    <select class="table-select" ${readOnly ? 'tabindex="-1" style="pointer-events:none; appearance:none; -webkit-appearance:none;"' : `data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-field="embalaje_estado"`}>
                        ${optionMarkup(normalizeEmbalajeState(record), EMBALAJE_ESTADO_OPTIONS)}
                    </select>
                </td>
            </tr>
        `).join('');
        TintoreriaApp.refreshViewDecorations('embalaje');
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        if (isPcpTextilUser()) {
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
        document.addEventListener('scroll', hideCalidadFinFilterMenu, true);
        window.addEventListener('resize', hideEmbalajeContextMenu);
        window.addEventListener('resize', hideCalidadFinFilterMenu);
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
