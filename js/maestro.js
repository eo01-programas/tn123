(() => {
    let maestroImportInProgress = false;

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
        const articulo = String(normalized.ARTICULO === undefined || normalized.ARTICULO === null ? '' : normalized.ARTICULO).trim();

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
            articulo,
            cod_color: String(normalized['COD. COLOR'] === undefined || normalized['COD. COLOR'] === null ? '' : normalized['COD. COLOR']).trim(),
            color: String(normalized.COLOR === undefined || normalized.COLOR === null ? '' : normalized.COLOR).trim(),
            peso_kg_crudo: TintoreriaUtils.parseNumericCell(normalized['PESO (KG)']),
            cantidad_crudo: String(normalized['CANT. (UND)'] === undefined || normalized['CANT. (UND)'] === null ? '' : normalized['CANT. (UND)']).trim(),
            tipo_guia: String(normalized['TIPO GUIA'] === undefined || normalized['TIPO GUIA'] === null ? '' : normalized['TIPO GUIA']).trim(),
            motivo_guia: String(normalized['MOTIVO TIPO GUIA'] === undefined || normalized['MOTIVO TIPO GUIA'] === null ? '' : normalized['MOTIVO TIPO GUIA']).trim(),
            reserva: String(normalized.RESERVA === undefined || normalized.RESERVA === null ? '' : normalized.RESERVA).trim(),
            certificado: String(normalized['O/P CERT.'] === undefined || normalized['O/P CERT.'] === null ? '' : normalized['O/P CERT.']).trim(),
            ruta: TintoreriaUtils.isSpandexArticle(articulo) ? 'Termofijado' : ''
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

    function buildImportIdentityKey(record) {
        return TintoreriaUtils.buildMaestroIdentityKey(
            record.tipo_tela,
            record.op_tela,
            record.partida,
            record.cod_art
        );
    }

    function normalizeColorValue(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    // La identidad de una partida es tipo_tela+op_tela+partida+cod_art (sin color).
    // Cuando esa combinacion se repite gana el ultimo ingresado, pero solo se
    // sobrescribe el color del registro que ya existe para no perder datos.
    function planImportedRecords(records, existingRecords) {
        const existingByIdentity = new Map();

        existingRecords.forEach((record) => {
            const key = buildImportIdentityKey(record);
            if (!key) {
                return;
            }

            const bucket = existingByIdentity.get(key);
            if (bucket) {
                bucket.push(record);
            } else {
                existingByIdentity.set(key, [record]);
            }
        });

        const directImports = [];
        const newByIdentity = new Map();
        const latestColorByIdentity = new Map();
        let collapsedInFile = 0;

        records.forEach((record) => {
            const key = buildImportIdentityKey(record);

            if (!key) {
                directImports.push(record);
                return;
            }

            if (existingByIdentity.has(key)) {
                if (latestColorByIdentity.has(key)) {
                    collapsedInFile += 1;
                }
                latestColorByIdentity.set(key, record.color);
                return;
            }

            if (newByIdentity.has(key)) {
                collapsedInFile += 1;
            }
            newByIdentity.set(key, record);
        });

        const colorUpdates = [];
        latestColorByIdentity.forEach((color, key) => {
            const nextColor = normalizeColorValue(color);
            existingByIdentity.get(key).forEach((existing) => {
                if (normalizeColorValue(existing.color) === nextColor) {
                    return;
                }
                colorUpdates.push({ record: existing, color: nextColor });
            });
        });

        return {
            recordsToImport: [...directImports, ...Array.from(newByIdentity.values())],
            colorUpdates,
            matchedInSheet: latestColorByIdentity.size,
            collapsedInFile
        };
    }

    async function applyColorUpdates(colorUpdates) {
        let updatedCount = 0;

        for (const update of colorUpdates) {
            const targetId = String(update.record.id_registro || '').trim();
            if (!targetId) {
                continue;
            }

            try {
                await TintoreriaAPI.updateRecord(targetId, { color: update.color }, {
                    match: {
                        record_key: TintoreriaUtils.buildRecordMatchKey(update.record)
                    }
                });
                updatedCount += 1;
            } catch (error) {
                console.error(error);
            }
        }

        return updatedCount;
    }

    function transformEntregaRow(row) {
        const normalized = normalizeSourceRow(row);
        const guia = normalized['O/P GUIA'];
        const { tipoTela, opTela } = TintoreriaUtils.extractTelaData(guia);

        if (!tipoTela || !opTela) {
            return null;
        }

        const partida = String(normalized['PARTIDA GUIA'] === undefined || normalized['PARTIDA GUIA'] === null ? '' : normalized['PARTIDA GUIA']).trim();
        const codArt = String(normalized['COD. ART.'] === undefined || normalized['COD. ART.'] === null ? '' : normalized['COD. ART.']).trim();
        const color = String(normalized.COLOR === undefined || normalized.COLOR === null ? '' : normalized.COLOR).trim();
        const fecha = TintoreriaUtils.parseExcelDate(normalized['FECHA EMBALAJE']);

        if (!partida || !fecha) {
            return null;
        }

        return {
            op_tela: opTela,
            partida,
            cod_art: codArt,
            color,
            fecha_entrega_tela_acabada: fecha
        };
    }

    async function handleEntregaExcelSelection(event) {
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

            const updates = rows
                .map(transformEntregaRow)
                .filter((update) => Boolean(update && update.fecha_entrega_tela_acabada));

            if (!updates.length) {
                TintoreriaApp.showToast('El archivo no contiene filas validas con fecha de entrega.', 'error', 'Archivo vacio');
                return;
            }

            const result = await TintoreriaAPI.updateFechaEntregaTelaAcabada(updates);
            await TintoreriaApp.refreshData({ silent: true });

            const parts = [`${result.updatedCount} registros actualizados.`];
            if (result.unmatchedCount > 0) {
                parts.push(`${result.unmatchedCount} sin coincidencia.`);
            }
            TintoreriaApp.showToast(parts.join(' '), 'success', 'Fecha entrega actualizada');
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo procesar el archivo.', 'error', 'Error al cargar');
        } finally {
            event.target.value = '';
        }
    }

    async function handleExcelSelection(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }

        if (maestroImportInProgress) {
            event.target.value = '';
            TintoreriaApp.showToast('Ya hay una importacion de Maestro en curso.', 'error', 'Importacion en proceso');
            return;
        }

        if (!window.XLSX) {
            TintoreriaApp.showToast('La libreria XLSX no esta disponible.', 'error', 'Importacion fallida');
            return;
        }

        maestroImportInProgress = true;

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
                colorUpdates,
                collapsedInFile
            } = planImportedRecords(transformed, TintoreriaApp.getRecords());

            const colorUpdatedCount = await applyColorUpdates(colorUpdates);

            let appended = [];
            if (recordsToImport.length) {
                appended = await TintoreriaApp.importRecords(recordsToImport);
            }

            if (colorUpdatedCount > 0) {
                await TintoreriaApp.refreshData({ silent: true });
            }

            renderMetrics(getVisibleRecords(TintoreriaApp.getRecords()));

            if (!appended.length && !colorUpdatedCount) {
                TintoreriaApp.showToast(
                    'No hubo cambios: las partidas del archivo ya estaban registradas con el mismo color.',
                    'error',
                    'Importacion sin cambios'
                );
                return;
            }

            const messageParts = [];
            if (appended.length) {
                messageParts.push(`Se importaron ${appended.length} filas.`);
            }
            if (colorUpdatedCount > 0) {
                messageParts.push(`${colorUpdatedCount} colores actualizados (ultimo ingresado).`);
            }
            if (collapsedInFile > 0) {
                messageParts.push(`${collapsedInFile} duplicados en el archivo colapsados.`);
            }

            TintoreriaApp.showToast(messageParts.join(' '), 'success', 'Importacion completada');
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo procesar el archivo Excel.', 'error', 'Importacion fallida');
        } finally {
            maestroImportInProgress = false;
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

    function openWithXlsx(button, fileInput) {
        if (window.XLSX) { fileInput.click(); return; }
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="ph ph-arrows-clockwise" style="display:inline-block;animation:spin 0.9s linear infinite;"></i> Cargando...';
        TintoreriaUtils.loadXLSX()
            .then(() => {
                button.innerHTML = original;
                button.disabled = false;
                fileInput.click();
            })
            .catch((err) => {
                button.innerHTML = original;
                button.disabled = false;
                TintoreriaApp.showToast(err.message, 'error', 'Error de carga');
            });
    }

    function init() {
        const openButton = document.getElementById('btn-open-excel');
        const input = document.getElementById('excel-input');
        const openEntregaButton = document.getElementById('btn-open-entrega-excel');
        const entregaInput = document.getElementById('excel-entrega-input');
        const tbody = document.getElementById('tbody-maestro');

        if (openButton && input) {
            openButton.addEventListener('click', () => openWithXlsx(openButton, input));
        }

        if (input) {
            input.addEventListener('change', handleExcelSelection);
        }

        if (openEntregaButton && entregaInput) {
            openEntregaButton.addEventListener('click', () => openWithXlsx(openEntregaButton, entregaInput));
        }

        if (entregaInput) {
            entregaInput.addEventListener('change', handleEntregaExcelSelection);
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
