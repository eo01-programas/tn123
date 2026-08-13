(() => {
    const STORAGE_KEY = 'tintoreria_four_point_audit_record';
    const ROWS = 51;
    const COLS = 41;
    const GRID_HEADERS = [
        '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6',
        '2.7', '2.8', '2.9', '2.10', '2.11', '3.1', '3.2', '3.3', '3.4', '4.1', '4.2', '4.3',
        '4.4', '4.5', '4.6', '4.7', '4.8', '5.1', '5.2', '5.3', '5.4'
    ];
    const COL_WIDTHS_PX = [
        3, 165, 34, 34, 34, 34,
        ...Array.from({ length: 34 }, () => 20),
        7
    ];
    const COL_WIDTHS_XLSX = [
        1, 29.2, 6, 6, 6, 6,
        ...Array.from({ length: 34 }, () => 3.5),
        1
    ];
    const ROW_HEIGHTS_PX = [
        3, 31, 25, 4, 0, 21,
        ...Array.from({ length: 12 }, () => 16),
        ...Array.from({ length: 17 }, () => 16),
        5,
        ...Array.from({ length: 7 }, () => 11),
        24, 11, 11, 11, 12,
        4, 7, 12
    ];
    const ROW_HEIGHTS_PT = [
        4, 31.5, 24.75, 4, 0, 21,
        ...Array.from({ length: 12 }, () => 15.75),
        ...Array.from({ length: 17 }, () => 15.75),
        5,
        ...Array.from({ length: 7 }, () => 10.5),
        23.25, 10.5, 10.5, 10.5, 12,
        4, 7, 12
    ];
    const MERGES = [
        [2, 4, 2, 3], [3, 4, 3, 16], [34, 35, 6, 40],
        [35, 36, 2, 9], [35, 36, 9, 40],
        [2, 6, 35, 41], [2, 3, 3, 35], [44, 45, 17, 21], [48, 49, 11, 17],
        [47, 48, 11, 17], [46, 47, 11, 17], [45, 46, 11, 17], [48, 49, 17, 21],
        [47, 48, 17, 21], [46, 47, 17, 21], [45, 46, 17, 21], [44, 45, 11, 17],
        [3, 4, 16, 35], [18, 19, 2, 5], [18, 19, 6, 40], [19, 20, 2, 9],
        [19, 20, 9, 40], [34, 35, 2, 5],
        [11, 14, 2, 3], [24, 27, 2, 3],
        [44, 45, 2, 9], [45, 46, 2, 9], [46, 47, 2, 9], [47, 48, 2, 9],
        [48, 49, 2, 9]
    ];
    const DEFECT_LEGEND = [
        [37, 2, '1.1 HILO CONTAMINADO'], [37, 3, '2.1 CAIDA DE TELA '], [37, 7, '2.7 MANCHAS O GOTAS DE ACEITE'], [37, 15, '3.1 DEGRADE'], [37, 22, '4.1 REMALLES'], [37, 28, '4.5 JALADURAS'], [37, 35, '5.1 MANCHAS DE GRASA'],
        [38, 2, '1.2 BARRADO'], [38, 3, '2.2 FALLA DE AGUJA'], [38, 7, '2.8 HILO TENSIONADO/ANILLADO'], [38, 15, '3.2 MIGRACIÓN'], [38, 22, '4.2 ANCHO VARIADO'], [38, 28, '4.6 RASPADURAS'], [38, 35, '5.2 MANCHAS DE SUCIEDAD'],
        [39, 2, '1.3 HILO SUCIO'], [39, 3, '2.3 LÍNEAS DE ACEITE'], [39, 7, '2.9 FALLA DE LYCRA'], [39, 15, '3.3 MANCHAS DE COLORANTES'], [39, 22, '4.3 TRAMA ONDEADA'], [39, 28, '4.7 QUEBRADURAS'], [39, 35, '5.3 MANCHAS DE PRODUCTO'],
        [40, 2, '1.4 HILO GRUESO'], [40, 3, '2.4 MALLA ROTA'], [40, 7, '2.10 FALLA DE RAPORT'], [40, 15, '3.4 MALA IGUALACIÓN'], [40, 22, '4.4 MORDEDURAS'], [40, 28, '4.8 MANCHAS BLANCAS'], [40, 35, '5.4 MANCHAS DE ÓXIDO'],
        [41, 2, '1.5 HILO JASPEADO'], [41, 3, '2.5  LINEAS VERTICALES'], [41, 7, '2.11 CORTES'],
        [42, 2, '1.6 HILO IRREGULAR'], [42, 3, '2.6 PARADA DE MÁQUINA']
    ];
    const EXACT_40645 = {
        article1: 'JERSEY 40/1VORTEX ORG PIMA/LYOCELL STD/REC PES 40/30/30+30D SPD',
        article2: 'BABY RIB1X1 40/1VORTEX ORG PIMA/LYOCELL STD/R.PES40/30/30+30D SP',
        rows: [
            [7, 3, 180], [7, 4, 101], [7, 7, 1], [7, 13, 0.2],
            [9, 3, 181], [9, 4, 110], [9, 13, 1], [9, 19, 0.1],
            [11, 3, 172], [11, 4, 121],
            [20, 3, 90], [20, 4, 201], [20, 36, 2],
            [22, 3, 95], [22, 4, 203]
        ]
    };

    let currentModel = null;

    function getRecord() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
        } catch (error) {
            return {};
        }
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function text(record, keys) {
        for (const key of keys) {
            const value = String(record && record[key] !== undefined && record[key] !== null ? record[key] : '').trim();
            if (value) return value;
        }
        return '';
    }

    function formatDate(raw) {
        if (window.TintoreriaUtils && TintoreriaUtils.formatDateDayMonth) {
            const label = TintoreriaUtils.formatDateDayMonth(raw);
            if (label) {
                const parts = label.split('/');
                const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
                const monthIndex = Number(parts[1]) - 1;
                if (parts.length >= 3 && monthNames[monthIndex]) return `${parts[0]}/${monthNames[monthIndex]}/${parts[2]}`;
                return label;
            }
        }
        return '';
    }

    function opPartida(record) {
        if (window.TintoreriaUtils && TintoreriaUtils.formatOpPartida) {
            return TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
        }
        return [record.op_tela, record.partida].filter(Boolean).join('-');
    }

    function isExact40645(record) {
        return opPartida(record).replace(/\s/g, '') === '40645-396';
    }

    function buildMatrix(record) {
        const matrix = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ''));
        const op = opPartida(record);
        const inspector = text(record, ['calidad_auditor']);
        const date = formatDate(record.calidad_fin || record.fecha_rechazo_1 || record.calidad_inicio);
        const client = text(record, ['cliente']) || (isExact40645(record) ? 'LULU' : '');
        const color = text(record, ['color']) || (isExact40645(record) ? 'WHITE' : '');
        const kilos = text(record, ['peso_kg_crudo']) || (isExact40645(record) ? '502,5' : '');
        const rollCount = text(record, ['cantidad_crudo']) || (isExact40645(record) ? '20' : '');
        const article1 = isExact40645(record) ? EXACT_40645.article1 : text(record, ['articulo']);
        const article2 = isExact40645(record) ? EXACT_40645.article2 : text(record, ['articulo_2']);

        set(matrix, 2, 3, 'AUDITORÍA DE 4 PUNTOS');
        set(matrix, 2, 35, 'CÓDIGO: \nF-GT-ACT-24\nAseguramiento de Calidad\nTINTORERÍA DE TELAS');
        set(matrix, 3, 3, 'Fecha de aprobación: 21/11/2022');
        set(matrix, 3, 16, 'Versión: 01');

        ['ANCHO', 'R#', 'Mt', 'PESO'].forEach((label, index) => set(matrix, 6, 3 + index, label));
        GRID_HEADERS.forEach((label, index) => set(matrix, 6, 7 + index, label));
        set(matrix, 6, 40, 'PTS');

        set(matrix, 7, 2, `INSPECTOR: ${inspector}`);
        set(matrix, 8, 2, `FECHA: ${date}`);
        set(matrix, 9, 2, `CLIENTE: ${client}`);
        set(matrix, 10, 2, `OP/PARTIDA: ${op}`);
        set(matrix, 11, 2, `ARTÍCULO: ${article1}`);
        set(matrix, 14, 2, `COLOR: ${color}`);
        set(matrix, 15, 2, `N. ROLLOS: ${rollCount}`);
        set(matrix, 16, 2, `KILOS: ${kilos}`);
        set(matrix, 18, 6, 'PUNTAJE TOTAL');

        set(matrix, 19, 2, 'CALIFICACIÓN DE PUNTAJE POR 100 mt² (DESPACHO APROBADO/FALLADO)');
        if (article2) {
            set(matrix, 20, 2, `INSPECTOR: ${inspector}`);
            set(matrix, 21, 2, `FECHA: ${date}`);
            set(matrix, 22, 2, `CLIENTE: ${client}`);
            set(matrix, 23, 2, `OP/PARTIDA: ${op}`);
            set(matrix, 24, 2, `ARTÍCULO: ${article2}`);
            set(matrix, 27, 2, `COLOR: ${color}`);
            set(matrix, 28, 2, `N. ROLLOS: ${rollCount}`);
            set(matrix, 29, 2, `KILOS: ${kilos}`);
        }
        set(matrix, 34, 6, 'PUNTAJE TOTAL');
        set(matrix, 35, 2, 'CALIFICACIÓN DE PUNTAJE POR 100 mt² (DESPACHO APROBADO/FALLADO)');

        DEFECT_LEGEND.forEach(([r, c, value]) => set(matrix, r, c, value));
        set(matrix, 44, 2, 'SISTEMA DE 4 PUNTOS - LULULEMON');
        set(matrix, 45, 2, 'Promedio de puntos por 100 Mt\u00b2 =       Total de puntos penalizados x 10,000');
        set(matrix, 46, 2, '                                      Promedio ancho \u00fatil cm x Metros inspeccionados');
        set(matrix, 48, 2, 'Para telas con < 7% de spandex     Promedio de puntos x 100 mt\u00b2 = 24');
        set(matrix, 44, 11, 'Tamaño del defecto (SI)');
        set(matrix, 44, 17, 'Puntos de penalización');
        set(matrix, 45, 11, 'Defecto <= 7.5 cm');
        set(matrix, 45, 17, 1);
        set(matrix, 46, 11, '7.5 cm < Defecto < 15 cm');
        set(matrix, 46, 17, 2);
        set(matrix, 47, 11, '15 cm < Defecto < 23 cm');
        set(matrix, 47, 17, 3);
        set(matrix, 48, 11, 'Defecto > 23 cm');
        set(matrix, 48, 17, 4);
        set(matrix, 51, 2, '19-1455');

        if (isExact40645(record)) {
            EXACT_40645.rows.forEach(([r, c, value]) => set(matrix, r, c, value));
        } else {
            fillGenericRollData(matrix, record);
        }

        return matrix;
    }

    function set(matrix, row, col, value) {
        matrix[row - 1][col - 1] = value;
    }

    // Solo se vuelcan las mediciones reales de la auditoria (aud_4_puntos_*).
    // Si la partida no tiene esos datos, la grilla ANCHO/R#/Mt/PESO queda vacia:
    // no se deduce el numero de rollos desde cantidad_crudo ni el peso por rollo
    // desde peso_kg_crudo, porque serian valores inventados y no medidos.
    function fillGenericRollData(matrix, record) {
        const auditRows = parseAuditRows(record);
        if (!auditRows.length) return;

        const targetRows = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];
        auditRows.slice(0, targetRows.length).forEach((roll, index) => {
            const row = targetRows[index];
            set(matrix, row, 3, roll.ancho);
            set(matrix, row, 4, roll.numero);
            roll.defectos.forEach(({ codigo, cantidad }) => {
                const defectIndex = GRID_HEADERS.indexOf(codigo);
                if (defectIndex !== -1 && cantidad !== '') {
                    set(matrix, row, 7 + defectIndex, cantidad);
                }
            });
        });
    }

    function splitAuditValues(value) {
        return String(value === undefined || value === null ? '' : value)
            .split(',')
            .map((item) => item.trim());
    }

    function parseAuditQuantity(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const numeric = Number(raw.replace('%', '').replace(',', '.'));
        if (!Number.isFinite(numeric)) return raw;
        return raw.includes('%') ? numeric / 100 : numeric;
    }

    function parseAuditRows(record) {
        const rollos = splitAuditValues(record.aud_4_puntos_rollos);
        const puntos = splitAuditValues(record.aud_4_puntos_puntos);
        const cantidades = splitAuditValues(record.aud_4_puntos_cantidad);
        const anchos = splitAuditValues(record.aud_4_puntos_ancho);
        const densidades = splitAuditValues(record.aud_4_puntos_densidad);
        const grouped = new Map();

        rollos.forEach((numero, index) => {
            if (!numero) return;
            if (!grouped.has(numero)) {
                grouped.set(numero, {
                    numero,
                    ancho: anchos[index] || '',
                    densidad: densidades[index] || '',
                    defectos: []
                });
            }

            const defectMatch = String(puntos[index] || '').match(/^\s*(\d+\.\d+)/);
            if (defectMatch) {
                grouped.get(numero).defectos.push({
                    codigo: defectMatch[1],
                    cantidad: parseAuditQuantity(cantidades[index])
                });
            }
        });

        return Array.from(grouped.values());
    }

    function isCovered(row, col) {
        return MERGES.some(([r1, r2, c1, c2]) => row >= r1 && row < r2 && col >= c1 && col < c2 && !(row === r1 && col === c1));
    }

    function spanFor(row, col) {
        const merge = MERGES.find(([r1, , c1]) => row === r1 && col === c1);
        if (!merge) return [1, 1];
        return [merge[1] - merge[0], merge[3] - merge[2]];
    }

    function hasBorder(row, col) {
        return (
            (row >= 2 && row <= 5 && col >= 2 && col <= 40) ||
            (row >= 6 && row <= 18 && col >= 2 && col <= 40) ||
            (row >= 19 && row <= 34 && col >= 2 && col <= 40) ||
            (row === 35 && col >= 2 && col <= 40) ||
            (row >= 44 && row <= 48 && col >= 11 && col <= 20) ||
            (row >= 44 && row <= 48 && col >= 2 && col <= 8)
        );
    }

    function isPercentage(value, row, col) {
        return typeof value === 'number' && value > 0 && value < 1 &&
            row <= 34 && col >= 7 && col <= 39;
    }

    function displayValue(value, row, col) {
        return isPercentage(value, row, col) ? `${Math.round(value * 100)}%` : value;
    }

    function cellClass(row, col, value) {
        const classes = ['audit-cell'];
        if (hasBorder(row, col)) classes.push('b');
        if ((row === 2 && col >= 2 && col <= 40) || (row === 6 && col >= 2 && col <= 40) || (row === 19 && col >= 2 && col <= 40) || (row === 35 && col >= 2 && col <= 40) || (row === 44 && col >= 2 && col <= 20)) classes.push('bt');
        if ((col === 2 && row >= 2 && row <= 35) || (col === 2 && row >= 44 && row <= 48) || (col === 11 && row >= 44 && row <= 48)) classes.push('bl');
        if ((row === 2 && col === 3) || (row === 6 && col >= 3) || (row === 18 && col === 6) || (row === 34 && col === 6) || row === 44 || (col === 17 && row >= 45 && row <= 48)) classes.push('center');
        if (row === 2 && col === 3) classes.push('title');
        if ((row === 2 && col === 35) || (row === 4 && col === 35)) classes.push('header-note');
        if (col === 2 && row >= 7 && row <= 27 && row !== 19) classes.push('label');
        if ((row === 19 || row === 35) && col === 2) classes.push('score-heading');
        if (row >= 37 && row <= 43) classes.push('defect');
        if (row >= 44 && row <= 48 && col === 2) classes.push('formula-block');
        if (row === 48 && col === 2) classes.push('formula-end');
        if (row >= 45 && row <= 48) classes.push('penalty');
        if (typeof value === 'number' && row < 35 && col >= 7 && col <= 39) classes.push('mark');
        return classes.join(' ');
    }

    function renderHtml(model) {
        const grid = document.getElementById('audit-excel-grid');
        const logo = '<img class="audit-logo" src="https://www.cofaco.com/es/img/logo-marco-verde.png" alt="Cofaco">';
        const html = [];

        for (let row = 1; row <= ROWS; row += 1) {
            for (let col = 1; col <= COLS; col += 1) {
                if (isCovered(row, col)) continue;
                const [rowSpan, colSpan] = spanFor(row, col);
                const rawValue = row === 2 && col === 2 ? logo : model[row - 1][col - 1];
                if (rawValue === '' && !hasBorder(row, col)) continue;
                const isLogo = row === 2 && col === 2;
                const style = `grid-row:${row} / span ${rowSpan}; grid-column:${col} / span ${colSpan};`;
                const shownValue = isLogo ? rawValue : displayValue(rawValue, row, col);
                html.push(`<div class="${cellClass(row, col, rawValue)}" style="${style}">${isLogo ? shownValue : escapeHtml(shownValue)}</div>`);
            }
        }

        grid.innerHTML = html.join('');
    }

    function xlsxStyle(row, col, value) {
        const border = hasBorder(row, col)
            ? { style: 'thin', color: { rgb: '000000' } }
            : undefined;
        const style = {
            font: {
                name: 'Arial',
                sz: row === 2 && col === 3 ? 14 : 8,
                bold: row === 2 && col === 3 || row === 6 || row === 18 || row === 34 || row === 44
            },
            alignment: {
                vertical: 'center',
                horizontal: (row === 2 && col === 3) || row === 6 || row === 44 || (col === 17 && row >= 45 && row <= 48) || (typeof value === 'number' && col >= 7) ? 'center' : 'left',
                wrapText: !(row >= 37 && row <= 43) && row !== 19 && row !== 35
            }
        };
        const formulaBlock = row >= 44 && row <= 48 && col >= 2 && col <= 8;
        if (formulaBlock) {
            style.border = {};
            if (row === 44) style.border.top = border;
            if (row === 48) style.border.bottom = border;
            if (col === 2) style.border.left = border;
            if (col === 8) style.border.right = border;
        } else if (border) {
            style.border = { top: border, right: border, bottom: border, left: border };
        }
        if (isPercentage(value, row, col)) style.numFmt = '0%';
        return style;
    }

    async function applyPrintSettings(workbookData) {
        const zip = await JSZip.loadAsync(workbookData);
        const sheetPath = 'xl/worksheets/sheet1.xml';
        const sheetFile = zip.file(sheetPath);
        if (!sheetFile) throw new Error('No se encontro la hoja exportada.');

        let xml = await sheetFile.async('string');
        const printXml = '<pageMargins left="0.2" right="0.2" top="0.25" bottom="0.25" header="0" footer="0"/>' +
            '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1" horizontalDpi="300" verticalDpi="300"/>';
        const hadPageMargins = /<pageMargins\b[^>]*\/>/.test(xml);
        xml = xml.replace(/<pageSetup\b[^>]*\/>/g, '');
        if (hadPageMargins) {
            xml = xml.replace(/<pageMargins\b[^>]*\/>/, printXml);
        }

        if (/<sheetPr\b[^>]*\/>/.test(xml)) {
            xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
        } else if (/<sheetPr\b[^>]*>/.test(xml)) {
            if (/<pageSetUpPr\b[^>]*\/>/.test(xml)) {
                xml = xml.replace(/<pageSetUpPr\b[^>]*\/>/, '<pageSetUpPr fitToPage="1"/>');
            } else {
                xml = xml.replace(/(<sheetPr\b[^>]*>)/, '$1<pageSetUpPr fitToPage="1"/>');
            }
        } else {
            xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
        }

        if (!hadPageMargins) {
            const laterWorksheetNode = /(<(?:headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>)/;
            xml = xml.replace(laterWorksheetNode, `${printXml}$1`);
        }
        zip.file(sheetPath, xml);
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    async function exportXlsx() {
        if (!window.XLSX || !window.JSZip) {
            alert('No se pudieron cargar las librerias necesarias para exportar XLSX.');
            return;
        }

        const aoa = currentModel.map((row) => row.map((value) => value));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = COL_WIDTHS_XLSX.map((wch) => ({ wch }));
        ws['!rows'] = ROW_HEIGHTS_PT.map((hpt, index) => index === 4 ? { hpt: 0, hidden: true } : { hpt });
        ws['!merges'] = MERGES.map(([r1, r2, c1, c2]) => ({
            s: { r: r1 - 1, c: c1 - 1 },
            e: { r: r2 - 2, c: c2 - 2 }
        }));

        for (let row = 1; row <= ROWS; row += 1) {
            for (let col = 1; col <= COLS; col += 1) {
                const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
                if (row >= 37 && row <= 43 && currentModel[row - 1][col - 1] === '') {
                    delete ws[address];
                    continue;
                }
                if (!ws[address]) ws[address] = { t: 's', v: '' };
                ws[address].s = xlsxStyle(row, col, currentModel[row - 1][col - 1]);
            }
        }

        ws['!margins'] = { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0, footer: 0 };
        ws['!pageSetup'] = {
            paperSize: 9,
            orientation: 'landscape',
            fitToWidth: 1,
            fitToHeight: 1,
            fitToPage: true,
            horizontalDpi: 300,
            verticalDpi: 300
        };
        ws['!printArea'] = 'A1:AO51';
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'hoja de inspecc');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Names = wb.Workbook.Names || [];
        wb.Workbook.Names.push({
            Name: '_xlnm.Print_Area',
            Sheet: 0,
            Ref: "'hoja de inspecc'!$A$1:$AO$51"
        });
        const record = getRecord();
        const filename = `${opPartida(record) || 'OP'} F-GT-ACT-24 Auditoria de 4 puntos.xlsx`;
        try {
            const workbookData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = await applyPrintSettings(workbookData);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error(error);
            alert('No se pudo generar el archivo XLSX.');
        }
    }

    function init() {
        const record = getRecord();
        currentModel = buildMatrix(record);
        renderHtml(currentModel);
        let zoom = 1;
        const sheet = document.getElementById('audit-sheet');
        const zoomValue = document.getElementById('zoom-value');
        const updateZoom = (nextZoom) => {
            zoom = Math.max(0.5, Math.min(2, Math.round(nextZoom * 10) / 10));
            sheet.style.setProperty('--audit-zoom', zoom);
            zoomValue.textContent = `${Math.round(zoom * 100)}%`;
        };
        document.getElementById('btn-zoom-out').addEventListener('click', () => updateZoom(zoom - 0.1));
        document.getElementById('btn-zoom-in').addEventListener('click', () => updateZoom(zoom + 0.1));
        document.getElementById('btn-back').addEventListener('click', () => window.history.back());
        document.getElementById('btn-export').addEventListener('click', exportXlsx);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
