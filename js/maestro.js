(() => {
    let maestroImportInProgress = false;

    // Deja respirar al navegador para que llegue a pintar el loader antes de
    // entrar en un tramo sincrono pesado (XLSX.read de un archivo grande
    // congela el hilo principal y sin esto el circulo no alcanza a aparecer).
    function nextFrame() {
        return new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            } else {
                setTimeout(resolve, 16);
            }
        });
    }

    function setImportUiBusy(isBusy) {
        ['btn-open-excel', 'btn-open-entrega-excel'].forEach((buttonId) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = isBusy;
            }
        });
    }

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

    // Antes esto mandaba un POST por color y en serie: con un Excel grande eran
    // cientos de peticiones, varios minutos sin ninguna senal en pantalla y los
    // fallos se tragaban en silencio. Ahora va por lotes y devuelve el detalle.
    async function applyColorUpdates(colorUpdates, onProgress) {
        const updates = colorUpdates
            .map((update) => {
                const targetId = String(update.record.id_registro || '').trim();
                if (!targetId) {
                    return null;
                }

                return {
                    id_registro: targetId,
                    changes: { color: update.color },
                    match: {
                        record_key: TintoreriaUtils.buildRecordMatchKey(update.record)
                    }
                };
            })
            .filter(Boolean);

        if (!updates.length) {
            return { updatedCount: 0, failedCount: 0 };
        }

        const result = await TintoreriaAPI.updateRecordsBatch(updates, { onProgress });

        return {
            updatedCount: result.updatedCount || 0,
            failedCount: result.failedCount || 0
        };
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

        if (maestroImportInProgress) {
            event.target.value = '';
            TintoreriaApp.showToast('Espera a que termine la carga en curso.', 'error', 'Carga en proceso');
            return;
        }

        if (!window.XLSX) {
            TintoreriaApp.showToast('La libreria XLSX no esta disponible.', 'error', 'Importacion fallida');
            return;
        }

        maestroImportInProgress = true;
        setImportUiBusy(true);

        try {
            await TintoreriaApp.runBlockingTask('Leyendo el archivo...', async ({ setMessage }) => {
                await nextFrame();

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

                setMessage(`Actualizando ${updates.length} fechas de entrega...`);
                const result = await TintoreriaAPI.updateFechaEntregaTelaAcabada(updates);

                setMessage('Sincronizando con la hoja...');
                await TintoreriaApp.refreshData({ silent: true });

                const parts = [`${result.updatedCount} registros actualizados.`];
                if (result.unmatchedCount > 0) {
                    parts.push(`${result.unmatchedCount} sin coincidencia.`);
                }
                TintoreriaApp.showToast(parts.join(' '), 'success', 'Fecha entrega actualizada');
            });
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo procesar el archivo.', 'error', 'Error al cargar');
        } finally {
            maestroImportInProgress = false;
            setImportUiBusy(false);
            event.target.value = '';
        }
    }

    // Cuenta cuantas identidades del archivo quedaron realmente en la hoja. Es
    // la unica forma honesta de saber si "se escapo" alguna fila: los contadores
    // que devuelve el servidor pueden quedarse cortos si un bloque se reenvio
    // despues de un timeout (la fila ya estaba escrita y el reintento la ve
    // como duplicada).
    function countMissingIdentities(fileIdentities) {
        const present = new Set();

        TintoreriaApp.getRecords().forEach((record) => {
            const key = buildImportIdentityKey(record);
            if (key) {
                present.add(key);
            }
        });

        let missing = 0;
        fileIdentities.forEach((key) => {
            if (!present.has(key)) {
                missing += 1;
            }
        });

        return missing;
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
        setImportUiBusy(true);

        try {
            await TintoreriaApp.runBlockingTask('Leyendo el archivo...', async ({ setMessage }) => {
                // Sin este respiro el XLSX.read de un archivo grande arranca
                // antes de que el navegador pinte el loader.
                await nextFrame();

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

                setMessage(`Preparando ${rows.length} filas...`);
                await nextFrame();

                const transformed = rows
                    .map(transformSourceRow)
                    .filter(Boolean);

                if (!transformed.length) {
                    TintoreriaApp.showToast('El archivo no contiene filas validas para importar.', 'error', 'Importacion vacia');
                    return;
                }

                const fileIdentities = new Set(
                    transformed.map(buildImportIdentityKey).filter(Boolean)
                );

                // Scope 'all' explicito: la deduplicacion y el recuento final
                // se comparan contra el historico completo. Con el scope activo
                // una partida ya embalada no se veria y se contaria como
                // perdida aunque estuviera en la hoja.
                setMessage('Consultando lo que ya esta en la hoja...');
                await TintoreriaApp.refreshData({ silent: true, scope: 'all' });

                const {
                    recordsToImport,
                    colorUpdates,
                    collapsedInFile
                } = planImportedRecords(transformed, TintoreriaApp.getRecords());

                let colorUpdatedCount = 0;
                let colorFailedCount = 0;

                if (colorUpdates.length) {
                    setMessage(`Actualizando ${colorUpdates.length} colores...`);
                    const colorResult = await applyColorUpdates(colorUpdates, (progress) => {
                        setMessage(`Actualizando colores ${progress.processed} de ${progress.total}...`);
                    });
                    colorUpdatedCount = colorResult.updatedCount;
                    colorFailedCount = colorResult.failedCount;
                }

                let appended = [];
                let appendFailedCount = 0;
                const appendErrors = [];

                if (recordsToImport.length) {
                    setMessage(`Subiendo 0 de ${recordsToImport.length} filas...`);

                    const importResult = await TintoreriaApp.importRecords(recordsToImport, {
                        message: `Subiendo 0 de ${recordsToImport.length} filas...`,
                        onProgress: (progress) => {
                            if (progress.retrying) {
                                setMessage(`Reintentando bloque ${progress.chunkIndex + 1} de ${progress.chunkCount}...`);
                                return;
                            }
                            setMessage(`Subiendo ${progress.processed} de ${progress.total} filas...`);
                        }
                    });

                    appended = importResult.records || [];
                    appendFailedCount = importResult.failedCount || 0;
                    (importResult.errors || []).forEach((message) => appendErrors.push(message));
                }

                setMessage('Verificando que todo quedo guardado...');
                await TintoreriaApp.refreshData({ silent: true, scope: 'all' });

                const missing = countMissingIdentities(fileIdentities);

                renderMetrics(getVisibleRecords(TintoreriaApp.getRecords()));

                if (appendFailedCount > 0 || colorFailedCount > 0 || missing > 0) {
                    const failParts = [];
                    if (missing > 0) {
                        failParts.push(`${missing} de ${fileIdentities.size} partidas del archivo NO quedaron guardadas.`);
                    }
                    if (colorFailedCount > 0) {
                        failParts.push(`${colorFailedCount} colores no se pudieron actualizar.`);
                    }
                    if (appended.length) {
                        failParts.push(`Si se guardaron ${appended.length} filas.`);
                    }
                    failParts.push('Vuelve a cargar el mismo archivo para completar lo que falta.');

                    console.error('Errores de importacion:', appendErrors);
                    TintoreriaApp.showToast(failParts.join(' '), 'error', 'Importacion incompleta');
                    return;
                }

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
            });
        } catch (error) {
            console.error(error);
            TintoreriaApp.showToast(error.message || 'No se pudo procesar el archivo Excel.', 'error', 'Importacion fallida');
        } finally {
            maestroImportInProgress = false;
            setImportUiBusy(false);
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
