(() => {
    const STOCK_AREAS = [
        {
            id: 'plegado',
            label: 'Plegado',
            shortLabel: 'Pleg.',
            isEligible(record) {
                const ruta = String(record.ruta || '').trim();
                const state = normalizeProcessState(record.plegado_estado);
                return (ruta === 'Termoficado' || ruta === 'Humectado') && state !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.plegado_estado) === 'PROG';
            }
        },
        {
            id: 'rama-crudo',
            label: 'Rama Crudo',
            shortLabel: 'R. Crudo',
            isEligible(record) {
                return String(record.plegado_estado || '').trim() === 'OK'
                    && normalizeProcessState(record.rama_crudo_estado) !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.rama_crudo_estado) === 'PROG';
            }
        },
        {
            id: 'preparado',
            label: 'Preparado',
            shortLabel: 'Prepar.',
            isEligible(record) {
                const preparadoState = normalizeProcessState(record.preparado_estado);
                if (preparadoState === 'OK') {
                    return false;
                }

                return String(record.rama_crudo_estado || '').trim() === 'OK'
                    || String(record.ruta || '').trim() === 'Directo';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.preparado_estado) === 'PROG';
            }
        },
        {
            id: 'tenido',
            label: 'Tenido',
            shortLabel: 'Tenido',
            isEligible(record) {
                return String(record.preparado_estado || '').trim() === 'OK'
                    && normalizeProcessState(record.tenido_estado) !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.tenido_estado) === 'PROG';
            }
        },
        {
            id: 'abridora',
            label: 'Abridora',
            shortLabel: 'Abrid.',
            isEligible(record) {
                return String(record.tenido_estado || '').trim() === 'OK'
                    && normalizeProcessState(record.abridora_estado) !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.abridora_estado) === 'PROG';
            }
        },
        {
            id: 'rama-tenido',
            label: 'Rama Tenido',
            shortLabel: 'R. Ten.',
            isEligible(record) {
                return String(record.abridora_estado || '').trim() === 'OK'
                    && normalizeProcessState(record.rama_tenido_estado) !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.rama_tenido_estado) === 'PROG';
            }
        },
        {
            id: 'acab-espec',
            label: 'Acab Espec.',
            shortLabel: 'Acab.',
            isEligible(record) {
                const acabadoTipo = getAcabadoEspecialTipo(record);
                if (acabadoTipo.toUpperCase() === 'NO LLEVA') {
                    return false;
                }

                const acabadoState = normalizeAcabadoEspecialState(record);
                if (acabadoState === 'OK') {
                    return false;
                }

                return String(record.rama_tenido_estado || '').trim() === 'OK'
                    || Boolean(acabadoTipo);
            },
            isProgrammed(record) {
                return normalizeAcabadoEspecialState(record) === 'PROG';
            }
        },
        {
            id: 'calidad',
            label: 'Calidad',
            shortLabel: 'Calid.',
            isEligible(record) {
                return isReadyForCalidad(record)
                    && normalizeProcessState(record.calidad_estado) !== 'OK';
            },
            isProgrammed(record) {
                return normalizeProcessState(record.calidad_estado) !== 'X PROG';
            }
        },
        {
            id: 'embalaje',
            label: 'Embalaje',
            shortLabel: 'Embal.',
            isEligible(record) {
                return String(record.calidad_estado || '').trim() === 'OK'
                    && String(record.embalaje_estado || '').trim() !== 'OK';
            },
            isProgrammed() {
                return true;
            }
        }
    ];

    let resizeFrame = 0;
    let currentArticleTypeFilter = 'all';
    let currentTypeTelaFilter = 'all';
    let currentClientFilter = 'all';
    let tooltipState = {
        entries: {},
        activeKey: ''
    };
    const RECTILINEAR_KEYWORDS = ['CUELLO', 'CUELLOS', 'PUNO', 'PUNOS', 'PRETINA', 'PRETINAS'];
    const CALIDAD_UNPROGRAMMED_STATES = new Set(['', 'X PROG']);
    const CALIDAD_REJECTED_STATE = 'RECHAZADO';
    const TYPE_TELA_LABELS = {
        '100': 'Produccion',
        '102': 'Tela para Venta',
        '103': 'Desarrollo (OF)',
        '104': 'Prueba de lote',
        '105': 'Prueba validacion de articulo',
        '106': 'Prueba validacion de teñido/disperso',
        '107': 'Muestra de Venta',
        '108': 'Tela de relleno',
        '109': 'Prueba de tela/Fundas'
    };

    function normalizeProcessState(value, fallback = 'X PROG') {
        return String(value || fallback).trim() || fallback;
    }

    function normalizeCalidadState(value) {
        return String(value || '').trim().toUpperCase();
    }

    function normalizeAcabadoEspecialState(record) {
        return String(record.acabado_especial_estado || record.acab_espec_estado || 'X PROG').trim() || 'X PROG';
    }

    function getAcabadoEspecialTipo(record) {
        return String(record.acabado_especial_tipo || '').trim();
    }

    function isReadyForCalidad(record) {
        const acabadoTipo = getAcabadoEspecialTipo(record);
        const acabadoEstado = String(record.acabado_especial_estado || record.acab_espec_estado || '').trim();

        return acabadoTipo === 'NO LLEVA'
            || acabadoTipo === 'OK'
            || acabadoEstado === 'OK';
    }

    function normalizeArticleText(value) {
        return String(value === undefined || value === null ? '' : value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim();
    }

    function isRectilinearArticle(record) {
        const normalizedArticle = normalizeArticleText(record && record.articulo);
        if (!normalizedArticle) {
            return false;
        }

        return RECTILINEAR_KEYWORDS.some((keyword) => normalizedArticle.includes(keyword));
    }

    function matchesArticleTypeFilter(record) {
        if (currentArticleTypeFilter === 'rectilineos') {
            return isRectilinearArticle(record);
        }

        if (currentArticleTypeFilter === 'no-rectilineos') {
            return !isRectilinearArticle(record);
        }

        return true;
    }

    function normalizeTypeTelaValue(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function normalizeClientValue(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function matchesTypeTelaFilter(record) {
        if (currentTypeTelaFilter === 'all') {
            return true;
        }

        return normalizeTypeTelaValue(record && record.tipo_tela) === currentTypeTelaFilter;
    }

    function matchesClientFilter(record) {
        if (currentClientFilter === 'all') {
            return true;
        }

        return normalizeClientValue(record && record.cliente) === currentClientFilter;
    }

    function matchesStockFilters(record) {
        return matchesArticleTypeFilter(record) && matchesTypeTelaFilter(record) && matchesClientFilter(record);
    }

    function getArticleTypeFilterLabel() {
        if (currentArticleTypeFilter === 'rectilineos') {
            return 'Rectilineos';
        }

        if (currentArticleTypeFilter === 'no-rectilineos') {
            return 'No rectilineos';
        }

        return 'Todos';
    }

    function getTypeTelaFilterLabel() {
        if (currentTypeTelaFilter === 'all') {
            return 'Todos';
        }

        return currentTypeTelaFilter;
    }

    function getClientFilterLabel() {
        if (currentClientFilter === 'all') {
            return 'Todos';
        }

        return currentClientFilter;
    }

    function formatTypeTelaOptionLabel(value) {
        const normalizedValue = normalizeTypeTelaValue(value);
        if (!normalizedValue) {
            return '';
        }

        const description = TYPE_TELA_LABELS[normalizedValue];
        return description ? `${normalizedValue} → ${description}` : normalizedValue;
    }

    function updateChartSubtitle() {
        const subtitle = document.getElementById('stock-chart-subtitle');
        if (!(subtitle instanceof HTMLElement)) {
            return;
        }

        subtitle.textContent = `Tipo articulo: ${getArticleTypeFilterLabel()} | Tipo tela: ${getTypeTelaFilterLabel()} | Cliente: ${getClientFilterLabel()}`;
    }

    function getUniqueTypeTelaValues(records) {
        const values = new Set();

        (records || []).forEach((record) => {
            const value = normalizeTypeTelaValue(record && record.tipo_tela);
            if (value) {
                values.add(value);
            }
        });

        return Array.from(values).sort((left, right) => Number(left) - Number(right));
    }

    function getUniqueClientValues(records) {
        const values = new Set();

        (records || []).forEach((record) => {
            const value = normalizeClientValue(record && record.cliente);
            if (value) {
                values.add(value);
            }
        });

        return Array.from(values).sort((left, right) => left.localeCompare(right, 'es', {
            numeric: true,
            sensitivity: 'base'
        }));
    }

    function buildTypeTelaOptionsMarkup(selectedValue, values) {
        const optionValues = [...values];
        if (selectedValue && selectedValue !== 'all' && !optionValues.includes(selectedValue)) {
            optionValues.push(selectedValue);
        }

        return [
            `<option value="all"${selectedValue === 'all' ? ' selected' : ''}>Todos</option>`,
            ...optionValues.map((value) => `<option value="${TintoreriaUtils.escapeHtml(value)}"${selectedValue === value ? ' selected' : ''}>${TintoreriaUtils.escapeHtml(formatTypeTelaOptionLabel(value))}</option>`)
        ].join('');
    }

    function buildClientOptionsMarkup(selectedValue, values) {
        const optionValues = [...values];
        if (selectedValue && selectedValue !== 'all' && !optionValues.includes(selectedValue)) {
            optionValues.push(selectedValue);
        }

        return [
            `<option value="all"${selectedValue === 'all' ? ' selected' : ''}>Todos</option>`,
            ...optionValues.map((value) => `<option value="${TintoreriaUtils.escapeHtml(value)}"${selectedValue === value ? ' selected' : ''}>${TintoreriaUtils.escapeHtml(value)}</option>`)
        ].join('');
    }

    function syncStockFilterOptions(records) {
        const articleFilteredRecords = (records || []).filter((record) => matchesArticleTypeFilter(record));
        const typeTelaContextRecords = articleFilteredRecords.filter((record) => matchesClientFilter(record));
        const availableTypeTelaValues = getUniqueTypeTelaValues(typeTelaContextRecords);

        if (currentTypeTelaFilter !== 'all' && !availableTypeTelaValues.includes(currentTypeTelaFilter)) {
            currentTypeTelaFilter = 'all';
        }

        const clientContextRecords = articleFilteredRecords.filter((record) => matchesTypeTelaFilter(record));
        const availableClientValues = getUniqueClientValues(clientContextRecords);

        if (currentClientFilter !== 'all' && !availableClientValues.includes(currentClientFilter)) {
            currentClientFilter = 'all';
        }

        const typeTelaSelect = document.getElementById('stock-type-tela-filter');
        if (typeTelaSelect instanceof HTMLSelectElement) {
            typeTelaSelect.innerHTML = buildTypeTelaOptionsMarkup(currentTypeTelaFilter, availableTypeTelaValues);
            typeTelaSelect.value = currentTypeTelaFilter;
        }

        const clientSelect = document.getElementById('stock-client-filter');
        if (clientSelect instanceof HTMLSelectElement) {
            clientSelect.innerHTML = buildClientOptionsMarkup(currentClientFilter, availableClientValues);
            clientSelect.value = currentClientFilter;
        }

        const articleSelect = document.getElementById('stock-article-type-filter');
        if (articleSelect instanceof HTMLSelectElement) {
            articleSelect.value = currentArticleTypeFilter;
        }
    }

    function sumRecordWeight(records) {
        return (records || []).reduce((total, record) => total + TintoreriaUtils.toNumber(record.peso_kg_crudo), 0);
    }

    function buildClientBreakdown(records) {
        const totalsByClient = new Map();

        (records || []).forEach((record) => {
            const client = String(record && record.cliente || '').trim() || 'SIN CLIENTE';
            const weight = TintoreriaUtils.toNumber(record && record.peso_kg_crudo);

            if (weight <= 0) {
                return;
            }

            totalsByClient.set(client, (totalsByClient.get(client) || 0) + weight);
        });

        const totalWeight = Array.from(totalsByClient.values()).reduce((sum, value) => sum + value, 0);

        return Array.from(totalsByClient.entries())
            .map(([client, weight]) => ({
                client,
                weight,
                percentage: totalWeight > 0 ? (weight / totalWeight) * 100 : 0
            }))
            .sort((left, right) => {
                if (right.weight !== left.weight) {
                    return right.weight - left.weight;
                }

                return left.client.localeCompare(right.client, 'es');
            });
    }

    function buildStockDataset(records) {
        const filteredByFilters = (records || []).filter((record) => matchesStockFilters(record));

        return STOCK_AREAS.map((area) => {
            const eligibleRecords = filteredByFilters.filter((record) => area.isEligible(record));
            let porProgramarRecords = [];
            let programadoRecords = [];
            let rejectedRecords = [];

            if (area.id === 'embalaje') {
                programadoRecords = eligibleRecords;
            } else if (area.id === 'calidad') {
                rejectedRecords = eligibleRecords.filter((record) => (
                    normalizeCalidadState(record.calidad_estado) === CALIDAD_REJECTED_STATE
                ));
                porProgramarRecords = [];
                programadoRecords = eligibleRecords.filter((record) => (
                    normalizeCalidadState(record.calidad_estado) !== CALIDAD_REJECTED_STATE
                ));
            } else {
                porProgramarRecords = eligibleRecords.filter((record) => !area.isProgrammed(record));
                programadoRecords = eligibleRecords.filter((record) => area.isProgrammed(record));
            }

            return {
                id: area.id,
                label: area.label,
                xprog: sumRecordWeight(porProgramarRecords),
                prog: sumRecordWeight(programadoRecords),
                rejected: sumRecordWeight(rejectedRecords),
                xprogBreakdown: buildClientBreakdown(porProgramarRecords),
                progBreakdown: buildClientBreakdown(programadoRecords),
                rejectedBreakdown: buildClientBreakdown(rejectedRecords)
            };
        });
    }

    function formatKg(value) {
        return `${TintoreriaUtils.formatNumber(value)}kg`;
    }

    function formatPercentage(value) {
        return `${TintoreriaUtils.toNumber(value).toLocaleString('es-PE', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })}%`;
    }

    function getNiceMax(value) {
        if (value <= 0) {
            return 1;
        }

        const exponent = Math.pow(10, Math.floor(Math.log10(value)));
        const fraction = value / exponent;

        if (fraction <= 1) {
            return exponent;
        }

        if (fraction <= 2) {
            return 2 * exponent;
        }

        if (fraction <= 5) {
            return 5 * exponent;
        }

        return 10 * exponent;
    }

    function splitAxisLabel(label) {
        const words = String(label || '').trim().split(/\s+/).filter(Boolean);
        if (words.length <= 1) {
            return words;
        }

        if (words.length === 2) {
            return words;
        }

        const midpoint = Math.ceil(words.length / 2);
        return [
            words.slice(0, midpoint).join(' '),
            words.slice(midpoint).join(' ')
        ];
    }

    function formatCompactBarValue(value) {
        const numericValue = TintoreriaUtils.toNumber(value);
        if (numericValue >= 1000000) {
            return `${trimCompactDecimals(numericValue / 1000000)}M`;
        }

        if (numericValue >= 1000) {
            return `${trimCompactDecimals(numericValue / 1000)}k`;
        }

        return TintoreriaUtils.formatNumber(numericValue, 0);
    }

    function trimCompactDecimals(value) {
        return value
            .toFixed(value >= 10 ? 0 : 1)
            .replace(/\.0$/, '');
    }

    function formatBarLabelValue(value, compactMode) {
        return compactMode
            ? formatCompactBarValue(value)
            : TintoreriaUtils.formatNumber(value, 0);
    }

    function renderAxisLabel(x, y, label, compactMode = false) {
        const lines = splitAxisLabel(label);
        const firstLineY = y - ((lines.length - 1) * 6);
        const className = compactMode ? 'group-label group-label-compact' : 'group-label';

        return `
            <text class="${className}" text-anchor="middle">
                ${lines.map((line, index) => `
                    <tspan x="${x}" y="${firstLineY + (index * 14)}">${TintoreriaUtils.escapeHtml(line)}</tspan>
                `).join('')}
            </text>
        `;
    }

    function renderRoundedTopBar(x, y, width, height, className, title, radius = 8, tooltipKey = '') {
        const safeHeight = Math.max(0, height);
        const safeRadius = Math.min(radius, width / 2, safeHeight);

        if (safeHeight <= 0) {
            return '';
        }

        return `
            <path
                class="${className}"
                ${tooltipKey ? `data-tooltip-key="${TintoreriaUtils.escapeHtml(tooltipKey)}"` : ''}
                aria-label="${TintoreriaUtils.escapeHtml(title)}"
                d="M ${x} ${y + safeHeight} L ${x} ${y + safeRadius} Q ${x} ${y} ${x + safeRadius} ${y} L ${x + width - safeRadius} ${y} Q ${x + width} ${y} ${x + width} ${y + safeRadius} L ${x + width} ${y + safeHeight} Z"
            ></path>
        `;
    }

    function renderRectBar(x, y, width, height, className, title, tooltipKey = '') {
        const safeHeight = Math.max(0, height);

        if (safeHeight <= 0) {
            return '';
        }

        return `
            <rect
                class="${className}"
                x="${x}"
                y="${y}"
                width="${width}"
                height="${safeHeight}"
                ${tooltipKey ? `data-tooltip-key="${TintoreriaUtils.escapeHtml(tooltipKey)}"` : ''}
                aria-label="${TintoreriaUtils.escapeHtml(title)}"
            ></rect>
        `;
    }

    function renderChart(dataset) {
        const svg = document.getElementById('stock-chart');
        if (!(svg instanceof SVGElement)) {
            return;
        }

        const host = svg.parentElement;
        const height = 430;
        const margin = {
            top: 24,
            right: 22,
            bottom: 64,
            left: 28
        };
        const hostWidth = host && host.clientWidth ? host.clientWidth : 0;
        const width = Math.max(280, hostWidth - 4);
        const plotWidth = Math.max(180, width - margin.left - margin.right);
        const plotHeight = height - margin.top - margin.bottom;
        const maxValue = dataset.reduce((peak, item) => Math.max(peak, item.xprog + item.prog + (item.rejected || 0)), 0);
        const yMax = getNiceMax(maxValue);
        const tickCount = 4;
        const groupWidth = plotWidth / Math.max(dataset.length, 1);
        const compactMode = groupWidth < 64;
        const barWidth = Math.max(18, Math.min(62, groupWidth - (compactMode ? 4 : 8)));
        const tooltipEntries = {};

        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));

        const scaleY = (value) => margin.top + plotHeight - ((value / yMax) * plotHeight);
        const axisBottom = margin.top + plotHeight;

        const gridMarkup = Array.from({ length: tickCount + 1 }, (_, index) => {
            const tickValue = (yMax / tickCount) * index;
            const y = scaleY(tickValue);

            return `
                <line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
            `;
        }).join('');

        const barsMarkup = dataset.map((item, index) => {
            const groupCenter = margin.left + (groupWidth * index) + (groupWidth / 2);
            const rejectedValue = item.rejected || 0;
            const totalValue = item.xprog + item.prog + rejectedValue;
            const totalHeight = totalValue > 0 ? ((totalValue / yMax) * plotHeight) : 0;
            const xprogHeight = item.xprog > 0 ? ((item.xprog / yMax) * plotHeight) : 0;
            const progHeight = item.prog > 0 ? ((item.prog / yMax) * plotHeight) : 0;
            const rejectedHeight = rejectedValue > 0 ? ((rejectedValue / yMax) * plotHeight) : 0;
            const barX = groupCenter - (barWidth / 2);
            const progY = axisBottom - progHeight;
            const xprogY = progY - xprogHeight;
            const rejectedY = xprogY - rejectedHeight;
            const totalY = axisBottom - totalHeight;
            const progTitle = `${item.label} - Programado: ${formatKg(item.prog)}`;
            const xprogTitle = `${item.label} - Por Programar: ${formatKg(item.xprog)}`;
            const rejectedTitle = `${item.label} - Rechazos: ${formatKg(rejectedValue)}`;
            const progTooltipKey = `${item.id}-prog`;
            const xprogTooltipKey = `${item.id}-xprog`;
            const rejectedTooltipKey = `${item.id}-rejected`;

            if (item.prog > 0) {
                tooltipEntries[progTooltipKey] = {
                    title: `PROG ${formatKg(item.prog)}`,
                    breakdown: item.progBreakdown
                };
            }

            if (item.xprog > 0) {
                tooltipEntries[xprogTooltipKey] = {
                    title: `X PROG ${formatKg(item.xprog)}`,
                    breakdown: item.xprogBreakdown
                };
            }

            if (rejectedValue > 0) {
                tooltipEntries[rejectedTooltipKey] = {
                    title: `RECHAZOS ${formatKg(rejectedValue)}`,
                    breakdown: item.rejectedBreakdown
                };
            }

            const topSegment = rejectedValue > 0
                ? 'rejected'
                : (item.xprog > 0 ? 'xprog' : (item.prog > 0 ? 'prog' : ''));

            const progMarkup = item.prog > 0
                ? (topSegment === 'prog'
                    ? renderRoundedTopBar(barX, progY, barWidth, progHeight, 'bar-prog', progTitle, 8, progTooltipKey)
                    : renderRectBar(barX, progY, barWidth, progHeight, 'bar-prog', progTitle, progTooltipKey))
                : '';

            const xprogMarkup = item.xprog > 0
                ? (topSegment === 'xprog'
                    ? renderRoundedTopBar(barX, xprogY, barWidth, xprogHeight, 'bar-xprog', xprogTitle, 8, xprogTooltipKey)
                    : renderRectBar(barX, xprogY, barWidth, xprogHeight, 'bar-xprog', xprogTitle, xprogTooltipKey))
                : '';

            const rejectedMarkup = rejectedValue > 0
                ? renderRoundedTopBar(barX, rejectedY, barWidth, rejectedHeight, 'bar-rejected', rejectedTitle, 8, rejectedTooltipKey)
                : '';

            const progLabelMarkup = item.prog > 0 && progHeight >= (compactMode ? 18 : 22)
                ? `
                    <text class="${compactMode ? 'bar-segment-label bar-segment-label-compact' : 'bar-segment-label'}" x="${groupCenter}" y="${progY + (progHeight / 2) + 4}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(formatBarLabelValue(item.prog, compactMode))}
                    </text>
                `
                : '';

            const xprogLabelMarkup = item.xprog > 0 && xprogHeight >= (compactMode ? 18 : 22)
                ? `
                    <text class="${compactMode ? 'bar-segment-label bar-segment-label-compact' : 'bar-segment-label'}" x="${groupCenter}" y="${xprogY + (xprogHeight / 2) + 4}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(formatBarLabelValue(item.xprog, compactMode))}
                    </text>
                `
                : '';

            const rejectedLabelMarkup = rejectedValue > 0 && rejectedHeight >= (compactMode ? 18 : 22)
                ? `
                    <text class="${compactMode ? 'bar-segment-label bar-segment-label-compact' : 'bar-segment-label'}" x="${groupCenter}" y="${rejectedY + (rejectedHeight / 2) + 4}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(formatBarLabelValue(rejectedValue, compactMode))}
                    </text>
                `
                : '';

            const totalLabelMarkup = totalValue > 0
                ? `
                    <text class="${compactMode ? 'bar-total-label bar-total-label-compact' : 'bar-total-label'}" x="${groupCenter}" y="${totalY - 10}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(formatBarLabelValue(totalValue, compactMode))}
                    </text>
                `
                : '';

            return `
                <g>
                    ${progMarkup}
                    ${xprogMarkup}
                    ${rejectedMarkup}
                    ${progLabelMarkup}
                    ${xprogLabelMarkup}
                    ${rejectedLabelMarkup}
                    ${totalLabelMarkup}
                    ${renderAxisLabel(groupCenter, axisBottom + 20, compactMode ? item.shortLabel || item.label : item.label, compactMode)}
                </g>
            `;
        }).join('');

        svg.innerHTML = `
            <title>Stock de Tintoreria de telas</title>
            <desc>Grafico de barras apiladas por proceso, separado entre Programado, Por Programar y Rechazos en Calidad, filtrado por tipo articulo, tipo tela y cliente.</desc>
            ${gridMarkup}
            <line class="axis-line" x1="${margin.left}" y1="${axisBottom}" x2="${width - margin.right}" y2="${axisBottom}"></line>
            ${barsMarkup}
        `;

        tooltipState.entries = tooltipEntries;
    }

    function renderStockView(records) {
        hideTooltip();
        syncStockFilterOptions(records);
        updateChartSubtitle();
        const dataset = buildStockDataset(records);
        renderChart(dataset);
    }

    function goToStockView() {
        TintoreriaApp.switchView('stock', { clearSearch: false });
    }

    function bindArticleTypeFilter() {
        const filterSelect = document.getElementById('stock-article-type-filter');
        if (!(filterSelect instanceof HTMLSelectElement)) {
            return;
        }

        filterSelect.value = currentArticleTypeFilter;
        filterSelect.addEventListener('change', () => {
            currentArticleTypeFilter = filterSelect.value || 'all';
            renderStockView(TintoreriaApp.getRecords());
        });
    }

    function bindTypeTelaFilter() {
        const filterSelect = document.getElementById('stock-type-tela-filter');
        if (!(filterSelect instanceof HTMLSelectElement)) {
            return;
        }

        filterSelect.value = currentTypeTelaFilter;
        filterSelect.addEventListener('change', () => {
            currentTypeTelaFilter = filterSelect.value || 'all';
            renderStockView(TintoreriaApp.getRecords());
        });
    }

    function bindClientFilter() {
        const filterSelect = document.getElementById('stock-client-filter');
        if (!(filterSelect instanceof HTMLSelectElement)) {
            return;
        }

        filterSelect.value = currentClientFilter;
        filterSelect.addEventListener('change', () => {
            currentClientFilter = filterSelect.value || 'all';
            renderStockView(TintoreriaApp.getRecords());
        });
    }

    function renderTooltipContent(entry) {
        if (!entry) {
            return '';
        }

        const rowsMarkup = (entry.breakdown || []).map((item) => `
            <div class="stock-tooltip-row">
                <span class="stock-tooltip-client">${TintoreriaUtils.escapeHtml(item.client)}</span>
                <span class="stock-tooltip-value">${TintoreriaUtils.escapeHtml(`${formatKg(item.weight)} (${formatPercentage(item.percentage)})`)}</span>
            </div>
        `).join('');

        return `
            <div class="stock-tooltip-title">${TintoreriaUtils.escapeHtml(entry.title)}</div>
            <div class="stock-tooltip-subtitle">Por Cliente:</div>
            <div class="stock-tooltip-list">
                ${rowsMarkup || '<div class="stock-tooltip-row"><span class="stock-tooltip-client">Sin datos</span></div>'}
            </div>
        `;
    }

    function hideTooltip() {
        const tooltip = document.getElementById('stock-chart-tooltip');
        if (!(tooltip instanceof HTMLElement)) {
            return;
        }

        tooltip.classList.add('hidden');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltipState.activeKey = '';
    }

    function positionTooltip(event, tooltip) {
        const offset = 16;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        let left = event.clientX + offset;
        let top = event.clientY + offset;

        if (left + tooltipWidth > viewportWidth - 12) {
            left = Math.max(12, event.clientX - tooltipWidth - offset);
        }

        if (top + tooltipHeight > viewportHeight - 12) {
            top = Math.max(12, viewportHeight - tooltipHeight - 12);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function showTooltip(event, tooltipKey) {
        const tooltip = document.getElementById('stock-chart-tooltip');
        const entry = tooltipState.entries[tooltipKey];
        if (!(tooltip instanceof HTMLElement) || !entry) {
            return;
        }

        if (tooltipState.activeKey !== tooltipKey) {
            tooltip.innerHTML = renderTooltipContent(entry);
            tooltipState.activeKey = tooltipKey;
        }

        tooltip.classList.remove('hidden');
        tooltip.setAttribute('aria-hidden', 'false');
        positionTooltip(event, tooltip);
    }

    function bindTooltipEvents() {
        const svg = document.getElementById('stock-chart');
        if (!(svg instanceof SVGElement)) {
            return;
        }

        svg.addEventListener('mousemove', (event) => {
            const target = event.target;
            if (!(target instanceof SVGElement)) {
                hideTooltip();
                return;
            }

            const tooltipKey = String(target.dataset.tooltipKey || '').trim();
            if (!tooltipKey) {
                hideTooltip();
                return;
            }

            showTooltip(event, tooltipKey);
        });

        svg.addEventListener('mouseleave', () => {
            hideTooltip();
        });
    }

    function syncOnResize() {
        if (TintoreriaApp.state.activeView !== 'stock') {
            return;
        }

        hideTooltip();
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
            renderStockView(TintoreriaApp.getRecords());
        });
    }

    function init() {
        const openButton = document.getElementById('btn-open-stock');

        if (openButton) {
            openButton.addEventListener('click', goToStockView);
        }

        bindArticleTypeFilter();
        bindTypeTelaFilter();
        bindClientFilter();
        bindTooltipEvents();
        document.addEventListener('click', hideTooltip);
        window.addEventListener('resize', syncOnResize);
    }

    TintoreriaApp.registerView('stock', {
        init,
        render(records) {
            renderStockView(records);
        }
    });
})();
