(() => {
    let embalajeContextMenuRefs = null;
    let embalajeCalidadFinMenuRefs = null;
    let embalajeCalidadFinFilter = null;
    let embalajeLastRecords = null;
    let embalajeLastState = null;

    // ── Anchos de columnas ────────────────────────────────────────────
    // NO edites los px aqui. Cada columna usa la variable CSS --embalaje-col-*
    // y estos px son solo el valor de respaldo si la variable no existe.
    // Para CAMBIAR los anchos edita las variables --embalaje-col-* en
    // css/style.css (busca "Edita aqui los anchos de Embalaje").
    // Orden: P | calidad_fin | cliente | OP-PTDA | color | articulo | kg | #rollos/cntd | Status
    const EMBALAJE_WIDTHS = [
        'var(--embalaje-col-p, 42px)',
        'var(--embalaje-col-calidad-fin, 80px)',
        'var(--embalaje-col-cliente, 80px)',
        'var(--embalaje-col-op-ptda, 100px)',
        'var(--embalaje-col-color, 190px)',
        'var(--embalaje-col-articulo, 450px)',
        'var(--embalaje-col-kg, 92px)',
        'var(--embalaje-col-rollos, 92px)',
        'var(--embalaje-col-status, 70px)'
    ];

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

    // Orden ascendente por calidad_fin (lo mas antiguo primero); las filas sin
    // fecha valida quedan al final.
    function sortByCalidadFin(records) {
        return [...records].sort((a, b) => {
            const dateA = TintoreriaUtils.parseDateish(a.calidad_fin);
            const dateB = TintoreriaUtils.parseDateish(b.calidad_fin);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateA - dateB;
        });
    }

    function getFilteredEmbalajeRecords(records, state) {
        let filtered = TintoreriaUtils.filterRecordsForSearch(
            sortByCalidadFin(getEligibleRecords(records)),
            state,
            'embalaje'
        );

        if (embalajeCalidadFinFilter) {
            filtered = filtered.filter(
                (r) => TintoreriaUtils.formatDateDayMonth(r.calidad_fin) === embalajeCalidadFinFilter
            );
        }

        return filtered;
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
        if (colgroup) colgroup.innerHTML = EMBALAJE_WIDTHS.map(w => `<col style="width:${w}">`).join('');

        updateCalidadFinHeader();
        hideEmbalajeContextMenu();
        hideCalidadFinFilterMenu();
        renderSubtabCounts(records);

        const filtered = getFilteredEmbalajeRecords(records, state);

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

    // ── Exportacion a Excel (hoja "Por embalar", lista para imprimir) ─────

    // Columnas del Excel — mismo orden que la tabla en pantalla.
    // Anchos en "caracteres" de Excel. Suman ~146, que entra en A4 horizontal
    // con margenes estrechos sin que Excel tenga que encoger el texto.
    // articulo lleva el mayor ancho; cliente y color se ajustan a lo justo.
    function getEmbalajeExportColumns() {
        return [
            { key: 'p', header: 'P', width: 5, align: 'center' },
            { key: 'calidad_fin', header: 'calidad_fin', width: 12, align: 'center' },
            { key: 'cliente', header: 'cliente', width: 16, align: 'left' },
            { key: 'op_ptda', header: 'OP-PTDA', width: 14, align: 'center' },
            { key: 'color', header: 'color', width: 20, align: 'left' },
            { key: 'articulo', header: 'articulo', width: 60, align: 'left' },
            { key: 'kg', header: 'kg(crudo)', width: 11, align: 'center' },
            { key: 'rollos', header: '#rollos/cntd', width: 12, align: 'center' },
            { key: 'status', header: 'Status', width: 10, align: 'center' }
        ];
    }

    // Calcula los saltos de pagina manuales para que, cuando la informacion
    // ocupe mas de una hoja A4, cada hoja se llene al maximo y el corte caiga
    // siempre en un limite de OP-PTDA (nunca parte en dos una misma OP-PTDA ni
    // deja paginas a medias). Devuelve numeros de fila del Excel (1-based)
    // despues de los cuales insertar el salto.
    function computeOpPtdaRowBreaks(rows) {
        // Capacidad fisica de filas de datos por hoja A4 horizontal con los
        // margenes actuales. Debe ser <= a lo que realmente entra para que el
        // salto manual gane al automatico de Excel. Si ves que parte una
        // OP-PTDA, baja este numero; si sobra espacio abajo, subelo.
        const CAPACITY = 30;
        const breaks = [];
        const total = rows.length;
        let pageStart = 0;

        // Mientras lo que queda no entre en una sola hoja, cerramos una hoja.
        while (total - pageStart > CAPACITY) {
            // Ultima fila tentativa de esta hoja (indice 0-based en `rows`).
            let pageEnd = pageStart + CAPACITY - 1;

            // Si esa fila parte una OP-PTDA, retrocede hasta el ultimo limite
            // de grupo dentro de la hoja para no cortar el grupo.
            while (pageEnd > pageStart && rows[pageEnd].opPtda === rows[pageEnd + 1].opPtda) {
                pageEnd -= 1;
            }

            // Caso extremo: un solo grupo mas grande que una hoja. No se puede
            // evitar el corte; se usa la hoja completa.
            if (pageEnd === pageStart && rows[pageEnd].opPtda === rows[pageEnd + 1].opPtda) {
                pageEnd = pageStart + CAPACITY - 1;
            }

            // Fila de datos `pageEnd` -> fila `pageEnd + 2` en el Excel (hay 1
            // encabezado). El salto se inserta debajo de esa fila.
            breaks.push(pageEnd + 2);
            pageStart = pageEnd + 1;
        }

        return breaks;
    }

    function buildEmbalajeExportFileName() {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        return `embalaje_por_embalar_${year}${month}${day}_${hours}${minutes}.xlsx`;
    }

    function exportEmbalajeWorkbook() {
        if (!window.TintoreriaExcelExport || typeof TintoreriaExcelExport.downloadStyledWorkbook !== 'function') {
            TintoreriaApp.showToast('La utilidad de exportacion no esta disponible.', 'error', 'Exportacion fallida');
            return;
        }

        try {
            const records = embalajeLastRecords || TintoreriaApp.getRecords();
            const state = embalajeLastState || TintoreriaApp.state;
            const filtered = getFilteredEmbalajeRecords(records, state);

            if (!filtered.length) {
                TintoreriaApp.showToast('No hay filas para exportar en "Por embalar".', 'info', 'Sin datos');
                return;
            }

            // Checkbox en blanco para que al imprimir marquen con check manual.
            const EMPTY_CHECKBOX = '☐'; // ☐

            // Banda por grupo OP-PTDA: alterna 0/1 cada vez que cambia la OP-PTDA,
            // igual que el pintado de la tabla en pantalla.
            let groupIndex = -1;
            let previousOpPtda = null;

            const rows = filtered.map((record) => {
                const opPtda = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);

                if (opPtda !== previousOpPtda) {
                    groupIndex += 1;
                    previousOpPtda = opPtda;
                }

                return {
                    opPtda,
                    band: groupIndex % 2,
                    urgent: TintoreriaUtils.isUrgentPriority(record.embalaje_p),
                    cells: [
                        record.embalaje_p || '',
                        TintoreriaUtils.formatDateDayMonth(record.calidad_fin) || '',
                        record.cliente || '',
                        opPtda,
                        TintoreriaUtils.formatColorLabel(record.color) || '',
                        record.articulo || '',
                        record.peso_kg_crudo || '',
                        record.cantidad_crudo || '',
                        EMPTY_CHECKBOX
                    ]
                };
            });

            TintoreriaExcelExport.downloadStyledWorkbook({
                filename: buildEmbalajeExportFileName(),
                sheets: [{
                    name: 'Por embalar',
                    columns: getEmbalajeExportColumns(),
                    rows,
                    rowBreaks: computeOpPtdaRowBreaks(rows),
                    repeatHeader: true,
                    footerNote: 'NO OLVIDAR ACTUALIZAR EN LA APLICACION',
                    pageSetup: {
                        orientation: 'landscape',
                        paperSize: 9, // A4
                        fitToWidth: 1,
                        fitToHeight: 0,
                        // Margenes estrechos + superior/inferior reducidos para
                        // aprovechar mas filas por hoja (pulgadas).
                        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 }
                    }
                }]
            });

            TintoreriaApp.showToast('Se descargo el Excel de Embalaje (Por embalar).', 'success', 'Exportacion completada');
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo exportar el archivo Excel.', 'error', 'Exportacion fallida');
        }
    }

    function init() {
        const tbody = document.getElementById('tbody-embalaje');
        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
            tbody.addEventListener('contextmenu', handleEmbalajeContextMenu);
        }

        const exportButton = document.getElementById('btn-export-embalaje-excel');
        if (exportButton) {
            exportButton.addEventListener('click', exportEmbalajeWorkbook);
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
