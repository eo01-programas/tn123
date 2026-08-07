/* ============================================================
   GRAFICOS.JS — Renderizado de gráficos (Chart.js) con la
   paleta del tema Sc8_Ceropegia
   ============================================================ */

const Graficos = (() => {

  if (typeof Chart !== 'undefined') {
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
    // Negro para textos generales de ejes y leyendas en todos los gráficos.
    Chart.defaults.color = '#111111';
  }

  const instancias = {};   // id de canvas -> Chart

  function destruir(id) {
    if (instancias[id]) { instancias[id].destroy(); delete instancias[id]; }
  }

  function crear(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;
    destruir(id);
    instancias[id] = new Chart(canvas.getContext('2d'), config);
  }

  /* ---------- Drill-down: clic en una barra abre el detalle ----------
     Se engancha en options.onClick del gráfico ya creado (Chart.js lo
     lee en cada evento, no hace falta recrearlo). `resolver(indice)`
     devuelve { titulo, registros } y UI.modalRegistros pinta la tabla.
     El cursor pasa a "pointer" al pasar sobre un elemento clicable.
     intersect=false hace tolerante el clic en barras finas (basta con
     acertar la columna/fila); en la dona se exige intersect para no
     disparar desde el agujero central. */
  function enlazarDrill(id, resolver, intersect) {
    const ch = instancias[id];
    if (!ch) return;
    const modo = { intersect: !!intersect };
    ch.options.onClick = (evt, _els, chart) => {
      // Chart.js entrega un ChartEvent con coordenadas ya relativas al
      // canvas. getElementsAtEventForMode espera el evento DOM original;
      // reutilizar ChartEvent vuelve a restar el offset y puede resolver
      // una barra distinta a la pulsada.
      const pts = chart.getElementsAtEventForMode(
        evt.native || evt, 'nearest', modo, true);
      if (!pts.length) return;
      const info = resolver(pts[0].index, pts[0].datasetIndex);
      if (info && info.registros && info.registros.length &&
          typeof UI !== 'undefined' && UI.modalRegistros)
        UI.modalRegistros(info.titulo, info.registros, info.opciones);
    };
    ch.options.onHover = (evt, _els, chart) => {
      if (!chart.canvas) return;
      const pts = chart.getElementsAtEventForMode(
        evt.native || evt, 'nearest', modo, true);
      chart.canvas.style.cursor = pts.length ? 'pointer' : 'default';
    };
  }

  /* Engancha el drill-down de las 8 gráficas del Dashboard: cada barra
     resuelve al subconjunto de modelo.reprocesos que la compone. */
  function enlazarDrilldown(modelo) {
    const reprocesos = modelo.reprocesos || [];
    if (!reprocesos.length) return;
    const porMes = modelo.granularidad === 'mes';
    const claveP = r => porMes ? r.mesPeriodo : r.semanaPeriodo;

    const porEtiqueta = (id, campo, prefijo) => enlazarDrill(id, i => {
      const et = instancias[id] ? instancias[id].data.labels[i] : '';
      return { titulo: `${prefijo}: ${et}`,
               registros: reprocesos.filter(r => r[campo] === et) };
    });

    // Pareto y dona comparten el eje de defectos (mismo orden que modelo.pareto).
    const drillDefecto = i => {
      const def = (modelo.pareto[i] || {}).defecto || '';
      return { titulo: `Defecto: ${def}`,
               registros: reprocesos.filter(r => r.defecto === def) };
    };
    enlazarDrill('chPareto', drillDefecto);
    enlazarDrill('chDona', drillDefecto, true);

    enlazarDrill('chTendencia', i => {
      const it = modelo.tendencia[i] || {};
      return { titulo: `Reprocesos ${it.etiqueta || ''}`.trim(),
               registros: reprocesos.filter(r => claveP(r) === it.periodo) };
    });

    porEtiqueta('chMaqOrigen', 'maqOrigen', 'Máquina origen');
    porEtiqueta('chMaqRecuperacion', 'maquina', 'Máquina recuperación');
    porEtiqueta('chArticulo', 'articulo', 'Artículo');
    porEtiqueta('chColor', 'color1', 'Color');
    porEtiqueta('chCliente', 'clienteCorto', 'Cliente');
  }

  const fuenteBase = { family: 'Arial, Helvetica, sans-serif', size: 11 };
  const coloresEtiqueta = {
    '#4c8ca8': '#245b72', // azul
    '#b65b5b': '#7d3030', // rojo
    '#4f8f62': '#285f3b', // verde
    '#d39b36': '#8c5b00'  // ámbar
  };
  const colorEtiqueta = color => coloresEtiqueta[color] || '#111111';

  // Formato abreviado exclusivo para marcas de ejes: 80.000 -> 80k y
  // 10.000.000 -> 10M. Tooltips, KPIs y etiquetas sobre las barras
  // conservan el valor completo.
  function fmtEjeMiles(valor, moneda) {
    const n = Number(valor) || 0;
    const abs = Math.abs(n);
    let texto;
    if (abs >= 1000000) {
      const millones = n / 1000000;
      const decimales = Math.abs(millones) < 10 && !Number.isInteger(millones) ? 1 : 0;
      texto = Utils.fmtDecimal(millones, decimales) + 'M';
    } else if (abs >= 1000) {
      const miles = n / 1000;
      const decimales = Math.abs(miles) < 10 && !Number.isInteger(miles) ? 1 : 0;
      texto = Utils.fmtDecimal(miles, decimales) + 'k';
    } else {
      texto = Utils.fmtEntero(n);
    }
    return moneda ? '$' + texto : texto;
  }

  function opcionesBase(extra) {
    extra = extra || {};
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false
    }, extra, {
      plugins: Object.assign({
        legend: { labels: { font: fuenteBase, color: '#2f3b2f', boxWidth: 12 } },
        tooltip: { titleFont: fuenteBase, bodyFont: fuenteBase },
        datalabels: { display: false }
      }, extra.plugins || {})
    });
  }

  /* ---------- 1. Pareto de defectos ---------- */
  function pareto(datos) {
    crear('chPareto', {
      data: {
        labels: datos.map(d => d.defecto),
        datasets: [
          {
            type: 'line', label: '% Acumulado', yAxisID: 'y1',
            data: datos.map(d => +(d.acumulado * 100).toFixed(1)),
            borderColor: PALETA_SC8.alerta, backgroundColor: PALETA_SC8.alerta,
            tension: 0.15, pointRadius: 4,
            datalabels: {
              display: true,
              anchor: 'end',
              align: 'top',
              color: PALETA_SC8.alerta,
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
              formatter: v => v + '%'
            }
          },
          {
            type: 'bar', label: 'Eventos', yAxisID: 'y',
            data: datos.map(d => d.eventos),
            backgroundColor: PALETA_SC8.primario, borderRadius: 4,
            datalabels: {
              display: true,
              anchor: 'start',
              align: 'end',
              offset: 6,
              color: '#fff',
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' }
            }
          }
        ]
      },
      options: opcionesBase({
        plugins: {
          legend: { display: false },
          tooltip: { titleFont: fuenteBase, bodyFont: fuenteBase }
        },
        scales: {
          y:  { beginAtZero: true },
          y1: { display: false, min: 20, max: 110, position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { callback: v => v + '%' } },
          x:  { ticks: { font: fuenteBase } }
        }
      })
    });
  }

  /* ---------- 2. Tendencia semanal/mensual (según pill Sem/Mes) ----------
     El pill Ptda/Kg decide la unidad: barras en # partidas reprocesadas
     o en kg reprocesados; la línea % acompaña esa misma unidad. */
  function tendencia(datos, granularidad, porKg) {
    // El título de la tarjeta acompaña la granularidad del eje X y la unidad.
    const titulo = document.getElementById('tituloTendencia');
    if (titulo) titulo.textContent =
      (granularidad === 'mes' ? 'TENDENCIA MES REPROC' : 'TENDENCIA SEM REPROC') +
      (porKg ? ' (Kg)' : '');
    crear('chTendencia', {
      data: {
        labels: datos.map(d => d.etiqueta),
        datasets: [
          {
            type: 'line', label: '% Reproceso', yAxisID: 'y1',
            data: datos.map(d => +(d.pct * 100).toFixed(1)),
            borderColor: PALETA_SC8.peligro, backgroundColor: PALETA_SC8.peligro,
            tension: 0.2, pointRadius: 4,
            datalabels: {
              display: true,
              anchor: 'end',
              align: 'top',
              color: PALETA_SC8.peligro,
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
              formatter: v => v + '%'
            }
          },
          {
            type: 'bar', label: porKg ? 'Kg reprocesados' : 'Partidas reprocesadas',
            yAxisID: 'y',
            data: datos.map(d => d.reprocesadas),
            backgroundColor: PALETA_SC8.info, borderRadius: 4,
            datalabels: {
              display: true,
              anchor: 'start',
              align: 'end',
              offset: 6,
              color: '#fff',
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
              formatter: v => porKg ? Utils.fmtKg(v) : v
            }
          }
        ]
      },
      options: opcionesBase({
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: { titleFont: fuenteBase, bodyFont: fuenteBase }
        },
        scales: {
          y:  { beginAtZero: true },
          y1: { display: false, beginAtZero: true, position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { callback: v => v + '%' } }
        }
      })
    });
  }

  /* ---------- Barras horizontales genéricas ----------
     porKg: los valores son kg reprocesados (pill Ptda/Kg), no eventos. */
  function barrasH(id, pares, color, porKg) {
    crear(id, {
      type: 'bar',
      data: {
        labels: pares.map(p => p[0]),
        datasets: [{
          data: pares.map(p => p[1]),
          backgroundColor: color, borderRadius: 4,
          label: porKg ? 'Kg reprocesados' : 'Reprocesos'
        }]
      },
      options: opcionesBase({
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ` +
                (porKg ? Utils.fmtKg(ctx.parsed.x) : ctx.parsed.x)
            }
          }
        },
        scales: {
          x: { beginAtZero: true,
               ticks: { precision: 0,
                        callback: v => fmtEjeMiles(v) } },
          y: { ticks: { font: fuenteBase, autoSkip: false } }
        }
      })
    });
  }

  /* ---------- Pastel de distribución por defecto ----------
     Leyenda a la derecha, con el círculo un poco más chico (radius)
     para darle un poco más de aire al texto de la leyenda. */
  function dona(pares) {
    const total = pares.reduce((s, p) => s + p.eventos, 0) || 1;
    crear('chDona', {
      type: 'pie',
      data: {
        labels: pares.map(p => `${p.defecto} (${p.eventos})`),
        datasets: [{
          data: pares.map(p => p.eventos),
          backgroundColor: PALETA_SC8.series,
          borderColor: '#ffffff', borderWidth: 2
        }]
      },
      options: opcionesBase({
        radius: '92%',
        plugins: {
          legend: {
            position: 'right',
            labels: { font: fuenteBase, boxWidth: 10, padding: 8 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${Utils.fmtPct(ctx.parsed / total, 1)}`
            }
          }
        }
      })
    });
  }

  /* ---------- Resumen gerencial: tendencias en Ptda/Kg y costo ---------- */
  const pluginSinDatos = {
    id: 'sc8SinDatos',
    afterDraw(chart) {
      const tieneDatos = chart.data.datasets.some(ds =>
        (ds.data || []).some(v => {
          if (v && typeof v === 'object')
            return ['x', 'y', 'r'].some(c => Number.isFinite(+v[c]) && +v[c] !== 0);
          return Number.isFinite(+v) && +v !== 0;
        }));
      if (tieneDatos || (chart.data.labels || []).length) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.fillStyle = '#667466';
      ctx.font = '12px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos para los filtros seleccionados',
        (chartArea.left + chartArea.right) / 2,
        (chartArea.top + chartArea.bottom) / 2);
      ctx.restore();
    }
  };

  /* ---------- PxMAQ: producción y reproceso combinados ----------
     Barras apiladas: reproceso en la base y producción encima. */
  function pxMaqCombinado(id, produccion, reproceso, campo) {
    const esKg = campo === 'kg';
    const prod = new Map((produccion || []).map(item => [item.maquina, item]));
    const rep = new Map((reproceso || []).map(item => [item.maquina, item]));
    const maquinas = [...new Set([...prod.keys(), ...rep.keys()])]
      .sort((a, b) => a.localeCompare(b, 'es', {
        numeric: true,
        sensitivity: 'base'
      }));
    const valoresProd = maquinas.map(m => prod.get(m)?.[campo] || 0);
    const valoresRep = maquinas.map(m => rep.get(m)?.[campo] || 0);
    const fmtValor = v => esKg ? Utils.fmtDecimal(v, 1) : Utils.fmtEntero(v);
    const datasetBarra = (label, valores, color) => ({
      label,
      data: valores,
      yAxisID: 'y',
      stack: 'total',
      backgroundColor: color + 'cc',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 34,
      datalabels: {
        display: maquinas.length <= 10 ? 'auto' : false,
        anchor: 'end', align: 'top', offset: 2, clamp: true,
        color: colorEtiqueta(color),
        font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
        formatter: fmtValor
      }
    });

    crear(id, {
      type: 'bar',
      plugins: [pluginSinDatos],
      data: {
        labels: maquinas,
        datasets: [
          datasetBarra('Reproceso', valoresRep, PALETA_SC8.peligro),
          datasetBarra('Producción', valoresProd, PALETA_SC8.primario)
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 24, left: 5, right: 5 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                return ` ${ctx.dataset.label}: ${fmtValor(ctx.parsed.y)}` +
                  (esKg ? ' kg' : ' carga(s)');
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            stacked: true,
            ticks: {
              font: fuenteBase,
              autoSkip: false,
              minRotation: 90,
              maxRotation: 90
            }
          },
          y: {
            beginAtZero: true,
            stacked: true,
            grace: '12%',
            grid: { color: 'rgba(102,116,102,.10)' },
            ticks: {
              precision: esKg ? undefined : 0,
              callback: v => fmtEjeMiles(v)
            }
          }
        }
      })
    });

    enlazarDrill(id, i => {
      const maquina = maquinas[i] || '';
      return {
        titulo: `Producción y reprocesos · ${maquina}`,
        registros: [
          ...(prod.get(maquina)?.registros || []),
          ...(rep.get(maquina)?.registros || [])
        ],
        opciones: { pxMaq: true }
      };
    });
  }

  function renderizarPxMaq(modelo) {
    const px = modelo.pxMaq || {};
    pxMaqCombinado('chPxMaqCargas', px.produccion, px.reproceso, 'cargas');
    pxMaqCombinado('chPxMaqKg', px.produccion, px.reproceso, 'kg');
  }

  function renderizarProgramacion(modelo) {
    const items = (modelo.programacion && modelo.programacion.porMaquina) || [];
    const tendencia = (modelo.programacion && modelo.programacion.tendencia) || [];
    const etiquetas = items.map(i => i.maquina);
    const ejeX = {
      grid: { display: false },
      ticks: {
        font: fuenteBase, autoSkip: false, minRotation: 90, maxRotation: 90
      }
    };
    const barra = (label, data, color, eje) => ({
      label, data, yAxisID: eje || 'y',
      backgroundColor: color + 'cc', borderColor: color,
      borderWidth: 1, borderRadius: 4, maxBarThickness: 34,
      datalabels: {
        display: items.length <= 10 ? 'auto' : false,
        anchor: 'end', align: 'top', clamp: true,
        color: colorEtiqueta(color),
        font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
        formatter: v => Utils.fmtDecimal(v, Number.isInteger(v) ? 0 : 1)
      }
    });

    crear('chProgFrecuencia', {
      type: 'bar', plugins: [pluginSinDatos],
      data: {
        labels: etiquetas,
        datasets: [
          Object.assign(
            barra('Reprocesos', items.map(i => i.reprocesos), PALETA_SC8.peligro),
            { stack: 'cargas' }),
          Object.assign(
            barra('Cargas productivas', items.map(i => i.productivas), PALETA_SC8.primario),
            { stack: 'cargas' }),
          Object.assign(
            barra('Lavados', items.map(i => i.lavados), PALETA_SC8.info),
            { stack: 'cargas' })
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 22 } },
        plugins: { legend: { display: false } },
        scales: {
          x: Object.assign({}, ejeX, { stacked: true }),
          y: {
            beginAtZero: true, stacked: true, grace: '12%',
            ticks: { precision: 0 }
          }
        }
      })
    });

    crear('chProgRecursos', {
      type: 'bar', plugins: [pluginSinDatos],
      data: {
        labels: tendencia.map(i => i.etiqueta),
        datasets: [
          {
            label: 'Litros de lavado',
            data: tendencia.map(i => i.litros),
            yAxisID: 'y',
            backgroundColor: PALETA_SC8.info + 'cc',
            borderColor: PALETA_SC8.info,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 38,
            datalabels: {
              display: 'auto',
              anchor: 'start',
              align: 'end',
              offset: 5,
              clamp: true,
              color: '#111111',
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
              formatter: v => Utils.fmtEntero(v)
            }
          },
          {
            type: 'line',
            label: 'Cargas de lavado',
            data: tendencia.map(i => i.lavados),
            yAxisID: 'y1',
            borderColor: PALETA_SC8.alerta,
            backgroundColor: PALETA_SC8.alerta,
            borderWidth: 2.2,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: .25,
            datalabels: {
              display: true, anchor: 'end', align: 'top', offset: 5, clamp: true,
              color: colorEtiqueta(PALETA_SC8.alerta),
              font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
              formatter: (v, ctx) => {
                if (!v) return '0';
                return `${Utils.fmtEntero(v)} (` +
                  `${Utils.fmtDecimal((tendencia[ctx.dataIndex] || {}).horas || 0, 1)} h)`;
              }
            }
          }
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 22 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: itemsTooltip => {
                const i = itemsTooltip.length ? itemsTooltip[0].dataIndex : -1;
                const item = tendencia[i] || {};
                return `${item.etiqueta || ''} · #C ${item.colores || 0}`;
              },
              label: ctx => ctx.dataset.yAxisID === 'y1'
                ? ` Cargas de lavado: ${Utils.fmtEntero(ctx.parsed.y)} ` +
                  `(${Utils.fmtDecimal((tendencia[ctx.dataIndex] || {}).horas || 0, 1)} h)`
                : ` Litros de lavado: ${Utils.fmtEntero(ctx.parsed.y)} Lt`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              display: false
            }
          },
          y: {
            beginAtZero: true, grace: '12%',
            ticks: { callback: v => fmtEjeMiles(v) }
          },
          y1: {
            beginAtZero: true, position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { precision: 0, callback: v => Utils.fmtEntero(v) }
          }
        }
      })
    });

    enlazarDrill('chProgFrecuencia', i => {
      const item = items[i] || {};
      return {
        titulo: `Programación de máquina · ${etiquetas[i] || ''}`,
        registros: [
          ...(item.registrosLavado || []),
          ...(item.registrosProductivos || []),
          ...(item.registrosReproceso || [])
        ],
        opciones: { programacion: true, litros: true }
      };
    });
    enlazarDrill('chProgRecursos', i => ({
      titulo: `Programación · ${(tendencia[i] || {}).etiqueta || ''}`,
      registros: (tendencia[i] || {}).registrosDetalle || [],
      opciones: { programacion: true, litros: true }
    }));
  }

  function coloresBarras(cantidad, color) {
    return Array.from({ length: cantidad }, (_, i) =>
      i === cantidad - 1 ? color : color + '99');
  }

  function etiquetaResumen(ctx) {
    const valor = ctx.parsed.y;
    if (ctx.dataset.unidad === 'pct') return ` ${ctx.dataset.label}: ${Utils.fmtDecimal(valor, 1)}%`;
    if (ctx.dataset.unidad === 'usd') return ` ${ctx.dataset.label}: ${Utils.fmtDolares(valor)}`;
    if (ctx.dataset.unidad === 'lt')   return ` ${ctx.dataset.label}: ${Utils.fmtEntero(valor)} Lt`;
    if (ctx.dataset.unidad === 'ltkg') return ` ${ctx.dataset.label}: ${Utils.fmtDecimal(valor, 1)} Lt/kg`;
    if (ctx.dataset.unidad === 'partidas') {
      const texto = ctx.dataset.label === 'Prom'
        ? Utils.fmtDecimal(valor, 1)
        : Utils.fmtEntero(valor);
      return ` ${ctx.dataset.label}: ${texto}`;
    }
    return ` ${ctx.dataset.label}: ${Utils.fmtKg(valor)} kg`;
  }

  function resumenConPromedio(id, datos, campo, etiqueta, color, unidad) {
    const valores = datos.map(d => d[campo] || 0);
    const colorTexto = colorEtiqueta(color);
    const promedio = valores.length
      ? valores.reduce((s, v) => s + v, 0) / valores.length
      : 0;
    const fmtValor = v => unidad === 'usd' ? Utils.fmtDolares(v)
      : unidad === 'partidas' ? Utils.fmtEntero(v)
      : unidad === 'ltkg' ? Utils.fmtDecimal(v, 1)
      : Utils.fmtKg(v);
    // Lt/kg se mueve en valores pequeños (5–15): el eje conserva un
    // decimal en vez del redondeo a miles de las demás unidades.
    const fmtEje = v => unidad === 'ltkg'
      ? Utils.fmtDecimal(v, Number.isInteger(+v) ? 0 : 1)
      : fmtEjeMiles(v, unidad === 'usd');
    crear(id, {
      type: 'bar',
      plugins: [pluginSinDatos],
      data: {
        labels: datos.map(d => d.etiqueta),
        datasets: [
          {
            label: etiqueta,
            unidad,
            data: valores,
            backgroundColor: coloresBarras(valores.length, color),
            borderColor: color,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            datalabels: {
              // "auto" oculta una etiqueta solo si llegara a superponerse.
              display: valores.length <= 8 ? 'auto' : false,
              anchor: 'end', align: 'top', offset: 1, clamp: true,
              color: colorTexto,
              font: { family: fuenteBase.family, size: 13, weight: 'bold' },
              formatter: fmtValor
            }
          },
          {
            type: 'line',
            label: 'Prom',
            unidad,
            data: valores.map(() => promedio),
            borderColor: PALETA_SC8.neutro,
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            datalabels: { display: false }
          }
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 17 } },
        plugins: {
          legend: {
            display: false
          },
          tooltip: { callbacks: { label: etiquetaResumen } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: fuenteBase, color: '#111111' } },
          y: {
            beginAtZero: true,
            grace: '12%',
            grid: { color: 'rgba(102,116,102,.10)' },
            ticks: { font: fuenteBase, color: '#111111', callback: fmtEje }
          }
        }
      })
    });
  }

  function resumenConPorcentaje(id, datos, campoValor, campoPct,
                                etiquetaValor, etiquetaPct, colorValor, colorPct,
                                unidadValor, esBap) {
    const valores = datos.map(d => d[campoValor] || 0);
    const pct = datos.map(d => (d[campoPct] || 0) * 100);
    const colorValorTexto = colorEtiqueta(colorValor);
    const colorPctTexto = colorEtiqueta(colorPct);
    const fmtValor = v => unidadValor === 'partidas'
      ? Utils.fmtEntero(v)
      : Utils.fmtKg(v);
    const maxPct = Math.max(0, ...pct);
    const minPct = Math.min(100, ...pct);
    const escalaPct = esBap
      ? { min: Math.max(0, Math.floor(minPct / 5) * 5 - 5), max: 105 }
      : {
          beginAtZero: true,
          suggestedMax: Math.max(10, Math.ceil((maxPct * 1.25) / 5) * 5)
        };
    crear(id, {
      type: 'bar',
      plugins: [pluginSinDatos],
      data: {
        labels: datos.map(d => d.etiqueta),
        datasets: [
          {
            label: etiquetaValor,
            unidad: unidadValor,
            yAxisID: 'y',
            data: valores,
            backgroundColor: coloresBarras(valores.length, colorValor),
            borderColor: colorValor,
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            datalabels: {
              // Si una barra muy pequeña coincide con la línea, se prioriza
              // el porcentaje y ChartDataLabels oculta solo la etiqueta solapada.
              display: valores.length <= 7 ? 'auto' : false,
              anchor: 'start', align: 'end', offset: 5, clamp: true,
              color: colorValorTexto,
              font: { family: fuenteBase.family, size: 13, weight: 'bold' },
              formatter: fmtValor
            }
          },
          {
            type: 'line',
            label: etiquetaPct,
            unidad: 'pct',
            yAxisID: 'y1',
            data: pct,
            borderColor: colorPct,
            backgroundColor: colorPct,
            borderWidth: 2.2,
            pointRadius: 3.5,
            pointHoverRadius: 5,
            tension: .25,
            datalabels: {
              // Con más de 6 períodos se alternan las etiquetas de la línea
              // (conservando siempre la última) para impedir cruces laterales.
              display: ctx => {
                if (pct.length <= 6) return true;
                if (pct.length > 10) return false;
                const ultimo = pct.length - 1;
                return ctx.dataIndex === ultimo ||
                  (ctx.dataIndex % 2 === 0 && ctx.dataIndex !== ultimo - 1);
              },
              anchor: 'end', align: 'top', offset: esBap ? 5 : 12, clamp: true,
              color: colorPctTexto,
              font: { family: fuenteBase.family, size: 13, weight: 'bold' },
              formatter: v => Utils.fmtDecimal(v, 1) + '%'
            }
          }
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: esBap ? 24 : 20, left: 6, right: 6 } },
        plugins: {
          legend: {
            display: false
          },
          tooltip: { callbacks: { label: etiquetaResumen } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: fuenteBase, color: '#111111' } },
          y: {
            beginAtZero: true,
            grace: '12%',
            grid: { color: 'rgba(102,116,102,.10)' },
            ticks: {
              font: fuenteBase,
              color: '#111111',
              precision: unidadValor === 'partidas' ? 0 : undefined,
              callback: v => fmtEjeMiles(v, false)
            }
          },
          y1: Object.assign({
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              font: fuenteBase,
              color: '#111111',
              callback: v => v > 100 ? '' : v + '%'
            }
          }, escalaPct)
        }
      })
    });
  }

  function renderizarResumen(modelo) {
    const datos = modelo.resumenTendencia || [];
    const porKg = modelo.metrica === 'kg';
    const unidad = porKg ? 'kg' : 'partidas';
    const etiquetaUnidad = porKg ? 'Kg' : 'Ptdas';
    const etiquetaPct = porKg ? '% Kg' : '% Ptdas';
    resumenConPromedio('chResumenProcesados', datos,
      porKg ? 'kgProcesados' : 'partidasProcesadas',
      etiquetaUnidad, PALETA_SC8.info, unidad);
    resumenConPorcentaje('chResumenReprocesados', datos,
      porKg ? 'kgReprocesados' : 'partidasReprocesadas',
      porKg ? 'pctKgReprocesados' : 'pctPartidasReprocesadas',
      etiquetaUnidad, etiquetaPct, PALETA_SC8.peligro,
      PALETA_SC8.alerta, unidad, false);
    resumenConPorcentaje('chResumenBap', datos,
      porKg ? 'kgBap' : 'partidasBap',
      porKg ? 'pctBap' : 'pctBapPartidas',
      etiquetaUnidad, etiquetaPct,
      PALETA_SC8.primario, PALETA_SC8.info, unidad, true);
    resumenConPromedio('chResumenCosto', datos, 'costoReproceso',
      '$', PALETA_SC8.alerta, 'usd');
  }

  /* ---------- Vista COSTO: impacto económico ---------- */
  function detalleTooltipCosto(item, conIntensidad) {
    if (!item) return [];
    const detalle = [
      `Cargas: ${Utils.fmtEntero(item.cargas || 0)}`,
      `Kg reprocesados: ${Utils.fmtDecimal(item.kg || 0, 1)}`,
      `Promedio/carga: ${Utils.fmtDolares(item.costoPromedio || 0)}`,
      `Costo/kg reproc.: US$ ${Utils.fmtDecimal(item.costoPorKg || 0, 2)}`
    ];
    if (conIntensidad && item.kgProcesados) {
      detalle.push(
        `Costo/1.000 kg: ${Utils.fmtDolares(item.costoPorMilKg || 0)}`);
    }
    return detalle;
  }

  /* Pareto horizontal: costo total abajo y porcentaje acumulado arriba.
     Los nombres largos conservan legibilidad y cada barra abre sus cargas. */
  function paretoCosto(id, items, color) {
    crear(id, {
      data: {
        labels: items.map(i => i.etiqueta),
        datasets: [
          {
            type: 'line',
            label: '% acumulado',
            xAxisID: 'x1',
            data: items.map(i => +(i.acumulado * 100).toFixed(1)),
            borderColor: PALETA_SC8.alerta,
            backgroundColor: PALETA_SC8.alerta,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: .18,
            datalabels: { display: false }
          },
          {
            type: 'bar',
            label: 'Costo',
            xAxisID: 'x',
            data: items.map(i => i.costo),
            backgroundColor: color + 'c9',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 5,
            maxBarThickness: 27,
            datalabels: {
              display: 'auto',
              anchor: 'end',
              align: 'right',
              offset: 3,
              clamp: true,
              color: colorEtiqueta(color),
              font: { family: fuenteBase.family, size: 9, weight: 'bold' },
              formatter: v => Utils.fmtDolares(v)
            }
          }
        ]
      },
      options: opcionesBase({
        indexAxis: 'y',
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { right: 48 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.xAxisID === 'x1'
                ? ` Acumulado: ${Utils.fmtDecimal(ctx.parsed.x, 1)}%`
                : ` Costo: ${Utils.fmtDolares(ctx.parsed.x)}`,
              afterBody: elementos => {
                const i = elementos.length ? elementos[0].dataIndex : -1;
                return detalleTooltipCosto(items[i], false);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(102,116,102,.09)' },
            ticks: { callback: v => fmtEjeMiles(v, true) }
          },
          x1: {
            beginAtZero: true,
            min: 0,
            max: 100,
            position: 'top',
            grid: { drawOnChartArea: false },
            ticks: { callback: v => v + '%' }
          },
          y: {
            grid: { display: false },
            ticks: {
              autoSkip: false,
              font: fuenteBase,
              callback: function (v) {
                return Utils.truncar(this.getLabelForValue(v), 24);
              }
            }
          }
        }
      }),
      plugins: [pluginSinDatos]
    });
  }

  function barrasCosto(id, items, color, conIntensidad) {
    crear(id, {
      type: 'bar',
      data: {
        labels: items.map(i => i.etiqueta),
        datasets: [{
          label: 'Costo',
          data: items.map(i => i.costo),
          backgroundColor: color + 'c9',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 5,
          maxBarThickness: 27,
          datalabels: {
            display: items.length <= 7 ? 'auto' : false,
            anchor: 'end',
            align: 'right',
            offset: 3,
            clamp: true,
            color: colorEtiqueta(color),
            font: { family: fuenteBase.family, size: 9, weight: 'bold' },
            formatter: v => Utils.fmtDolares(v)
          }
        }]
      },
      options: opcionesBase({
        indexAxis: 'y',
        layout: { padding: { right: 48 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` Costo: ${Utils.fmtDolares(ctx.parsed.x)}`,
              afterBody: elementos => {
                const i = elementos.length ? elementos[0].dataIndex : -1;
                return detalleTooltipCosto(items[i], conIntensidad);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(102,116,102,.09)' },
            ticks: { callback: v => fmtEjeMiles(v, true) }
          },
          y: {
            grid: { display: false },
            ticks: {
              autoSkip: false,
              font: fuenteBase,
              callback: function (v) {
                return Utils.truncar(this.getLabelForValue(v), 21);
              }
            }
          }
        }
      }),
      plugins: [pluginSinDatos]
    });
  }

  function prioridadCosto(items) {
    const maxCosto = Math.max(0, ...items.map(i => i.costo));
    const puntos = items.map((item, i) => ({
      x: item.cargas,
      y: item.costoPromedio,
      r: maxCosto ? 7 + Math.sqrt(item.costo / maxCosto) * 15 : 7,
      item,
      backgroundColor: PALETA_SC8.series[i % PALETA_SC8.series.length] + '99',
      borderColor: PALETA_SC8.series[i % PALETA_SC8.series.length]
    }));
    crear('chCostoPrioridad', {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Defectos',
          data: puntos,
          backgroundColor: puntos.map(p => p.backgroundColor),
          borderColor: puntos.map(p => p.borderColor),
          borderWidth: 1.5,
          datalabels: {
            display: items.length <= 7 ? 'auto' : false,
            align: 'top',
            offset: 3,
            color: '#263326',
            font: { family: fuenteBase.family, size: 9, weight: 'bold' },
            formatter: p => Utils.truncar(p.item.etiqueta, 16)
          }
        }]
      },
      options: opcionesBase({
        layout: { padding: { top: 20, right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: elementos => {
                const raw = elementos.length ? elementos[0].raw : null;
                return raw && raw.item ? raw.item.etiqueta : '';
              },
              label: ctx => [
                ` Frecuencia: ${Utils.fmtEntero(ctx.raw.item.cargas)} cargas`,
                ` Promedio/carga: ${Utils.fmtDolares(ctx.raw.item.costoPromedio)}`,
                ` Costo total: ${Utils.fmtDolares(ctx.raw.item.costo)}`,
                ` Kg reprocesados: ${Utils.fmtDecimal(ctx.raw.item.kg, 1)}`
              ]
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Frecuencia (# cargas)', font: fuenteBase },
            ticks: { precision: 0 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Costo promedio por carga', font: fuenteBase },
            ticks: { callback: v => fmtEjeMiles(v, true) }
          }
        }
      }),
      plugins: [pluginSinDatos]
    });
  }

  function tendenciaCosto(costo, granularidad) {
    const datos = costo.tendencia || [];
    const series = costo.defectosTendencia || [];
    const tieneOtros = datos.some(i => i.otros > 0);
    const barras = series.map((defecto, i) => ({
      type: 'bar',
      label: defecto,
      stack: 'costo',
      yAxisID: 'y',
      data: datos.map(d => d.porDefecto[defecto] || 0),
      backgroundColor: PALETA_SC8.series[i % PALETA_SC8.series.length] + 'c9',
      borderColor: PALETA_SC8.series[i % PALETA_SC8.series.length],
      borderWidth: 1,
      maxBarThickness: 38,
      datalabels: { display: false }
    }));
    if (tieneOtros) {
      barras.push({
        type: 'bar',
        label: 'Otros',
        stack: 'costo',
        yAxisID: 'y',
        data: datos.map(d => d.otros || 0),
        backgroundColor: PALETA_SC8.neutro + 'a6',
        borderColor: PALETA_SC8.neutro,
        borderWidth: 1,
        maxBarThickness: 38,
        datalabels: { display: false }
      });
    }
    const indiceLinea = barras.length;
    barras.push({
      type: 'line',
      label: '$ / 1.000 kg',
      yAxisID: 'y1',
      data: datos.map(d => d.costoPorMilKg || 0),
      borderColor: PALETA_SC8.alerta,
      backgroundColor: PALETA_SC8.alerta,
      borderWidth: 2.2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: .25,
      datalabels: { display: false }
    });

    const titulo = document.getElementById('costoTituloTendencia');
    if (titulo) titulo.textContent = granularidad === 'mes'
      ? 'TENDENCIA MENSUAL DE COSTO'
      : 'TENDENCIA SEMANAL DE COSTO';
    crear('chCostoTendencia', {
      data: {
        labels: datos.map(d => d.etiqueta),
        datasets: barras
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: fuenteBase.family, size: 9 }, boxWidth: 9 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.yAxisID === 'y1'
                ? ` ${ctx.dataset.label}: ${Utils.fmtDolares(ctx.parsed.y)}`
                : ` ${ctx.dataset.label}: ${Utils.fmtDolares(ctx.parsed.y)}`,
              footer: elementos => {
                const i = elementos.length ? elementos[0].dataIndex : -1;
                const item = datos[i] || {};
                return `Total: ${Utils.fmtDolares(item.costo || 0)}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: fuenteBase }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: v => fmtEjeMiles(v, true) }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: v => fmtEjeMiles(v, true) }
          }
        }
      }),
      plugins: [pluginSinDatos]
    });
    return { indiceLinea, tieneOtros };
  }

  function renderizarCostos(modelo) {
    const costo = modelo.costo || {};
    const porTenido = costo.porTenido || [];
    const porDefecto = costo.porDefecto || [];
    const porMaquina = costo.porMaquinaOrigen || [];
    const porReceta = costo.porRecetaRecuperacion || [];
    const prioridad = costo.prioridad || [];
    paretoCosto('chCostoTenido', porTenido, PALETA_SC8.alerta);
    paretoCosto('chCostoDefecto', porDefecto, PALETA_SC8.peligro);
    barrasCosto('chCostoMaqOrigen', porMaquina, PALETA_SC8.info, true);
    barrasCosto('chCostoReceta', porReceta, PALETA_SC8.primario, false);
    prioridadCosto(prioridad);
    const infoTendencia = tendenciaCosto(costo, modelo.granularidad);

    const conectarItems = (id, items, prefijo) =>
      enlazarDrill(id, i => {
        const item = items[i] || {};
        return {
          titulo: `${prefijo}: ${item.etiqueta || ''}`,
          registros: item.registros || [],
          opciones: { costo: true }
        };
      });
    conectarItems('chCostoTenido', porTenido, 'Teñido de origen');
    conectarItems('chCostoDefecto', porDefecto, 'Defecto');
    conectarItems('chCostoMaqOrigen', porMaquina, 'Máquina de origen');
    conectarItems('chCostoReceta', porReceta, 'Receta de recuperación');
    conectarItems('chCostoPrioridad', prioridad, 'Prioridad');

    enlazarDrill('chCostoTendencia', (i, datasetIndex) => {
      const item = (costo.tendencia || [])[i] || {};
      let registros = item.registros || [];
      let segmento = '';
      const series = costo.defectosTendencia || [];
      if (datasetIndex < series.length) {
        segmento = series[datasetIndex];
        registros = registros.filter(r => r.defecto === segmento);
      } else if (infoTendencia.tieneOtros &&
                 datasetIndex === series.length) {
        segmento = 'Otros';
        registros = registros.filter(r => !series.includes(r.defecto));
      }
      return {
        titulo: `Costo ${item.etiqueta || ''}${segmento ? ' · ' + segmento : ''}`,
        registros,
        opciones: { costo: true }
      };
    });
  }

  /* ---------- Vista H2O: agua consumida por periodo (apilado) ----------
     Cada columna separa los litros del LAVADO MÁQUINA (segmento ámbar en
     la base) de los del resto de procesos (azul); la altura total son los
     litros del periodo y la línea punteada su promedio. */
  function aguaLitrosApilado(id, datos) {
    const lavado  = datos.map(d => d.litrosLavado || 0);
    const resto   = datos.map(d =>
      Math.max(0, (d.litros || 0) - (d.litrosLavado || 0)));
    const totales = datos.map(d => d.litros || 0);
    const promedio = totales.length
      ? totales.reduce((s, v) => s + v, 0) / totales.length
      : 0;
    crear(id, {
      type: 'bar',
      plugins: [pluginSinDatos],
      data: {
        labels: datos.map(d => d.etiqueta),
        datasets: [
          {
            label: 'Lavado máquina', unidad: 'lt', stack: 'agua',
            data: lavado,
            backgroundColor: coloresBarras(lavado.length, PALETA_SC8.alerta),
            borderColor: PALETA_SC8.alerta, borderWidth: 1,
            maxBarThickness: 44,
            datalabels: { display: false }
          },
          {
            label: 'Otros procesos', unidad: 'lt', stack: 'agua',
            data: resto,
            backgroundColor: coloresBarras(resto.length, PALETA_SC8.info),
            borderColor: PALETA_SC8.info, borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 44,
            datalabels: {
              // La etiqueta sobre la columna muestra el TOTAL del periodo.
              display: totales.length <= 8 ? 'auto' : false,
              anchor: 'end', align: 'top', offset: 1, clamp: true,
              color: colorEtiqueta(PALETA_SC8.info),
              font: { family: fuenteBase.family, size: 13, weight: 'bold' },
              formatter: (v, ctx) => Utils.fmtEntero(totales[ctx.dataIndex] || 0)
            }
          },
          {
            type: 'line', label: 'Prom', unidad: 'lt', stack: 'prom',
            data: totales.map(() => promedio),
            borderColor: PALETA_SC8.neutro,
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            datalabels: { display: false }
          }
        ]
      },
      options: opcionesBase({
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 17 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: etiquetaResumen,
              footer: items => {
                const i = items.length ? items[0].dataIndex : 0;
                const total = totales[i] || 0;
                const pct = total ? (lavado[i] || 0) / total : 0;
                return `Total: ${Utils.fmtEntero(total)} Lt · ` +
                       `Lavado máq.: ${Utils.fmtPct(pct, 1)}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false },
               ticks: { font: fuenteBase, color: '#111111' } },
          y: { stacked: true, beginAtZero: true, grace: '12%',
               grid: { color: 'rgba(102,116,102,.10)' },
               ticks: { font: fuenteBase, color: '#111111',
                        callback: v => fmtEjeMiles(v) } }
        }
      })
    });
  }

  /* ---------- Vista H2O: consumo de agua ----------
     Barras horizontales por artículo, color o proceso: el largo de la
     barra son los litros totales (eje X en Lt) y la etiqueta al final
     muestra la intensidad Lt/kg, así una sola gráfica responde "cuánta
     agua" y "cuánta agua por kg". El tooltip desglosa litros, kg y
     Lt/kg. Si el grupo no tiene kg de carga (p. ej. LAVADO MÁQUINA sin
     tela), la intensidad se omite. */
  function aguaBarrasH(id, items) {
    crear(id, {
      type: 'bar',
      plugins: [pluginSinDatos],
      data: {
        labels: items.map(d => d.clave),
        datasets: [{
          data: items.map(d => d.litros),
          backgroundColor: PALETA_SC8.info, borderRadius: 4,
          label: 'Litros'
        }]
      },
      options: opcionesBase({
        indexAxis: 'y',
        layout: { padding: { right: 70 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const d = items[ctx.dataIndex] || {};
                return [
                  ` Agua: ${Utils.fmtEntero(d.litros)} Lt`,
                  ` Carga: ${Utils.fmtKg(d.kg)} kg`,
                  ` Intensidad: ` + (d.kg
                    ? `${Utils.fmtDecimal(d.ltPorKg, 1)} Lt/kg`
                    : '—')
                ];
              }
            }
          },
          datalabels: {
            display: true,
            anchor: 'end', align: 'end', offset: 4, clamp: true,
            color: colorEtiqueta(PALETA_SC8.info),
            font: { family: fuenteBase.family, size: fuenteBase.size, weight: 'bold' },
            formatter: (v, ctx) => {
              const d = items[ctx.dataIndex] || {};
              return d.kg ? Utils.fmtDecimal(d.ltPorKg, 1) + ' Lt/kg' : '';
            }
          }
        },
        scales: {
          x: { beginAtZero: true,
               ticks: { precision: 0, callback: v => fmtEjeMiles(v) } },
          y: { ticks: { font: fuenteBase, autoSkip: false,
                        // Nombres largos (p. ej. procesos) truncados en el
                        // eje; el tooltip conserva el nombre completo.
                        callback: function (v) {
                          return Utils.truncar(this.getLabelForValue(v), 22);
                        } } }
        }
      })
    });
  }

  /* Drill-down de la vista H2O: cada barra abre el modal con las cargas
     que la componen, con la columna de litros visible. */
  function enlazarDrilldownH2O(modelo) {
    const agua = modelo.agua || {};
    const regs = agua.registros || [];
    if (!regs.length) return;
    const porMes = modelo.granularidad === 'mes';
    const claveP = r => porMes ? r.mesPeriodo : r.semanaPeriodo;
    const opciones = { litros: true };

    const porPeriodo = id => enlazarDrill(id, (i, di) => {
      const it = (agua.tendencia || [])[i] || {};
      const enPeriodo = regs.filter(r => claveP(r) === it.periodo);
      // En la gráfica apilada, el clic sobre el segmento ámbar (dataset 0)
      // acota el detalle a las cargas de LAVADO MÁQUINA del periodo.
      const soloLavado = id === 'chAguaLitros' && di === 0;
      return {
        titulo: `${soloLavado ? 'Lavado máquina' : 'Consumo de agua'} ` +
                `${it.etiqueta || ''}`.trim(),
        registros: soloLavado
          ? enPeriodo.filter(r => r.esLavadoMaquina)
          : enPeriodo,
        opciones
      };
    });
    porPeriodo('chAguaLitros');
    porPeriodo('chAguaLtKg');

    enlazarDrill('chAguaArticulo', i => {
      const it = (agua.porArticulo || [])[i] || {};
      return { titulo: `Agua por artículo: ${it.clave || ''}`,
               registros: regs.filter(r => r.articulo === it.clave),
               opciones };
    });
    enlazarDrill('chAguaColor', i => {
      const it = (agua.porColor || [])[i] || {};
      return { titulo: `Agua por color: ${it.clave || ''}`,
               registros: regs.filter(r => r.color1 === it.clave),
               opciones };
    });
    enlazarDrill('chAguaProceso', i => {
      const it = (agua.porProceso || [])[i] || {};
      return { titulo: `Agua por proceso: ${it.clave || ''}`,
               registros: regs.filter(r => r.procesos === it.clave),
               opciones };
    });
  }

  function renderizarH2O(modelo) {
    const agua = modelo.agua || {};
    const datos = agua.tendencia || [];
    aguaLitrosApilado('chAguaLitros', datos);
    resumenConPromedio('chAguaLtKg', datos, 'ltPorKg', 'Lt/Kg',
      PALETA_SC8.info, 'ltkg');
    aguaBarrasH('chAguaArticulo', agua.porArticulo || []);
    aguaBarrasH('chAguaColor', agua.porColor || []);
    aguaBarrasH('chAguaProceso', agua.porProceso || []);
    enlazarDrilldownH2O(modelo);
  }

  /* ---------- Render completo ---------- */
  function renderizar(modelo) {
    const porKg = modelo.metrica === 'kg';
    // Los títulos de las tarjetas en kg llevan el sufijo "(Kg)"; el
    // Pareto y la dona siguen siempre en # eventos.
    document.querySelectorAll('.sc8-sufijo-metrica').forEach(el => {
      el.textContent = porKg ? ' (Kg)' : '';
    });
    pareto(modelo.pareto);
    tendencia(modelo.tendencia, modelo.granularidad, porKg);
    barrasH('chMaqOrigen', modelo.porMaqOrigen, PALETA_SC8.peligro, porKg);
    barrasH('chMaqRecuperacion', modelo.porMaqRecuperacion, PALETA_SC8.primario, porKg);
    dona(modelo.pareto);
    barrasH('chArticulo', modelo.porArticulo, PALETA_SC8.alerta, porKg);
    barrasH('chColor',    modelo.porColor,    PALETA_SC8.info,   porKg);
    barrasH('chCliente',  modelo.porCliente,  PALETA_SC8.acento, porKg);
    enlazarDrilldown(modelo);
  }

  return { renderizar, renderizarResumen, renderizarCostos, renderizarPxMaq,
           renderizarProgramacion, renderizarH2O };
})();
