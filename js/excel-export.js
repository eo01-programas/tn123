(() => {
    const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const textEncoder = new TextEncoder();
    const CRC_TABLE = buildCrcTable();

    function buildCrcTable() {
        const table = new Uint32Array(256);

        for (let index = 0; index < 256; index += 1) {
            let current = index;
            for (let bit = 0; bit < 8; bit += 1) {
                current = (current & 1) ? (0xEDB88320 ^ (current >>> 1)) : (current >>> 1);
            }
            table[index] = current >>> 0;
        }

        return table;
    }

    function encodeUtf8(value) {
        return textEncoder.encode(String(value === undefined || value === null ? '' : value));
    }

    function escapeXml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function buildInlineString(value) {
        const stringValue = String(value === undefined || value === null ? '' : value);
        const preserveSpace = /^\s|\s$/.test(stringValue) || stringValue.includes('\n');
        const preserveAttribute = preserveSpace ? ' xml:space="preserve"' : '';
        return `<is><t${preserveAttribute}>${escapeXml(stringValue)}</t></is>`;
    }

    function columnName(index) {
        let dividend = index + 1;
        let column = '';

        while (dividend > 0) {
            const modulo = (dividend - 1) % 26;
            column = String.fromCharCode(65 + modulo) + column;
            dividend = Math.floor((dividend - modulo) / 26);
        }

        return column;
    }

    function normalizeSheetName(name, usedNames) {
        const normalizedBase = String(name || 'Hoja')
            .replace(/[\\/*?:\[\]]/g, '_')
            .trim()
            .slice(0, 31) || 'Hoja';

        let candidate = normalizedBase;
        let suffix = 1;

        while (usedNames.has(candidate)) {
            const suffixLabel = `_${suffix}`;
            candidate = `${normalizedBase.slice(0, Math.max(0, 31 - suffixLabel.length))}${suffixLabel}`;
            suffix += 1;
        }

        usedNames.add(candidate);
        return candidate;
    }

    function normalizeColumns(columns) {
        return (columns || []).map((column, index) => ({
            key: column && column.key ? String(column.key) : `col_${index + 1}`,
            header: String(column && column.header ? column.header : ''),
            width: Number(column && column.width) > 0 ? Number(column.width) : 12,
            align: column && column.align === 'center' ? 'center' : 'left'
        }));
    }

    function normalizeRows(rows, columnCount) {
        return (rows || []).map((row) => {
            const cells = Array.isArray(row && row.cells) ? row.cells : [];
            return {
                urgent: Boolean(row && row.urgent),
                cells: Array.from({ length: columnCount }, (_, columnIndex) => (
                    columnIndex < cells.length ? String(cells[columnIndex] === undefined || cells[columnIndex] === null ? '' : cells[columnIndex]) : ''
                ))
            };
        });
    }

    function buildStylesXml() {
        return `${XML_HEADER}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color rgb="FF1E293B"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FFFFFFFF"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0070C0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E6FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE3E3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border>
      <left/><right/><top/><bottom/><diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
    }

    function resolveCellStyleId(rowIndex, row, column) {
        if (rowIndex === -1) {
            return 1;
        }

        const isCentered = column.align === 'center';

        if (row.urgent) {
            return isCentered ? 7 : 4;
        }

        const isOddVisualRow = rowIndex % 2 === 0;
        return isCentered
            ? (isOddVisualRow ? 5 : 6)
            : (isOddVisualRow ? 2 : 3);
    }

    function buildWorksheetXml(sheet) {
        const columnsXml = sheet.columns.map((column, index) => (
            `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`
        )).join('');

        const headerRow = `<row r="1" spans="1:${sheet.columns.length}" ht="22" customHeight="1">${
            sheet.columns.map((column, columnIndex) => (
                `<c r="${columnName(columnIndex)}1" s="1" t="inlineStr">${buildInlineString(column.header)}</c>`
            )).join('')
        }</row>`;

        const bodyRows = sheet.rows.map((row, rowIndex) => {
            const rowNumber = rowIndex + 2;
            const cellsXml = sheet.columns.map((column, columnIndex) => {
                const styleId = resolveCellStyleId(rowIndex, row, column);
                const value = row.cells[columnIndex];
                return `<c r="${columnName(columnIndex)}${rowNumber}" s="${styleId}" t="inlineStr">${buildInlineString(value)}</c>`;
            }).join('');

            return `<row r="${rowNumber}" spans="1:${sheet.columns.length}" ht="20" customHeight="1">${cellsXml}</row>`;
        }).join('');

        const lastColumn = columnName(Math.max(0, sheet.columns.length - 1));
        const lastRow = Math.max(1, sheet.rows.length + 1);
        const tableRef = `A1:${lastColumn}${lastRow}`;

        return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${tableRef}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnsXml}</cols>
  <sheetData>${headerRow}${bodyRows}</sheetData>
  <autoFilter ref="${tableRef}"/>
</worksheet>`;
    }

    function buildWorkbookXml(sheets) {
        const sheetsXml = sheets.map((sheet, index) => (
            `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
        )).join('');

        return `${XML_HEADER}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="24026"/>
  <workbookPr defaultThemeVersion="166925"/>
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>
  </bookViews>
  <sheets>${sheetsXml}</sheets>
</workbook>`;
    }

    function buildWorkbookRelsXml(sheets) {
        const sheetRelationships = sheets.map((sheet, index) => (
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
        )).join('');

        return `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    }

    function buildRootRelsXml() {
        return `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
    }

    function buildContentTypesXml(sheets) {
        const sheetOverrides = sheets.map((sheet, index) => (
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )).join('');

        return `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;
    }

    function buildAppXml(sheets) {
        const titles = sheets.map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join('');

        return `${XML_HEADER}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">
      ${titles}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;
    }

    function buildCoreXml() {
        const timestamp = new Date().toISOString();

        return `${XML_HEADER}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Tintoreria Telas</dc:creator>
  <cp:lastModifiedBy>Tintoreria Telas</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
    }

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;

        for (let index = 0; index < bytes.length; index += 1) {
            crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function getDosDateTime(value) {
        const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
        const dosTime = (
            ((date.getHours() & 0x1F) << 11)
            | ((date.getMinutes() & 0x3F) << 5)
            | (Math.floor(date.getSeconds() / 2) & 0x1F)
        ) >>> 0;
        const dosDate = (
            ((Math.max(1980, date.getFullYear()) - 1980) << 9)
            | (((date.getMonth() + 1) & 0x0F) << 5)
            | (date.getDate() & 0x1F)
        ) >>> 0;

        return {
            time: dosTime,
            date: dosDate
        };
    }

    function concatBytes(parts) {
        const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
        const output = new Uint8Array(totalLength);
        let offset = 0;

        parts.forEach((part) => {
            output.set(part, offset);
            offset += part.length;
        });

        return output;
    }

    function createZip(entries) {
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;

        entries.forEach((entry) => {
            const nameBytes = encodeUtf8(entry.name);
            const dataBytes = entry.data instanceof Uint8Array ? entry.data : encodeUtf8(entry.data);
            const checksum = crc32(dataBytes);
            const { time, date } = getDosDateTime(entry.date);

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, time, true);
            localView.setUint16(12, date, true);
            localView.setUint32(14, checksum, true);
            localView.setUint32(18, dataBytes.length, true);
            localView.setUint32(22, dataBytes.length, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, time, true);
            centralView.setUint16(14, date, true);
            centralView.setUint32(16, checksum, true);
            centralView.setUint32(20, dataBytes.length, true);
            centralView.setUint32(24, dataBytes.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, localOffset, true);
            centralHeader.set(nameBytes, 46);

            localParts.push(localHeader, dataBytes);
            centralParts.push(centralHeader);
            localOffset += localHeader.length + dataBytes.length;
        });

        const centralDirectory = concatBytes(centralParts);
        const endRecord = new Uint8Array(22);
        const endView = new DataView(endRecord.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, entries.length, true);
        endView.setUint16(10, entries.length, true);
        endView.setUint32(12, centralDirectory.length, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);

        return concatBytes([...localParts, centralDirectory, endRecord]);
    }

    function buildWorkbookEntries(sheets) {
        const entries = [
            { name: '[Content_Types].xml', data: buildContentTypesXml(sheets) },
            { name: '_rels/.rels', data: buildRootRelsXml() },
            { name: 'docProps/app.xml', data: buildAppXml(sheets) },
            { name: 'docProps/core.xml', data: buildCoreXml() },
            { name: 'xl/workbook.xml', data: buildWorkbookXml(sheets) },
            { name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRelsXml(sheets) },
            { name: 'xl/styles.xml', data: buildStylesXml() }
        ];

        sheets.forEach((sheet, index) => {
            entries.push({
                name: `xl/worksheets/sheet${index + 1}.xml`,
                data: buildWorksheetXml(sheet)
            });
        });

        return entries;
    }

    function downloadBlob(blob, filename) {
        const anchor = document.createElement('a');
        const url = URL.createObjectURL(blob);

        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    function createStyledWorkbookBlob(options = {}) {
        const requestedSheets = Array.isArray(options.sheets) ? options.sheets : [];
        const usedNames = new Set();
        const normalizedSheets = requestedSheets.map((sheet) => {
            const columns = normalizeColumns(sheet && sheet.columns);
            const rows = normalizeRows(sheet && sheet.rows, columns.length);

            if (!columns.length) {
                return null;
            }

            return {
                name: normalizeSheetName(sheet && sheet.name, usedNames),
                columns,
                rows
            };
        }).filter(Boolean);

        if (!normalizedSheets.length) {
            throw new Error('No hay hojas para exportar.');
        }

        const zipBytes = createZip(buildWorkbookEntries(normalizedSheets));
        const filename = /\.xlsx$/i.test(String(options.filename || ''))
            ? String(options.filename)
            : `${String(options.filename || 'exportacion')}.xlsx`;

        return {
            blob: new Blob([zipBytes], { type: MIME_TYPE }),
            filename,
            sheetCount: normalizedSheets.length,
            size: zipBytes.length
        };
    }

    function downloadStyledWorkbook(options = {}) {
        const result = createStyledWorkbookBlob(options);
        downloadBlob(result.blob, result.filename);
        return result;
    }

    window.TintoreriaExcelExport = {
        createStyledWorkbookBlob,
        downloadStyledWorkbook
    };
})();
