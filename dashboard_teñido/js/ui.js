/* ============================================================
   UI.JS — KPIs, ficha rápida de OP-Partida, resumen del periodo
   y modal de drill-down.
   La vista DETALLE es un tablero autónomo: vive en js/tablero.js.
   ============================================================ */

const UI = (() => {

  const $ = id => document.getElementById(id);

  /* ---------- KPIs ---------- */
  function kpis(k) {
    $('kpiProcesadas').textContent   = Utils.fmtEntero(k.partidasProcesadas);
    $('kpiReprocesadas').textContent = Utils.fmtEntero(k.partidasReprocesadas);
    $('kpiKgProc').textContent       = Utils.fmtKg(k.kgProcesados);
    $('kpiKgRep').textContent        = Utils.fmtKg(k.kgReprocesados);
    $('kpiRft').textContent          = Utils.fmtPct(k.rft);
    $('kpiPctRep').textContent       = Utils.fmtPct(k.pctReproceso);
    $('kpiCosto').textContent        = Utils.fmtDolares(k.costoEstimado);

    $('kpiReprocesadasSub').textContent = Utils.fmtPct(k.pctReproceso);
    $('kpiKgRepSub').textContent        = Utils.fmtPct(k.pctKgReprocesados);
  }

  /* ---------- Resumen gerencial ---------- */
  function resumenGerencial(modelo) {
    const datos = modelo.resumenTendencia || [];
    const k = modelo.kpis;
    const porKg = modelo.metrica === 'kg';
    const ultimo = datos[datos.length - 1] || null;
    const cantidad = datos.length;
    const promedio = valor => cantidad
      ? datos.reduce((s, d) => s + (d[valor] || 0), 0) / cantidad
      : 0;

    $('resumenTituloProcesados').textContent = porKg
      ? 'KG PROCESADOS' : 'PARTIDAS PROCESADAS';
    $('resumenTituloReprocesados').textContent = porKg
      ? 'KG REPROCESADOS' : 'PARTIDAS REPROCESADAS';
    $('resumenTituloBap').textContent = porKg
      ? 'KG BIEN A LA PRIMERA (BAP)' : 'PARTIDAS BIEN A LA PRIMERA (BAP)';
    $('resumenUnidadProcesados').textContent = porKg ? 'Kg' : 'Ptdas';
    $('resumenUnidadReprocesados').textContent = porKg ? 'Kg' : 'Ptdas';
    $('resumenUnidadBap').textContent = porKg ? 'Kg' : 'Ptdas';
    $('resumenPctReprocesados').textContent = porKg ? '% Kg' : '% Ptdas';
    $('resumenPctBap').textContent = porKg ? '% Kg' : '% Ptdas';

    const campoProcesados = porKg ? 'kgProcesados' : 'partidasProcesadas';
    const fmtProcesados = valor => porKg
      ? `${Utils.fmtKg(valor)} kg`
      : `${Utils.fmtEntero(valor)} partidas`;
    const fmtPromedio = valor => porKg
      ? `${Utils.fmtKg(valor)} kg`
      : `${Utils.fmtDecimal(valor, 1)} partidas`;
    const pctReprocesados = porKg ? k.pctKgReprocesados : k.pctReproceso;
    const pctBap = porKg ? k.pctBapKg : k.rft;
    const campoPctReprocesados = porKg
      ? 'pctKgReprocesados' : 'pctPartidasReprocesadas';
    const campoPctBap = porKg ? 'pctBap' : 'pctBapPartidas';

    $('resumenCtxProcesados').textContent = ultimo
      ? `Último ${ultimo.etiqueta}: ${fmtProcesados(ultimo[campoProcesados])} · ` +
        `Promedio: ${fmtPromedio(promedio(campoProcesados))}/período`
      : 'Sin volumen para los filtros seleccionados';
    $('resumenCtxReprocesados').textContent = ultimo
      ? `Incidencia global: ${Utils.fmtPct(pctReprocesados)} · ` +
        `Último ${ultimo.etiqueta}: ${Utils.fmtPct(ultimo[campoPctReprocesados])}`
      : 'Sin reprocesos para los filtros seleccionados';
    $('resumenCtxBap').textContent = ultimo
      ? `Rendimiento global: ${Utils.fmtPct(pctBap)} · ` +
        `Último ${ultimo.etiqueta}: ${Utils.fmtPct(ultimo[campoPctBap])}`
      : 'Sin volumen para calcular BAP';
    $('resumenCtxCosto').textContent =
      `Promedio: ${Utils.fmtDolares(promedio('costoReproceso'))}/período · ` +
      `Calculado con el costo US$/kg de cada carga`;
  }

  /* ---------- Vista COSTO ---------- */
  function resumenCostos(modelo) {
    const costo = modelo.costo || {};
    const k = costo.kpis || {};
    $('costoKpiTotal').textContent = Utils.fmtDolares(k.total || 0);
    $('costoKpiMilKg').textContent = Utils.fmtDolares(k.costoPorMilKg || 0);
    $('costoKpiCarga').textContent = Utils.fmtDolares(k.costoPorCarga || 0);
    $('costoKpiKg').textContent =
      'US$ ' + Utils.fmtDecimal(k.costoPorKgReprocesado || 0, 2);

    $('costoKpiTotalSub').textContent =
      `${Utils.fmtEntero(k.cargas || 0)} cargas reprocesadas`;
    $('costoKpiMilKgSub').textContent =
      `${Utils.fmtKg(k.kgProduccion || 0)} kg de producción`;
    $('costoKpiCargaSub').textContent =
      `${Utils.fmtKg(k.kgReprocesados || 0)} kg reprocesados`;
    $('costoKpiKgSub').textContent = 'Tarifa ponderada por volumen';

    $('costoCtxPrioridad').textContent =
      'Más arriba = mayor costo por carga · Más a la derecha = más frecuencia';
  }

  /* ---------- Contextos de la vista H2O ---------- */
  function resumenH2O(modelo) {
    const agua = modelo.agua || {};
    const datos = agua.tendencia || [];
    const ultimo = datos[datos.length - 1] || null;
    const promLitros = datos.length
      ? datos.reduce((s, d) => s + (d.litros || 0), 0) / datos.length
      : 0;

    $('h2oCtxLitros').textContent = ultimo
      ? `Último ${ultimo.etiqueta}: ${Utils.fmtEntero(ultimo.litros)} Lt · ` +
        `Promedio: ${Utils.fmtEntero(promLitros)} Lt/período · ` +
        `Lavado máq.: ${Utils.fmtPct(agua.pctLavado || 0, 1)} del total`
      : 'Sin consumo para los filtros seleccionados';
    $('h2oCtxLtKg').textContent = ultimo
      ? `Global: ${Utils.fmtDecimal(agua.ltPorKg, 1)} Lt/kg · ` +
        `Último ${ultimo.etiqueta}: ${Utils.fmtDecimal(ultimo.ltPorKg, 1)} Lt/kg`
      : 'Sin datos para los filtros seleccionados';

    const contextoTop = (id, top) => {
      $(id).textContent = top
        ? `Mayor consumo: ${top.clave} · ${Utils.fmtEntero(top.litros)} Lt` +
          (top.kg ? ` (${Utils.fmtDecimal(top.ltPorKg, 1)} Lt/kg)` : '')
        : 'Sin datos para los filtros seleccionados';
    };
    contextoTop('h2oCtxArticulo', (agua.porArticulo || [])[0]);
    contextoTop('h2oCtxColor', (agua.porColor || [])[0]);
    contextoTop('h2oCtxProceso', (agua.porProceso || [])[0]);
  }

  /* ---------- Resumen de clasificación y totales PxMAQ ---------- */
  function resumenPxMaq(modelo) {
    const px = modelo.pxMaq || {};
    const produccion = px.produccion || [];
    const reproceso = px.reproceso || [];
    const sumar = (items, campo) =>
      items.reduce((s, item) => s + (item[campo] || 0), 0);
    const nProd = sumar(produccion, 'cargas');
    const kgProd = sumar(produccion, 'kg');
    const nRep = sumar(reproceso, 'cargas');
    const kgRep = sumar(reproceso, 'kg');

    $('pxMaqCtxCargas').textContent =
      `Producción: ${Utils.fmtEntero(nProd)} · Reproceso: ${Utils.fmtEntero(nRep)} carga(s)`;
    $('pxMaqCtxKg').textContent =
      `Producción: ${Utils.fmtDecimal(kgProd, 1)} · Reproceso: ${Utils.fmtDecimal(kgRep, 1)} kg`;

    const clases = {
      'PRODUCCIÓN': 'produccion',
      'PROCESO': 'proceso',
      'REPROCESO': 'reproceso',
      'NINGUNO': 'ninguno',
      'NN': 'nn'
    };
    $('pxMaqClasificacion').innerHTML = (px.resumenTipos || []).map(item => `
      <div class="sc8-pxmaq-tipo ${clases[item.tipo] || 'nn'}">
        <strong>${Utils.escapeHtml(item.tipo)}</strong>
        <span>${Utils.fmtEntero(item.cargas)} carga(s) · ${Utils.fmtDecimal(item.kg, 1)} kg</span>
      </div>`).join('');
  }

  function resumenProgramacion(modelo) {
    const p = modelo.programacion || {};
    const tendencia = p.tendencia || [];
    $('progCtxFrecuencia').textContent =
      `${Utils.fmtEntero(p.totalProductivas || 0)} cargas productivas · ` +
      `${Utils.fmtEntero(p.totalReprocesos || 0)} reprocesos · ` +
      `${Utils.fmtEntero(p.totalLavados || 0)} lavados`;
    $('progCtxRecursos').textContent = '';
    $('progTablaColores').innerHTML = tendencia.length ? `
      <table>
        <tbody>
          <tr>
            <th scope="row">#C</th>
            ${tendencia.map(item =>
              `<td>${Utils.fmtEntero(item.colores || 0)}</td>`).join('')}
          </tr>
          <tr class="periodos">
            <th scope="row" aria-label="Período"></th>
            ${tendencia.map(item =>
              `<td><span>${Utils.escapeHtml(item.etiqueta || '')}</span></td>`).join('')}
          </tr>
        </tbody>
      </table>` : '';
  }

  /* ---------- Badge de estado ---------- */
  function badgeEstado(r) {
    const est = Utils.clave(r.estadoCarga);
    if (est.includes('TERMINADO'))
      return '<span class="sc8-badge success">Terminado</span>';
    if (est.includes('PROCESO'))
      return '<span class="sc8-badge warning">En Proceso</span>';
    return `<span class="sc8-badge neutral">${Utils.escapeHtml(r.estadoCarga || '—')}</span>`;
  }


  /* ---------- Ficha rápida de OP-Partida ---------- */
  function fichaRapida(idPartida) {
    const cont = $('fichaContenido');
    const id = Utils.texto(idPartida);
    if (!id) {
      cont.innerHTML = '<p class="sc8-vacio">Ingresa una OP-Partida para ver su trazabilidad.</p>';
      return;
    }
    const historia = Datos.historialPartida(id);
    if (!historia.length) {
      cont.innerHTML = `<p class="sc8-vacio">No se encontró la OP-Partida
        <strong>${Utils.escapeHtml(id)}</strong> en los datos cargados.</p>`;
      return;
    }
    cont.innerHTML = '<div class="sc8-timeline">' + historia.map(r => {
      const clase = r.esReproceso ? 'rep' : 'prod';
      const titulo = r.esReproceso
        ? 'Reproceso — ' + r.defecto
        : (r.tipoRecetas || 'Producción');
      return `
        <div class="sc8-tl-item ${clase}">
          <div class="sc8-tl-punto"></div>
          <div class="sc8-tl-cuerpo">
            <div class="sc8-tl-hora">${Utils.escapeHtml(
              r.horaInicio ? Utils.fmtFechaHora(r.horaInicio) : r.fechaTxt)}</div>
            <div class="sc8-tl-titulo">${Utils.escapeHtml(r.maquina || '—')}</div>
            <div class="sc8-tl-detalle">${Utils.escapeHtml(r.tipoProcesos || r.procesos || '—')}</div>
            <div class="sc8-tl-detalle sc8-muted">${Utils.escapeHtml(titulo)}
              · ${Utils.fmtDecimal(r.kgCarga, 1)} kg</div>
            <div>${badgeEstado(r)}</div>
          </div>
        </div>`;
    }).join('') + '</div>';
  }

  /* ---------- Resumen del periodo ---------- */
  function resumen(k) {
    const filas = [
      ['Partidas procesadas',    Utils.fmtEntero(k.partidasProcesadas)],
      ['Partidas reprocesadas',  Utils.fmtEntero(k.partidasReprocesadas)],
      ['Kg procesados',          Utils.fmtKg(k.kgProcesados)],
      ['Kg reprocesados',        Utils.fmtKg(k.kgReprocesados)],
      ['% Reproceso',            Utils.fmtPct(k.pctReproceso)],
      ['Right First Time (RFT)', Utils.fmtPct(k.rft)],
      ['Horas máquina perdidas (Est.)', Utils.fmtDecimal(k.horasPerdidas, 1)],
      ['Costo reprocesos (Est.)', Utils.fmtDolares(k.costoEstimado)]
    ];
    $('resumenPeriodo').innerHTML = filas.map(([n, v]) => `
      <div class="sc8-resumen-fila">
        <span>${n}</span><strong>${v}</strong>
      </div>`).join('');
  }

  /* ---------- Modal de detalle (clic en una barra del Dashboard) ----------
     Lista los reprocesos que componen la barra clicada. Art. y Color
     se apilan en la misma celda (una línea por artículo/color), de modo
     que Art.1↔Color1 quedan en la primera línea, Art.2↔Color2 en la
     segunda, etc. (celdas con vertical-align: top, ver estilos.css). */
  function celdaMultilinea(items, respaldo) {
    const lista = (items && items.length ? items : [respaldo]).filter(Boolean);
    if (!lista.length) return '—';
    return lista.map(x => Utils.escapeHtml(x)).join('<br>');
  }

  function tipoOpPartida(valor) {
    const primero = Utils.texto(valor).split(/[|,]/)[0].trim();
    const op = primero.split('-')[0].trim();
    const tipo = op.match(/^\d{3}/);
    return tipo ? tipo[0] : '—';
  }

  function normalizarOpPartidaDetalle(valor) {
    const normalizarSegmento = segmento => {
      const texto = Utils.texto(segmento);
      if (!texto) return '';
      const idx = texto.lastIndexOf('-');
      if (idx < 0) return texto.replace(/^0+(?=\d)/, '');
      let op = texto.slice(0, idx).trim();
      let partida = texto.slice(idx + 1).trim();
      if (op.length > 5) op = op.slice(-5);
      op = op.replace(/^0+(?=\d)/, '');
      partida = partida.replace(/^0+(?=\d)/, '');
      return `${op}-${partida}`;
    };

    const normalizada = Utils.texto(valor)
      .split(/([|,])/)
      .map(parte => parte === '|' ? ' | '
        : parte === ',' ? ', '
        : normalizarSegmento(parte))
      .join('');
    return normalizada || '—';
  }

  function opPartidaAuditable(r) {
    return r.opPartida || r.opPartidaCorta || '—';
  }

  function modalRegistros(titulo, registros, opciones) {
    // opciones.litros: el drill-down de la vista H2O añade la columna
    // "Vol Lt" y suma los litros en el pie del modal.
    const conLitros = !!(opciones && opciones.litros);
    // opciones.pxMaq: muestra las cinco columnas fuente de esta vista y
    // la clasificación calculada para poder auditar cada barra.
    const conPxMaq = !!(opciones && opciones.pxMaq);
    const conProgramacion = !!(opciones && opciones.programacion);
    // opciones.costo: explica el impacto económico carga por carga.
    const conCosto = !!(opciones && opciones.costo);
    // opciones.detalleColor: auditoría de las cargas de un color en
    // la pestaña "Detalle por artículo".
    const conDetalleColor = !!(opciones && opciones.detalleColor);
    const clasificacionProgramacion = r => r.esLavadoMaquina
      ? { texto: 'LAVADO', clase: 'lavado' }
      : r.tipoRecetaClase === 'REPROCESO'
        ? { texto: 'REPROCESO', clase: 'reproceso' }
        : { texto: 'PRODUCCIÓN', clase: 'produccion' };
    const instanteProgramacion = r => {
      const fecha = r.horaInicio || r.fecha;
      return fecha instanceof Date && !Number.isNaN(fecha.getTime())
        ? fecha.getTime() : 0;
    };
    const regs = (registros || []).slice().sort((a, b) =>
      conDetalleColor
        ? Utils.texto(a.cliente).localeCompare(Utils.texto(b.cliente), 'es', {
            sensitivity: 'base'
          }) || normalizarOpPartidaDetalle(a.opPartida).localeCompare(
            normalizarOpPartidaDetalle(b.opPartida), 'es', { numeric: true })
        : conProgramacion
        ? instanteProgramacion(a) - instanteProgramacion(b) ||
          Utils.numero(a.nCarga) - Utils.numero(b.nCarga)
        : conCosto
          ? (b.costoReproceso || b.kgCarga * b.costoPorKg) -
            (a.costoReproceso || a.kgCarga * a.costoPorKg)
        : b.kgCarga - a.kgCarga);
    const filas = regs.map(r => conDetalleColor ? `
        <tr>
          <td>${Utils.escapeHtml(r.cliente || '—')}</td>
          <td>${Utils.escapeHtml(tipoOpPartida(r.opPartida))}</td>
          <td>${Utils.escapeHtml(opPartidaAuditable(r))}</td>
          <td class="sc8-col-num">${Utils.fmtDecimal(r.kgCarga, 1)}</td>
          <td>${Utils.escapeHtml(r.tipoProcesos || '—')}</td>
        </tr>` : conProgramacion ? (() => {
      const clasificacion = clasificacionProgramacion(r);
      return `
        <tr class="sc8-fila-programacion ${clasificacion.clase}">
          <td>${Utils.escapeHtml(r.fechaTxt || '—')}</td>
          <td>${Utils.escapeHtml(r.nCarga || '—')}</td>
          <td>${Utils.escapeHtml(
            r.horaInicio ? Utils.fmtFechaHora(r.horaInicio).split(' ').pop() : '—')}</td>
          <td>${Utils.escapeHtml(r.maquina || '(Sin máquina)')}</td>
          <td class="sc8-clasificacion-programacion ${clasificacion.clase}">
            ${clasificacion.texto}
          </td>
          <td>${Utils.escapeHtml(r.tipoRecetas || '—')}</td>
          <td>${Utils.escapeHtml(r.procesos || r.tipoProcesos || '—')}</td>
          <td>${celdaMultilinea(r.coloresList, r.color1)}</td>
          <td class="sc8-col-num">${Utils.fmtDecimal(r.kgCarga, 1)}</td>
          <td class="sc8-col-num">${Utils.fmtEntero(r.volLt)}</td>
        </tr>`;
    })() : conPxMaq ? `
        <tr>
          <td>${Utils.escapeHtml(r.fechaTxt || '—')}</td>
          <td>${Utils.escapeHtml(r.nCarga || '—')}</td>
          <td>${Utils.escapeHtml(
            r.horaInicio ? Utils.fmtFechaHora(r.horaInicio).split(' ').pop() : '—')}</td>
          <td>${celdaMultilinea(r.descArts, r.descArt)}</td>
          <td>${celdaMultilinea(r.coloresList, r.color1)}</td>
          <td>${Utils.escapeHtml(r.tipoRecetas || '—')}</td>
          <td class="sc8-clasificacion-programacion ${
            r.tipoRecetaClase === 'REPROCESO' ? 'reproceso' : 'produccion'}">
            ${Utils.escapeHtml(r.tipoRecetaClase || 'NN')}
          </td>
          <td class="sc8-col-num">${Utils.fmtDecimal(r.kgCarga, 1)}</td>
        </tr>` : conCosto ? `
        <tr>
          <td>${Utils.escapeHtml(r.fechaTxt || '—')}</td>
          <td>${Utils.escapeHtml(opPartidaAuditable(r))}</td>
          <td title="${Utils.escapeHtml(r.tipoProcesoOrigen || '')}">${Utils.escapeHtml(
            r.tipoTenidoOrigen || 'Sin registro')}</td>
          <td>${Utils.escapeHtml(r.maqOrigen || 'Sin registro')}</td>
          <td>${Utils.escapeHtml(r.defecto || '—')}</td>
          <td class="sc8-col-num">${Utils.fmtDecimal(r.kgCarga, 1)}</td>
          <td class="sc8-col-num">US$ ${Utils.fmtDecimal(r.costoPorKg, 4)}</td>
          <td class="sc8-col-num">${Utils.fmtDolares(
            r.costoReproceso || r.kgCarga * r.costoPorKg)}</td>
        </tr>` : `
        <tr>
          <td>${Utils.escapeHtml(r.clienteCorto || r.cliente || '—')}</td>
          <td>${Utils.escapeHtml(opPartidaAuditable(r))}</td>
          <td>${celdaMultilinea(r.descArts, r.descArt)}</td>
          <td>${celdaMultilinea(r.coloresList, r.color1)}</td>
          <td class="sc8-col-num">${Utils.fmtDecimal(r.kgCarga, 1)}</td>
          ${conLitros ? `<td class="sc8-col-num">${Utils.fmtEntero(r.volLt)}</td>` : ''}
        </tr>`).join('');

    const encabezado = conDetalleColor ? `
          <tr>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>OP - Partida</th>
            <th class="sc8-col-num">Kg Carga</th>
            <th>Tipo Procesos</th>
          </tr>` : conProgramacion ? `
          <tr>
            <th>Fecha</th>
            <th>N° Carga</th>
            <th>Hora inicio</th>
            <th>Máquina</th>
            <th>Clasificación</th>
            <th>Tipo Recetas</th>
            <th>Proceso</th>
            <th>Color</th>
            <th class="sc8-col-num">Kg Carga</th>
            <th class="sc8-col-num">Vol Lt</th>
          </tr>` : conPxMaq ? `
          <tr>
            <th>Fecha</th>
            <th>N° Carga</th>
            <th>Hora inicio</th>
            <th>Artículo</th>
            <th>Color</th>
            <th>Tipo Recetas</th>
            <th>Clasificación</th>
            <th class="sc8-col-num">Kg Carga</th>
          </tr>` : conCosto ? `
          <tr>
            <th>Fecha</th>
            <th>OP - Partida</th>
            <th>Teñido origen</th>
            <th>Máq. origen</th>
            <th>Defecto</th>
            <th class="sc8-col-num">Kg Carga</th>
            <th class="sc8-col-num">Costo US$/kg</th>
            <th class="sc8-col-num">Costo carga</th>
          </tr>` : `
          <tr>
            <th>Cliente</th>
            <th>OP - Partida</th>
            <th>Descripción Art.</th>
            <th>Color</th>
            <th class="sc8-col-num">Kg Carga</th>
            ${conLitros ? '<th class="sc8-col-num">Vol Lt</th>' : ''}
          </tr>`;
    const columnas = conDetalleColor ? 5
      : conProgramacion ? 10
      : conPxMaq || conCosto ? 8
      : (conLitros ? 6 : 5);

    $('modalRegistrosCuerpo').innerHTML = `
      <table class="sc8-table">
        <thead>${encabezado}</thead>
        <tbody>${filas ||
          `<tr><td colspan="${columnas}" class="sc8-vacio">Sin registros.</td></tr>`}</tbody>
      </table>`;

    const totalKg = regs.reduce((s, r) => s + r.kgCarga, 0);
    const totalLt = regs.reduce((s, r) => s + (r.volLt || 0), 0);
    const totalCosto = regs.reduce((s, r) =>
      s + (r.costoReproceso || r.kgCarga * r.costoPorKg), 0);
    $('modalRegistrosTitulo').textContent = titulo || 'Detalle';
    $('modalRegistrosTotal').textContent =
      `${regs.length} carga(s) · ${Utils.fmtDecimal(totalKg, 1)} kg` +
      (conLitros ? ` · ${Utils.fmtEntero(totalLt)} Lt` : '') +
      (conCosto ? ` · ${Utils.fmtDolares(totalCosto)}` : '');
    $('modalRegistros').classList.remove('oculto');
  }

  /* ---------- Estado de importación / envío (aviso flotante) ---------- */
  let estadoTimer = null;
  function estadoImportacion(mensaje, tipo) {
    const el = $('estadoImportacion');
    el.textContent = mensaje || '';
    el.className = 'sc8-estado ' + (tipo || '');
    clearTimeout(estadoTimer);
    // Los mensajes de éxito se ocultan solos; info y error permanecen.
    if (tipo === 'ok')
      estadoTimer = setTimeout(() => { el.textContent = ''; }, 6000);
  }

  function renderizar(modelo) {
    kpis(modelo.kpis);
    resumenGerencial(modelo);
    resumenCostos(modelo);
    resumenH2O(modelo);
    resumenPxMaq(modelo);
    resumenProgramacion(modelo);
    // La vista DETALLE es autónoma (js/tablero.js): no depende de este
    // modelo ni de los filtros del panel lateral.
    resumen(modelo.kpis);
    // Ficha rápida: primera partida reprocesada si el buscador está vacío.
    const buscador = $('buscarPartida');
    if (!buscador.value && modelo.reprocesos.length)
      buscador.value = modelo.reprocesos[0].partidas[0] || '';
    fichaRapida(buscador.value);
  }

  return { renderizar, fichaRapida, estadoImportacion, modalRegistros };
})();
