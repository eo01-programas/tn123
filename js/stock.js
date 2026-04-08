(() => {
    const STOCK_AREAS = [
        {
            id: 'plegado',
            label: 'Plegado',
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

    function normalizeProcessState(value, fallback = 'X PROG') {
        return String(value || fallback).trim() || fallback;
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

    function sumRecordWeight(records) {
        return (records || []).reduce((total, record) => total + TintoreriaUtils.toNumber(record.peso_kg_crudo), 0);
    }

    function buildStockDataset(records) {
        return STOCK_AREAS.map((area) => {
            const eligibleRecords = (records || []).filter((record) => area.isEligible(record));
            const porProgramarRecords = area.id === 'embalaje'
                ? []
                : eligibleRecords.filter((record) => !area.isProgrammed(record));
            const programadoRecords = area.id === 'embalaje'
                ? eligibleRecords
                : eligibleRecords.filter((record) => area.isProgrammed(record));

            return {
                id: area.id,
                label: area.label,
                xprog: sumRecordWeight(porProgramarRecords),
                prog: sumRecordWeight(programadoRecords)
            };
        });
    }

    function formatKg(value) {
        return `${TintoreriaUtils.formatNumber(value)}kg`;
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

    function renderAxisLabel(x, y, label) {
        const lines = splitAxisLabel(label);
        const firstLineY = y - ((lines.length - 1) * 6);

        return `
            <text class="group-label" text-anchor="middle">
                ${lines.map((line, index) => `
                    <tspan x="${x}" y="${firstLineY + (index * 14)}">${TintoreriaUtils.escapeHtml(line)}</tspan>
                `).join('')}
            </text>
        `;
    }

    function renderRoundedTopBar(x, y, width, height, className, title, radius = 8) {
        const safeHeight = Math.max(0, height);
        const safeRadius = Math.min(radius, width / 2, safeHeight);

        if (safeHeight <= 0) {
            return '';
        }

        return `
            <path
                class="${className}"
                d="M ${x} ${y + safeHeight} L ${x} ${y + safeRadius} Q ${x} ${y} ${x + safeRadius} ${y} L ${x + width - safeRadius} ${y} Q ${x + width} ${y} ${x + width} ${y + safeRadius} L ${x + width} ${y + safeHeight} Z"
            >
                <title>${TintoreriaUtils.escapeHtml(title)}</title>
            </path>
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
            bottom: 96,
            left: 28
        };
        const minChartWidth = margin.left + margin.right + (dataset.length * 104);
        const width = Math.max(minChartWidth, (host && host.clientWidth ? host.clientWidth : 0) - 4);
        const plotWidth = Math.max(180, width - margin.left - margin.right);
        const plotHeight = height - margin.top - margin.bottom;
        const maxValue = dataset.reduce((peak, item) => Math.max(peak, item.xprog + item.prog), 0);
        const yMax = getNiceMax(maxValue);
        const tickCount = 4;
        const groupWidth = plotWidth / Math.max(dataset.length, 1);
        const barWidth = Math.max(30, Math.min(64, groupWidth - 24));

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
            const totalValue = item.xprog + item.prog;
            const totalHeight = totalValue > 0 ? ((totalValue / yMax) * plotHeight) : 0;
            const xprogHeight = item.xprog > 0 ? ((item.xprog / yMax) * plotHeight) : 0;
            const progHeight = item.prog > 0 ? ((item.prog / yMax) * plotHeight) : 0;
            const barX = groupCenter - (barWidth / 2);
            const progY = axisBottom - progHeight;
            const xprogY = progY - xprogHeight;
            const totalY = axisBottom - totalHeight;
            const progTitle = `${item.label} - Programado: ${formatKg(item.prog)}`;
            const xprogTitle = `${item.label} - Por Programar: ${formatKg(item.xprog)}`;

            const progMarkup = item.prog > 0
                ? (item.xprog > 0
                    ? `
                        <rect class="bar-prog" x="${barX}" y="${progY}" width="${barWidth}" height="${progHeight}">
                            <title>${TintoreriaUtils.escapeHtml(progTitle)}</title>
                        </rect>
                    `
                    : renderRoundedTopBar(barX, progY, barWidth, progHeight, 'bar-prog', progTitle))
                : '';

            const xprogMarkup = item.xprog > 0
                ? renderRoundedTopBar(barX, xprogY, barWidth, xprogHeight, 'bar-xprog', xprogTitle)
                : '';

            const progLabelMarkup = item.prog > 0 && progHeight >= 18
                ? `
                    <text class="bar-segment-label" x="${groupCenter}" y="${progY + (progHeight / 2) + 4}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatNumber(item.prog, 0))}
                    </text>
                `
                : '';

            const xprogLabelMarkup = item.xprog > 0 && xprogHeight >= 18
                ? `
                    <text class="bar-segment-label" x="${groupCenter}" y="${xprogY + (xprogHeight / 2) + 4}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatNumber(item.xprog, 0))}
                    </text>
                `
                : '';

            const totalLabelMarkup = totalValue > 0
                ? `
                    <text class="bar-total-label" x="${groupCenter}" y="${totalY - 10}" text-anchor="middle">
                        ${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatNumber(totalValue, 0))}
                    </text>
                `
                : '';

            return `
                <g>
                    ${progMarkup}
                    ${xprogMarkup}
                    ${progLabelMarkup}
                    ${xprogLabelMarkup}
                    ${totalLabelMarkup}
                    ${renderAxisLabel(groupCenter, height - 34, item.label)}
                </g>
            `;
        }).join('');

        svg.innerHTML = `
            <title>Stock de Tintoreria de telas</title>
            <desc>Grafico de barras apiladas por proceso, separado entre Programado y Por Programar.</desc>
            ${gridMarkup}
            <line class="axis-line" x1="${margin.left}" y1="${axisBottom}" x2="${width - margin.right}" y2="${axisBottom}"></line>
            ${barsMarkup}
        `;
    }

    function renderStockView(records) {
        const dataset = buildStockDataset(records);
        renderChart(dataset);
    }

    function goToStockView() {
        TintoreriaApp.switchView('stock', { clearSearch: false });
    }

    function syncOnResize() {
        if (TintoreriaApp.state.activeView !== 'stock') {
            return;
        }

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

        window.addEventListener('resize', syncOnResize);
    }

    TintoreriaApp.registerView('stock', {
        init,
        render(records) {
            renderStockView(records);
        }
    });
})();
