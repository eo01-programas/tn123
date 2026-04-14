(() => {
    const state = {
        activeView: 'plegado',
        records: [],
        source: 'local',
        views: {},
        activeSearch: null,
        clientFilters: {},
        pendingSaves: {},
        saveSequence: 0,
        renderSequence: 0,
        returnView: null,
        initialized: false
    };

    let confirmResolver = null;
    let clientFilterMenuRefs = null;
    const SEARCH_VIEW_ORDER = ['maestro', ...PROCESS_TABS.map((tab) => tab.id)];
    const CLIENT_FILTER_HEADER_LABEL = 'CLIENTE';
    const OP_SEARCH_HEADER_LABEL = 'OP-PTDA';
    const CLIENT_FILTER_MENU_ID = 'client-filter-menu';
    const SEARCH_FILTER_ATTRIBUTES = {
        plegado: 'data-plegado-filter',
        'rama-crudo': 'data-rama-crudo-filter',
        preparado: 'data-preparado-filter',
        tenido: 'data-tenido-filter',
        abridora: 'data-abridora-filter',
        'rama-tenido': 'data-rama-tenido-filter',
        'acab-espec': 'data-acab-espec-filter',
        calidad: 'data-calidad-filter'
    };
    const DETAIL_MODAL_ACCESS = {
        'rama-crudo': {
            modalId: 'rama-crudo-detail-modal',
            formId: 'rama-crudo-detail-form',
            saveId: 'rama-crudo-detail-save',
            clearId: 'rama-crudo-detail-clear'
        },
        'rama-tenido': {
            modalId: 'rama-tenido-detail-modal',
            formId: 'rama-tenido-detail-form',
            saveId: 'rama-tenido-detail-save',
            clearId: 'rama-tenido-detail-clear'
        },
        tenido: {
            modalId: 'tenido-detail-modal',
            formId: 'tenido-detail-form',
            saveId: 'tenido-detail-save',
            clearId: 'tenido-detail-clear'
        }
    };

    function hasAuthController() {
        return Boolean(window.TintoreriaAuth);
    }

    function canAccessView(viewId) {
        if (!hasAuthController() || typeof TintoreriaAuth.canAccessView !== 'function') {
            return true;
        }

        return TintoreriaAuth.canAccessView(viewId);
    }

    function getAvailableSearchViewOrder() {
        return SEARCH_VIEW_ORDER.filter((viewId) => canAccessView(viewId));
    }

    function getDefaultAccessibleView() {
        return getAvailableSearchViewOrder().find((viewId) => viewId !== 'maestro') || 'plegado';
    }

    function getPreferredLandingState() {
        if (!hasAuthController() || typeof TintoreriaAuth.getSession !== 'function') {
            return {
                viewId: getDefaultAccessibleView(),
                filter: ''
            };
        }

        const session = TintoreriaAuth.getSession();
        const preferredView = session && session.defaultView && canAccessView(session.defaultView)
            ? session.defaultView
            : getDefaultAccessibleView();

        return {
            viewId: preferredView,
            filter: session && preferredView === session.defaultView ? String(session.defaultFilter || '') : ''
        };
    }

    function getActiveSubtabFilter(viewId = state.activeView) {
        const activeButton = document.querySelector(`#view-${viewId} .subtabs .subtab.active`);
        if (!(activeButton instanceof HTMLButtonElement)) {
            return '';
        }

        for (const [key, value] of Object.entries(activeButton.dataset || {})) {
            if (key.endsWith('Filter')) {
                return String(value || '').trim();
            }
        }

        return '';
    }

    function activatePreferredSubtab(viewId, filter) {
        const normalizedFilter = String(filter || '').trim().toUpperCase();
        if (!normalizedFilter) {
            return false;
        }

        const section = document.getElementById(`view-${viewId}`);
        if (!(section instanceof HTMLElement)) {
            return false;
        }

        const buttons = Array.from(section.querySelectorAll('.subtab'));
        const targetButton = buttons.find((button) => {
            if (!(button instanceof HTMLButtonElement)) {
                return false;
            }

            return Object.entries(button.dataset || {}).some(([key, value]) => (
                key.endsWith('Filter') &&
                String(value || '').trim().toUpperCase() === normalizedFilter
            ));
        });

        if (!(targetButton instanceof HTMLButtonElement)) {
            return false;
        }

        targetButton.click();
        return true;
    }

    function canEditActiveView(viewId = state.activeView) {
        if (!hasAuthController() || typeof TintoreriaAuth.canEditView !== 'function') {
            return true;
        }

        return TintoreriaAuth.canEditView(viewId, getActiveSubtabFilter(viewId));
    }

    function canEditViewField(fieldName, viewId = state.activeView) {
        if (!hasAuthController()) {
            return true;
        }

        if (typeof TintoreriaAuth.canEditField === 'function') {
            return TintoreriaAuth.canEditField(viewId, fieldName, getActiveSubtabFilter(viewId));
        }

        return canEditActiveView(viewId);
    }

    function canEditViewChanges(changes, viewId = state.activeView, activeFilter = getActiveSubtabFilter(viewId)) {
        if (!hasAuthController()) {
            return true;
        }

        if (typeof TintoreriaAuth.canEditChanges === 'function') {
            return TintoreriaAuth.canEditChanges(viewId, changes, activeFilter);
        }

        return canEditActiveView(viewId);
    }

    function updateAuthSessionUi() {
        const maestroButton = document.querySelector('.brand-logo-button');
        const stockButton = document.getElementById('btn-open-stock');

        if (maestroButton) {
            maestroButton.classList.toggle('hidden', !canAccessView('maestro'));
        }

        if (stockButton) {
            stockButton.classList.toggle('hidden', !canAccessView('stock'));
        }
    }

    function normalizeClientFilterValue(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function normalizeClientFilterKey(value) {
        return normalizeClientFilterValue(value).toUpperCase();
    }

    function isClientHeaderCell(cell) {
        return (
            cell instanceof HTMLTableCellElement &&
            normalizeClientFilterKey(cell.textContent) === CLIENT_FILTER_HEADER_LABEL
        );
    }

    function getViewIdFromNode(node) {
        if (!(node instanceof Element)) {
            return '';
        }

        const section = node.closest('.view-section');
        if (!(section instanceof HTMLElement) || !section.id.startsWith('view-')) {
            return '';
        }

        return section.id.slice(5);
    }

    function getClientFilterTable(viewId = state.activeView) {
        const section = document.getElementById(`view-${viewId}`);
        if (!(section instanceof HTMLElement)) {
            return null;
        }

        const table = section.querySelector('table.data-table');
        return table instanceof HTMLTableElement ? table : null;
    }

    function getClientColumnIndex(table) {
        if (!(table instanceof HTMLTableElement) || !table.tHead || !table.tHead.rows.length) {
            return -1;
        }

        return Array.from(table.tHead.rows[0].cells).findIndex((cell) => isClientHeaderCell(cell));
    }

    function getTableColumnIndexByHeader(table, headerLabel) {
        if (!(table instanceof HTMLTableElement) || !table.tHead || !table.tHead.rows.length) {
            return -1;
        }

        const normalizedHeaderLabel = String(headerLabel || '').trim().toUpperCase();
        return Array.from(table.tHead.rows[0].cells).findIndex((cell) => (
            cell instanceof HTMLTableCellElement &&
            String(cell.textContent || '').trim().toUpperCase() === normalizedHeaderLabel
        ));
    }

    function getClientFilterDataRows(table) {
        if (!(table instanceof HTMLTableElement) || !table.tBodies.length) {
            return [];
        }

        return Array.from(table.tBodies[0].rows).filter((row) => (
            !row.classList.contains('empty-state') &&
            !row.classList.contains('client-filter-empty-state')
        ));
    }

    function getRenderableTableRows(table) {
        if (!(table instanceof HTMLTableElement) || !table.tBodies.length) {
            return [];
        }

        return Array.from(table.tBodies[0].rows).filter((row) => (
            !row.classList.contains('empty-state') &&
            !row.classList.contains('client-filter-empty-state') &&
            !row.classList.contains('op-search-empty-state')
        ));
    }

    function getClientValueFromRow(row, columnIndex) {
        if (!(row instanceof HTMLTableRowElement) || columnIndex < 0 || !row.cells[columnIndex]) {
            return '';
        }

        return normalizeClientFilterValue(row.cells[columnIndex].textContent);
    }

    function collectClientFilterOptions(table, columnIndex) {
        const values = new Map();

        getClientFilterDataRows(table).forEach((row) => {
            const clientValue = getClientValueFromRow(row, columnIndex);
            if (!clientValue) {
                return;
            }

            const clientKey = normalizeClientFilterKey(clientValue);
            if (!values.has(clientKey)) {
                values.set(clientKey, clientValue);
            }
        });

        return Array.from(values.values()).sort((left, right) => {
            return left.localeCompare(right, 'es', { sensitivity: 'base' });
        });
    }

    function ensureClientFilterMenu() {
        if (clientFilterMenuRefs && clientFilterMenuRefs.root instanceof HTMLElement) {
            return clientFilterMenuRefs;
        }

        const root = document.createElement('div');
        root.id = CLIENT_FILTER_MENU_ID;
        root.className = 'client-filter-menu hidden';
        root.innerHTML = `
            <div class="client-filter-menu-head">
                <strong>Filtro Cliente</strong>
            </div>
            <div class="client-filter-menu-field">
                <select class="table-select client-filter-menu-select"></select>
            </div>
        `;

        document.body.appendChild(root);

        const select = root.querySelector('.client-filter-menu-select');

        if (!(select instanceof HTMLSelectElement)) {
            throw new Error('No se pudo construir el menu de filtro por cliente.');
        }

        select.addEventListener('change', () => {
            const viewId = String(root.dataset.viewId || '').trim();
            if (!viewId) {
                hideClientFilterMenu();
                return;
            }

            state.clientFilters[viewId] = normalizeClientFilterValue(select.value);
            applyClientFilterToView(viewId);
            hideClientFilterMenu();
        });

        root.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        clientFilterMenuRefs = {
            root,
            select
        };

        return clientFilterMenuRefs;
    }

    function hideClientFilterMenu() {
        if (!clientFilterMenuRefs || !(clientFilterMenuRefs.root instanceof HTMLElement)) {
            return;
        }

        clientFilterMenuRefs.root.classList.add('hidden');
        clientFilterMenuRefs.root.removeAttribute('data-view-id');
    }

    function populateClientFilterMenuOptions(select, options, selectedValue) {
        select.innerHTML = '';
        select.appendChild(new Option('Todos los clientes', ''));

        options.forEach((optionValue) => {
            select.appendChild(new Option(optionValue, optionValue));
        });

        if (
            selectedValue &&
            !options.some((optionValue) => normalizeClientFilterKey(optionValue) === normalizeClientFilterKey(selectedValue))
        ) {
            select.appendChild(new Option(selectedValue, selectedValue));
        }

        select.value = selectedValue || '';
    }

    function positionClientFilterMenu(menuRoot, clientX, clientY) {
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

    function openClientFilterMenu(headerCell, clientX, clientY) {
        if (!isClientHeaderCell(headerCell)) {
            return;
        }

        const viewId = getViewIdFromNode(headerCell);
        const table = getClientFilterTable(viewId);
        const columnIndex = getClientColumnIndex(table);
        if (!viewId || !(table instanceof HTMLTableElement) || columnIndex < 0) {
            return;
        }

        const menu = ensureClientFilterMenu();
        const selectedValue = normalizeClientFilterValue(state.clientFilters[viewId]);
        const options = collectClientFilterOptions(table, columnIndex);

        menu.root.dataset.viewId = viewId;
        populateClientFilterMenuOptions(menu.select, options, selectedValue);
        positionClientFilterMenu(menu.root, clientX, clientY);
        menu.select.focus();
    }

    function syncClientFilterHeaderState() {
        document.querySelectorAll('table.data-table thead th').forEach((cell) => {
            if (!(cell instanceof HTMLTableCellElement) || !isClientHeaderCell(cell)) {
                return;
            }

            const viewId = getViewIdFromNode(cell);
            const selectedValue = normalizeClientFilterValue(state.clientFilters[viewId]);
            cell.classList.add('client-filter-target');
            cell.classList.toggle('client-filter-active', Boolean(selectedValue));
            cell.title = selectedValue
                ? `Filtro activo: ${selectedValue}. Click derecho en el encabezado "Cliente" para cambiarlo.`
                : 'Click derecho en el encabezado "Cliente" para filtrar por un valor unico.';
        });
    }

    function removeClientFilterEmptyState(table) {
        if (!(table instanceof HTMLTableElement) || !table.tBodies.length) {
            return;
        }

        table.tBodies[0].querySelectorAll('.client-filter-empty-state').forEach((row) => {
            row.remove();
        });
    }

    function syncClientFilterEmptyState(table, visibleRows, selectedValue) {
        removeClientFilterEmptyState(table);

        if (!(table instanceof HTMLTableElement) || !table.tBodies.length || visibleRows > 0 || !selectedValue) {
            return;
        }

        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-state client-filter-empty-state';

        const emptyCell = document.createElement('td');
        emptyCell.colSpan = table.tHead && table.tHead.rows.length
            ? table.tHead.rows[0].cells.length
            : 1;
        emptyCell.textContent = `No hay filas para el cliente "${selectedValue}".`;

        emptyRow.appendChild(emptyCell);
        table.tBodies[0].appendChild(emptyRow);
    }

    function syncClientFilterRowClasses(rows) {
        let visibleIndex = 0;

        rows.forEach((row) => {
            row.classList.remove('client-filter-row-odd', 'client-filter-row-even');

            if (row.hidden) {
                return;
            }

            row.classList.add(visibleIndex % 2 === 0 ? 'client-filter-row-odd' : 'client-filter-row-even');
            visibleIndex += 1;
        });
    }

    function applyOpGroupStriping(viewId = state.activeView) {
        const section = document.getElementById(`view-${viewId}`);
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const table = section.querySelector('table.data-table');
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        const columnIndex = getTableColumnIndexByHeader(table, OP_SEARCH_HEADER_LABEL);
        if (columnIndex < 0 || !table.tBodies.length) {
            return;
        }

        const rows = Array.from(table.tBodies[0].rows).filter((row) => (
            row instanceof HTMLTableRowElement &&
            !row.classList.contains('empty-state') &&
            !row.classList.contains('client-filter-empty-state') &&
            !row.classList.contains('op-search-empty-state')
        ));

        const visibleRows = rows.filter((row) => !row.hidden && row.style.display !== 'none');

        rows.forEach((row) => {
            row.classList.remove('op-group-plain', 'op-group-painted');
        });

        let previousGroupKey = null;
        let groupIndex = -1;

        visibleRows.forEach((row) => {
            const cell = row.cells[columnIndex];
            const groupKey = String(cell ? cell.textContent : '').trim();

            if (!groupKey) {
                return;
            }

            if (groupKey !== previousGroupKey) {
                groupIndex += 1;
                previousGroupKey = groupKey;
            }

            row.classList.add(groupIndex % 2 === 0 ? 'op-group-plain' : 'op-group-painted');
        });
    }

    function applyClientFilterToView(viewId = state.activeView) {
        const table = getClientFilterTable(viewId);
        const columnIndex = getClientColumnIndex(table);

        syncClientFilterHeaderState();
        removeClientFilterEmptyState(table);

        if (!(table instanceof HTMLTableElement) || columnIndex < 0) {
            return;
        }

        const selectedValue = normalizeClientFilterValue(state.clientFilters[viewId]);
        const selectedKey = normalizeClientFilterKey(selectedValue);
        const rows = getClientFilterDataRows(table);
        let visibleRows = 0;

        rows.forEach((row) => {
            const clientValue = getClientValueFromRow(row, columnIndex);
            const matches = !selectedKey || normalizeClientFilterKey(clientValue) === selectedKey;

            row.hidden = !matches;
            row.classList.toggle('client-filter-hidden-row', !matches);

            if (matches) {
                visibleRows += 1;
            }
        });

        syncClientFilterRowClasses(rows);
        syncClientFilterEmptyState(table, visibleRows, selectedValue);
        applyOpGroupStriping(viewId);
    }

    function removeOpSearchEmptyState(table) {
        if (!(table instanceof HTMLTableElement) || !table.tBodies.length) {
            return;
        }

        table.tBodies[0].querySelectorAll('.op-search-empty-state').forEach((row) => {
            row.remove();
        });
    }

    function syncOpSearchEmptyState(table, visibleRows, searchValue) {
        removeOpSearchEmptyState(table);

        if (!(table instanceof HTMLTableElement) || !table.tBodies.length || visibleRows > 0 || !searchValue) {
            return;
        }

        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-state op-search-empty-state';

        const emptyCell = document.createElement('td');
        emptyCell.colSpan = table.tHead && table.tHead.rows.length
            ? table.tHead.rows[0].cells.length
            : 1;
        emptyCell.textContent = `No hay filas para la OP-PTDA "${searchValue}".`;

        emptyRow.appendChild(emptyCell);
        table.tBodies[0].appendChild(emptyRow);
    }

    function applyOpSearchFilterToView(viewId = state.activeView) {
        const table = getClientFilterTable(viewId);
        const rows = getRenderableTableRows(table);

        removeOpSearchEmptyState(table);

        rows.forEach((row) => {
            row.style.display = '';
        });

        const activeSearch = state.activeSearch;
        if (
            !activeSearch ||
            activeSearch.viewId !== viewId ||
            !(table instanceof HTMLTableElement)
        ) {
            return;
        }

        const searchValue = String(activeSearch.searchValue || activeSearch.query || '').trim();
        const normalizedSearchValue = TintoreriaUtils.normalizeOpPartidaSearchValue(searchValue);
        const columnIndex = getTableColumnIndexByHeader(table, OP_SEARCH_HEADER_LABEL);

        if (!normalizedSearchValue || columnIndex < 0) {
            return;
        }

        let visibleRows = 0;

        rows.forEach((row) => {
            const cell = row.cells[columnIndex];
            const rowSearchValue = TintoreriaUtils.normalizeOpPartidaSearchValue(cell ? cell.textContent : '');
            const matches = rowSearchValue === normalizedSearchValue;

            row.style.display = matches ? '' : 'none';

            if (matches) {
                visibleRows += 1;
            }
        });

        syncOpSearchEmptyState(table, visibleRows, searchValue);
        applyOpGroupStriping(viewId);
    }

    function handleClientHeaderContextMenu(event) {
        const target = event.target;
        const headerCell = target instanceof Element ? target.closest('th') : null;

        if (!isClientHeaderCell(headerCell)) {
            hideClientFilterMenu();
            return;
        }

        event.preventDefault();
        openClientFilterMenu(headerCell, event.clientX, event.clientY);
    }

    function handleClientFilterDocumentClick(event) {
        if (!clientFilterMenuRefs || !(clientFilterMenuRefs.root instanceof HTMLElement)) {
            return;
        }

        const menuRoot = clientFilterMenuRefs.root;
        if (menuRoot.classList.contains('hidden')) {
            return;
        }

        const target = event.target;
        if (target instanceof Node && menuRoot.contains(target)) {
            return;
        }

        hideClientFilterMenu();
    }

    function handleClientFilterKeydown(event) {
        if (event.key === 'Escape') {
            hideClientFilterMenu();
        }
    }

    function bindClientFilterMenu() {
        syncClientFilterHeaderState();
        document.addEventListener('contextmenu', handleClientHeaderContextMenu);
        document.addEventListener('click', handleClientFilterDocumentClick);
        document.addEventListener('keydown', handleClientFilterKeydown);
        document.addEventListener('scroll', hideClientFilterMenu, true);
        window.addEventListener('resize', hideClientFilterMenu);
    }

    function buildReadonlyValue(value, extraClassName = '') {
        const span = document.createElement('span');
        span.className = `cell-text readonly-cell-value ${extraClassName}`.trim();

        const safeValue = String(value === undefined || value === null ? '' : value).trim();
        if (safeValue) {
            span.textContent = safeValue;
        } else {
            span.textContent = '--';
            span.classList.add('readonly-placeholder');
        }

        return span;
    }

    function getReadonlyControlValue(control) {
        if (control instanceof HTMLSelectElement) {
            if (!control.value) {
                return '';
            }

            return control.selectedOptions[0] ? control.selectedOptions[0].textContent.trim() : control.value;
        }

        if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
            return control.value;
        }

        return '';
    }

    function replaceTableControlWithReadonlyValue(control) {
        const extraClassName = control.classList.contains('mono') ? 'code-text' : '';
        const replacement = buildReadonlyValue(getReadonlyControlValue(control), extraClassName);
        if (control.dataset.recordId) {
            replacement.dataset.recordId = control.dataset.recordId;
        }
        if (control.dataset.field) {
            replacement.dataset.field = control.dataset.field;
        }
        if (control.dataset.recordKey) {
            replacement.dataset.recordKey = control.dataset.recordKey;
        }
        control.replaceWith(replacement);
    }

    function replaceReadonlyActionButton(button) {
        const action = String(button.dataset.action || '').trim();

        if (button.classList.contains('edit-detail-button') || action === 'open-detail-modal') {
            button.remove();
            return;
        }

        if (button.classList.contains('process-pill')) {
            const pill = document.createElement('span');
            pill.className = button.className.replace('process-pill-action', '').trim() || 'process-pill';
            pill.classList.remove('process-pill-action');
            pill.classList.add(action === 'start' ? 'process-pill-muted' : 'process-pill-info');
            pill.textContent = action === 'start'
                ? 'Pendiente'
                : (String(button.textContent || '').trim() || '--:--');
            button.replaceWith(pill);
            return;
        }

        button.replaceWith(buildReadonlyValue(button.textContent || ''));
    }

    function syncDetailModalAccess(viewId, canEdit) {
        const config = DETAIL_MODAL_ACCESS[viewId];
        if (!config) {
            return;
        }

        const modal = document.getElementById(config.modalId);
        const form = document.getElementById(config.formId);
        const saveButton = document.getElementById(config.saveId);
        const clearButton = document.getElementById(config.clearId);

        if (saveButton instanceof HTMLButtonElement) {
            saveButton.disabled = !canEdit;
            saveButton.classList.toggle('hidden', !canEdit);
        }

        if (clearButton instanceof HTMLButtonElement) {
            clearButton.disabled = !canEdit;
            clearButton.classList.toggle('hidden', !canEdit);
        }

        if (form instanceof HTMLFormElement) {
            form.querySelectorAll('input, textarea, select').forEach((element) => {
                if (element instanceof HTMLSelectElement) {
                    element.disabled = !canEdit;
                    return;
                }

                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                    element.readOnly = !canEdit;
                }
            });
        }

        if (!canEdit && modal instanceof HTMLElement && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    }

    function applyCurrentViewAccess() {
        updateAuthSessionUi();

        const section = document.getElementById(`view-${state.activeView}`);
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const canEdit = canEditActiveView(state.activeView);
        section.classList.toggle('view-readonly', !canEdit);
        syncDetailModalAccess(state.activeView, canEdit);

        if (canEdit) {
            return;
        }

        const tbody = section.querySelector('tbody');
        if (!(tbody instanceof HTMLElement)) {
            return;
        }

        tbody.querySelectorAll('.table-input, .table-select, .table-textarea').forEach((control) => {
            if (
                control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement
            ) {
                if (canEditViewField(control.dataset.field || '', state.activeView)) {
                    return;
                }

                replaceTableControlWithReadonlyValue(control);
            }
        });

        tbody.querySelectorAll('.edit-detail-button, button[data-action="open-detail-modal"], button[data-action="start"], button[data-action="finish"]').forEach((button) => {
            if (button instanceof HTMLButtonElement) {
                replaceReadonlyActionButton(button);
            }
        });

        tbody.querySelectorAll('[data-action="edit-route"]').forEach((node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }

            const clone = node.cloneNode(true);
            if (clone instanceof HTMLElement) {
                clone.removeAttribute('data-action');
                clone.removeAttribute('data-record-id');
                clone.removeAttribute('title');
                clone.classList.remove('route-readonly-chip');
                clone.classList.add('readonly-route-chip');
                node.replaceWith(clone);
            }
        });
    }

    function annotateVisibleRows(viewId = state.activeView) {
        const section = document.getElementById(`view-${viewId}`);
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const rows = section.querySelectorAll('tbody tr');

        rows.forEach((row) => {
            if (!(row instanceof HTMLTableRowElement)) {
                return;
            }

            const currentRecordId = row.dataset.recordRowId || '';
            if (currentRecordId) {
                return;
            }

            const sourceNode = row.querySelector('[data-record-id]');
            if (!(sourceNode instanceof HTMLElement)) {
                return;
            }

            const recordId = String(sourceNode.dataset.recordId || '').trim();
            if (!recordId) {
                return;
            }

            row.dataset.recordRowId = recordId;
        });

        syncClientFilterRowClasses(rows);
    }

    function isTableEditorControl(node) {
        return (
            (
                node instanceof HTMLInputElement ||
                node instanceof HTMLSelectElement ||
                node instanceof HTMLTextAreaElement
            ) &&
            (
                node.classList.contains('table-input') ||
                node.classList.contains('table-select') ||
                node.classList.contains('table-textarea')
            ) &&
            Boolean(node.dataset.recordId) &&
            Boolean(node.dataset.field)
        );
    }

    function escapeAttributeValue(value) {
        const stringValue = String(value === undefined || value === null ? '' : value);
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return CSS.escape(stringValue);
        }

        return stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function focusControl(control) {
        if (
            !(
                control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement
            )
        ) {
            return;
        }

        try {
            control.focus({ preventScroll: true });
        } catch (error) {
            control.focus();
        }
    }

    function captureTableInteraction(viewId = state.activeView) {
        const activeElement = document.activeElement;
        if (!isTableEditorControl(activeElement)) {
            return null;
        }

        const section = activeElement.closest('.view-section');
        if (!(section instanceof HTMLElement) || section.id !== `view-${viewId}`) {
            return null;
        }

        const snapshot = {
            viewId,
            recordId: String(activeElement.dataset.recordId || ''),
            field: String(activeElement.dataset.field || ''),
            value: activeElement.value
        };

        if (
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement
        ) {
            snapshot.selectionStart = activeElement.selectionStart;
            snapshot.selectionEnd = activeElement.selectionEnd;
            snapshot.selectionDirection = activeElement.selectionDirection;
            snapshot.scrollLeft = activeElement.scrollLeft;
        }

        return snapshot.recordId && snapshot.field ? snapshot : null;
    }

    function restoreTableInteraction(snapshot, viewId = state.activeView) {
        if (!snapshot || snapshot.viewId !== viewId) {
            return;
        }

        const section = document.getElementById(`view-${viewId}`);
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const selector = [
            `[data-record-id="${escapeAttributeValue(snapshot.recordId)}"]`,
            `[data-field="${escapeAttributeValue(snapshot.field)}"]`
        ].join('');

        const control = section.querySelector(selector);
        if (!isTableEditorControl(control)) {
            return;
        }

        focusControl(control);

        if (
            (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
            control.value === snapshot.value &&
            typeof snapshot.selectionStart === 'number' &&
            typeof snapshot.selectionEnd === 'number'
        ) {
            control.setSelectionRange(
                snapshot.selectionStart,
                snapshot.selectionEnd,
                snapshot.selectionDirection || 'none'
            );

            if (typeof snapshot.scrollLeft === 'number') {
                control.scrollLeft = snapshot.scrollLeft;
            }
        }
    }

    function areRecordsEquivalent(leftRecord, rightRecord) {
        const normalizedLeft = TintoreriaUtils.defaultRecord(leftRecord || {});
        const normalizedRight = TintoreriaUtils.defaultRecord(rightRecord || {});
        return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
    }

    function setLoading(isLoading) {
        const loader = document.getElementById('app-loader');
        if (!loader) {
            return;
        }

        loader.classList.toggle('hidden', !isLoading);
    }

    function showToast(message, type = 'success', title = null) {
        const container = document.getElementById('toast-root');
        if (!container) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <strong>${TintoreriaUtils.escapeHtml(title || (type === 'error' ? 'Error' : 'Aviso'))}</strong>
            <span>${TintoreriaUtils.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);
        window.setTimeout(() => {
            toast.remove();
        }, 4200);
    }

    function closeConfirm(result) {
        const modal = document.getElementById('confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        if (confirmResolver) {
            confirmResolver(result);
            confirmResolver = null;
        }
    }

    function refreshConfigBanner() {
        const banner = document.getElementById('config-banner');
        if (!banner) {
            return;
        }

        if (TintoreriaUtils.hasConfiguredWebAppUrl()) {
            banner.textContent = '';
            banner.classList.add('hidden');
            return;
        }

        banner.textContent = 'WEB_APP_URL aun no esta configurada. La interfaz funciona en modo local para pruebas; para sincronizar con Google Sheets debes pegar la URL del Apps Script en js/config.js.';
        banner.classList.remove('hidden');
    }

    function bindNavigation() {
        document.querySelectorAll('[data-view-target]').forEach((button) => {
            button.addEventListener('click', () => {
                switchView(button.dataset.viewTarget);
            });
        });
    }

    function bindPermissionRefresh() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element) || !target.closest('.subtab')) {
                return;
            }

            window.requestAnimationFrame(() => {
                applyCurrentViewAccess();
            });
        });
    }

    function getSearchInput() {
        return document.getElementById('op-search-input');
    }

    function getSearchClearButton() {
        return document.getElementById('op-search-clear');
    }

    function syncSearchUi() {
        const searchInput = getSearchInput();
        const clearButton = getSearchClearButton();
        if (!(clearButton instanceof HTMLButtonElement)) {
            return;
        }

        const hasValue = searchInput instanceof HTMLInputElement && Boolean(searchInput.value.trim());
        clearButton.classList.toggle('hidden', !hasValue && !state.activeSearch);
    }

    function normalizeSearchTerm(value) {
        return String(value === undefined || value === null ? '' : value)
            .toUpperCase()
            .replace(/\s+/g, '')
            .trim();
    }

    function compactSearchTerm(value) {
        return normalizeSearchTerm(value).replace(/[^A-Z0-9]/g, '');
    }

    function buildRecordSearchValue(record) {
        return TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
    }

    function getRecordSearchMatchType(record, query) {
        const normalizedQuery = normalizeSearchTerm(query);
        const compactQuery = compactSearchTerm(query);

        if (!normalizedQuery || !compactQuery) {
            return '';
        }

        const displayValue = buildRecordSearchValue(record);
        const normalizedDisplay = normalizeSearchTerm(displayValue);
        const compactDisplay = compactSearchTerm(displayValue);

        if (normalizedDisplay === normalizedQuery || compactDisplay === compactQuery) {
            return 'exact';
        }

        if (normalizedDisplay.includes(normalizedQuery) || compactDisplay.includes(compactQuery)) {
            return 'partial';
        }

        return '';
    }

    function findSearchResult(query) {
        const searchModes = ['exact', 'partial'];

        for (const mode of searchModes) {
            for (const viewId of getAvailableSearchViewOrder()) {
                const controller = state.views[viewId];
                if (!controller || typeof controller.locateRecord !== 'function') {
                    continue;
                }

                for (const record of state.records) {
                    const matchType = getRecordSearchMatchType(record, query);
                    if (matchType !== mode) {
                        continue;
                    }

                    const context = controller.locateRecord(record, state);
                    if (!context) {
                        continue;
                    }

                    return {
                        record,
                        viewId,
                        context
                    };
                }
            }
        }

        return null;
    }

    function clearActiveSearch(options = {}) {
        const {
            keepInput = false,
            rerender = true
        } = options;

        state.activeSearch = null;

        const searchInput = getSearchInput();
        if (searchInput && !keepInput) {
            searchInput.value = '';
        }

        syncSearchUi();

        if (rerender) {
            renderActiveView();
        }
    }

    function activateSearchFilter(viewId, context) {
        const filter = context && context.filter;
        const attribute = SEARCH_FILTER_ATTRIBUTES[viewId];
        if (!filter || !attribute) {
            return false;
        }

        const targetButton = document.querySelector(`[${attribute}="${filter}"]`);
        if (!(targetButton instanceof HTMLButtonElement)) {
            return false;
        }

        targetButton.click();
        return true;
    }

    function scrollSearchRecordIntoView(recordId) {
        if (!recordId) {
            return;
        }

        window.requestAnimationFrame(() => {
            const row = document.querySelector(`#view-${state.activeView} tr[data-record-row-id="${recordId}"]`)
                || document.querySelector(`#view-${state.activeView} [data-record-id="${recordId}"]`)?.closest('tr')
                || null;

            if (row) {
                row.scrollIntoView({
                    block: 'center',
                    behavior: 'smooth'
                });
            }
        });
    }

    function runGlobalOpSearch() {
        const searchInput = getSearchInput();
        if (!(searchInput instanceof HTMLInputElement)) {
            return;
        }

        const query = searchInput.value.trim();
        if (!query) {
            clearActiveSearch();
            return;
        }

        const result = findSearchResult(query);
        if (!result) {
            if (state.activeSearch) {
                clearActiveSearch({ keepInput: true });
            }
            showToast(`No se encontro la OP-PTDA ${query} en las vistas visibles.`, 'error', 'Sin resultados');
            return;
        }

        const canonicalSearchValue = buildRecordSearchValue(result.record);
        searchInput.value = canonicalSearchValue;
        state.activeSearch = {
            query: canonicalSearchValue,
            searchValue: canonicalSearchValue,
            recordId: result.record.id_registro,
            viewId: result.viewId
        };
        syncSearchUi();

        switchView(result.viewId, { clearSearch: false });

        if (!activateSearchFilter(result.viewId, result.context)) {
            renderActiveView();
        }

        scrollSearchRecordIntoView(result.record.id_registro);
    }

    function bindSearchActions() {
        const searchForm = document.getElementById('op-search-form');
        const searchInput = getSearchInput();
        const clearButton = getSearchClearButton();

        if (searchForm) {
            searchForm.addEventListener('submit', (event) => {
                event.preventDefault();
                runGlobalOpSearch();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (!searchInput.value.trim() && state.activeSearch) {
                    clearActiveSearch({ rerender: true });
                    return;
                }

                if (
                    state.activeSearch &&
                    normalizeSearchTerm(searchInput.value) !== normalizeSearchTerm(state.activeSearch.query)
                ) {
                    clearActiveSearch({ keepInput: true, rerender: true });
                }

                syncSearchUi();
            });

            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    clearActiveSearch();
                    searchInput.blur();
                }
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                clearActiveSearch({ keepInput: false, rerender: true });

                if (searchInput instanceof HTMLInputElement) {
                    searchInput.focus();
                }
            });
        }

        syncSearchUi();
    }

    function bindSharedActions() {
        const refreshButton = document.getElementById('btn-refresh-data');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                refreshData();
            });
        }

        const confirmCancel = document.getElementById('confirm-cancel');
        const confirmAccept = document.getElementById('confirm-accept');

        if (confirmCancel) {
            confirmCancel.addEventListener('click', () => closeConfirm(false));
        }

        if (confirmAccept) {
            confirmAccept.addEventListener('click', () => closeConfirm(true));
        }
    }

    function refreshCounts() {
        PROCESS_TABS.forEach((tab) => {
            const view = state.views[tab.id];
            const count = view && typeof view.count === 'function' ? view.count(state.records, state) : 0;
            const badge = document.getElementById(`count-${tab.id}`);
            if (badge) {
                badge.textContent = String(count);
            }
        });
    }

    function applyCalidadPageLoadOrder(records = state.records) {
        if (window.TintoreriaCalidad && typeof TintoreriaCalidad.sortRecordsForPageLoad === 'function') {
            return TintoreriaCalidad.sortRecordsForPageLoad(records);
        }

        return [...records];
    }

    function renderActiveView(options = {}) {
        const { preserveInteraction = true } = options;
        const renderToken = state.renderSequence + 1;
        const interactionSnapshot = preserveInteraction ? captureTableInteraction() : null;
        state.renderSequence = renderToken;
        hideClientFilterMenu();

        const controller = state.views[state.activeView];
        if (controller && typeof controller.render === 'function') {
            controller.render(state.records, state);
        }

        applyCurrentViewAccess();
        annotateVisibleRows();
        applyClientFilterToView();
        applyOpSearchFilterToView();
        applyOpGroupStriping();

        if (interactionSnapshot) {
            window.requestAnimationFrame(() => {
                if (state.renderSequence !== renderToken) {
                    return;
                }

                restoreTableInteraction(interactionSnapshot);
            });
        }
    }

    function switchView(viewId, options = {}) {
        const { clearSearch = true } = options;
        const previousView = state.activeView;

        if (!canAccessView(viewId)) {
            showToast('Tu usuario no tiene acceso a esta vista.', 'error', 'Acceso restringido');
            return;
        }

        if (clearSearch) {
            clearActiveSearch({ rerender: false });
        }

        if (viewId === 'stock' && previousView !== 'stock') {
            state.returnView = canAccessView(previousView) ? previousView : getDefaultAccessibleView();
        } else if (viewId !== 'stock') {
            state.returnView = viewId;
        }

        state.activeView = viewId;
        document.body.dataset.activeView = viewId;

        document.querySelectorAll('.view-section').forEach((section) => {
            section.classList.toggle('active', section.id === `view-${viewId}`);
        });

        document.querySelectorAll('.main-tab, .brand-logo-button').forEach((button) => {
            button.classList.toggle('active', button.dataset.viewTarget === viewId);
        });

        renderActiveView();
    }

    function getStockReturnView() {
        if (state.returnView && canAccessView(state.returnView)) {
            return state.returnView;
        }

        return getDefaultAccessibleView();
    }

    async function refreshData(options = {}) {
        const { silent = false } = options;
        setLoading(true);

        try {
            const result = await TintoreriaAPI.listRecords();
            state.records = TintoreriaUtils.sortRecords(result.records || []);
            state.records = applyCalidadPageLoadOrder(state.records);
            state.source = result.source || 'local';

            refreshCounts();
            renderActiveView();
            refreshConfigBanner();

            if (!silent) {
                const message = state.source === 'remote'
                    ? 'Datos actualizados desde Google Sheet.'
                    : 'Datos actualizados en modo local.';
                showToast(message, 'success', 'Datos sincronizados');
            }
        } catch (error) {
            console.error(error);
            showToast(error.message || 'No se pudieron cargar los datos.', 'error', 'Error al cargar');
        } finally {
            setLoading(false);
        }
    }

    function upsertRecord(record) {
        const normalized = TintoreriaUtils.defaultRecord(record);
        const index = state.records.findIndex((item) => item.id_registro === normalized.id_registro);

        if (index >= 0) {
            state.records.splice(index, 1, normalized);
        } else {
            state.records.unshift(normalized);
        }

        state.records = TintoreriaUtils.sortRecords(state.records);
    }

    function refreshVisibleState(options = {}) {
        refreshCounts();
        renderActiveView(options);
    }

    function setRecords(records, options = {}) {
        state.records = TintoreriaUtils.sortRecords(
            (records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );
        state.records = applyCalidadPageLoadOrder(state.records);
        refreshVisibleState(options);
        return getRecords();
    }

    async function importRecords(records) {
        if (!canAccessView('maestro')) {
            throw new Error('Tu usuario no tiene permisos para importar registros en Maestro.');
        }

        setLoading(true);

        try {
            const result = await TintoreriaAPI.appendRecords(records);
            (result.records || []).forEach((record) => upsertRecord(record));
            refreshVisibleState();
            return result.records || [];
        } catch (error) {
            console.error(error);
            showToast(error.message || 'No se pudieron importar los registros.', 'error', 'Importacion fallida');
            throw error;
        } finally {
            setLoading(false);
        }
    }

    async function saveRecordChanges(recordId, changes, options = {}) {
        const {
            silent = false,
            successTitle = 'Registro actualizado',
            successMessage = 'Los cambios se guardaron correctamente.',
            permissionViewId = state.activeView,
            permissionFilter = getActiveSubtabFilter(permissionViewId)
        } = options;

        if (!canEditViewChanges(changes, permissionViewId, permissionFilter)) {
            throw new Error('Tu usuario solo tiene permiso de consulta en esta vista o subtab.');
        }

        const currentRecord = findRecord(recordId);
        if (!currentRecord) {
            throw new Error('No se encontro el registro a actualizar.');
        }

        const pending = state.pendingSaves[recordId] || {
            confirmedRecord: currentRecord,
            latestToken: 0,
            queue: Promise.resolve()
        };

        state.saveSequence += 1;
        const saveToken = state.saveSequence;
        pending.latestToken = saveToken;
        state.pendingSaves[recordId] = pending;

        upsertRecord({
            ...currentRecord,
            ...changes,
            id_registro: recordId
        });
        refreshVisibleState({ preserveInteraction: true });

        const queuedSave = pending.queue
            .catch(() => undefined)
            .then(async () => {
                const result = await TintoreriaAPI.updateRecord(recordId, changes);
                const confirmedRecord = {
                    ...pending.confirmedRecord,
                    ...changes,
                    ...(result.record || {}),
                    id_registro: recordId
                };

                pending.confirmedRecord = TintoreriaUtils.defaultRecord(confirmedRecord);

                if (pending.latestToken === saveToken) {
                    const activeRecord = findRecord(recordId);
                    if (!areRecordsEquivalent(activeRecord, pending.confirmedRecord)) {
                        upsertRecord(pending.confirmedRecord);
                        refreshVisibleState({ preserveInteraction: true });
                    }

                    if (!silent) {
                        showToast(successMessage, 'success', successTitle);
                    }
                }

                return pending.confirmedRecord;
            })
            .catch((error) => {
                if (pending.latestToken === saveToken) {
                    upsertRecord(pending.confirmedRecord);
                    refreshVisibleState({ preserveInteraction: true });
                }

                throw error;
            });

        pending.queue = queuedSave.finally(() => {
            const activePending = state.pendingSaves[recordId];
            if (activePending === pending && pending.latestToken === saveToken) {
                delete state.pendingSaves[recordId];
            }
        });

        return queuedSave;
    }

    function registerView(viewId, controller) {
        state.views[viewId] = controller;
    }

    function getRecords() {
        return [...state.records];
    }

    function findRecord(recordId) {
        return state.records.find((record) => record.id_registro === recordId) || null;
    }

    function confirmAction({ title = 'Confirmar accion', message = '' } = {}) {
        const modal = document.getElementById('confirm-modal');
        const titleNode = document.getElementById('confirm-title');
        const messageNode = document.getElementById('confirm-message');

        if (titleNode) {
            titleNode.textContent = title;
        }

        if (messageNode) {
            messageNode.textContent = message;
        }

        if (modal) {
            modal.classList.remove('hidden');
        }

        return new Promise((resolve) => {
            confirmResolver = resolve;
        });
    }

    function init() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;
        updateAuthSessionUi();

        const preferredLanding = getPreferredLandingState();
        state.activeView = preferredLanding.viewId;

        bindNavigation();
        bindPermissionRefresh();
        bindSharedActions();
        bindSearchActions();
        bindClientFilterMenu();
        Object.values(state.views).forEach((view) => {
            if (view && typeof view.init === 'function') {
                view.init();
            }
        });
        refreshConfigBanner();
        switchView(state.activeView);
        activatePreferredSubtab(preferredLanding.viewId, preferredLanding.filter);
        refreshData({ silent: true });
    }

    window.TintoreriaApp = {
        state,
        registerView,
        getRecords,
        setRecords,
        findRecord,
        switchView,
        getStockReturnView,
        refreshData,
        importRecords,
        saveRecordChanges,
        showToast,
        confirmAction
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.addEventListener('tintoreria-authenticated', () => {
            init();
        });

        if (!hasAuthController()) {
            init();
            return;
        }

        Promise.resolve(TintoreriaAuth.ready && TintoreriaAuth.ready())
            .then(() => {
                if (TintoreriaAuth.isAuthenticated()) {
                    init();
                }
            })
            .catch((error) => {
                console.error('No se pudo preparar la autenticacion.', error);
            });
    });
})();
