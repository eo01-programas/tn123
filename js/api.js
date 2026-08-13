(() => {
    const STORAGE_META_KEY = `${LOCAL_STORAGE_KEY}-meta`;
    const GVIZ_COLUMNS_KEY = `${LOCAL_STORAGE_KEY}-gviz-cols`;
    let remoteCacheAvailable = true;

    // La hoja tiene ~6.5k filas x ~184 columnas (~10 MB por lectura completa).
    // Por eso el arranque solo pide las partidas que siguen en proceso; el
    // historico completo se carga bajo demanda (Stock, Reporte, Maestro) y las
    // partidas ya embaladas se traen puntualmente al buscar una OP-PTDA.
    const ACTIVE_SCOPE_COLUMN = 'embalaje_estado';
    const ACTIVE_SCOPE_DONE_VALUE = 'OK';
    const OP_COLUMN = 'op_tela';
    const PARTIDA_COLUMN = 'partida';

    function isQuotaExceededError(error) {
        if (!error) {
            return false;
        }

        const name = String(error.name || '').trim();
        const message = String(error.message || '').trim();
        const code = Number(error.code);

        return (
            name === 'QuotaExceededError' ||
            name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            code === 22 ||
            code === 1014 ||
            /quota/i.test(message)
        );
    }

    function removeStorageItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`No se pudo eliminar ${key} de localStorage.`, error);
        }
    }

    function clearPersistedRecordsCache() {
        removeStorageItem(LOCAL_STORAGE_KEY);
        removeStorageItem(STORAGE_META_KEY);
    }

    function loadLocalRecords() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed)
                ? parsed.map((record) => TintoreriaUtils.defaultRecord(record))
                : [];
        } catch (error) {
            console.error('No se pudo leer localStorage', error);
            return [];
        }
    }

    function saveLocalRecords(records, options = {}) {
        const { optional = false } = options;

        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
            return true;
        } catch (error) {
            if (optional && isQuotaExceededError(error)) {
                remoteCacheAvailable = false;
                clearPersistedRecordsCache();
                console.warn('No se pudo guardar la caché local de registros por falta de espacio.', error);
                return false;
            }

            throw error;
        }
    }

    function loadStorageMeta() {
        try {
            const raw = localStorage.getItem(STORAGE_META_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : null;
        } catch (error) {
            console.error('No se pudo leer la metadata del cache', error);
            return null;
        }
    }

    function saveStorageMeta(meta = {}, options = {}) {
        const { optional = false } = options;

        try {
            localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
            return true;
        } catch (error) {
            if (optional && isQuotaExceededError(error)) {
                remoteCacheAvailable = false;
                clearPersistedRecordsCache();
                console.warn('No se pudo guardar la metadata de la caché local por falta de espacio.', error);
                return false;
            }

            throw error;
        }
    }

    function saveRecordsSnapshot(records, mode, options = {}) {
        const { optional = false, scope = 'active' } = options;
        const normalizedRecords = TintoreriaUtils.sortRecords(
            (records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );

        const recordsSaved = saveLocalRecords(normalizedRecords, { optional });
        if (!recordsSaved) {
            return {
                records: normalizedRecords,
                persisted: false
            };
        }

        const metaSaved = saveStorageMeta({
            mode,
            scope,
            updatedAt: new Date().toISOString(),
            recordCount: normalizedRecords.length
        }, { optional });

        if (!metaSaved) {
            return {
                records: normalizedRecords,
                persisted: false
            };
        }

        return {
            records: normalizedRecords,
            persisted: true
        };
    }

    function loadRemoteCachedRecords() {
        const meta = loadStorageMeta();
        if (!meta || meta.mode !== 'remote') {
            return null;
        }

        return {
            success: true,
            source: 'cache',
            // Sin scope guardado se asume el subconjunto activo: es la opcion
            // segura, porque obliga a buscar en remoto lo que falte.
            scope: meta.scope === 'all' ? 'all' : 'active',
            cachedAt: meta.updatedAt || '',
            records: TintoreriaUtils.sortRecords(loadLocalRecords())
        };
    }

    function mergeRecordsById(baseRecords, nextRecords) {
        const mergedById = new Map();

        (baseRecords || []).forEach((record) => {
            const normalized = TintoreriaUtils.defaultRecord(record);
            mergedById.set(String(normalized.id_registro || ''), normalized);
        });

        (nextRecords || []).forEach((record) => {
            const normalized = TintoreriaUtils.defaultRecord(record);
            mergedById.set(String(normalized.id_registro || ''), normalized);
        });

        return Array.from(mergedById.values());
    }

    function updateRemoteCache(records, scope = 'active') {
        const snapshot = saveRecordsSnapshot(records, 'remote', { optional: true, scope });
        remoteCacheAvailable = snapshot.persisted;
        return snapshot.records;
    }

    function updateLocalModeSnapshot(records) {
        try {
            const snapshot = saveRecordsSnapshot(records, 'local');
            return snapshot.records;
        } catch (error) {
            if (isQuotaExceededError(error)) {
                throw new Error('El dispositivo no tiene espacio suficiente para guardar datos locales.');
            }

            throw error;
        }
    }

    function matchesRecord(record, recordId, match = null) {
        if (!record || String(record.id_registro || '').trim() !== String(recordId || '').trim()) {
            return false;
        }

        const recordKey = match && match.record_key
            ? String(match.record_key).trim()
            : '';

        if (!recordKey) {
            return true;
        }

        return TintoreriaUtils.buildRecordMatchKey(record) === recordKey;
    }

    function buildLocalRecord(record) {
        return TintoreriaUtils.defaultRecord({
            ...record,
            id_registro: record.id_registro || `LOCAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            fecha_registro: record.fecha_registro || TintoreriaUtils.formatDateTimeShort(new Date()),
            plegado_estado: record.plegado_estado || 'X PROG'
        });
    }

    async function parseJsonResponse(response) {
        if (!response.ok) {
            throw new Error(`La API respondio con HTTP ${response.status}.`);
        }

        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error('La respuesta del Apps Script no es JSON valido.');
        }

        if (!data.success) {
            throw new Error(data.message || 'La API devolvio un error.');
        }

        return data;
    }

    async function postPayload(payload) {
        const formData = new URLSearchParams();
        formData.set('payload', JSON.stringify(payload));
        if (payload && payload.action) {
            formData.set('action', String(payload.action));
        }

        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: formData
        });

        return parseJsonResponse(response);
    }

    async function listRemoteRecords() {
        const url = new URL(WEB_APP_URL);
        url.searchParams.set('action', 'list');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        return parseJsonResponse(response);
    }

    // Medido sobre la hoja real: subconjunto activo ~11 s / 5 MB, historico
    // completo ~49 s / 10 MB, consulta puntual por OP ~3 s / 12 KB.
    const GVIZ_TIMEOUT_MS = 45000;
    const GVIZ_FULL_TIMEOUT_MS = 120000;
    const GVIZ_LOOKUP_TIMEOUT_MS = 20000;

    function canUseGvizReader() {
        return typeof SHEET_ID === 'string' && SHEET_ID.trim() !== '' && typeof document !== 'undefined';
    }

    function loadGvizJson(options = {}) {
        const { tq = '', timeout = GVIZ_TIMEOUT_MS } = options;

        return new Promise((resolve, reject) => {
            const callbackName = `tintoreriaGviz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            const script = document.createElement('script');
            let done = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                try {
                    delete window[callbackName];
                } catch (error) {
                    window[callbackName] = undefined;
                }
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            };

            window[callbackName] = (json) => {
                if (done) return;
                done = true;
                cleanup();
                resolve(json);
            };

            const queryParts = [
                `tqx=responseHandler:${callbackName}`,
                `sheet=${encodeURIComponent(DATA_SHEET_NAME)}`,
                'headers=1',
                `_=${Date.now()}`
            ];

            if (tq) {
                queryParts.push(`tq=${encodeURIComponent(tq)}`);
            }

            script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${queryParts.join('&')}`;
            script.onerror = () => {
                if (done) return;
                done = true;
                cleanup();
                reject(new Error('No se pudo leer la hoja compartida (gviz).'));
            };
            timeoutId = setTimeout(() => {
                if (done) return;
                done = true;
                cleanup();
                reject(new Error('Tiempo de espera agotado leyendo la hoja compartida (gviz).'));
            }, timeout);

            document.body.appendChild(script);
        });
    }

    // gviz filtra por letra de columna (A, B, ... FQ), no por encabezado, asi
    // que hay que traducir el nombre de campo a su posicion real en la hoja.
    function gvizColumnLetter(index) {
        let letter = '';
        let remaining = Number(index);

        while (remaining >= 0) {
            letter = String.fromCharCode(65 + (remaining % 26)) + letter;
            remaining = Math.floor(remaining / 26) - 1;
        }

        return letter;
    }

    function readGvizColumnLabels(json) {
        const cols = json && json.table && Array.isArray(json.table.cols) ? json.table.cols : [];
        return cols.map((col) => String((col && col.label) || '').trim());
    }

    function loadGvizColumnLabels() {
        try {
            const raw = localStorage.getItem(GVIZ_COLUMNS_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) && parsed.length ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function saveGvizColumnLabels(labels) {
        if (!Array.isArray(labels) || !labels.length) {
            return;
        }

        try {
            localStorage.setItem(GVIZ_COLUMNS_KEY, JSON.stringify(labels));
        } catch (error) {
            console.warn('No se pudo guardar el mapa de columnas de la hoja.', error);
        }
    }

    function findColumnLetter(labels, header) {
        const index = (labels || []).indexOf(header);
        return index === -1 ? '' : gvizColumnLetter(index);
    }

    async function ensureGvizColumnLabels() {
        const cached = loadGvizColumnLabels();
        if (cached && cached.includes(ACTIVE_SCOPE_COLUMN) && cached.includes(OP_COLUMN)) {
            return cached;
        }

        const json = await loadGvizJson({ tq: 'select * limit 0', timeout: GVIZ_LOOKUP_TIMEOUT_MS });
        const labels = readGvizColumnLabels(json);
        saveGvizColumnLabels(labels);
        return labels;
    }

    function buildActiveScopeQuery(labels) {
        const letter = findColumnLetter(labels, ACTIVE_SCOPE_COLUMN);
        if (!letter) {
            return '';
        }

        return `select * where (${letter} is null or ${letter} <> '${ACTIVE_SCOPE_DONE_VALUE}')`;
    }

    function gvizCellToDisplayValue(cell) {
        if (!cell) {
            return '';
        }

        if (cell.f !== undefined && cell.f !== null) {
            return String(cell.f);
        }

        if (cell.v === null || cell.v === undefined) {
            return '';
        }

        return typeof cell.v === 'string' ? cell.v : String(cell.v);
    }

    function gvizJsonToRecords(json) {
        const table = json && json.table;
        if (!table || !Array.isArray(table.cols)) {
            throw new Error('Respuesta invalida de la hoja compartida (gviz).');
        }

        let headers = table.cols.map((col) => String((col && col.label) || '').trim());
        let rows = Array.isArray(table.rows) ? table.rows : [];

        // Si gviz no detecto la fila de encabezados, llega como primera fila de datos.
        if (!headers.includes('id_registro')) {
            const firstRow = rows[0];
            const firstCells = firstRow && Array.isArray(firstRow.c) ? firstRow.c : [];
            headers = table.cols.map((_, index) => gvizCellToDisplayValue(firstCells[index]).trim());
            rows = rows.slice(1);
        }

        if (!headers.includes('id_registro')) {
            throw new Error('No se encontraron encabezados validos en la hoja compartida (gviz).');
        }

        const records = [];

        rows.forEach((row) => {
            const cells = row && Array.isArray(row.c) ? row.c : [];
            const record = {};
            let hasContent = false;

            headers.forEach((header, index) => {
                if (!header) {
                    return;
                }

                const value = gvizCellToDisplayValue(cells[index]);
                record[header] = value;

                if (!hasContent && String(value).trim() !== '') {
                    hasContent = true;
                }
            });

            if (hasContent) {
                records.push(record);
            }
        });

        return records;
    }

    async function listAllRecordsViaGviz() {
        const json = await loadGvizJson({ timeout: GVIZ_FULL_TIMEOUT_MS });
        saveGvizColumnLabels(readGvizColumnLabels(json));
        return gvizJsonToRecords(json);
    }

    async function listActiveRecordsViaGviz() {
        const labels = await ensureGvizColumnLabels();
        const tq = buildActiveScopeQuery(labels);

        if (!tq) {
            console.warn(`No se encontro la columna ${ACTIVE_SCOPE_COLUMN}; se lee la hoja completa.`);
            return { records: await listAllRecordsViaGviz(), scope: 'all' };
        }

        let json = await loadGvizJson({ tq, timeout: GVIZ_TIMEOUT_MS });
        const freshLabels = readGvizColumnLabels(json);

        // Si movieron columnas en la hoja, la letra usada en el filtro ya no
        // apunta a embalaje_estado: se reintenta con el orden real.
        if (freshLabels.length && freshLabels.join('|') !== labels.join('|')) {
            saveGvizColumnLabels(freshLabels);
            const retryTq = buildActiveScopeQuery(freshLabels);

            if (!retryTq) {
                return { records: await listAllRecordsViaGviz(), scope: 'all' };
            }

            if (retryTq !== tq) {
                json = await loadGvizJson({ tq: retryTq, timeout: GVIZ_TIMEOUT_MS });
            }
        }

        return { records: gvizJsonToRecords(json), scope: 'active' };
    }

    async function findRecordsByOpPartidaViaGviz(opTela, partida) {
        const labels = await ensureGvizColumnLabels();
        const opLetter = findColumnLetter(labels, OP_COLUMN);
        const partidaLetter = findColumnLetter(labels, PARTIDA_COLUMN);

        if (!opLetter || !partidaLetter) {
            return null;
        }

        const op = String(opTela === undefined || opTela === null ? '' : opTela).trim();
        const ptda = String(partida === undefined || partida === null ? '' : partida).trim();
        const isOpNumeric = /^\d+$/.test(op);
        const isPartidaNumeric = /^\d+$/.test(ptda);
        let where = '';

        if (isOpNumeric && isPartidaNumeric) {
            where = `${opLetter} = ${Number(op)} and ${partidaLetter} = ${Number(ptda)}`;
        } else if (isOpNumeric) {
            // Un solo numero puede ser la OP o la partida; se prueban ambas.
            where = `${opLetter} = ${Number(op)} or ${partidaLetter} = ${Number(op)}`;
        } else if (isPartidaNumeric) {
            where = `${opLetter} = ${Number(ptda)} or ${partidaLetter} = ${Number(ptda)}`;
        } else {
            return null;
        }

        const json = await loadGvizJson({
            tq: `select * where ${where}`,
            timeout: GVIZ_LOOKUP_TIMEOUT_MS
        });

        return gvizJsonToRecords(json);
    }

    window.TintoreriaAPI = {
        getCachedRecords() {
            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return null;
            }

            if (!remoteCacheAvailable) {
                return null;
            }

            return loadRemoteCachedRecords();
        },

        async listRecords(options = {}) {
            const requestedScope = options && options.scope === 'all' ? 'all' : 'active';

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return {
                    success: true,
                    source: 'local',
                    scope: 'all',
                    records: TintoreriaUtils.sortRecords(loadLocalRecords())
                };
            }

            let rawRecords = null;
            let scope = requestedScope;

            if (canUseGvizReader()) {
                try {
                    if (requestedScope === 'all') {
                        rawRecords = await listAllRecordsViaGviz();
                    } else {
                        const result = await listActiveRecordsViaGviz();
                        rawRecords = result.records;
                        scope = result.scope;
                    }
                } catch (error) {
                    console.warn('Lectura rapida (gviz) no disponible; usando Apps Script.', error);
                    rawRecords = null;
                }
            }

            if (rawRecords === null) {
                // El Apps Script no filtra: siempre devuelve la hoja completa.
                const data = await listRemoteRecords();
                rawRecords = data.records || [];
                scope = 'all';
            }

            const records = updateRemoteCache(rawRecords, scope);
            return {
                success: true,
                source: 'remote',
                scope,
                records
            };
        },

        async findRecordsByOpPartida(opTela, partida) {
            if (!TintoreriaUtils.hasConfiguredWebAppUrl() || !canUseGvizReader()) {
                return [];
            }

            const records = await findRecordsByOpPartidaViaGviz(opTela, partida);
            return (records || []).map((record) => TintoreriaUtils.defaultRecord(record));
        },

        async appendRecords(records) {
            if (!Array.isArray(records) || records.length === 0) {
                return {
                    success: true,
                    source: TintoreriaUtils.hasConfiguredWebAppUrl() ? 'remote' : 'local',
                    records: []
                };
            }

            const prepared = records.map((record) => TintoreriaUtils.defaultRecord(record));

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                const current = loadLocalRecords();
                const existingKeys = new Set(
                    current
                        .map((record) => TintoreriaUtils.buildMaestroIdentityKey(record.tipo_tela, record.op_tela, record.partida, record.cod_art))
                        .filter(Boolean)
                );
                const appended = [];

                prepared.forEach((record) => {
                    const duplicateKey = TintoreriaUtils.buildMaestroIdentityKey(record.tipo_tela, record.op_tela, record.partida, record.cod_art);
                    if (duplicateKey && existingKeys.has(duplicateKey)) {
                        return;
                    }

                    const builtRecord = buildLocalRecord(record);
                    appended.push(builtRecord);

                    if (duplicateKey) {
                        existingKeys.add(duplicateKey);
                    }
                });

                const merged = TintoreriaUtils.sortRecords(current.concat(appended));
                updateLocalModeSnapshot(merged);
                return {
                    success: true,
                    source: 'local',
                    records: appended
                };
            }

            const data = await postPayload({
                action: 'appendRecords',
                records: prepared
            });
            const appended = (data.records || []).map((record) => TintoreriaUtils.defaultRecord(record));
            const cached = loadRemoteCachedRecords();
            if (cached) {
                updateRemoteCache(mergeRecordsById(cached.records, appended), cached.scope);
            }

            return {
                success: true,
                source: 'remote',
                records: appended
            };
        },

        async updateFechaEntregaTelaAcabada(updates) {
            if (!Array.isArray(updates) || updates.length === 0) {
                return { updatedCount: 0, unmatchedCount: 0, records: [] };
            }

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                const current = loadLocalRecords();
                let updatedCount = 0;
                let unmatchedCount = 0;

                const keyMap = new Map(
                    updates.map((u) => [
                        TintoreriaUtils.buildMaestroDuplicateKey(u.op_tela, u.partida, u.cod_art, u.color),
                        u.fecha_entrega_tela_acabada
                    ])
                );

                const updated = current.map((record) => {
                    const matchKey = TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color);
                    if (!matchKey || !keyMap.has(matchKey)) {
                        return record;
                    }
                    updatedCount += 1;
                    return TintoreriaUtils.defaultRecord({ ...record, fecha_entrega_tela_acabada: keyMap.get(matchKey) });
                });

                updates.forEach((u) => {
                    const matchKey = TintoreriaUtils.buildMaestroDuplicateKey(u.op_tela, u.partida, u.cod_art, u.color);
                    if (!matchKey || !current.some((record) => TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color) === matchKey)) {
                        unmatchedCount += 1;
                    }
                });

                updateLocalModeSnapshot(updated);
                return { updatedCount, unmatchedCount, records: updated };
            }

            const data = await postPayload({
                action: 'updateFechaEntregaTelaAcabada',
                updates
            });

            const updatedRecords = (data.records || []).map((record) => TintoreriaUtils.defaultRecord(record));
            const cached = loadRemoteCachedRecords();
            if (updatedRecords.length && cached) {
                updateRemoteCache(mergeRecordsById(cached.records, updatedRecords), cached.scope);
            }

            return {
                updatedCount: data.updatedCount || 0,
                unmatchedCount: data.unmatchedCount || 0,
                records: updatedRecords
            };
        },

        async updateRecord(recordId, changes, options = {}) {
            if (!recordId) {
                throw new Error('El registro no tiene id_registro.');
            }

            const match = options && options.match ? options.match : null;

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                const current = loadLocalRecords();
                const index = current.findIndex((record) => matchesRecord(record, recordId, match));

                if (index === -1) {
                    throw new Error('No se encontro el registro a actualizar.');
                }

                current[index] = TintoreriaUtils.defaultRecord({
                    ...current[index],
                    ...changes
                });
                updateLocalModeSnapshot(current);

                return {
                    success: true,
                    source: 'local',
                    record: current[index]
                };
            }

            const data = await postPayload({
                action: 'updateRecord',
                id_registro: recordId,
                changes,
                match
            });
            const updatedRecord = data.record ? TintoreriaUtils.defaultRecord(data.record) : null;
            const cached = loadRemoteCachedRecords();

            if (updatedRecord && cached) {
                const merged = mergeRecordsById(cached.records, [updatedRecord]);
                updateRemoteCache(merged, cached.scope);
            }

            return {
                success: true,
                source: 'remote',
                record: updatedRecord
            };
        }
    };
})();
