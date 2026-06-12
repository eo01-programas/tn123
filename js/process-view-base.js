(() => {
    function renderEmptyRow(tbody, message) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">${TintoreriaUtils.escapeHtml(message)}</td>
            </tr>
        `;
    }

    function getRouteClass(route) {
        if (!route) return 'route-empty';
        const lowerRoute = String(route).trim().toLowerCase();
        if (lowerRoute === 'termofijado') return 'route-termofijado';
        if (lowerRoute === 'humectado') return 'route-humectado';
        if (lowerRoute === 'directo') return 'route-directo';
        return 'route-filled';
    }

    function buildRowsMarkup(records) {
        return records.map((record) => `
            <tr>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.op_tela)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.partida)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}">${TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color))}</span></td>
                <td>
                    <span class="status-chip ${getRouteClass(record.ruta)}">
                        ${TintoreriaUtils.escapeHtml(record.ruta || 'Sin ruta')}
                    </span>
                </td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.peso_kg_crudo)}</span></td>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.plegado_estado || 'X PROG')}</span></td>
            </tr>
        `).join('');
    }

    window.registerGenericProcessView = function registerGenericProcessView(config) {
        const {
            id,
            filter,
            emptyMessage = 'No hay filas para esta vista.'
        } = config;

        TintoreriaApp.registerView(id, {
            count(records) {
                return records.filter(filter).length;
            },

            render(records) {
                const filtered = records.filter(filter);
                const tbody = document.getElementById(`tbody-${id}`);

                if (!tbody) {
                    return;
                }

                if (!filtered.length) {
                    renderEmptyRow(tbody, emptyMessage);
                    return;
                }

                tbody.innerHTML = buildRowsMarkup(filtered);
            }
        });
    };
})();
