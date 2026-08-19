(() => {
    // ── Subtabs ─────────────────────────────────────────────────────────
    const FILTER_MUESTRA = 'MUESTRA';
    const FILTER_RECETA = 'RECETA';
    const FILTER_OK = 'OK';
    const SUBTAB_ORDER = [FILTER_MUESTRA, FILTER_RECETA, FILTER_OK];
    let currentFilter = FILTER_MUESTRA;

    // Buscadores del toolbar (mismo comportamiento que la vista Calidad).
    //   op  -> OP-PTDA (coincidencia exacta para el salto de subtab)
    //   art -> cod_art (coincidencia parcial; ej. "29878" encuentra "06-00029878")
    const LOOKUPS = {
        op: {
            inputId: 'lab-tinto-toolbar-search',
            getValue: (record) => normalizeLookup(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)),
            exact: true,
            notFound: (query) => `No se encontro la partida ${query}.`
        },
        art: {
            inputId: 'lab-tinto-toolbar-search-art',
            getValue: (record) => normalizeLookup(record.cod_art),
            exact: false,
            notFound: (query) => `No se encontro el cod_art ${query}.`
        }
    };
    const lookupState = {
        op: { query: '', committed: '' },
        art: { query: '', committed: '' }
    };

    const TRUE_VALUES = new Set(['TRUE', 'SI', 'SÍ', 'X', '1', 'VERDADERO', 'YES', 'OK']);

    function isMuestraChecked(record) {
        return TRUE_VALUES.has(String(record.status_muestra_tela_lab_tinto || '').trim().toUpperCase());
    }

    function hasValue(value) {
        return String(value === undefined || value === null ? '' : value).trim() !== '';
    }

    // Flujo por fechas:
    //   Por pasar muestra -> f_solicitud con dato y f_muestra vacio
    //   Por receta        -> f_muestra con dato y fecha_receta vacio
    //   Receta OK         -> fecha_receta con dato
    function getSubtabFor(record) {
        if (hasValue(record.fecha_receta_lab_tinto)) {
            return FILTER_OK;
        }
        if (hasValue(record.f_muestra_tela_lab_tinto)) {
            return FILTER_RECETA;
        }
        return FILTER_MUESTRA;
    }

    // El subtab "Receta OK" no tiene ventana de fechas, asi que se apoya en el
    // scope activo para no acumular historico. Al entrar a Calidad se carga la
    // hoja completa y ese scope se pierde, asi que la vista excluye aqui las
    // partidas ya embaladas y mantiene el mismo alcance de siempre.
    function getEligibleRecords(records) {
        return records.filter((record) => (
            String(record.f_solicitud_receta_lab_tinto || '').trim() !== '' &&
            !['OK', 'TELA 2DA'].includes(String(record.embalaje_estado || '').trim().toUpperCase())
        ));
    }

    function solicitudTime(record) {
        const parsed = TintoreriaUtils.parseDateish(record.f_solicitud_receta_lab_tinto);
        return parsed ? parsed.getTime() : 0;
    }

    function getFilteredRecords(records) {
        const filtered = getEligibleRecords(records)
            .filter((record) => getSubtabFor(record) === currentFilter);

        // Agrupa por op-ptda para que las partidas iguales salgan juntas,
        // ordenando los grupos por la solicitud mas reciente (mas nuevo primero).
        const groups = new Map();
        filtered.forEach((record) => {
            const key = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(record);
        });

        const groupTime = (rows) => rows.reduce((max, record) => Math.max(max, solicitudTime(record)), 0);

        return [...groups.values()]
            .sort((leftRows, rightRows) => groupTime(rightRows) - groupTime(leftRows))
            .flatMap((rows) => rows.sort((left, right) => solicitudTime(right) - solicitudTime(left)));
    }

    // ── Buscadores del toolbar (OP-PTDA y cod_art) ──────────────────────
    function normalizeLookup(value) {
        return TintoreriaUtils.normalizeOpPartidaSearchValue(value);
    }

    function recordMatchesQuery(record, normalizedQuery, lookup, exact) {
        const value = lookup.getValue(record);
        return exact ? value === normalizedQuery : value.includes(normalizedQuery);
    }

    function activeLookupKeys() {
        return Object.keys(lookupState).filter((key) => normalizeLookup(lookupState[key].query));
    }

    function hasActiveLookup() {
        return activeLookupKeys().length > 0;
    }

    function getLookupLabel() {
        return Object.keys(lookupState)
            .map((key) => lookupState[key].query.trim())
            .filter(Boolean)
            .join(' / ');
    }

    // Filtra (coincidencia parcial) las partidas del subtab activo por ambos buscadores.
    function filterRecordsForLookup(records) {
        const keys = activeLookupKeys();
        if (!keys.length) {
            return records;
        }
        return records.filter((record) => keys.every((key) => (
            recordMatchesQuery(record, normalizeLookup(lookupState[key].query), LOOKUPS[key], false)
        )));
    }

    // Subtabs que contienen una coincidencia del buscador indicado.
    function getLookupSubtabs(records, query, lookup) {
        const normalizedQuery = normalizeLookup(query);
        if (!normalizedQuery) {
            return [];
        }
        const eligible = getEligibleRecords(records);
        return SUBTAB_ORDER.filter((filter) => eligible.some((record) => (
            getSubtabFor(record) === filter && recordMatchesQuery(record, normalizedQuery, lookup, lookup.exact)
        )));
    }

    function setActiveSubtab(filter) {
        currentFilter = SUBTAB_ORDER.includes(filter) ? filter : FILTER_MUESTRA;
        document.querySelectorAll('[data-lab-tinto-filter]').forEach((node) => {
            node.classList.toggle('active', node.dataset.labTintoFilter === currentFilter);
        });
        TintoreriaApp.refreshVisibleState();
    }

    function clearLookup(key, { rerender = true } = {}) {
        lookupState[key].query = '';
        lookupState[key].committed = '';
        if (rerender) {
            TintoreriaApp.refreshVisibleState();
        }
    }

    // Al presionar Enter salta al subtab que contiene la coincidencia (ciclando si hay varios).
    function applyLookup(key, query, { cycleOnRepeat = false } = {}) {
        const lookup = LOOKUPS[key];
        const entry = lookupState[key];
        const normalizedQuery = normalizeLookup(query);
        if (!normalizedQuery) {
            clearLookup(key);
            return true;
        }

        const records = TintoreriaApp.getRecords();
        const subtabs = getLookupSubtabs(records, normalizedQuery, lookup);
        if (!subtabs.length) {
            entry.committed = '';
            TintoreriaApp.showToast(lookup.notFound(query), 'error', 'Sin resultados');
            return false;
        }

        entry.query = query.trim();

        let target = subtabs[0];
        if (cycleOnRepeat && entry.committed === normalizedQuery && subtabs.length > 1) {
            const currentIndex = subtabs.indexOf(currentFilter);
            target = subtabs[(currentIndex + 1) % subtabs.length];
        }
        entry.committed = normalizedQuery;

        setActiveSubtab(target);
        return true;
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

    // ── Sanitizadores de campos ────────────────────────────────────────
    function sanitizeLettersLive(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü ]/g, '')
            .toUpperCase();
    }

    function sanitizeLetters(value) {
        return sanitizeLettersLive(value).replace(/\s+/g, ' ').trim();
    }

    function sanitizeNumEntradas(value) {
        return String(value === undefined || value === null ? '' : value).replace(/\D/g, '').slice(0, 1);
    }

    function sanitizeNumReceta(value) {
        return String(value === undefined || value === null ? '' : value).replace(/\D/g, '').slice(0, 6);
    }

    function isValidNumReceta(value) {
        return !value || /^\d{4,6}$/.test(value);
    }

    // ── Helpers de celda ────────────────────────────────────────────────
    function textCell(value) {
        return `<td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(value)}">${TintoreriaUtils.escapeHtml(value || '')}</span></td>`;
    }

    function codeCell(value) {
        return `<td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(value || '')}</span></td>`;
    }

    function colorCell(record) {
        const label = TintoreriaUtils.formatColorLabel(record.color);
        return `<td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(label)}">${TintoreriaUtils.escapeHtml(label)}</span></td>`;
    }

    // Fecha corta en pill; el tooltip (title) muestra la fecha y hora registrada.
    function datePillCell(value) {
        const short = TintoreriaUtils.formatDateDayMonth(value);
        const full = TintoreriaUtils.formatProcessDateTimeLabel(value);
        const pill = short
            ? `<span class="process-pill process-pill-finished" title="${TintoreriaUtils.escapeHtml(full || '')}">${TintoreriaUtils.escapeHtml(short)}</span>`
            : `<span class="process-pill process-pill-muted" title="Sin fecha">S/Fecha</span>`;
        return `<td>${pill}</td>`;
    }

    // Observaciones de solo lectura: pill rojo cuando hay dato, celda vacia si no.
    // El texto largo hace salto de linea dentro del ancho de la columna.
    function observacionesPillCell(value) {
        const text = String(value === undefined || value === null ? '' : value).trim();
        if (!text) {
            return `<td></td>`;
        }
        return `<td><span class="lab-tinto-obs-pill" title="${TintoreriaUtils.escapeHtml(text)}">${TintoreriaUtils.escapeHtml(text)}</span></td>`;
    }

    function textInputCell(record, id, field) {
        return `<td><input class="table-input" type="text" value="${TintoreriaUtils.escapeHtml(record[field] || '')}" data-record-id="${id}" data-field="${field}"></td>`;
    }

    function selectCell(record, id, field, options) {
        return `<td><select class="table-select" data-record-id="${id}" data-field="${field}">${optionMarkup(record[field] || '', options)}</select></td>`;
    }

    // reserva: quita los primeros 4 digitos y convierte a entero (2025000092 -> 92)
    function formatReserva(value) {
        const raw = String(value === undefined || value === null ? '' : value).trim();
        if (!raw) {
            return '';
        }
        const rest = raw.slice(4);
        if (!rest) {
            return '';
        }
        const parsed = Number(rest);
        return Number.isFinite(parsed) ? String(parsed) : raw;
    }

    // ── Definicion de columnas: etiqueta normalizada, ancho (px) y celda ─
    const COLUMN_DEFS = {
        f_solicitud_receta_lab_tinto: { label: 'f_sol', width: 58, cell: (r) => datePillCell(r.f_solicitud_receta_lab_tinto) },
        f_muestra_tela_lab_tinto: { label: 'f_ent_tela', width: 68, cell: (r) => datePillCell(r.f_muestra_tela_lab_tinto) },
        cliente: { label: 'cliente', width: 58, cell: (r) => textCell(r.cliente) },
        reserva: { label: 'rsv', width: 42, cell: (r) => textCell(formatReserva(r.reserva)) },
        cod_color: { label: 'cod_color', width: 88, cell: (r) => codeCell(r.cod_color) },
        color: { label: 'color', width: 92, cell: (r) => colorCell(r) },
        cod_art: { label: 'cod_art', width: 88, cell: (r) => codeCell(r.cod_art) },
        articulo: { label: 'articulo', width: 150, cell: (r) => textCell(r.articulo) },
        tipo_tela: { label: 'tipo', width: 50, cell: (r) => codeCell(r.tipo_tela) },
        op_partida: { label: 'op-ptda', width: 92, cell: (r) => codeCell(TintoreriaUtils.formatOpPartida(r.op_tela, r.partida)) },
        peso_kg_crudo: { label: 'kg', width: 56, cell: (r) => codeCell(r.peso_kg_crudo) },
        lote: { label: 'lote', width: 80, cell: (r) => codeCell(r.lote) },
        tenido_rb: { label: 'rb', width: 62, cell: (r, id) => textInputCell(r, id, 'tenido_rb') },
        tenido_maquina: { label: 'maq', width: 66, cell: (r, id) => selectCell(r, id, 'tenido_maquina', TENIDO_MAQUINA_OPTIONS) },
        observaciones_muestra_view: { label: 'observaciones', width: 104, cell: (r) => observacionesPillCell(r.observaciones_receta_lab_tinto) },
        status_muestra_tela_lab_tinto: {
            label: 'status',
            width: 64,
            cell: (r, id) => `<td class="lab-tinto-check-cell"><input class="table-input lab-tinto-check" type="checkbox" ${isMuestraChecked(r) ? 'checked' : ''} data-record-id="${id}" data-field="status_muestra_tela_lab_tinto" aria-label="Muestra de tela"></td>`
        },
        matizador_lab_tinto: { label: 'matizador', width: 96, cell: (r, id) => textInputCell(r, id, 'matizador_lab_tinto') },
        auxiliar_lab_tinto: { label: 'auxiliar', width: 96, cell: (r, id) => textInputCell(r, id, 'auxiliar_lab_tinto') },
        num_entradas_lab_tinto: {
            label: '#entradas',
            width: 70,
            cell: (r, id) => `<td><input class="table-input mono" type="number" min="0" max="9" step="1" value="${TintoreriaUtils.escapeHtml(r.num_entradas_lab_tinto || '')}" data-record-id="${id}" data-field="num_entradas_lab_tinto"></td>`
        },
        num_receta_lab_tinto: {
            label: '#receta',
            width: 78,
            cell: (r, id) => `<td><input class="table-input mono" type="text" inputmode="numeric" value="${TintoreriaUtils.escapeHtml(r.num_receta_lab_tinto || '')}" data-record-id="${id}" data-field="num_receta_lab_tinto"></td>`
        },
        tipo_receta_lab_tinto: { label: 'tipo receta', width: 100, cell: (r, id) => selectCell(r, id, 'tipo_receta_lab_tinto', TIPO_RECETA_LAB_TINTO_OPTIONS) },
        observaciones_receta_lab_tinto: { label: 'observaciones', width: 160, cell: (r, id) => textInputCell(r, id, 'observaciones_receta_lab_tinto') },
        status_receta_lab_tinto: { label: 'status', width: 96, cell: (r, id) => selectCell(r, id, 'status_receta_lab_tinto', STATUS_RECETA_LAB_TINTO_OPTIONS) },
        fecha_receta_lab_tinto: { label: 'f_receta', width: 64, cell: (r) => datePillCell(r.fecha_receta_lab_tinto) }
    };

    const FILTER_COLUMNS = {
        [FILTER_MUESTRA]: [
            'f_solicitud_receta_lab_tinto', 'cliente', 'reserva', 'tipo_tela', 'op_partida', 'cod_art', 'articulo',
            'cod_color', 'color', 'peso_kg_crudo', 'lote', 'tenido_rb', 'tenido_maquina',
            'observaciones_muestra_view', 'status_muestra_tela_lab_tinto'
        ],
        [FILTER_RECETA]: [
            'f_solicitud_receta_lab_tinto', 'f_muestra_tela_lab_tinto', 'cliente', 'reserva', 'tipo_tela', 'op_partida',
            'cod_art', 'articulo', 'cod_color', 'color', 'peso_kg_crudo', 'lote', 'tenido_rb',
            'tenido_maquina', 'matizador_lab_tinto', 'auxiliar_lab_tinto', 'num_entradas_lab_tinto',
            'num_receta_lab_tinto', 'tipo_receta_lab_tinto', 'observaciones_receta_lab_tinto', 'status_receta_lab_tinto'
        ],
        [FILTER_OK]: [
            'f_solicitud_receta_lab_tinto', 'f_muestra_tela_lab_tinto', 'cliente', 'reserva', 'tipo_tela', 'op_partida',
            'cod_art', 'articulo', 'cod_color', 'color', 'peso_kg_crudo', 'lote', 'tenido_rb',
            'tenido_maquina', 'matizador_lab_tinto', 'auxiliar_lab_tinto', 'num_entradas_lab_tinto',
            'num_receta_lab_tinto', 'tipo_receta_lab_tinto', 'observaciones_receta_lab_tinto', 'status_receta_lab_tinto',
            'fecha_receta_lab_tinto'
        ]
    };

    function getActiveColumns() {
        return FILTER_COLUMNS[currentFilter] || FILTER_COLUMNS[FILTER_MUESTRA];
    }

    function setSubtabCount(countId, summaryId, group) {
        const countEl = document.getElementById(countId);
        const summaryEl = document.getElementById(summaryId);
        if (countEl) {
            countEl.textContent = `${new Set(group.map((r) => TintoreriaUtils.formatOpPartida(r.op_tela, r.partida))).size} ptds`;
        }
        if (summaryEl) {
            summaryEl.textContent = TintoreriaUtils.formatSubtabSummary(group);
        }
    }

    function renderSubtabCounts(records) {
        const groups = { [FILTER_MUESTRA]: [], [FILTER_RECETA]: [], [FILTER_OK]: [] };
        getEligibleRecords(records).forEach((record) => {
            groups[getSubtabFor(record)].push(record);
        });

        setSubtabCount('count-lab-tinto-muestra', 'summary-lab-tinto-muestra', groups[FILTER_MUESTRA]);
        setSubtabCount('count-lab-tinto-receta', 'summary-lab-tinto-receta', groups[FILTER_RECETA]);
        setSubtabCount('count-lab-tinto-ok', 'summary-lab-tinto-ok', groups[FILTER_OK]);
    }

    function renderHead() {
        const columns = getActiveColumns();
        const colgroup = document.getElementById('colgroup-lab-tinto');
        if (colgroup) {
            colgroup.innerHTML = columns.map((key) => `<col style="width:${COLUMN_DEFS[key].width}px">`).join('');
        }
        const thead = document.getElementById('thead-lab-tinto');
        if (thead) {
            thead.innerHTML = `<tr>${columns.map((key) => `<th>${TintoreriaUtils.escapeHtml(COLUMN_DEFS[key].label)}</th>`).join('')}</tr>`;
        }
    }

    function renderRow(record) {
        const id = TintoreriaUtils.escapeHtml(record.id_registro);
        const cells = getActiveColumns().map((key) => COLUMN_DEFS[key].cell(record, id)).join('');
        return `<tr>${cells}</tr>`;
    }

    // "Solicita Receta" registra solicitudes nuevas; solo lo permiten LAB_TINTO_SOLICITA_USERS.
    function canSolicitaLabTinto() {
        if (!window.TintoreriaAuth || typeof TintoreriaAuth.canSolicitaReceta !== 'function') {
            return true;
        }

        return TintoreriaAuth.canSolicitaReceta();
    }

    function updateSolicitaAccess() {
        const button = document.getElementById('btn-lab-tinto-solicita');
        if (button instanceof HTMLElement) {
            button.classList.toggle('hidden', !canSolicitaLabTinto());
        }
    }

    function renderTable(records, state) {
        renderSubtabCounts(records);
        updateSolicitaAccess();
        renderHead();

        const tbody = document.getElementById('tbody-lab-tinto');
        if (!tbody) {
            return;
        }

        const searched = TintoreriaUtils.filterRecordsForSearch(getFilteredRecords(records), state, 'lab-tinto');
        const filtered = filterRecordsForLookup(searched);

        if (!filtered.length) {
            const emptyLabel = hasActiveLookup()
                ? `No se encontraron filas para ${TintoreriaUtils.escapeHtml(getLookupLabel())} en este subtab.`
                : 'No hay partidas en este subtab.';
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="${getActiveColumns().length}">${emptyLabel}</td>
                </tr>
            `;
            TintoreriaApp.refreshViewDecorations('lab-tinto');
            return;
        }

        tbody.innerHTML = filtered.map(renderRow).join('');
        TintoreriaApp.refreshViewDecorations('lab-tinto');
    }

    // ── Edicion en linea ───────────────────────────────────────────────
    function handleLiveInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.dataset.field) {
            return;
        }

        const field = target.dataset.field;
        if (field === 'matizador_lab_tinto' || field === 'auxiliar_lab_tinto') {
            target.value = sanitizeLettersLive(target.value);
        } else if (field === 'num_entradas_lab_tinto') {
            target.value = sanitizeNumEntradas(target.value);
        } else if (field === 'num_receta_lab_tinto') {
            target.value = sanitizeNumReceta(target.value);
        }
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
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

        let changes = null;

        if (field === 'status_muestra_tela_lab_tinto') {
            const checked = target instanceof HTMLInputElement && target.checked;
            changes = {
                status_muestra_tela_lab_tinto: checked ? 'TRUE' : '',
                f_muestra_tela_lab_tinto: checked ? TintoreriaUtils.formatProcessDateTime(new Date()) : ''
            };
        } else if (field === 'status_receta_lab_tinto') {
            const nextValue = target.value;
            changes = {
                status_receta_lab_tinto: nextValue,
                fecha_receta_lab_tinto: nextValue === 'OK' ? TintoreriaUtils.formatProcessDateTime(new Date()) : ''
            };
        } else if (field === 'matizador_lab_tinto' || field === 'auxiliar_lab_tinto') {
            const nextValue = sanitizeLetters(target.value);
            target.value = nextValue;
            changes = { [field]: nextValue };
        } else if (field === 'num_entradas_lab_tinto') {
            const nextValue = sanitizeNumEntradas(target.value);
            target.value = nextValue;
            changes = { [field]: nextValue };
        } else if (field === 'num_receta_lab_tinto') {
            const nextValue = sanitizeNumReceta(target.value);
            if (!isValidNumReceta(nextValue)) {
                target.value = currentRecord[field] || '';
                TintoreriaApp.showToast('num_receta debe tener entre 4 y 6 digitos.', 'error', 'Dato invalido');
                return;
            }
            target.value = nextValue;
            changes = { [field]: nextValue };
        } else if (field === 'tenido_rb' || field === 'observaciones_receta_lab_tinto') {
            const nextValue = String(target.value || '').trim();
            target.value = nextValue;
            changes = { [field]: nextValue };
        } else {
            changes = { [field]: target.value };
        }

        const unchanged = Object.keys(changes).every((key) => String(currentRecord[key] || '') === String(changes[key] || ''));
        if (unchanged) {
            return;
        }

        try {
            await TintoreriaApp.saveRecordChanges(recordId, changes, {
                silent: true,
                permissionViewId: 'lab-tinto',
                permissionFilter: currentFilter
            });
        } catch (error) {
            renderTable(TintoreriaApp.getRecords(), TintoreriaApp.state);
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    // ── Modal "Solicita Receta" ────────────────────────────────────────
    let previewRows = [];
    // Lineas pegadas ya resueltas contra el maestro (fase 1 de buildPreview).
    let previewEntries = [];
    // tipo_tela elegido por OP-PTDA mientras el modal sigue abierto: "op|ptda" -> Set(tipo_tela)
    const telaChoices = new Map();
    let telaResolver = null;

    function getSolicitaElements() {
        return {
            modal: document.getElementById('lab-tinto-solicita-modal'),
            openBtn: document.getElementById('btn-lab-tinto-solicita'),
            closeBtn: document.getElementById('lab-tinto-solicita-close'),
            paste: document.getElementById('lab-tinto-paste'),
            buildBtn: document.getElementById('lab-tinto-solicita-build'),
            previewTbody: document.getElementById('lab-tinto-preview-tbody'),
            clearBtn: document.getElementById('lab-tinto-solicita-clear'),
            saveBtn: document.getElementById('lab-tinto-solicita-save')
        };
    }

    function normalizeKeyPart(value) {
        const compact = String(value === undefined || value === null ? '' : value).trim().toUpperCase().replace(/\s+/g, '');
        if (!compact) {
            return '';
        }
        if (/^\d+$/.test(compact)) {
            return compact.replace(/^0+/, '') || '0';
        }
        return compact;
    }

    function buildKey(opTela, partida) {
        return `${normalizeKeyPart(opTela)}|${normalizeKeyPart(partida)}`;
    }

    function parsePastedLine(line) {
        let cols = line.split('\t');
        if (cols.length < 2) {
            cols = line.trim().split(/\s{2,}|\t|;|\|/);
        }
        if (cols.length < 2) {
            cols = line.trim().split(/\s+/);
        }
        return {
            opTela: String(cols[0] || '').trim(),
            partida: String(cols[1] || '').trim(),
            lote: String(cols[2] || '').trim(),
            observaciones: cols.slice(3).join(' ').trim()
        };
    }

    function normalizeTipoTela(value) {
        return String(value === undefined || value === null ? '' : value).trim().toUpperCase();
    }

    // Fase 1: cada linea pegada se resuelve contra el maestro por op|partida y sus
    // coincidencias se agrupan por tipo_tela. Un solo tipo distinto = sin ambiguedad.
    function buildPreviewEntries(lines, records) {
        return lines.map((line) => {
            const { opTela, partida, lote, observaciones } = parsePastedLine(line);
            if (!opTela && !partida) {
                return null;
            }

            const key = buildKey(opTela, partida);
            const matches = records.filter((record) => buildKey(record.op_tela, record.partida) === key);

            const tipos = new Map();
            matches.forEach((record) => {
                const tipo = normalizeTipoTela(record.tipo_tela);
                if (!tipos.has(tipo)) {
                    tipos.set(tipo, []);
                }
                tipos.get(tipo).push(record);
            });

            return {
                opTela,
                partida,
                lote,
                observaciones,
                key,
                matches,
                tipos,
                label: TintoreriaUtils.formatOpPartida(opTela, partida)
            };
        }).filter(Boolean);
    }

    function isAmbiguousEntry(entry) {
        return entry.tipos.size > 1;
    }

    // Eleccion guardada, descartando tipos que ya no existan tras reeditar el pegado.
    function getStoredTipos(entry) {
        const stored = telaChoices.get(entry.key);
        if (!stored) {
            return null;
        }
        const valid = [...stored].filter((tipo) => entry.tipos.has(tipo));
        return valid.length ? new Set(valid) : null;
    }

    function needsTelaChoice(entry) {
        return isAmbiguousEntry(entry) && !getStoredTipos(entry);
    }

    function getSelectedMatches(entry) {
        if (!isAmbiguousEntry(entry)) {
            return entry.matches;
        }
        const stored = getStoredTipos(entry);
        if (!stored) {
            return [];
        }
        return entry.matches.filter((record) => stored.has(normalizeTipoTela(record.tipo_tela)));
    }

    async function buildPreview() {
        const els = getSolicitaElements();
        if (!els.previewTbody || !els.paste) {
            return;
        }

        const records = TintoreriaApp.getRecords();
        const lines = String(els.paste.value || '')
            .split(/\r?\n/)
            .map((line) => line.replace(/\s+$/, ''))
            .filter((line) => line.trim());

        previewEntries = buildPreviewEntries(lines, records);

        // Pregunta una sola vez por cada OP-PTDA con mas de un tipo_tela.
        const pendingKeys = new Set();
        const pending = previewEntries.filter((entry) => {
            if (!needsTelaChoice(entry) || pendingKeys.has(entry.key)) {
                return false;
            }
            pendingKeys.add(entry.key);
            return true;
        });

        if (pending.length && !(await openTelaModal(pending))) {
            return;
        }

        renderPreview();
    }

    // Fase 2: pinta el cuadro de la derecha con las coincidencias ya filtradas por tipo_tela.
    function renderPreview() {
        const els = getSolicitaElements();
        if (!els.previewTbody) {
            return;
        }

        previewRows = [];
        const rowsHtml = [];
        const cell = (value) => `<td><span class="cell-text">${TintoreriaUtils.escapeHtml(value || '')}</span></td>`;

        previewEntries.forEach((entry) => {
            if (!entry.matches.length) {
                rowsHtml.push(`
                    <tr class="lab-tinto-preview-missing">
                        <td colspan="7"><span class="cell-text">No encontrado en maestro</span></td>
                        <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(entry.opTela)}</span></td>
                        <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(entry.partida)}</span></td>
                        <td>—</td>
                        <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(entry.lote)}</span></td>
                        ${cell(entry.observaciones)}
                    </tr>
                `);
                return;
            }

            const ambiguous = isAmbiguousEntry(entry);
            getSelectedMatches(entry).forEach((record) => {
                previewRows.push({ recordId: record.id_registro, lote: entry.lote, observaciones: entry.observaciones });
                rowsHtml.push(`
                    <tr>
                        ${cell(record.cliente)}
                        ${cell(record.reserva)}
                        ${cell(record.cod_color)}
                        ${cell(TintoreriaUtils.formatColorLabel(record.color))}
                        ${cell(record.cod_art)}
                        ${cell(record.articulo)}
                        ${tipoTelaCell(record, entry, ambiguous)}
                        ${cell(record.op_tela)}
                        ${cell(record.partida)}
                        ${cell(record.peso_kg_crudo)}
                        <td><strong class="cell-text code-text">${TintoreriaUtils.escapeHtml(entry.lote)}</strong></td>
                        ${cell(entry.observaciones)}
                    </tr>
                `);
            });
        });

        if (!rowsHtml.length) {
            els.previewTbody.innerHTML = `<tr class="empty-state"><td colspan="12">No se encontraron partidas para la lista pegada.</td></tr>`;
            return;
        }

        els.previewTbody.innerHTML = rowsHtml.join('');
    }

    // En las partidas que hubo que desambiguar el tipo queda como boton para reabrir el selector.
    function tipoTelaCell(record, entry, ambiguous) {
        const tipo = TintoreriaUtils.escapeHtml(record.tipo_tela || '');
        if (!ambiguous) {
            return `<td><span class="cell-text">${tipo}</span></td>`;
        }
        return `
            <td>
                <button class="lab-tinto-tela-change" type="button" data-key="${TintoreriaUtils.escapeHtml(entry.key)}" title="Cambiar el tipo de tela elegido">
                    <span>${tipo}</span><i class="ph ph-pencil-simple"></i>
                </button>
            </td>
        `;
    }

    // ── Modal secundario: elige tipo_tela cuando la OP-PTDA tiene varios ─
    function getTelaElements() {
        return {
            modal: document.getElementById('lab-tinto-tela-modal'),
            groups: document.getElementById('lab-tinto-tela-groups'),
            closeBtn: document.getElementById('lab-tinto-tela-close'),
            cancelBtn: document.getElementById('lab-tinto-tela-cancel'),
            okBtn: document.getElementById('lab-tinto-tela-ok')
        };
    }

    function isTelaModalOpen() {
        const modal = document.getElementById('lab-tinto-tela-modal');
        return Boolean(modal) && !modal.classList.contains('hidden');
    }

    function uniqueValues(rows, field) {
        const values = rows
            .map((row) => String(row[field] === undefined || row[field] === null ? '' : row[field]).trim())
            .filter(Boolean);
        return [...new Set(values)];
    }

    // Referencia para reconocer la tela: cuantas filas trae y de que articulo/color son.
    function telaOptionMeta(rows) {
        const colors = [...new Set(rows.map((row) => TintoreriaUtils.formatColorLabel(row.color)).filter(Boolean))];
        return [
            `${rows.length} fila${rows.length === 1 ? '' : 's'}`,
            uniqueValues(rows, 'cod_art').join(' / '),
            uniqueValues(rows, 'articulo').join(' / '),
            colors.join(' / ')
        ].filter(Boolean).join(' · ');
    }

    function renderTelaGroup(entry, preselected) {
        const options = [...entry.tipos.entries()]
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([tipo, rows]) => `
                <label class="lab-tinto-tela-option">
                    <input class="lab-tinto-tela-input" type="checkbox" data-tipo="${TintoreriaUtils.escapeHtml(tipo)}" ${preselected && preselected.has(tipo) ? 'checked' : ''}>
                    <span class="lab-tinto-tela-tipo">${TintoreriaUtils.escapeHtml(tipo || 'Sin tipo')}</span>
                    <span class="lab-tinto-tela-meta">${TintoreriaUtils.escapeHtml(telaOptionMeta(rows))}</span>
                </label>
            `).join('');

        return `
            <div class="lab-tinto-tela-group" data-key="${TintoreriaUtils.escapeHtml(entry.key)}" data-label="${TintoreriaUtils.escapeHtml(entry.label)}">
                <div class="lab-tinto-tela-group-head">OP-PTDA ${TintoreriaUtils.escapeHtml(entry.label)}</div>
                ${options}
            </div>
        `;
    }

    // Resuelve true si el usuario confirmo; false si cancelo o cerro.
    function openTelaModal(entries, { preselect = false } = {}) {
        const els = getTelaElements();
        if (!els.modal || !els.groups) {
            return Promise.resolve(false);
        }

        if (telaResolver) {
            const stale = telaResolver;
            telaResolver = null;
            stale(false);
        }

        els.groups.innerHTML = entries
            .map((entry) => renderTelaGroup(entry, preselect ? getStoredTipos(entry) : null))
            .join('');
        els.modal.classList.remove('hidden');
        window.requestAnimationFrame(() => {
            const firstInput = els.groups.querySelector('.lab-tinto-tela-input');
            if (firstInput) {
                firstInput.focus();
            }
        });

        return new Promise((resolve) => {
            telaResolver = resolve;
        });
    }

    function closeTelaModal(result) {
        const els = getTelaElements();
        if (els.modal) {
            els.modal.classList.add('hidden');
        }
        if (els.groups) {
            els.groups.innerHTML = '';
        }

        const resolve = telaResolver;
        telaResolver = null;
        if (resolve) {
            resolve(result);
        }
    }

    // Exige al menos un tipo marcado por partida antes de cerrar.
    function confirmTelaModal() {
        const els = getTelaElements();
        if (!els.groups) {
            return;
        }

        const groups = [...els.groups.querySelectorAll('.lab-tinto-tela-group')];
        const selections = new Map();

        for (const group of groups) {
            const checked = [...group.querySelectorAll('.lab-tinto-tela-input:checked')]
                .map((input) => input.dataset.tipo || '');
            if (!checked.length) {
                TintoreriaApp.showToast(`Marca al menos un tipo de tela para ${group.dataset.label}.`, 'error', 'Falta seleccionar');
                return;
            }
            selections.set(group.dataset.key, new Set(checked));
        }

        selections.forEach((tipos, key) => telaChoices.set(key, tipos));
        closeTelaModal(true);
    }

    async function handlePreviewClick(event) {
        const button = event.target instanceof Element ? event.target.closest('.lab-tinto-tela-change') : null;
        if (!button) {
            return;
        }

        const entry = previewEntries.find((item) => item.key === button.dataset.key);
        if (!entry) {
            return;
        }

        if (await openTelaModal([entry], { preselect: true })) {
            renderPreview();
        }
    }

    function resetSolicitaState() {
        previewRows = [];
        previewEntries = [];
        telaChoices.clear();
        if (isTelaModalOpen()) {
            closeTelaModal(false);
        }
    }

    function openSolicitaModal() {
        if (!canSolicitaLabTinto()) {
            return;
        }

        const els = getSolicitaElements();
        if (!els.modal) {
            return;
        }

        resetSolicitaState();
        if (els.paste) {
            els.paste.value = '';
        }
        if (els.previewTbody) {
            els.previewTbody.innerHTML = `<tr class="empty-state"><td colspan="12">Pega la lista y presiona la flecha para armar el cuadro.</td></tr>`;
        }

        els.modal.classList.remove('hidden');
        window.requestAnimationFrame(() => {
            if (els.paste) {
                els.paste.focus();
            }
        });
    }

    function closeSolicitaModal() {
        const els = getSolicitaElements();
        if (els.modal) {
            els.modal.classList.add('hidden');
        }
        resetSolicitaState();
    }

    async function handleSolicitaSave() {
        const els = getSolicitaElements();

        if (!previewRows.length) {
            TintoreriaApp.showToast('Primero arma el cuadro con la flecha.', 'error', 'Sin datos');
            return;
        }

        if (els.saveBtn) {
            els.saveBtn.disabled = true;
            els.saveBtn.textContent = 'Guardando...';
        }

        try {
            const now = TintoreriaUtils.formatProcessDateTime(new Date());
            const promises = previewRows.map((row) => {
                const record = TintoreriaApp.findRecord(row.recordId);
                if (!record) {
                    return Promise.resolve();
                }

                const existingSolicitud = String(record.f_solicitud_receta_lab_tinto || '').trim();
                const existingStatus = String(record.status_receta_lab_tinto || '').trim();
                const existingObservaciones = String(record.observaciones_receta_lab_tinto || '').trim();

                const changes = {
                    lote: row.lote,
                    observaciones_receta_lab_tinto: row.observaciones || existingObservaciones,
                    f_solicitud_receta_lab_tinto: existingSolicitud || now,
                    status_receta_lab_tinto: existingStatus || 'Por hacer'
                };

                return TintoreriaApp.saveRecordChanges(row.recordId, changes, {
                    silent: true,
                    permissionViewId: 'lab-tinto',
                    permissionFilter: FILTER_MUESTRA
                });
            });

            await Promise.all(promises);
            TintoreriaApp.showToast(`Receta solicitada para ${previewRows.length} partida(s).`, 'success', 'Lab Tinto');
            closeSolicitaModal();
            TintoreriaApp.refreshVisibleState();
        } catch (error) {
            TintoreriaApp.showToast(error.message || 'No se pudo solicitar la receta.', 'error', 'Error');
        } finally {
            if (els.saveBtn) {
                els.saveBtn.disabled = false;
                els.saveBtn.textContent = 'Solicitar Receta';
            }
        }
    }

    function init() {
        document.querySelectorAll('[data-lab-tinto-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                setActiveSubtab(button.dataset.labTintoFilter || FILTER_MUESTRA);
            });
        });

        Object.keys(LOOKUPS).forEach((key) => {
            const searchInput = document.getElementById(LOOKUPS[key].inputId);
            if (!searchInput) {
                return;
            }

            searchInput.addEventListener('input', () => {
                const nextValue = searchInput.value;
                if (!nextValue.trim()) {
                    clearLookup(key);
                    return;
                }

                lookupState[key].committed = '';
                lookupState[key].query = nextValue.trim();
                TintoreriaApp.refreshVisibleState();
            });

            searchInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                applyLookup(key, searchInput.value, { cycleOnRepeat: true });
            });
        });

        const tbody = document.getElementById('tbody-lab-tinto');
        if (tbody) {
            tbody.addEventListener('input', handleLiveInput);
            tbody.addEventListener('change', handleEditableChange);
        }

        const els = getSolicitaElements();
        if (els.openBtn) {
            els.openBtn.addEventListener('click', openSolicitaModal);
        }
        if (els.closeBtn) {
            els.closeBtn.addEventListener('click', closeSolicitaModal);
        }
        if (els.buildBtn) {
            els.buildBtn.addEventListener('click', buildPreview);
        }
        if (els.clearBtn) {
            els.clearBtn.addEventListener('click', () => {
                resetSolicitaState();
                if (els.paste) {
                    els.paste.value = '';
                }
                if (els.previewTbody) {
                    els.previewTbody.innerHTML = `<tr class="empty-state"><td colspan="12">Pega la lista y presiona la flecha para armar el cuadro.</td></tr>`;
                }
                if (els.paste) {
                    els.paste.focus();
                }
            });
        }
        if (els.saveBtn) {
            els.saveBtn.addEventListener('click', handleSolicitaSave);
        }
        if (els.previewTbody) {
            els.previewTbody.addEventListener('click', handlePreviewClick);
        }
        if (els.modal) {
            els.modal.addEventListener('click', (event) => {
                // Con el selector de tela encima el backdrop del modal grande no cierra nada.
                if (event.target === els.modal && !isTelaModalOpen()) {
                    closeSolicitaModal();
                }
            });
        }

        const telaEls = getTelaElements();
        if (telaEls.okBtn) {
            telaEls.okBtn.addEventListener('click', confirmTelaModal);
        }
        if (telaEls.cancelBtn) {
            telaEls.cancelBtn.addEventListener('click', () => closeTelaModal(false));
        }
        if (telaEls.closeBtn) {
            telaEls.closeBtn.addEventListener('click', () => closeTelaModal(false));
        }
        if (telaEls.modal) {
            telaEls.modal.addEventListener('click', (event) => {
                if (event.target === telaEls.modal) {
                    closeTelaModal(false);
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            // Escape cierra primero el selector de tela para no perder lo ya pegado.
            if (isTelaModalOpen()) {
                closeTelaModal(false);
                return;
            }
            if (els.modal && !els.modal.classList.contains('hidden')) {
                closeSolicitaModal();
            }
        });
    }

    TintoreriaApp.registerView('lab-tinto', {
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

            return { filter: getSubtabFor(record) };
        }
    });
})();
