(() => {
    function renderEmptyRow(tbody, message) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">${TintoreriaUtils.escapeHtml(message)}</td>
            </tr>
        `;
    }

    function buildRowsMarkup(records) {
        return records.map((record) => `
            <tr>
                <td><span class="cell-text">${TintoreriaUtils.escapeHtml(record.cliente)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.op_tela)}</span></td>
                <td><span class="cell-text code-text">${TintoreriaUtils.escapeHtml(record.partida)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.articulo)}">${TintoreriaUtils.escapeHtml(record.articulo)}</span></td>
                <td><span class="cell-text" title="${TintoreriaUtils.escapeHtml(record.color)}">${TintoreriaUtils.escapeHtml(record.color)}</span></td>
                <td>
                    <span class="status-chip ${record.ruta ? 'route-filled' : 'route-empty'}">
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
