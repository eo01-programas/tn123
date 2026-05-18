(() => {
    const SESSION_STORAGE_KEY = 'tintoreria-auth-session';
    const CREDENTIALS_PATH = './credentials.md';
    const DEFAULT_CREDENTIALS_TABLE = `
| usuario | password |
| --- | --- |
| Pcp_textil | 087ja |
| Tintoreria05 | 982ao |
| Supervisor01 | 993ra |
| Supervisor02 | 477lf |
| Calidad | 023sb |
| Embalaje | 050jl |
`.trim();

    const PROCESS_VIEW_IDS = [
        'plegado',
        'rama-crudo',
        'preparado',
        'tenido',
        'abridora',
        'rama-tenido',
        'acab-espec',
        'calidad',
        'embalaje',
        'stock'
    ];

    const PERMISSION_PROFILES = {
        Pcp_textil: {
            canAccessMaestro: true,
            fullAccess: true,
            readOnlyViews: [],
            programadoOnlyViews: [],
            alwaysEditableViews: PROCESS_VIEW_IDS,
            defaultView: 'plegado',
            defaultFilter: 'X PROG'
        },
        Tintoreria05: {
            canAccessMaestro: true,
            fullAccess: true,
            readOnlyViews: [],
            programadoOnlyViews: [],
            alwaysEditableViews: PROCESS_VIEW_IDS,
            defaultView: 'plegado',
            defaultFilter: 'X PROG'
        },
        Supervisor01: {
            canAccessMaestro: false,
            fullAccess: false,
            readOnlyViews: ['preparado', 'tenido', 'calidad', 'embalaje'],
            programadoOnlyViews: ['plegado', 'rama-crudo', 'abridora', 'rama-tenido', 'acab-espec'],
            alwaysEditableViews: [],
            defaultView: 'rama-crudo',
            defaultFilter: 'PROG'
        },
        Supervisor02: {
            canAccessMaestro: false,
            fullAccess: false,
            readOnlyViews: ['plegado', 'rama-crudo', 'abridora', 'rama-tenido', 'acab-espec', 'calidad', 'embalaje'],
            programadoOnlyViews: ['preparado', 'tenido'],
            alwaysEditableViews: [],
            defaultView: 'tenido',
            defaultFilter: 'PROG'
        },
        Calidad: {
            canAccessMaestro: false,
            fullAccess: false,
            readOnlyViews: ['plegado', 'rama-crudo', 'preparado', 'tenido', 'abridora', 'rama-tenido', 'acab-espec', 'embalaje'],
            programadoOnlyViews: [],
            alwaysEditableViews: ['calidad'],
            defaultView: 'calidad',
            defaultFilter: 'ACTIVE'
        },
        Embalaje: {
            canAccessMaestro: false,
            fullAccess: false,
            readOnlyViews: ['plegado', 'rama-crudo', 'preparado', 'tenido', 'abridora', 'rama-tenido', 'acab-espec', 'calidad'],
            programadoOnlyViews: [],
            alwaysEditableViews: ['embalaje'],
            defaultView: 'embalaje',
            defaultFilter: ''
        }
    };

    let credentialsMap = new Map();
    let currentSession = null;
    let credentialsReadyPromise = Promise.resolve();
    let credentialsLoaded = false;

    function normalizeUsername(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function normalizePassword(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/Âª/g, 'ª')
            .trim();
    }

    function parseCredentialsTable(tableText) {
        const lines = String(tableText || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('|'));

        const rows = lines
            .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
            .filter((cells) => cells.length >= 2);

        if (rows.length <= 1) {
            return [];
        }

        return rows
            .slice(1)
            .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
            .map((cells) => ({
                username: normalizeUsername(cells[0]),
                password: normalizePassword(cells[1] || '')
            }))
            .filter((credential) => credential.username && credential.password);
    }

    async function loadCredentialsTable() {
        let rawTable = DEFAULT_CREDENTIALS_TABLE;

        try {
            const response = await fetch(CREDENTIALS_PATH, { cache: 'no-store' });
            if (response.ok) {
                rawTable = await response.text();
            }
        } catch (error) {
            console.warn('No se pudo cargar credentials.md, se usa la copia local de respaldo.', error);
        }

        const parsedCredentials = parseCredentialsTable(rawTable);
        credentialsMap = new Map(parsedCredentials.map((credential) => [credential.username, credential]));
    }

    function buildSession(username) {
        const normalizedUsername = normalizeUsername(username);
        const profile = PERMISSION_PROFILES[normalizedUsername];
        if (!profile) {
            return null;
        }

        return {
            username: normalizedUsername,
            canAccessMaestro: Boolean(profile.canAccessMaestro),
            fullAccess: Boolean(profile.fullAccess),
            readOnlyViews: [...profile.readOnlyViews],
            programadoOnlyViews: [...profile.programadoOnlyViews],
            alwaysEditableViews: [...profile.alwaysEditableViews],
            defaultView: String(profile.defaultView || 'plegado'),
            defaultFilter: String(profile.defaultFilter || '')
        };
    }

    function persistSession(username) {
        const nextSession = buildSession(username);
        if (!nextSession) {
            return null;
        }

        currentSession = nextSession;
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ username: nextSession.username }));
        return nextSession;
    }

    function clearSession() {
        currentSession = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    function restoreSession() {
        try {
            const rawSession = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
            if (!rawSession || !rawSession.username) {
                return;
            }

            currentSession = buildSession(rawSession.username);
        } catch (error) {
            clearSession();
        }
    }

    function isAuthenticated() {
        return Boolean(currentSession);
    }

    function getSession() {
        return currentSession ? { ...currentSession } : null;
    }

    function canAccessView(viewId) {
        if (!currentSession) {
            return false;
        }

        if (viewId === 'maestro') {
            return currentSession.canAccessMaestro;
        }

        return PROCESS_VIEW_IDS.includes(viewId);
    }

    function canEditView(viewId, activeFilter = '') {
        if (!currentSession || !canAccessView(viewId)) {
            return false;
        }

        if (viewId === 'maestro') {
            return currentSession.canAccessMaestro;
        }

        if (currentSession.fullAccess) {
            return true;
        }

        if (currentSession.readOnlyViews.includes(viewId)) {
            return false;
        }

        if (currentSession.alwaysEditableViews.includes(viewId)) {
            return true;
        }

        if (currentSession.programadoOnlyViews.includes(viewId)) {
            return String(activeFilter || '').trim().toUpperCase() === 'PROG';
        }

        return false;
    }

    function hasPorProgramarStatusOverride(viewId, activeFilter = '') {
        if (!currentSession || !canAccessView(viewId) || viewId === 'maestro') {
            return false;
        }

        if (!['Supervisor01', 'Supervisor02'].includes(currentSession.username)) {
            return false;
        }

        return String(activeFilter || '').trim().toUpperCase() === 'X PROG';
    }

    function getStatusCompanionFields(fieldName) {
        const normalizedField = String(fieldName || '').trim();
        const companionFields = new Set();

        if (!normalizedField) {
            return companionFields;
        }

        companionFields.add(normalizedField);

        if (/_estado$/.test(normalizedField)) {
            companionFields.add(`${normalizedField.replace(/_estado$/, '')}_fecha`);
        }

        if (normalizedField === 'acabado_especial_estado') {
            companionFields.add('acab_espec_estado');
        }

        if (normalizedField === 'acab_espec_estado') {
            companionFields.add('acabado_especial_estado');
            companionFields.add('acabado_especial_fecha');
        }

        return companionFields;
    }

    function canEditField(viewId, fieldName, activeFilter = '') {
        if (canEditView(viewId, activeFilter)) {
            return true;
        }

        if (!hasPorProgramarStatusOverride(viewId, activeFilter)) {
            return false;
        }

        return /_estado$/.test(String(fieldName || '').trim());
    }

    function canEditChanges(viewId, changes, activeFilter = '') {
        if (canEditView(viewId, activeFilter)) {
            return true;
        }

        if (!hasPorProgramarStatusOverride(viewId, activeFilter)) {
            return false;
        }

        const fields = Object.keys(changes || {}).filter((field) => String(field || '').trim());
        if (!fields.length) {
            return false;
        }

        const allowedFields = new Set();
        fields
            .filter((field) => /_estado$/.test(String(field || '').trim()))
            .forEach((field) => {
                getStatusCompanionFields(field).forEach((allowedField) => {
                    allowedFields.add(allowedField);
                });
            });

        if (!allowedFields.size) {
            return false;
        }

        return fields.every((field) => allowedFields.has(field));
    }

    function getAccessLabel(viewId, activeFilter = '') {
        if (!currentSession) {
            return 'Sesion inactiva';
        }

        if (currentSession.fullAccess) {
            return 'Acceso total';
        }

        if (viewId === 'maestro') {
            return currentSession.canAccessMaestro ? 'Acceso total' : 'Sin acceso';
        }

        if (canEditView(viewId, activeFilter)) {
            if (currentSession.programadoOnlyViews.includes(viewId)) {
                return 'Edicion en Programado';
            }

            return 'Edicion permitida';
        }

        return 'Solo consulta';
    }

    function setFeedback(message, type = 'error') {
        const feedback = document.getElementById('login-feedback');
        if (!feedback) {
            return;
        }

        if (!message) {
            feedback.textContent = '';
            feedback.classList.add('hidden');
            feedback.dataset.type = '';
            return;
        }

        feedback.textContent = message;
        feedback.dataset.type = type;
        feedback.classList.remove('hidden');
    }

    function setFormEnabled(isEnabled) {
        const form = document.getElementById('login-form');
        const submitButton = document.getElementById('login-submit');

        if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = !isEnabled;
        }

        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        Array.from(form.elements).forEach((element) => {
            if (
                element instanceof HTMLInputElement ||
                element instanceof HTMLButtonElement
            ) {
                element.disabled = !isEnabled;
            }
        });
    }

    function syncShellState() {
        const body = document.body;
        const session = getSession();
        const sessionActive = credentialsLoaded && Boolean(session);

        if (body) {
            body.classList.toggle('auth-locked', !sessionActive);
            body.classList.toggle('is-authenticated', sessionActive);
        }
    }

    function dispatchAuthenticatedEvent() {
        window.dispatchEvent(new CustomEvent('tintoreria-authenticated', {
            detail: getSession()
        }));
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        await credentialsReadyPromise;

        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        if (!(usernameInput instanceof HTMLInputElement) || !(passwordInput instanceof HTMLInputElement)) {
            return;
        }

        const username = normalizeUsername(usernameInput.value);
        const password = normalizePassword(passwordInput.value || '');
        const credential = credentialsMap.get(username);

        if (!credential || credential.password !== password) {
            setFeedback('Usuario o contraseña incorrectos.');
            passwordInput.focus();
            passwordInput.select();
            return;
        }

        persistSession(username);
        setFeedback('');
        syncShellState();

        const form = document.getElementById('login-form');
        if (form instanceof HTMLFormElement) {
            form.reset();
        }

        dispatchAuthenticatedEvent();
    }

    function handleLogoutClick() {
        clearSession();
        window.location.reload();
    }

    function bindEvents() {
        const form = document.getElementById('login-form');

        if (form instanceof HTMLFormElement) {
            form.addEventListener('submit', handleLoginSubmit);
        }
    }

    function init() {
        restoreSession();
        syncShellState();
        bindEvents();
        setFormEnabled(false);

        credentialsReadyPromise = loadCredentialsTable()
            .then(() => {
                if (currentSession && !credentialsMap.has(currentSession.username)) {
                    clearSession();
                    syncShellState();
                }
            })
            .catch((error) => {
                console.error(error);
                setFeedback('No se pudieron cargar las credenciales.');
            })
            .finally(() => {
                credentialsLoaded = true;
                setFormEnabled(true);
                syncShellState();

                if (isAuthenticated()) {
                    dispatchAuthenticatedEvent();
                }
            });
    }

    window.TintoreriaAuth = {
        ready() {
            return credentialsReadyPromise;
        },
        isAuthenticated,
        getSession,
        canAccessView,
        canEditView,
        canEditField,
        canEditChanges,
        getAccessLabel,
        logout: handleLogoutClick,
        syncShellState
    };

    document.addEventListener('DOMContentLoaded', init);
})();
