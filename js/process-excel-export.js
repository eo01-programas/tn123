(() => {
    // Exportacion a Excel de las vistas de proceso: genera un .xlsx con las
    // hojas "Procesado" (primera) y "Por procesar" (segunda) tomando la tabla
    // TAL CUAL se ve en pantalla (mismas columnas visibles y mismos filtros
    // de cliente/OP aplicados). Para capturar el subtab que no esta activo se
    // hace click programatico en su boton (el render es sincrono) y al final
    // se restaura el subtab que tenia el usuario.

    const EXPORT_VIEWS = [
        { id: 'plegado', filterAttr: 'data-plegado-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Plegado' },
        { id: 'rama-crudo', filterAttr: 'data-rama-crudo-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Rama Crudo' },
        { id: 'preparado', filterAttr: 'data-preparado-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Preparado' },
        { id: 'abridora', filterAttr: 'data-abridora-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Abridora' },
        { id: 'secado', filterAttr: 'data-secado-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Secado' },
        { id: 'rama-tenido', filterAttr: 'data-rama-tenido-filter', porProcesar: 'X PROG', procesado: 'PROG', label: 'Rama Acabado' },
        { id: 'acab-espec', filterAttr: 'data-acab-espec-filter', porProcesar: 'POR PROCESAR', procesado: 'PROCESADO', label: 'Acab Espec' }
    ];

    // Columnas que se alinean a la izquierda en el Excel; el resto centrado.
    const LEFT_ALIGN_HEADERS = new Set(['cliente', 'color', 'articulo']);

    // A4 horizontal con margenes super estrechos y ajuste al ancho de hoja.
    const PAGE_SETUP = {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 }
    };

    function showToast(message, tone, title) {
        if (window.TintoreriaApp && typeof TintoreriaApp.showToast === 'function') {
            TintoreriaApp.showToast(message, tone, title);
        }
    }

    function getViewTable(viewId) {
        const section = document.getElementById(`view-${viewId}`);
        return section ? section.querySelector('table.data-table') : null;
    }

    // px en pantalla -> ancho de columna de Excel (unidades de caracter).
    function pxToExcelWidth(px) {
        const width = (Number(px) - 5) / 7;
        return Math.max(4, Math.round(width * 10) / 10);
    }

    function extractCellText(cell) {
        const select = cell.querySelector('select');
        if (select instanceof HTMLSelectElement) {
            const option = select.selectedOptions && select.selectedOptions[0];
            const label = option ? option.textContent : select.value;
            const normalized = String(label || '').replace(/\s+/g, ' ').trim();
            return normalized === 'Selec' ? '' : normalized;
        }

        const input = cell.querySelector('input');
        if (input instanceof HTMLInputElement) {
            return String(input.value || '').trim();
        }

        // Se descartan botones de accion (lapiz de detalle, pill "click" de
        // inicio) que no aportan informacion impresa.
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('button.edit-detail-button, button[data-action="start"]').forEach((node) => {
            node.remove();
        });
        const text = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
        return text === 'Selec' ? '' : text;
    }

    function isExportableRow(row) {
        return (
            row instanceof HTMLTableRowElement &&
            !row.hidden &&
            row.style.display !== 'none' &&
            !row.classList.contains('empty-state') &&
            !row.classList.contains('client-filter-empty-state') &&
            !row.classList.contains('op-search-empty-state')
        );
    }

    // Lee del DOM el subtab actualmente renderizado: encabezados visibles,
    // anchos reales en pantalla y filas visibles (respeta filtros activos).
    function captureCurrentSubtab(viewId) {
        const table = getViewTable(viewId);
        if (!(table instanceof HTMLTableElement) || !table.tHead || !table.tHead.rows.length) {
            return { columns: [], rows: [] };
        }

        const headerCells = Array.from(table.tHead.rows[0].cells).filter((th) => !th.hidden);
        const columns = headerCells.map((th) => {
            const header = String(th.textContent || '').replace(/\s+/g, ' ').trim();
            return {
                header,
                width: pxToExcelWidth(th.getBoundingClientRect().width),
                align: LEFT_ALIGN_HEADERS.has(header.toLowerCase()) ? 'left' : 'center'
            };
        });

        const tbody = table.tBodies.length ? table.tBodies[0] : null;
        const rows = tbody
            ? Array.from(tbody.rows)
                .filter(isExportableRow)
                .map((row) => ({
                    urgent: row.classList.contains('urgent-row'),
                    // Reproduce el rayado por grupo OP-PTDA si la vista lo pinta.
                    band: row.classList.contains('op-group-painted')
                        ? 1
                        : (row.classList.contains('op-group-plain') ? 0 : undefined),
                    cells: Array.from(row.cells)
                        .slice(0, columns.length)
                        .map((cell) => extractCellText(cell))
                }))
            : [];

        return { columns, rows };
    }

    // Titulo de la fila 1 de cada hoja; se repite en cada pagina impresa.
    // Ej: "PROCESO: Abridora - Impresion 16/Jul/2026".
    function buildSheetTitle(label) {
        const printDate = TintoreriaUtils.formatDateForUi(new Date());
        return `PROCESO: ${label} - Impresion ${printDate}`;
    }

    function buildExportFileName(viewId) {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        return `${viewId.replace(/-/g, '_')}_${year}${month}${day}_${hours}${minutes}.xlsx`;
    }

    function exportProcessView(view) {
        if (!window.TintoreriaExcelExport || typeof TintoreriaExcelExport.downloadStyledWorkbook !== 'function') {
            showToast('La utilidad de exportacion no esta disponible.', 'error', 'Exportacion fallida');
            return;
        }

        try {
            const buttons = Array.from(document.querySelectorAll(`[${view.filterAttr}]`));
            const porProcesarButton = buttons.find((b) => b.getAttribute(view.filterAttr) === view.porProcesar);
            const procesadoButton = buttons.find((b) => b.getAttribute(view.filterAttr) === view.procesado);
            const activeButton = buttons.find((b) => b.classList.contains('active')) || porProcesarButton;

            if (!(porProcesarButton instanceof HTMLElement) || !(procesadoButton instanceof HTMLElement)) {
                showToast('No se encontraron los subtabs de la vista.', 'error', 'Exportacion fallida');
                return;
            }

            let porProcesar;
            let procesado;
            try {
                porProcesarButton.click();
                porProcesar = captureCurrentSubtab(view.id);
                procesadoButton.click();
                procesado = captureCurrentSubtab(view.id);
            } finally {
                if (activeButton instanceof HTMLElement) {
                    activeButton.click();
                }
            }

            if (!porProcesar.columns.length && !procesado.columns.length) {
                showToast('No se pudo leer la tabla de la vista.', 'error', 'Exportacion fallida');
                return;
            }

            if (!porProcesar.rows.length && !procesado.rows.length) {
                showToast('No hay filas visibles para exportar.', 'info', 'Sin datos');
                return;
            }

            TintoreriaExcelExport.downloadStyledWorkbook({
                filename: buildExportFileName(view.id),
                sheets: [
                    {
                        name: 'Procesado',
                        title: buildSheetTitle(view.label),
                        columns: procesado.columns,
                        rows: procesado.rows,
                        repeatHeader: true,
                        pageSetup: PAGE_SETUP
                    },
                    {
                        name: 'Por procesar',
                        title: buildSheetTitle(view.label),
                        columns: porProcesar.columns,
                        rows: porProcesar.rows,
                        repeatHeader: true,
                        pageSetup: PAGE_SETUP
                    }
                ].filter((sheet) => sheet.columns.length)
            });

            showToast(`Se descargo el Excel de ${view.label}.`, 'success', 'Exportacion completada');
        } catch (error) {
            console.error(error);
            showToast(error.message || 'No se pudo exportar el archivo Excel.', 'error', 'Exportacion fallida');
        }
    }

    EXPORT_VIEWS.forEach((view) => {
        const button = document.getElementById(`btn-export-${view.id}-excel`);
        if (button) {
            button.addEventListener('click', () => exportProcessView(view));
        }
    });
})();
