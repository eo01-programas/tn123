(() => {
    const state = {
        activeView: 'plegado',
        records: [],
        source: 'local',
        views: {},
        activeSearch: null,
        pendingSaves: {},
        saveSequence: 0,
        initialized: false
    };

    let confirmResolver = null;
    const SEARCH_VIEW_ORDER = ['maestro', ...PROCESS_TABS.map((tab) => tab.id)];
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

    function updateAuthSessionUi() {
        const maestroButton = document.querySelector('.brand-logo-button');

        if (maestroButton) {
            maestroButton.classList.toggle('hidden', !canAccessView('maestro'));
        }
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

        section.querySelectorAll('tbody tr').forEach((row) => {
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

        searchInput.value = buildRecordSearchValue(result.record);
        state.activeSearch = {
            query: searchInput.value,
            recordId: result.record.id_registro,
            viewId: result.viewId
        };

        switchView(result.viewId, { clearSearch: false });

        if (!activateSearchFilter(result.viewId, result.context)) {
            renderActiveView();
        }

        scrollSearchRecordIntoView(result.record.id_registro);
    }

    function bindSearchActions() {
        const searchForm = document.getElementById('op-search-form');
        const searchInput = getSearchInput();

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
            });

            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    clearActiveSearch();
                    searchInput.blur();
                }
            });
        }
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

    function renderActiveView() {
        const controller = state.views[state.activeView];
        if (controller && typeof controller.render === 'function') {
            controller.render(state.records, state);
        }

        applyCurrentViewAccess();
        annotateVisibleRows();
    }

    function switchView(viewId, options = {}) {
        const { clearSearch = true } = options;

        if (!canAccessView(viewId)) {
            showToast('Tu usuario no tiene acceso a esta vista.', 'error', 'Acceso restringido');
            return;
        }

        if (clearSearch) {
            clearActiveSearch({ rerender: false });
        }

        state.activeView = viewId;

        document.querySelectorAll('.view-section').forEach((section) => {
            section.classList.toggle('active', section.id === `view-${viewId}`);
        });

        document.querySelectorAll('.main-tab, .brand-logo-button').forEach((button) => {
            button.classList.toggle('active', button.dataset.viewTarget === viewId);
        });

        renderActiveView();
    }

    async function refreshData(options = {}) {
        const { silent = false } = options;
        setLoading(true);

        try {
            const result = await TintoreriaAPI.listRecords();
            state.records = TintoreriaUtils.sortRecords(result.records || []);
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

    function refreshVisibleState() {
        refreshCounts();
        renderActiveView();
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
            successMessage = 'Los cambios se guardaron correctamente.'
        } = options;

        if (!canEditActiveView(state.activeView)) {
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
        refreshVisibleState();

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
                    upsertRecord(pending.confirmedRecord);
                    refreshVisibleState();

                    if (!silent) {
                        showToast(successMessage, 'success', successTitle);
                    }
                }

                return pending.confirmedRecord;
            })
            .catch((error) => {
                if (pending.latestToken === saveToken) {
                    upsertRecord(pending.confirmedRecord);
                    refreshVisibleState();
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
        findRecord,
        switchView,
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
