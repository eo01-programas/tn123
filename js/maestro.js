(() => {
    function normalizeSourceRow(row) {
        return Object.entries(row).reduce((accumulator, [key, value]) => {
            accumulator[TintoreriaUtils.normalizeHeader(key)] = value;
            return accumulator;
        }, {});
    }

    function transformSourceRow(row) {
        const normalized = normalizeSourceRow(row);
        const guia = normalized['O/P GUIA'];
        const { tipoTela, opTela } = TintoreriaUtils.extractTelaData(guia);

        if (!tipoTela || !opTela) {
            return null;
        }

        const cliente = String(normalized.CLIENTE === undefined || normalized.CLIENTE === null ? '' : normalized.CLIENTE).trim();
        const partida = String(normalized['PARTIDA GUIA'] === undefined || normalized['PARTIDA GUIA'] === null ? '' : normalized['PARTIDA GUIA']).trim();

        if (!cliente && !partida) {
            return null;
        }

        return TintoreriaUtils.defaultRecord({
            F_ing_crudo: TintoreriaUtils.parseExcelDate(normalized['FECHA ENTREGA TINT.']),
            cliente,
            tipo_tela: tipoTela,
            op_tela: opTela,
            partida,
            cod_art: String(normalized['COD. ART.'] === undefined || normalized['COD. ART.'] === null ? '' : normalized['COD. ART.']).trim(),
            articulo: String(normalized.ARTICULO === undefined || normalized.ARTICULO === null ? '' : normalized.ARTICULO).trim(),
            cod_color: String(normalized['COD. COLOR'] === undefined || normalized['COD. COLOR'] === null ? '' : normalized['COD. COLOR']).trim(),
            color: String(normalized.COLOR === undefined || normalized.COLOR === null ? '' : normalized.COLOR).trim(),
            peso_kg_crudo: String(normalized['PESO (KG)'] === undefined || normalized['PESO (KG)'] === null ? '' : normalized['PESO (KG)']).trim(),
            cantidad_crudo: String(normalized['CANT. (UND)'] === undefined || normalized['CANT. (UND)'] === null ? '' : normalized['CANT. (UND)']).trim(),
            tipo_guia: String(normalized['TIPO GUIA'] === undefined || normalized['TIPO GUIA'] === null ? '' : normalized['TIPO GUIA']).trim(),
            motivo_guia: String(normalized['MOTIVO TIPO GUIA'] === undefined || normalized['MOTIVO TIPO GUIA'] === null ? '' : normalized['MOTIVO TIPO GUIA']).trim(),
            reserva: String(normalized.RESERVA === undefined || normalized.RESERVA === null ? '' : normalized.RESERVA).trim(),
            certificado: String(normalized['O/P CERT.'] === undefined || normalized['O/P CERT.'] === null ? '' : normalized['O/P CERT.']).trim()
        });
    }

    function optionMarkup(selectedValue, options) {
        return options.map((optionValue) => {
            const label = optionValue || 'Selec';
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function formatTipoGuia(value) {
        const label = String(value === undefined || value === null ? '' : value).trim();
        const normalizedLabel = label.toUpperCase();

        const shortLabels = {
            PRODUCCION: 'Prod',
            DESARROLLO: 'Desrr',
            'DEVOL. A TINTO.': 'Devl',
            'PRUEBA CAIDA CORTE': 'PCort',
            'PRUEBA TINTORERIA': 'PTint',
            REASIGNACION: 'RAsig',
            REPROCESO: 'Reprc'
        };

        if (shortLabels[normalizedLabel]) {
            return shortLabels[normalizedLabel];
        }

        return label;
    }

    function formatReserva(value) {
        const label = String(value === undefined || value === null ? '' : value).trim();

        if (!label) {
            return '';
        }

        if (/^20\d{2}\d+$/.test(label)) {
            const normalized = label.slice(4).replace(/^0+/, '');
            return normalized || '0';
        }

        return label;
    }

    function isFieldFilled(value) {
        return String(value === undefined || value === null ? '' : value).trim() !== '';
    }

    function buildMaestroRecordKey(record) {
        return TintoreriaUtils.buildRecordMatchKey(record);
    }

    function isSameMaestroRecord(record, recordId, recordKey = '') {
        if (String(record && record.id_registro || '').trim() !== String(recordId || '').trim()) {
            return false;
        }

        if (!String(recordKey || '').trim()) {
            return true;
        }

        return buildMaestroRecordKey(record) === String(recordKey || '').trim();
    }

    function findMaestroRecord(recordId, recordKey = '') {
        const normalizedRecordId = String(recordId || '').trim();
        const normalizedRecordKey = String(recordKey || '').trim();

        return TintoreriaApp.getRecords().find((record) => {
            return isSameMaestroRecord(record, normalizedRecordId, normalizedRecordKey);
        }) || null;
    }

    function shouldHideFromMaestro(record) {
        return isFieldFilled(record.ruta);
    }

    function getVisibleRecords(records) {
        return records.filter((record) => !shouldHideFromMaestro(record));
    }

    function renderMetrics(records) {
        const totalWeight = records.reduce((sum, record) => sum + TintoreriaUtils.toNumber(record.peso_kg_crudo), 0);
        const totalRecordsLabel = `${records.length} ${records.length === 1 ? 'Partida' : 'Partidas'}`;

        document.getElementById('metric-total-records').textContent = totalRecordsLabel;
        document.getElementById('metric-total-weight').textContent = `${TintoreriaUtils.formatNumber(totalWeight)}kg`;
    }

    function renderTable(records, state) {
        const tbody = document.getElementById('tbody-maestro');
        if (!tbody) {
            return;
        }

        const visibleRecords = TintoreriaUtils.filterRecordsForSearch(getVisibleRecords(records), state, 'maestro');

        if (!visibleRecords.length) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="15">No hay registros pendientes en Maestro.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = visibleRecords.map((record) => `
            <tr>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatDateDayMonth(record.F_ing_crudo))}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.tipo_tela)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatOpPartida(record.op_tela, record.partida))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_art)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cod_color)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.cantidad_crudo)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(formatTipoGuia(record.tipo_guia))}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.motivo_guia)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(formatReserva(record.reserva))}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.certificado)}</span></td>
                <td>
                    <select class="table-select" data-record-id="${TintoreriaUtils.escapeHtml(record.id_registro)}" data-record-key="${TintoreriaUtils.escapeHtml(buildMaestroRecordKey(record))}" data-field="ruta">
                        ${optionMarkup(record.ruta || '', ROUTE_OPTIONS)}
                    </select>
                </td>
            </tr>
        `).join('');
    }

    function requestMaestroConfirmation() {
        return TintoreriaApp.confirmAction({
            title: 'Confirmar ruta',
            message: 'Esta seguro que la ruta es la correcta?'
        });
    }

    function filterImportedDuplicates(records, existingRecords) {
        const existingKeys = new Set(
            existingRecords
                .map((record) => TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color))
                .filter(Boolean)
        );
        const fileKeys = new Set();
        const recordsToImport = [];
        const duplicatesInSheet = [];
        const duplicatesInFile = [];

        records.forEach((record) => {
            const duplicateKey = TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color);

            if (!duplicateKey) {
                recordsToImport.push(record);
                return;
            }

            if (existingKeys.has(duplicateKey)) {
                duplicatesInSheet.push(record);
                return;
            }

            if (fileKeys.has(duplicateKey)) {
                duplicatesInFile.push(record);
                return;
            }

            fileKeys.add(duplicateKey);
            recordsToImport.push(record);
        });

        return {
            recordsToImport,
            duplicatesInSheet,
            duplicatesInFile
        };
    }

    async function handleExcelSelection(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        if (!window.XLSX) {
            TintoreriaApp.showToast('La libreria XLSX no esta disponible.', 'error', 'Importacion fallida');
            return;
        }

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, {
                type: 'array',
                cellDates: true
            });

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, {
                defval: '',
                raw: false,
                dateNF: 'yyyy-mm-dd hh:mm:ss'
            });

            const transformed = rows
                .map(transformSourceRow)
                .filter(Boolean);

            if (!transformed.length) {
                TintoreriaApp.showToast('El archivo no contiene filas validas para importar.', 'error', 'Importacion vacia');
                return;
            }

            await TintoreriaApp.refreshData({ silent: true });

            const {
                recordsToImport,
                duplicatesInSheet,
                duplicatesInFile
            } = filterImportedDuplicates(transformed, TintoreriaApp.getRecords());
            const omittedCount = duplicatesInSheet.length + duplicatesInFile.length;

            if (!recordsToImport.length) {
                TintoreriaApp.showToast(
                    `No se importo ninguna fila. ${omittedCount} duplicados omitidos.`,
                    'error',
                    'Importacion omitida'
                );
                return;
            }

            const appended = await TintoreriaApp.importRecords(recordsToImport);
            renderMetrics(getVisibleRecords(TintoreriaApp.getRecords()));

            let importMessage = `Se importaron ${appended.length} filas.`;
            if (omittedCount > 0) {
                const duplicateParts = [];

                if (duplicatesInSheet.length > 0) {
                    duplicateParts.push(`${duplicatesInSheet.length} ya existian en el sheet`);
                }

                if (duplicatesInFile.length > 0) {
                    duplicateParts.push(`${duplicatesInFile.length} venian duplicadas en el archivo`);
                }

                importMessage += ` ${duplicateParts.join('. ')}.`;
            }

            TintoreriaApp.showToast(importMessage, 'success', 'Importacion completada');
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo procesar el archivo Excel.', 'error', 'Importacion fallida');
        } finally {
            event.target.value = '';
        }
    }

    async function handleEditableChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        const recordId = target.dataset.recordId;
        const recordKey = target.dataset.recordKey || '';
        const field = target.dataset.field;
        if (!recordId || !field) {
            return;
        }

        const currentRecord = findMaestroRecord(recordId, recordKey);
        if (!currentRecord) {
            return;
        }

        let nextValue = target.value;

        if (field === 'ruta') {
            nextValue = ROUTE_OPTIONS.includes(nextValue) ? nextValue : '';
            if (nextValue) {
                const confirmed = await requestMaestroConfirmation();
                if (!confirmed) {
                    target.value = currentRecord.ruta || '';
                    return;
                }
            }
        } else {
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast('Solo se permite editar la ruta en Maestro.', 'error', 'Edicion no permitida');
            return;
        }

        if (String(currentRecord[field] || '') === String(nextValue || '')) {
            target.value = nextValue;
            return;
        }

        const changes = { [field]: nextValue };
        const previousRecords = TintoreriaApp.getRecords();
        const optimisticRecords = previousRecords.map((record) => {
            if (!isSameMaestroRecord(record, recordId, recordKey)) {
                return record;
            }

            return {
                ...record,
                ...changes
            };
        });

        target.value = nextValue;
        TintoreriaApp.setRecords(optimisticRecords, { preserveInteraction: false });

        try {
            const result = await TintoreriaAPI.updateRecord(recordId, changes, {
                match: {
                    record_key: recordKey
                }
            });

            if (result && result.record) {
                const confirmedRecords = TintoreriaApp.getRecords().map((record) => {
                    if (!isSameMaestroRecord(record, recordId, recordKey)) {
                        return record;
                    }

                    return {
                        ...record,
                        ...result.record
                    };
                });

                TintoreriaApp.setRecords(confirmedRecords, { preserveInteraction: false });
            }
        } catch (error) {
            TintoreriaApp.setRecords(previousRecords, { preserveInteraction: false });
            target.value = currentRecord[field] || '';
            TintoreriaApp.showToast(error.message || 'No se pudo guardar el cambio.', 'error', 'Error al guardar');
        }
    }

    function init() {
        const openButton = document.getElementById('btn-open-excel');
        const input = document.getElementById('excel-input');
        const tbody = document.getElementById('tbody-maestro');

        if (openButton && input) {
            openButton.addEventListener('click', () => input.click());
        }

        if (input) {
            input.addEventListener('change', handleExcelSelection);
        }

        if (tbody) {
            tbody.addEventListener('change', handleEditableChange);
        }
    }

    TintoreriaApp.registerView('maestro', {
        init,
        render(records, state) {
            const visibleRecords = TintoreriaUtils.filterRecordsForSearch(getVisibleRecords(records), state, 'maestro');
            renderMetrics(visibleRecords);
            renderTable(records, state);
        },
        count(records) {
            return getVisibleRecords(records).length;
        },
        locateRecord(record) {
            return shouldHideFromMaestro(record) ? null : {};
        }
    });
})();
