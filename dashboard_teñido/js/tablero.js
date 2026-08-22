/* ============================================================
   TABLERO.JS — Vista DETALLE: tablero de gestión de tintorería
   ============================================================
   Réplica del tablero de docs/tablero-tintoreria-cofaco_4 yarek.html
   construida sobre los datos reales de Google Sheets.

   Es una vista AUTÓNOMA: no obedece los filtros del panel lateral,
   sino los suyos propios (periodo de análisis, periodo de comparación
   y tono), igual que el tablero original. main.js oculta el panel
   lateral mientras esta vista está activa.

   Equivalencias con el tablero de referencia (que usaba datos
   simulados) y los datos que sí existen en la hoja:

     tono              -> se deduce de "Colores" (CONFIG.MAPA_TONOS)
     kg de primera     -> kg procesados - kg reprocesados
     % BALP            -> % BAP = kg de primera / kg procesados
     índice reprocesos -> kg procesados / kg de primera
     sobrecosto        -> suma(Kg Carga x Costo US$/kg) de reprocesos
     costo de receta   -> suma(Kg Carga x Costo US$/kg) / kg
     agua              -> "Vol Lt Utilizados" / kg
     tiempo de teñido  -> Hora Fin - Hora Inicio de cada carga
     tiempo total      -> ciclo de la partida (de su primera Hora
                          Inicio a su última Hora Fin: incluye esperas)
     reproc. hasta res.-> cargas de reproceso por partida afectada
     % tela lavada     -> peso crudo con ruta final LAVADA / peso
                          crudo total (fuente externa de producción)

   La merma ("tela defectuosa sin solución") del tablero original NO
   existe en la hoja: no hay columna de kg descartados. Donde el
   original la usaba, aquí se muestra el costo del reproceso, que sí
   es un dato real. Está anotado en el pie de la vista.
   ============================================================ */

const Tablero = (() => {

  const $ = id => document.getElementById(id);

  /* ============================================================
     FECHAS (todo en horario local, como Utils.parseFechaDMA)
     ============================================================ */

  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const dia = (a, m, d) => new Date(a, m, d);
  const iso = f => {
    const p = n => String(n).padStart(2, '0');
    return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
  };
  const desdeIso = s => {
    const [a, m, d] = String(s).split('-').map(Number);
    return dia(a, m - 1, d);
  };
  const sumarDias = (f, n) => dia(f.getFullYear(), f.getMonth(), f.getDate() + n);
  const sumarMeses = (f, n) => {
    const a = f.getFullYear(), m = f.getMonth() + n;
    const ultimo = dia(a, m + 1, 0).getDate();
    return dia(a, m, Math.min(f.getDate(), ultimo));
  };
  const diasEn = (a, m) => dia(a, m + 1, 0).getDate();
  const difDias = (a, b) =>
    Math.round((desdeIso(b) - desdeIso(a)) / 86400000);
  const fmtFechaLarga = s => {
    const f = desdeIso(s);
    return `${f.getDate()} ${MESES_LARGOS[f.getMonth()].slice(0, 3)} ${f.getFullYear()}`;
  };
  const rotulaRango = sel => sel ? `${fmtFechaLarga(sel.a)} – ${fmtFechaLarga(sel.b)}` : '—';

  /* ============================================================
     ESTADO
     ============================================================ */

  const TODOS = '__TODOS__';

  const estado = {
    vista: 'resumen',
    sel: null,            // { a: 'AAAA-MM-DD', b: 'AAAA-MM-DD' }
    cmp: 'prev',
    cmpCustom: null,
    tono: TODOS,
    granularidad: 'semana',   // columnas de las matrices: 'mes' o 'semana'
    articulo: null,           // pestaña "Detalle por artículo"
    detTono: TODOS
  };

  /* Datos preparados: registros con fecha válida, ordenados, con su
     clave ISO ya calculada e indexados por día para acotar rápido. */
  let DATOS = null;
  let conectado = false;
  const cacheAgg = new Map();
  const cacheAggLavado = new Map();

  /* ---------- Identidad del artículo ----------
     El artículo NO se toma de la columna "Articulo" de la hoja (AH),
     que es solo la familia deducida de una lista cerrada, sino de
     "Descripcion Art.". Sus partes se separan con " | " y
     Utils.splitDescripcionArt las devuelve en r.descArts.

     El 64% de las cargas tiñe DOS telas juntas (la tela y su rib), y
     sus kg son de las dos a la vez: repartirlos entre ambas duplicaría
     el volumen y descuadraría los totales. Por eso cada combinación es
     un artículo propio, con las descripciones separadas por " | ".

     Se usa " | " y no " + " porque las propias descripciones llevan
     signos "+" ("0 + 20Dn SPANDEX"), que harían ilegible el corte.

     Cuando una de las telas es un JERSEY se coloca primero: es la tela
     principal y el resto (rib, cuello) la acompaña. En la hoja el
     JERSEY viene en segundo o tercer lugar en 569 de las 951 cargas
     que lo llevan. Ningún par aparece en dos órdenes distintos, así
     que reordenar no fusiona ni parte grupos. */
  const SIN_DESCRIPCION = '(Sin descripción)';
  const SEPARADOR_ARTICULO = ' | ';

  /* El pipe es un separador explícito y sus partes se respetan sin
     heurísticas. La detección por tipo de tela queda como compatibilidad
     para filas históricas que aún usan doble espacio. */
  function partesArticulo(r) {
    const brutas = (r.descArts && r.descArts.length)
      ? r.descArts
      : (r.descArt ? [r.descArt] : []);
    if (r.descArtsConSeparadorExplicito)
      return brutas.map(Utils.texto).filter(Boolean);
    const partes = [];
    for (const bruta of brutas) {
      const p = Utils.texto(bruta);
      if (!p) continue;
      const clave = Utils.clave(p);
      const abreNueva = !partes.length ||
        CONFIG.TIPOS_TELA.some(t => clave.includes(Utils.clave(t)));
      if (abreNueva) partes.push(p);
      else partes[partes.length - 1] += '  ' + p;
    }
    return partes;
  }

  /* Posición de una descripción en CONFIG.TELAS_PRINCIPALES; las que no
     son telas principales van al final. */
  function prioridadTela(p) {
    const clave = Utils.clave(p);
    const i = CONFIG.TELAS_PRINCIPALES
      .findIndex(t => clave.includes(Utils.clave(t)));
    return i < 0 ? CONFIG.TELAS_PRINCIPALES.length : i;
  }

  function descripcionArticulo(r) {
    const partes = partesArticulo(r);
    if (!partes.length) return SIN_DESCRIPCION;
    /* Orden estable: solo se adelantan las telas principales (y entre
       ellas manda el orden de la lista); el resto conserva el orden en
       que viene en la hoja. */
    return partes
      .map((p, i) => ({ p, i, prioridad: prioridadTela(p) }))
      .sort((a, b) => a.prioridad - b.prioridad || a.i - b.i)
      .map(x => x.p)
      .join(SEPARADOR_ARTICULO);
  }

  function preparar() {
    const regs = (Datos.Estado.registros || [])
      .filter(r => r.fecha instanceof Date && !isNaN(r.fecha));
    regs.forEach(r => {
      r.isoFecha = iso(r.fecha);
      r.articuloDesc = descripcionArticulo(r);
    });
    regs.sort((x, y) => x.fecha - y.fecha);
    /* Índice por artículo: las matrices piden un agregado por artículo y
       periodo, y con ~160 artículos recorrer todos los registros en cada
       celda sería lento. */
    const porArticulo = new Map();
    for (const r of regs) {
      let lista = porArticulo.get(r.articuloDesc);
      if (!lista) porArticulo.set(r.articuloDesc, lista = []);
      lista.push(r);
    }

    const telaLavada = (Datos.Estado.telaLavada || []).map(r => ({
      articulo: Utils.texto(r.articulo),
      articuloClave: Utils.clave(r.articulo),
      pesoKg: Utils.numero(r.pesoKg),
      ruta: Utils.clave(r.ruta),
      fecha: Utils.texto(r.fecha)
    })).filter(r => r.articulo && r.pesoKg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const lavadoPorArticulo = new Map();
    for (const r of telaLavada) {
      let grupo = lavadoPorArticulo.get(r.articuloClave);
      if (!grupo) {
        grupo = { nombre: r.articulo, regs: [] };
        lavadoPorArticulo.set(r.articuloClave, grupo);
      }
      grupo.regs.push(r);
    }
    DATOS = {
      regs, porArticulo, telaLavada, lavadoPorArticulo,
      min: regs.length ? regs[0].isoFecha : null,
      max: regs.length ? regs[regs.length - 1].isoFecha : null,
      lavadoMin: telaLavada.length ? telaLavada[0].fecha : null,
      lavadoMax: telaLavada.length ? telaLavada[telaLavada.length - 1].fecha : null
    };
    cacheAgg.clear();
    cacheAggLavado.clear();
    return DATOS;
  }

  /* ============================================================
     AGREGACIÓN
     ============================================================ */

  const claveArticulo = r => r.articuloDesc;

  function registrosEn(sel, articulo, tono) {
    const t = tono === undefined ? estado.tono : tono;
    const fuente = articulo
      ? (DATOS.porArticulo.get(articulo) || [])
      : DATOS.regs;
    const salida = [];
    for (const r of fuente) {
      if (r.isoFecha < sel.a || r.isoFecha > sel.b) continue;
      if (t && t !== TODOS && r.tono !== t) continue;
      salida.push(r);
    }
    return salida;
  }

  /* Métricas de un conjunto de cargas. Todas las razones se calculan
     sobre los kg realmente disponibles para esa métrica (p. ej. el
     tiempo solo sobre las cargas que tienen Hora Inicio y Hora Fin),
     para no diluir el indicador con cargas sin dato. */
  function metricas(regs, sel) {
    const dias = sel ? difDias(sel.a, sel.b) + 1 : 1;
    const partidas = new Set(), partidasRep = new Set();
    let kg = 0, kgRep = 0, cargas = 0, cargasRep = 0;
    let costo = 0, sobrecosto = 0, litros = 0;
    let minutos = 0, cargasConTiempo = 0, kgConTiempo = 0;
    const ciclo = new Map();   // partida -> { ini, fin, kg }

    for (const r of regs) {
      cargas++;
      kg += r.kgCarga;
      costo += r.kgCarga * r.costoPorKg;
      litros += r.volLt || 0;
      r.partidas.forEach(p => partidas.add(p));
      if (r.esReproceso) {
        cargasRep++;
        kgRep += r.kgCarga;
        sobrecosto += r.kgCarga * r.costoPorKg;
        r.partidas.forEach(p => partidasRep.add(p));
      }
      if (r.horaInicio && r.horaFin && r.horaFin > r.horaInicio) {
        minutos += (r.horaFin - r.horaInicio) / 60000;
        cargasConTiempo++;
        kgConTiempo += r.kgCarga;
        r.partidas.forEach(p => {
          const c = ciclo.get(p);
          if (!c) ciclo.set(p, { ini: r.horaInicio, fin: r.horaFin, kg: r.kgCarga });
          else {
            if (r.horaInicio < c.ini) c.ini = r.horaInicio;
            if (r.horaFin > c.fin) c.fin = r.horaFin;
            c.kg += r.kgCarga;
          }
        });
      }
    }

    let cicloMin = 0, cicloKg = 0, cicloN = 0;
    ciclo.forEach(c => {
      cicloMin += (c.fin - c.ini) / 60000;
      cicloKg += c.kg;
      cicloN++;
    });

    const kgBap = Math.max(0, kg - kgRep);
    return {
      regs, dias, kg, kgBap, kgRep, cargas, cargasRep,
      partidas: partidas.size,
      partidasRep: partidasRep.size,
      costoTotal: costo,
      sobrecosto,
      litros,
      balpPct: kg ? 100 * kgBap / kg : null,
      repPct:  kg ? 100 * kgRep / kg : null,
      // Kg que pasan por máquina por cada kg bueno (objetivo 1,00).
      indice:  kgBap ? kg / kgBap : (kg ? Infinity : null),
      costoKg: kg ? costo / kg : null,
      aguaKg:  kg ? litros / kg : null,
      // Reprocesos que costó resolver cada partida afectada.
      reproProm: partidasRep.size ? cargasRep / partidasRep.size : null,
      // Minutos de máquina por kg y duración media de una carga.
      tTenidoKg: kgConTiempo ? minutos / kgConTiempo : null,
      curvaProm: cargasConTiempo ? minutos / cargasConTiempo : null,
      // Ciclo completo de la partida en tintorería (incluye esperas).
      tTotKg:  cicloKg ? cicloMin / cicloKg : null,
      totProm: cicloN ? cicloMin / cicloN : null,
      kgDia: kg / dias,
      kgBapDia: kgBap / dias
    };
  }

  function agg(sel, articulo, tono) {
    if (!sel) return metricas([], null);
    const clave = [sel.a, sel.b, articulo || '', tono === undefined ? estado.tono : tono].join('|');
    if (cacheAgg.has(clave)) return cacheAgg.get(clave);
    const m = metricas(registrosEn(sel, articulo, tono), sel);
    cacheAgg.set(clave, m);
    return m;
  }

  /* ============================================================
     PERIODOS (columnas de las matrices)
     ============================================================ */

  /* Devuelve los periodos (mes o semana) que toca el rango, cada uno
     con su sub-rango de fechas recortado al rango elegido. `parcial`
     marca los que el rango corta por la mitad. */
  function periodosEn(sel) {
    const porMes = estado.granularidad === 'mes';
    const vistos = new Map();
    for (const r of DATOS.regs) {
      if (r.isoFecha < sel.a || r.isoFecha > sel.b) continue;
      const k = porMes ? r.mes : r.semana;
      if (!k) continue;
      const p = vistos.get(k);
      if (!p) vistos.set(k, { clave: k, a: r.isoFecha, b: r.isoFecha });
      else {
        if (r.isoFecha < p.a) p.a = r.isoFecha;
        if (r.isoFecha > p.b) p.b = r.isoFecha;
      }
    }
    const lista = [...vistos.values()];
    lista.sort(porMes
      ? (x, y) => String(x.clave).localeCompare(String(y.clave))
      : (x, y) => Utils.numero(x.clave) - Utils.numero(y.clave));
    // Un periodo es parcial si el rango no cubre su extensión completa
    // en los datos (se compara contra todo el histórico, no solo el rango).
    const completo = new Map();
    for (const r of DATOS.regs) {
      const k = porMes ? r.mes : r.semana;
      if (!k) continue;
      const c = completo.get(k);
      if (!c) completo.set(k, { a: r.isoFecha, b: r.isoFecha });
      else {
        if (r.isoFecha < c.a) c.a = r.isoFecha;
        if (r.isoFecha > c.b) c.b = r.isoFecha;
      }
    }
    lista.forEach(p => {
      const c = completo.get(p.clave);
      p.parcial = !!c && (p.a !== c.a || p.b !== c.b);
      p.etiqueta = porMes ? Utils.mesCorto(p.clave) : 'Sem ' + p.clave;
    });
    return lista;
  }

  /* Todos los periodos del histórico, para las gráficas del resumen
     (que muestran la serie completa y resaltan el rango elegido). */
  function periodosHistoricos() {
    return periodosEn({ a: DATOS.min, b: DATOS.max });
  }

  const rotuloPeriodo = p => p.etiqueta + (p.parcial ? '*' : '');
  const notaParcial = periodos => periodos.some(p => p.parcial)
    ? '<p class="sc8-tab-nota-pie">* periodo parcial: solo incluye los días que caen dentro del rango elegido.</p>'
    : '';

  /* ============================================================
     PERIODO DE COMPARACIÓN
     ============================================================ */

  function rangoComparacion(sel, modo, personalizado) {
    const a = desdeIso(sel.a), b = desdeIso(sel.b);
    const largo = difDias(sel.a, sel.b) + 1;
    let r = null;
    if (modo === 'prev')
      r = { a: sumarDias(a, -largo), b: sumarDias(a, -1) };
    else if (modo === 'yoy')
      r = { a: dia(a.getFullYear() - 1, a.getMonth(), a.getDate()),
            b: dia(b.getFullYear() - 1, b.getMonth(), b.getDate()) };
    else if (modo === 'avg6')
      r = { a: sumarMeses(a, -6), b: sumarDias(a, -1) };
    else if (modo === 'avg12')
      r = { a: sumarMeses(a, -12), b: sumarDias(a, -1) };
    else if (modo === 'custom')
      return personalizado || null;
    if (!r) return null;
    const salida = { a: iso(r.a), b: iso(r.b) };
    // Sin histórico suficiente no hay base contra la cual comparar.
    if (salida.b < DATOS.min) return null;
    if (salida.a < DATOS.min) salida.a = DATOS.min;
    return salida;
  }

  /* ============================================================
     COMPONENTES DE PRESENTACIÓN
     ============================================================ */

  const esc = s => Utils.escapeHtml(s);
  const el = (tag, clase, html) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  const fmt = {
    kg:  v => v === null || v === undefined || isNaN(v) ? 'N/A' : Utils.fmtEntero(v),
    n:   (v, d = 2) => v === null || v === undefined || isNaN(v)
           ? 'N/A' : Utils.fmtDecimal(v, d),
    pct: (v, d = 1) => v === null || v === undefined || isNaN(v)
           ? 'N/A' : Utils.fmtDecimal(v, d) + '%',
    usd: v => v === null || v === undefined || isNaN(v)
           ? 'N/A' : Utils.fmtDolares(v),
    ton: v => v === null || v === undefined || isNaN(v)
           ? 'N/A' : Utils.fmtDecimal(v / 1000, 1),
    indice: v => v === null || v === undefined ? 'N/A'
           : !isFinite(v) ? '∞' : Utils.fmtDecimal(v, 2)
  };

  /* Semáforos. El corte verde de BAP sale de CONFIG.OBJETIVO_BAP. */
  function semBap(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    const obj = CONFIG.OBJETIVO_BAP;
    return v >= obj ? 'sem-g' : v >= obj - 5 ? 'sem-y'
         : v >= obj - 10 ? 'sem-o' : 'sem-r';
  }
  function semIndice(v) {
    if (v === null || v === undefined) return '';
    if (!isFinite(v)) return 'sem-r';
    return v < 1.05 ? 'sem-g' : v < 1.15 ? 'sem-y' : v < 1.30 ? 'sem-o' : 'sem-r';
  }

  /* Chip de variación. `dir` = +1 si subir es bueno, -1 si es malo,
     0 si es neutro (solo informa el cambio, sin color). */
  function chipDelta(actual, base, dir) {
    const vacio = v => v === null || v === undefined || isNaN(v);
    if (vacio(base) || base === 0 || vacio(actual))
      return '<span class="sc8-tab-delta plana">sin base</span>';
    const d = (actual - base) / Math.abs(base);
    if (Math.abs(d) < 0.0005)
      return '<span class="sc8-tab-delta plana">0,0%</span>';
    const bueno = dir === 0 ? null : (d > 0 ? dir > 0 : dir < 0);
    const clase = dir === 0 ? 'plana' : (bueno ? 'buena' : 'mala');
    return `<span class="sc8-tab-delta ${clase}">${d > 0 ? '▲' : '▼'} ` +
           `${fmt.n(Math.abs(d) * 100, 1)}%</span>`;
  }

  function ficha(rotulo, valorHtml, actual, base, dir, pie) {
    return `<div class="sc8-tab-ficha">
      <div class="rotulo">${rotulo}</div>
      <div class="linea">
        <span class="valor">${valorHtml}</span>
        ${chipDelta(actual, base, dir)}
        <span class="pie">${pie || ''}</span>
      </div>
    </div>`;
  }

  /* ---------- Tooltip flotante ---------- */
  function conectarTips(raiz) {
    const tip = $('tabTooltip');
    raiz.querySelectorAll('[data-tip]').forEach(n => {
      n.addEventListener('pointermove', ev => {
        tip.classList.remove('oculto');
        tip.innerHTML = n.dataset.tip;
        const ancho = tip.offsetWidth;
        let x = ev.clientX + 14;
        if (x + ancho > window.innerWidth - 8) x = ev.clientX - ancho - 14;
        tip.style.left = x + 'px';
        tip.style.top = (ev.clientY + 14) + 'px';
      });
      n.addEventListener('pointerleave', () => tip.classList.add('oculto'));
    });
  }

  /* ---------- Ordenamiento de tablas ---------- */
  function valorOrden(td) {
    const t = Utils.texto(td ? td.textContent : '');
    if (!t || t === '—' || t === 'N/A') return null;
    const limpio = t.replace(/\./g, '').replace(',', '.');
    const m = limpio.match(/-?\d+(\.\d+)?/);
    if (m && !/[a-záéíóúñ]/i.test(limpio)) return parseFloat(m[0]);
    return t.toLowerCase();
  }

  function hacerOrdenables(raiz) {
    raiz.querySelectorAll('table:not(.sin-orden)').forEach(tabla => {
      const ths = tabla.querySelectorAll('thead th');
      ths.forEach(th => {
        th.classList.add('sc8-th-orden');
        th.title = 'Clic para ordenar';
        th.addEventListener('click', () => {
          const cuerpo = tabla.tBodies[0];
          if (!cuerpo) return;
          const i = th.cellIndex;
          const dir = tabla.dataset.ordenCol === String(i)
            ? -(+tabla.dataset.ordenDir) : -1;
          tabla.dataset.ordenCol = i;
          tabla.dataset.ordenDir = dir;
          const filas   = [...cuerpo.rows].filter(f => !f.classList.contains('total'));
          const fijas   = [...cuerpo.rows].filter(f =>  f.classList.contains('total'));
          filas.sort((f1, f2) => {
            const v1 = valorOrden(f1.cells[i]), v2 = valorOrden(f2.cells[i]);
            if (v1 === null && v2 === null) return 0;
            if (v1 === null) return 1;
            if (v2 === null) return -1;
            if (typeof v1 === 'string' || typeof v2 === 'string')
              return dir * String(v1).localeCompare(String(v2), 'es');
            return dir * (v1 - v2);
          });
          filas.forEach(f => cuerpo.appendChild(f));
          fijas.forEach(f => cuerpo.appendChild(f));
          ths.forEach(o => o.classList.remove('asc', 'desc'));
          th.classList.add(dir > 0 ? 'asc' : 'desc');
        });
      });
    });
  }

  /* ============================================================
     GRÁFICAS (SVG en línea, sin dependencias)
     ============================================================ */

  const COLOR_BARRA = PALETA_SC8.primario;
  const COLOR_APAGADO = '#cfdcc8';
  const COLOR_EJE = '#a9bf9a';
  const COLOR_REJILLA = '#e2ecdc';
  const COLOR_TEXTO = '#667466';

  function graficaBarras(serie, opciones) {
    const W = 560, H = 210, pl = 52, pr = 12, pt = 14, pb = 30;
    const cw = W - pl - pr, ch = H - pt - pb;
    const max = Math.max(...serie.map(s => s.v), 0) * 1.12 || 1;
    const n = serie.length || 1;
    const paso = cw / n, ancho = Math.min(22, paso * 0.66);
    let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opciones.titulo)}">`;
    for (let i = 0; i <= 4; i++) {
      const y = pt + ch - ch * i / 4;
      g += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="${COLOR_REJILLA}"/>` +
           `<text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLOR_TEXTO}">` +
           `${opciones.fmtEje(max * i / 4)}</text>`;
    }
    serie.forEach((s, i) => {
      const x = pl + paso * i + (paso - ancho) / 2;
      const h = ch * (s.v / max), y = pt + ch - h;
      g += `<g class="sc8-tab-barra" data-tip="${esc(s.tip)}">` +
           `<rect x="${pl + paso * i}" y="${pt}" width="${paso}" height="${ch}" fill="transparent"/>` +
           `<rect class="barra" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" ` +
           `height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${s.dentro ? COLOR_BARRA : COLOR_APAGADO}"/></g>`;
      if (i % Math.ceil(n / 10) === 0 || i === n - 1)
        g += `<text x="${pl + paso * i + paso / 2}" y="${H - 8}" text-anchor="middle" ` +
             `font-size="10" fill="${COLOR_TEXTO}">${esc(s.rotulo)}</text>`;
    });
    g += `<line x1="${pl}" y1="${pt + ch}" x2="${W - pr}" y2="${pt + ch}" stroke="${COLOR_EJE}"/></svg>`;
    return g;
  }

  function graficaLinea(serie, opciones) {
    const W = 560, H = 210, pl = 48, pr = 16, pt = 14, pb = 30;
    const cw = W - pl - pr, ch = H - pt - pb;
    const valores = serie.filter(s => s.v !== null).map(s => s.v);
    if (!valores.length) return '<p class="sc8-vacio">Sin datos.</p>';
    const ref = opciones.ref;
    const lo = Math.min(...valores, ref === undefined ? Infinity : ref);
    const hi = Math.max(...valores, ref === undefined ? -Infinity : ref);
    const min = Math.max(0, lo - (hi - lo) * 0.25 - 1);
    const max = hi + (hi - lo) * 0.15 + 1;
    const n = serie.length, paso = cw / (n - 1 || 1);
    const X = i => pl + paso * i;
    const Y = v => pt + ch - ch * (v - min) / (max - min || 1);
    let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opciones.titulo)}">`;
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * i / 4, y = Y(v);
      g += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="${COLOR_REJILLA}"/>` +
           `<text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLOR_TEXTO}">` +
           `${opciones.fmtEje(v)}</text>`;
    }
    if (ref !== undefined) {
      const y = Y(ref);
      g += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="${PALETA_SC8.alerta}" ` +
           `stroke-dasharray="5 4"/>` +
           `<text x="${W - pr}" y="${y - 5}" text-anchor="end" font-size="10" ` +
           `fill="${PALETA_SC8.alerta}">${esc(opciones.refRotulo)}</text>`;
    }
    let ruta = '';
    serie.forEach((s, i) => {
      if (s.v === null) return;
      ruta += (ruta ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(s.v).toFixed(1);
    });
    g += `<path d="${ruta}" fill="none" stroke="${COLOR_BARRA}" stroke-width="2" ` +
         `stroke-linejoin="round" stroke-linecap="round"/>`;
    serie.forEach((s, i) => {
      if (s.v === null) return;
      g += `<g data-tip="${esc(s.tip)}">` +
           `<rect x="${X(i) - paso / 2}" y="${pt}" width="${paso}" height="${ch}" fill="transparent"/>` +
           `<circle cx="${X(i).toFixed(1)}" cy="${Y(s.v).toFixed(1)}" r="${s.dentro ? 4.5 : 3}" ` +
           `fill="${s.dentro ? COLOR_BARRA : COLOR_APAGADO}" stroke="#fff" stroke-width="2"/></g>`;
      if (i % Math.ceil(n / 10) === 0 || i === n - 1)
        g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10" ` +
             `fill="${COLOR_TEXTO}">${esc(s.rotulo)}</text>`;
    });
    g += `<line x1="${pl}" y1="${pt + ch}" x2="${W - pr}" y2="${pt + ch}" stroke="${COLOR_EJE}"/></svg>`;
    return g;
  }

  /* ============================================================
     SELECTOR DE RANGO DE FECHAS (popover con doble calendario)
     ============================================================ */

  function presets() {
    const max = desdeIso(DATOS.max);
    const p = [
      { k: '30d', lbl: 'Últimos 30 días',  a: iso(sumarDias(max, -29)), b: DATOS.max },
      { k: '90d', lbl: 'Últimos 90 días',  a: iso(sumarDias(max, -89)), b: DATOS.max },
      { k: '6m',  lbl: 'Últimos 6 meses',  a: iso(sumarDias(sumarMeses(max, -6), 1)), b: DATOS.max },
      { k: 'tm',  lbl: 'Este mes',         a: iso(dia(max.getFullYear(), max.getMonth(), 1)), b: DATOS.max },
      { k: 'pm',  lbl: 'Mes anterior',
        a: iso(dia(max.getFullYear(), max.getMonth() - 1, 1)),
        b: iso(dia(max.getFullYear(), max.getMonth(), 0)) },
      { k: 'ty',  lbl: 'Este año',         a: iso(dia(max.getFullYear(), 0, 1)), b: DATOS.max },
      { k: 'all', lbl: 'Todo el histórico', a: DATOS.min, b: DATOS.max }
    ];
    // Se recortan al histórico disponible y se descartan los vacíos.
    return p
      .map(x => ({ ...x, a: x.a < DATOS.min ? DATOS.min : x.a }))
      .filter(x => x.a <= x.b);
  }

  function selectorFechas(pop, boton, obtener, alAplicar) {
    let tmpA = null, tmpB = null, mesVista = null, abierto = false;

    const mesesDisponibles = () => {
      const min = desdeIso(DATOS.min), max = desdeIso(DATOS.max);
      const lista = [];
      let f = dia(min.getFullYear(), min.getMonth(), 1);
      while (f <= max) {
        lista.push({ a: f.getFullYear(), m: f.getMonth() });
        f = dia(f.getFullYear(), f.getMonth() + 1, 1);
      }
      return lista;
    };

    function acotar(i) {
      const n = mesesDisponibles().length;
      return Math.max(0, Math.min(Math.max(0, n - 2), i));
    }

    function calendario(indice) {
      const meses = mesesDisponibles();
      const mo = meses[indice];
      if (!mo) return '';
      const primero = dia(mo.a, mo.m, 1);
      const desfase = (primero.getDay() + 6) % 7;   // lunes primero
      const total = diasEn(mo.a, mo.m);
      const nombre = MESES_LARGOS[mo.m];
      let h = '<div class="cal"><div class="cal-cab">';
      h += `<button type="button" data-nav="-1"${acotar(mesVista - 1) === mesVista ? ' disabled' : ''} aria-label="Mes anterior">‹</button>`;
      h += `<span class="mes">${nombre[0].toUpperCase() + nombre.slice(1)} ${mo.a}</span>`;
      h += `<button type="button" data-nav="1"${acotar(mesVista + 1) === mesVista ? ' disabled' : ''} aria-label="Mes siguiente">›</button>`;
      h += '</div><div class="dow">' + DIAS_SEMANA.map(d => `<span>${d}</span>`).join('') + '</div><div class="dias">';
      for (let i = 0; i < desfase; i++) h += '<button type="button" disabled></button>';
      for (let d = 1; d <= total; d++) {
        const ds = iso(dia(mo.a, mo.m, d));
        const fuera = ds < DATOS.min || ds > DATOS.max;
        let c = '';
        if (tmpA && ds === tmpA) c += ' a';
        if (tmpB && ds === tmpB) c += ' b';
        if (tmpA && tmpB && ds > tmpA && ds < tmpB) c += ' dentro';
        h += `<button type="button" data-d="${ds}"${fuera ? ' disabled' : ''}` +
             `${c ? ` class="${c.trim()}"` : ''}>${d}</button>`;
      }
      return h + '</div></div>';
    }

    function pintar() {
      const lista = presets();
      let h = '<div class="pop-cuerpo"><div class="presets">';
      lista.forEach(p => {
        const on = tmpA === p.a && tmpB === p.b;
        h += `<button type="button" data-p="${p.k}"${on ? ' class="on"' : ''}>` +
             `<span class="ck">${on ? '✓' : ''}</span>${p.lbl}</button>`;
      });
      h += '</div><div class="cals">' + calendario(mesVista) + calendario(mesVista + 1) + '</div></div>';
      h += '<div class="pop-pie"><span class="sel">' +
        (tmpA ? (tmpB ? `${fmtFechaLarga(tmpA)} – ${fmtFechaLarga(tmpB)}`
                      : `${fmtFechaLarga(tmpA)} – <i>elige fin</i>`)
              : 'Elige la fecha de inicio') +
        '</span><span class="acciones">' +
        '<button type="button" class="cancelar">Cancelar</button>' +
        `<button type="button" class="aplicar"${tmpA && tmpB ? '' : ' disabled'}>Aplicar</button>` +
        '</span></div>';
      pop.innerHTML = h;

      pop.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
        const p = lista.find(x => x.k === b.dataset.p);
        tmpA = p.a; tmpB = p.b;
        mesVista = acotar(indiceMes(p.b) - 1);
        pintar();
      }));
      pop.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
        mesVista = acotar(mesVista + Number(b.dataset.nav));
        pintar();
      }));
      pop.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
        const ds = b.dataset.d;
        if (!tmpA || (tmpA && tmpB)) { tmpA = ds; tmpB = null; }
        else if (ds < tmpA) tmpA = ds;
        else tmpB = ds;
        pintar();
      }));
      pop.querySelector('.cancelar').addEventListener('click', cerrar);
      pop.querySelector('.aplicar').addEventListener('click', () => {
        if (tmpA && tmpB) { alAplicar({ a: tmpA, b: tmpB }); cerrar(); }
      });
    }

    function indiceMes(ds) {
      const f = desdeIso(ds), min = desdeIso(DATOS.min);
      return (f.getFullYear() - min.getFullYear()) * 12 + (f.getMonth() - min.getMonth());
    }

    function abrir() {
      const actual = obtener() || { a: DATOS.min, b: DATOS.max };
      tmpA = actual.a; tmpB = actual.b;
      mesVista = acotar(indiceMes(actual.b) - 1);
      pop.classList.remove('oculto');
      abierto = true;
      pintar();
    }
    function cerrar() { pop.classList.add('oculto'); abierto = false; }

    boton.addEventListener('click', ev => {
      ev.stopPropagation();
      abierto ? cerrar() : abrir();
    });
    pop.addEventListener('click', ev => ev.stopPropagation());
    document.addEventListener('click', () => { if (abierto) cerrar(); });
  }

  /* ============================================================
     APOYO COMÚN A LAS PESTAÑAS
     ============================================================ */

  const rotuloTono = () => estado.tono === TODOS ? '' : ' · Tono: ' + estado.tono;

  /* Las descripciones reales son largas (hasta ~110 caracteres cuando la
     carga lleva dos telas). Se entrega el texto completo y CSS lo recorta
     contra el borde real de la columna; el title conserva el valor íntegro. */
  const rotuloArticulo = nombre =>
    `<span class="sc8-tab-art" title="${esc(nombre)}">${esc(nombre)}</span>`;

  /* Artículos con producción en el rango, de mayor a menor volumen. */
  function articulosPorVolumen(sel) {
    const kg = new Map();
    for (const r of registrosEn(sel)) {
      const k = claveArticulo(r);
      kg.set(k, (kg.get(k) || 0) + r.kgCarga);
    }
    return [...kg.entries()]
      .filter(([, v]) => v > 0)
      .sort((x, y) => y[1] - x[1])
      .map(([nombre]) => ({ nombre, m: agg(sel, nombre) }));
  }

  /* Serie del indicador `prop` a lo largo de TODO el histórico, para
     poder comparar un periodo contra el anterior aunque ese anterior
     quede fuera del rango elegido. */
  function serieHistorica(articulo, prop) {
    return periodosHistoricos().map(p => {
      const m = agg({ a: p.a, b: p.b }, articulo);
      return { clave: p.clave, v: m.kg ? m[prop] : null };
    });
  }

  /* Variación del último periodo con datos del rango contra el promedio
     de los 6 periodos previos con datos (los del histórico, no solo los
     del rango). Devuelve null si no hay base suficiente. */
  function varPrevios(articulo, periodos, prop) {
    const serie = serieHistorica(articulo, prop);
    const indice = new Map(serie.map((s, i) => [String(s.clave), i]));
    let ultimo = null;
    for (let i = periodos.length - 1; i >= 0; i--) {
      const j = indice.get(String(periodos[i].clave));
      if (j !== undefined && serie[j].v !== null && isFinite(serie[j].v)) {
        ultimo = { j, v: serie[j].v };
        break;
      }
    }
    if (!ultimo) return null;
    const previos = [];
    for (let j = ultimo.j - 1; j >= 0 && previos.length < 6; j--)
      if (serie[j].v !== null && isFinite(serie[j].v)) previos.push(serie[j].v);
    if (previos.length < 2) return null;
    const prom = previos.reduce((s, v) => s + v, 0) / previos.length;
    if (!prom) return null;
    return { d: (ultimo.v - prom) / prom, actual: ultimo.v, prom };
  }

  function celdaVar(v, dir, fmtCelda) {
    if (!v) return '<td class="sc8-tab-nd">—</td>';
    const clase = Math.abs(v.d) < 0.005 ? 'plana'
      : dir === 0 ? 'plana' : ((v.d > 0 ? dir > 0 : dir < 0) ? 'buena' : 'mala');
    const signo = (v.d > 0 ? '+' : '−') + fmt.n(Math.abs(v.d) * 100, 1) + '%';
    return `<td><span class="sc8-tab-var ${clase}" data-tip="Último periodo: <b>${esc(fmtCelda(v.actual))}</b>` +
           `<br>Promedio de los 6 previos: ${esc(fmtCelda(v.prom))}">${signo}</span></td>`;
  }

  /* ============================================================
     PESTAÑA 1 · RESUMEN GENERAL
     ============================================================ */

  function vistaResumen(actual, base, sel, cmpRango) {
    const H = el('div');
    if (!actual.kg) {
      H.innerHTML = '<div class="sc8-card"><p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p></div>';
      return H;
    }
    const b = base && base.kg ? base : null;
    const lavado = aggTelaLavada(sel);
    const lavadoBase = cmpRango ? aggTelaLavada(cmpRango) : null;
    const vs = txt => b ? 'vs ' + txt : '—';

    let t = '<div class="sc8-tab-fichas">';
    t += ficha('Producción de primera',
      `${fmt.ton(actual.kgBap)}<small>t</small>`,
      actual.kgBapDia, b ? b.kgBapDia : null, 1,
      b ? vs(`${fmt.n(b.kgBapDia * actual.dias / 1000, 1)} t (a ritmo diario)`) : '—');
    t += ficha(`% BAP <span class="nota">(bien a la primera, en kg)</span>`,
      `${fmt.n(actual.balpPct, 1)}<small>%</small>`,
      actual.balpPct, b ? b.balpPct : null, 1,
      b ? vs(fmt.pct(b.balpPct)) : '—');
    t += ficha('Índice de reprocesos <span class="nota">(kg procesados / kg de primera · obj. 1,00)</span>',
      `${fmt.indice(actual.indice)}<small>×</small>`,
      isFinite(actual.indice) ? actual.indice : null,
      b && isFinite(b.indice) ? b.indice : null, -1,
      b ? vs(fmt.indice(b.indice)) : '—');
    t += ficha('Sobrecosto por reprocesos',
      fmt.usd(actual.sobrecosto),
      actual.sobrecosto / actual.dias, b ? b.sobrecosto / b.dias : null, -1,
      b ? vs(`${fmt.usd(b.sobrecosto / b.dias * actual.dias)} (a ritmo diario)`) : '—');
    t += ficha('Costo de receta',
      `${fmt.n(actual.costoKg, 2)}<small>$/kg</small>`,
      actual.costoKg, b ? b.costoKg : null, -1,
      b ? vs(`$${fmt.n(b.costoKg, 2)}/kg`) : '—');
    t += ficha('Consumo de agua',
      `${fmt.n(actual.aguaKg, 0)}<small>L/kg</small>`,
      actual.aguaKg, b ? b.aguaKg : null, -1,
      b ? vs(`${fmt.n(b.aguaKg, 0)} L/kg`) : '—');
    t += ficha('Tiempo de teñido <span class="nota">(máquina)</span>',
      `${fmt.n(actual.tTenidoKg, 2)}<small>min/kg</small>`,
      actual.tTenidoKg, b ? b.tTenidoKg : null, -1,
      b ? vs(`${fmt.n(b.tTenidoKg, 2)} min/kg`) : '—');
    t += ficha('Tiempo total en tintorería <span class="nota">(ciclo de la ptda.)</span>',
      `${fmt.n(actual.tTotKg, 2)}<small>min/kg</small>`,
      actual.tTotKg, b ? b.tTotKg : null, -1,
      b ? vs(`${fmt.n(b.tTotKg, 2)} min/kg`) : '—');
    t += ficha('Reprocesos hasta resolver <span class="nota">(cargas por ptda. afectada)</span>',
      `${fmt.n(actual.reproProm, 1)}<small>cargas</small>`,
      actual.reproProm, b ? b.reproProm : null, -1,
      b ? vs(`${fmt.n(b.reproProm, 1)} cargas`) : '—');
    t += ficha('Kg reprocesados',
      `${fmt.ton(actual.kgRep)}<small>t</small>`,
      actual.repPct, b ? b.repPct : null, -1,
      `${fmt.pct(actual.repPct)} de lo procesado` + (b ? ` · vs ${fmt.pct(b.repPct)}` : ''));
    t += ficha('Tela lavada',
      `${lavado.kg ? fmt.n(lavado.pct, 1) : 'N/A'}<small>%</small>`,
      lavado.kg ? lavado.pct : null,
      lavadoBase && lavadoBase.kg ? lavadoBase.pct : null, 0,
      lavadoBase && lavadoBase.kg ? `vs ${fmt.pct(lavadoBase.pct)}` : '—');
    t += ficha(`Ptdas. procesadas <span class="nota">(${fmt.n(100 * actual.partidasRep / (actual.partidas || 1), 1)}% con reproceso)</span>`,
      fmt.kg(actual.partidas),
      actual.partidas / actual.dias, b ? b.partidas / b.dias : null, 0,
      b ? vs(`${fmt.n(b.partidas / b.dias, 1)} ptdas/día`) : '—');
    t += '</div>';
    H.innerHTML = t;

    /* --- Gráficas: serie histórica con el rango resaltado --- */
    const historicos = periodosHistoricos();
    const dentro = p => !(p.b < sel.a || p.a > sel.b);
    const g = el('div', 'sc8-tab-grid2');

    const barras = historicos.map(p => {
      const m = agg({ a: p.a, b: p.b });
      return {
        v: m.kg ? m.kgBap / 1000 : 0,
        rotulo: p.etiqueta,
        dentro: dentro(p),
        tip: `<b>${p.etiqueta}${rotuloTono()}</b><br>De primera: <b>${fmt.n(m.kgBap / 1000, 1)} t</b>` +
             `<br>Procesado: ${fmt.n(m.kg / 1000, 1)} t<br>Reprocesado: ${fmt.kg(m.kgRep)} kg`
      };
    });
    const c1 = el('div', 'sc8-card');
    c1.innerHTML = `<h3>Producción de primera por periodo${rotuloTono()}</h3>` +
      '<p class="sc8-tab-desc">Toneladas · los periodos del rango elegido se muestran en verde</p>' +
      graficaBarras(barras, { titulo: 'Producción por periodo', fmtEje: v => fmt.n(v, 0) });

    const linea = historicos.map(p => {
      const m = agg({ a: p.a, b: p.b });
      return {
        v: m.kg ? m.balpPct : null,
        rotulo: p.etiqueta,
        dentro: dentro(p),
        tip: `<b>${p.etiqueta}${rotuloTono()}</b><br>% BAP: <b>${fmt.pct(m.balpPct)}</b>` +
             `<br>Reprocesado: ${fmt.kg(m.kgRep)} kg`
      };
    });
    const c2 = el('div', 'sc8-card');
    c2.innerHTML = `<h3>% BAP por periodo (planta)${rotuloTono()}</h3>` +
      `<p class="sc8-tab-desc">Ponderado por kg procesados · objetivo ≥ ${CONFIG.OBJETIVO_BAP}%</p>` +
      graficaLinea(linea, {
        titulo: '% BAP por periodo', fmtEje: v => fmt.n(v, 0) + '%',
        ref: CONFIG.OBJETIVO_BAP, refRotulo: `obj. ${CONFIG.OBJETIVO_BAP}%`
      });
    g.appendChild(c1); g.appendChild(c2);
    H.appendChild(g);

    /* --- Tabla ejecutiva --- */
    const c3 = el('div', 'sc8-card');
    let tb = '<h3>Los 8 artículos de mayor volumen del periodo</h3>' +
      '<p class="sc8-tab-desc">Resumen ejecutivo · el detalle completo está en las pestañas siguientes</p>' +
      '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla"><thead><tr>' +
      '<th class="sc8-tab-col-articulo">Artículo</th><th>Kg procesados</th><th>Partidas</th><th>% BAP</th>' +
      '<th>Índice reproc.</th><th>Costo receta $/kg</th><th>Sobrecosto</th></tr></thead><tbody>';
    articulosPorVolumen(sel).slice(0, 8).forEach(({ nombre, m }) => {
      tb += `<tr><td class="sc8-tab-col-articulo">${rotuloArticulo(nombre)}</td><td>${fmt.kg(m.kg)}</td><td>${m.partidas}</td>` +
        `<td class="${semBap(m.balpPct)}">${fmt.pct(m.balpPct)}</td>` +
        `<td class="${semIndice(m.indice)}">${fmt.indice(m.indice)}</td>` +
        `<td>${fmt.n(m.costoKg, 2)}</td><td>${fmt.usd(m.sobrecosto)}</td></tr>`;
    });
    tb += '</tbody></table></div>';
    c3.innerHTML = tb;
    H.appendChild(c3);
    return H;
  }

  /* ============================================================
     PESTAÑA 2 · PARETO DE ARTÍCULOS
     ============================================================ */

  function vistaPareto(sel, periodos) {
    const H = el('div', 'sc8-card');
    const lista = articulosPorVolumen(sel);
    if (!lista.length) {
      H.innerHTML = '<p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p>';
      return H;
    }
    const total = lista.reduce((s, x) => s + x.m.kg, 0);
    const mostrarPeriodos = periodos.length <= 14;
    let acum = 0, corte = false;
    let h = `<h3>Pareto de artículos — ${rotulaRango(sel)}${rotuloTono()}</h3>` +
      '<p class="sc8-tab-desc">Ordenados por participación en los kg procesados del periodo. ' +
      'La línea marca el grupo que acumula ~80% de la producción (foco de gestión).</p>' +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla sc8-tab-pareto sin-orden"><thead><tr>' +
      '<th>#</th><th class="txt sc8-tab-col-articulo">Artículo</th>';
    if (mostrarPeriodos) periodos.forEach(p => { h += `<th>${esc(rotuloPeriodo(p))}</th>`; });
    h += '<th>Total kg</th><th>%</th><th>% acum.</th><th class="participacion" title="Participación" aria-label="Participación">Part.</th></tr></thead><tbody>';
    const mayor = lista[0].m.kg;
    lista.forEach((x, i) => {
      const pct = 100 * x.m.kg / total;
      acum += pct;
      const sep = (!corte && acum >= 80) ? ' class="corte-pareto"' : '';
      h += `<tr${sep}><td class="sc8-tab-nd">${i + 1}</td><td class="txt sc8-tab-col-articulo">${rotuloArticulo(x.nombre)}</td>`;
      if (mostrarPeriodos) periodos.forEach(p => {
        const m = agg({ a: p.a, b: p.b }, x.nombre);
        h += m.kg ? `<td>${fmt.kg(m.kg)}</td>` : '<td class="sc8-tab-nd">—</td>';
      });
      h += `<td><b>${fmt.kg(x.m.kg)}</b></td><td>${fmt.n(pct, 1)}%</td>`;
      h += `<td class="sc8-tab-nd">${fmt.n(acum, 1)}%</td>` +
        `<td class="participacion"><div class="sc8-tab-barra-part" style="width:${(100 * x.m.kg / mayor).toFixed(1)}%"></div></td></tr>`;
      if (!corte && acum >= 80) corte = true;
    });
    h += '<tr class="total"><td></td><td class="txt">Total planta</td>';
    if (mostrarPeriodos) periodos.forEach(p => {
      const m = agg({ a: p.a, b: p.b });
      h += `<td>${fmt.kg(m.kg)}</td>`;
    });
    h += `<td>${fmt.kg(total)}</td><td>100%</td><td></td><td></td></tr>`;
    h += '</tbody></table></div>' + notaParcial(periodos);
    H.innerHTML = h;
    return H;
  }

  /* ============================================================
     PESTAÑA 3 · % BAP POR ARTÍCULO Y PERIODO
     ============================================================ */

  function vistaBalp(sel, periodos) {
    const H = el('div', 'sc8-card');
    const lista = articulosPorVolumen(sel);
    if (!lista.length) {
      H.innerHTML = '<p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p>';
      return H;
    }
    const obj = CONFIG.OBJETIVO_BAP;
    let h = `<h3>% Bien a la primera (BAP) por artículo y periodo${rotuloTono()}</h3>` +
      `<p class="sc8-tab-desc">Ponderado por kg procesados. Semáforo: ≥${obj}% verde · ` +
      `${obj - 5}–${obj}% amarillo · ${obj - 10}–${obj - 5}% naranja · &lt;${obj - 10}% rojo. ` +
      'Clic en cualquier encabezado ordena la tabla; segundo clic invierte el orden.</p>' +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla"><thead><tr><th class="sc8-tab-col-articulo">Artículo</th>';
    periodos.forEach(p => { h += `<th>${esc(rotuloPeriodo(p))}</th>`; });
    h += '<th>Prom. pond.</th></tr></thead><tbody>';
    lista.forEach(({ nombre, m }) => {
      h += `<tr><td class="sc8-tab-col-articulo">${rotuloArticulo(nombre)}</td>`;
      periodos.forEach(p => {
        const c = agg({ a: p.a, b: p.b }, nombre);
        if (!c.kg) { h += '<td class="sc8-tab-nd">N/A</td>'; return; }
        h += `<td class="${semBap(c.balpPct)}" data-tip="<b>${esc(Utils.truncar(nombre, 70))}</b> · ${esc(rotuloPeriodo(p))}${esc(rotuloTono())}` +
          `<br>% BAP: <b>${fmt.pct(c.balpPct)}</b><br>Procesado: ${fmt.kg(c.kg)} kg · ` +
          `Reprocesado: ${fmt.kg(c.kgRep)} kg<br>Partidas: ${c.partidas}">${fmt.n(c.balpPct, 1)}</td>`;
      });
      h += `<td class="${semBap(m.balpPct)}"><b>${fmt.n(m.balpPct, 1)}</b></td></tr>`;
    });
    h += '<tr class="total"><td>Total planta (pond.)</td>';
    periodos.forEach(p => {
      const c = agg({ a: p.a, b: p.b });
      h += c.kg ? `<td class="${semBap(c.balpPct)}">${fmt.n(c.balpPct, 1)}</td>`
                : '<td class="sc8-tab-nd">N/A</td>';
    });
    const t = agg(sel);
    h += `<td class="${semBap(t.balpPct)}">${fmt.n(t.balpPct, 1)}</td></tr></tbody></table></div>`;
    h += '<div class="sc8-det-leyenda">' +
      `<span><i class="sem-g"></i>≥ ${obj}%</span>` +
      `<span><i class="sem-y"></i>${obj - 5} – ${obj}%</span>` +
      `<span><i class="sem-o"></i>${obj - 10} – ${obj - 5}%</span>` +
      `<span><i class="sem-r"></i>&lt; ${obj - 10}%</span>` +
      '<span class="sc8-muted">N/A = sin producción</span></div>' + notaParcial(periodos);
    H.innerHTML = h;
    return H;
  }

  /* ============================================================
     PESTAÑA 4 · RANKING DE DEFECTOS
     ============================================================ */

  function vistaDefectos(sel) {
    const H = el('div');
    const m = agg(sel);
    if (!m.kg) {
      H.innerHTML = '<div class="sc8-card"><p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p></div>';
      return H;
    }
    const kgTotal = m.kg;
    const kgArt = new Map();
    const porTipo = new Map();     // defecto -> agregados
    const porArtDef = new Map();   // articulo|defecto
    const porArt = new Map();      // articulo (solo reprocesos)

    m.regs.forEach(r => {
      const a = claveArticulo(r);
      kgArt.set(a, (kgArt.get(a) || 0) + r.kgCarga);
      if (!r.esReproceso) return;
      const d = r.defecto || 'Sin clasificar';

      let t = porTipo.get(d);
      if (!t) porTipo.set(d, t = { kg: 0, cargas: 0, costo: 0, porArt: new Map(), partidas: new Set() });
      t.kg += r.kgCarga; t.cargas++; t.costo += r.kgCarga * r.costoPorKg;
      t.porArt.set(a, (t.porArt.get(a) || 0) + r.kgCarga);
      r.partidas.forEach(p => t.partidas.add(p));

      const k = a + '||' + d;
      let ad = porArtDef.get(k);
      if (!ad) porArtDef.set(k, ad = { articulo: a, defecto: d, kg: 0, cargas: 0, costo: 0, partidas: new Set() });
      ad.kg += r.kgCarga; ad.cargas++; ad.costo += r.kgCarga * r.costoPorKg;
      r.partidas.forEach(p => ad.partidas.add(p));

      let pa = porArt.get(a);
      if (!pa) porArt.set(a, pa = { kg: 0, cargas: 0, costo: 0, partidas: new Set(), defs: new Map() });
      pa.kg += r.kgCarga; pa.cargas++; pa.costo += r.kgCarga * r.costoPorKg;
      pa.defs.set(d, (pa.defs.get(d) || 0) + r.kgCarga);
      r.partidas.forEach(p => pa.partidas.add(p));
    });

    const kgRepTotal = m.kgRep || 1;

    /* --- Tabla 0: kg reprocesados por tipo de defecto --- */
    const tipos = [...porTipo.entries()].map(([d, v]) => {
      const top = [...v.porArt.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        defecto: d, kg: v.kg, cargas: v.cargas, costo: v.costo,
        partidas: v.partidas.size,
        topArt: top ? top[0] : '—', topKg: top ? top[1] : 0,
        pctRep: 100 * v.kg / kgRepTotal,
        pctProc: 100 * v.kg / kgTotal
      };
    }).sort((x, y) => y.kg - x.kg);

    const c0 = el('div', 'sc8-card');
    let h0 = `<h3>Resumen: tela reprocesada por tipo de defecto — ${rotulaRango(sel)}${rotuloTono()}</h3>` +
      '<p class="sc8-tab-desc">Todos los kg reprocesados del periodo agrupados por tipo de defecto, ' +
      'de mayor a menor. Es el punto de partida: primero qué defecto pesa más; abajo, en qué artículo vive.</p>' +
      '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla sc8-tab-resumen-defectos"><thead><tr>' +
      '<th>#</th><th class="txt">Tipo de defecto</th><th>Kg reproc.</th><th>% del reproc. total</th>' +
      '<th>% de kg procesados</th><th>Cargas</th><th>Partidas</th><th>Costo</th>' +
      '<th class="txt sc8-tab-col-articulo">Artículo más afectado</th><th class="participacion">Peso</th></tr></thead><tbody>';
    const mayorTipo = tipos.length ? tipos[0].kg : 1;
    tipos.forEach((t, i) => {
      h0 += `<tr><td class="sc8-tab-nd">${i + 1}</td><td class="txt"><b>${esc(t.defecto)}</b></td>` +
        `<td><b>${fmt.kg(t.kg)}</b></td><td>${fmt.n(t.pctRep, 1)}%</td>` +
        `<td>${fmt.n(t.pctProc, 2)}%</td><td>${t.cargas}</td><td>${t.partidas}</td>` +
        `<td>${fmt.usd(t.costo)}</td>` +
        `<td class="txt sc8-tab-col-articulo"><div class="sc8-tab-art-bloque">${rotuloArticulo(t.topArt)}` +
        `<span class="nota">(${fmt.n(100 * t.topKg / (t.kg || 1), 0)}%)</span></div></td>` +
        `<td class="participacion"><div class="sc8-tab-barra-part" style="width:${(100 * t.kg / mayorTipo).toFixed(1)}%"></div></td></tr>`;
    });
    h0 += '</tbody></table></div>';
    c0.innerHTML = h0;
    H.appendChild(c0);

    /* --- Tabla 1: ranking artículo · defecto --- */
    const items = [...porArtDef.values()].map(v => ({
      ...v,
      partidasN: v.partidas.size,
      cargasPorPartida: v.partidas.size ? v.cargas / v.partidas.size : 0,
      pctProc: 100 * v.kg / kgTotal,
      pctArt: 100 * v.kg / (kgArt.get(v.articulo) || 1)
    })).sort((x, y) => y.pctProc - x.pctProc);

    const c1 = el('div', 'sc8-card');
    let h1 = `<h3>Ranking de defectos principales — ${rotulaRango(sel)}${rotuloTono()}</h3>` +
      '<p class="sc8-tab-desc">Ordenado por impacto sobre la producción total ' +
      '(kg reprocesados / kg procesados de la planta). La columna “% del artículo” muestra el control ' +
      'técnico: <b>≥ 5%</b> del artículo reprocesándose se considera problema abierto. ' +
      '“Cargas / partida” = cargas de reproceso que costó resolver cada partida afectada.</p>' +
      '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla sc8-tab-ranking-defectos"><thead><tr>' +
      '<th>#</th><th class="txt sc8-tab-col-articulo">Artículo · Defecto</th><th>Kg reproc.</th><th>% sobre planta</th>' +
      '<th>% del artículo</th><th>Cargas / partida</th><th>Costo</th><th class="txt sc8-tab-col-estado">Estado</th>' +
      '</tr></thead><tbody>';
    const principales = items.slice(0, 15);
    principales.forEach((it, i) => {
      const alerta = it.pctArt >= 5;
      h1 += '<tr class="sc8-tab-fila-enlace">' +
        `<td class="sc8-tab-nd">${i + 1}</td>` +
        `<td class="txt sc8-tab-col-articulo"><div class="sc8-tab-art-bloque"><button type="button" class="sc8-tab-art sc8-tab-art-enlace" ` +
        `title="${esc(it.articulo)}" aria-label="Ver detalle por artículo de ${esc(it.articulo)}">` +
        `${esc(it.articulo)}</button><b>· ${esc(it.defecto)}</b></div></td>` +
        `<td>${fmt.kg(it.kg)}</td><td><b>${fmt.n(it.pctProc, 2)}%</b></td>` +
        `<td class="${alerta ? 'sem-r' : 'sem-g'}">${fmt.n(it.pctArt, 1)}%</td>` +
        `<td>${fmt.n(it.cargasPorPartida, 1)}</td><td>${fmt.usd(it.costo)}</td>` +
        `<td class="txt sc8-tab-col-estado">${alerta
          ? '<span class="sc8-badge danger">Fuera de control</span>'
          : '<span class="sc8-badge success">Bajo control</span>'}</td></tr>`;
    });
    h1 += '</tbody></table></div>' +
      '<p class="sc8-tab-nota-pie">Se muestran los 15 principales. El detalle periodo a periodo de cada ' +
      'defecto está en la pestaña “Detalle por artículo”.</p>';
    c1.innerHTML = h1;
    c1.querySelectorAll('.sc8-tab-fila-enlace').forEach((fila, i) => {
      fila.addEventListener('click', () => abrirDetalleArticulo(principales[i].articulo));
    });
    H.appendChild(c1);

    /* --- Tabla 2: ranking de artículos --- */
    const arts = [...porArt.entries()].map(([a, v]) => {
      const top = [...v.defs.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        articulo: a, kg: v.kg, cargas: v.cargas, costo: v.costo,
        partidas: v.partidas.size,
        nDefs: v.defs.size,
        topDef: top ? top[0] : '—', topKg: top ? top[1] : 0,
        cargasPorPartida: v.partidas.size ? v.cargas / v.partidas.size : 0,
        pctProc: 100 * v.kg / kgTotal,
        pctArt: 100 * v.kg / (kgArt.get(a) || 1)
      };
    }).sort((x, y) => y.kg - x.kg);

    const c2 = el('div', 'sc8-card');
    let h2 = '<h3>Ranking de artículos más defectuosos</h3>' +
      '<p class="sc8-tab-desc">Todos los defectos de cada artículo sumados en el periodo. Complementa al ' +
      'ranking anterior (allá cada fila es un defecto específico; aquí el artículo completo): úsala para ' +
      'decidir en qué artículo intervenir, y la anterior para decidir qué causa atacar primero.</p>' +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla"><thead><tr>' +
      '<th>#</th><th class="txt sc8-tab-col-articulo">Artículo</th><th>Kg reproc.</th><th>Partidas afectadas</th>' +
      '<th>% sobre planta</th><th>% del artículo</th><th>Cargas / partida</th>' +
      '<th>Costo</th><th class="txt">Defecto principal</th></tr></thead><tbody>';
    arts.forEach((it, i) => {
      h2 += `<tr><td class="sc8-tab-nd">${i + 1}</td><td class="txt sc8-tab-col-articulo">${rotuloArticulo(it.articulo)}</td>` +
        `<td><b>${fmt.kg(it.kg)}</b></td><td>${it.partidas}</td>` +
        `<td>${fmt.n(it.pctProc, 2)}%</td>` +
        `<td class="${it.pctArt >= 5 ? 'sem-r' : it.pctArt >= 3 ? 'sem-y' : 'sem-g'}">${fmt.n(it.pctArt, 1)}%</td>` +
        `<td>${fmt.n(it.cargasPorPartida, 1)}</td><td>${fmt.usd(it.costo)}</td>` +
        `<td class="txt">${esc(it.topDef)} <span class="nota">(${fmt.n(100 * it.topKg / (it.kg || 1), 0)}% del reproceso · ${it.nDefs} tipos)</span></td></tr>`;
    });
    h2 += '</tbody></table></div>';
    c2.innerHTML = h2;
    H.appendChild(c2);
    return H;
  }

  /* ============================================================
     PESTAÑA 5 · DETALLE POR ARTÍCULO
     ============================================================ */

  function vistaDetalleArticulo(sel, periodos) {
    const H = el('div');
    const lista = articulosPorVolumen(sel);
    if (!lista.length) {
      H.innerHTML = '<div class="sc8-card"><p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p></div>';
      return H;
    }
    if (!estado.articulo || !lista.some(x => x.nombre === estado.articulo))
      estado.articulo = lista[0].nombre;
    const art = estado.articulo;
    const m = agg(sel, art);

    const tarjeta = el('div', 'sc8-card');
    let h = `<h3>Detalle de defectos — ${esc(Utils.truncar(art, 80))}${rotuloTono()}</h3>` +
      `<p class="sc8-tab-art-full" title="${esc(art)}">${esc(art)}</p>` +
      '<p class="sc8-tab-desc">Evolución del comportamiento del artículo en el periodo. Cada defecto ' +
      'muestra su incidencia, las cargas de reproceso que exigió y su costo.</p>';

    h += '<div class="sc8-tab-fgroup en-linea"><label>Artículo</label><select id="tabSelArt" class="sc8-select">';
    lista.forEach(x => {
      h += `<option value="${esc(x.nombre)}"${x.nombre === art ? ' selected' : ''} title="${esc(x.nombre)}">` +
           `${esc(Utils.truncar(x.nombre, 70))} — ${fmt.kg(x.m.kg)} kg</option>`;
    });
    h += '</select></div>';

    h += '<div class="sc8-tab-kpis-linea">' +
      `<div><span>Kg procesados · partidas</span><strong>${fmt.kg(m.kg)} <small>· ${m.partidas} part.</small></strong></div>` +
      `<div><span>% BAP</span><strong>${fmt.n(m.balpPct, 1)}<small>%</small></strong></div>` +
      `<div><span>Índice de reprocesos <i>(obj. 1,00)</i></span><strong>${fmt.indice(m.indice)}</strong></div>` +
      `<div><span>Kg reprocesados</span><strong>${fmt.kg(m.kgRep)}</strong></div>` +
      `<div><span>Sobrecosto por reprocesos</span><strong>${fmt.usd(m.sobrecosto)}</strong></div>` +
      '</div>';

    /* --- Desempeño por color --- */
    const regsPorColor = new Map();
    m.regs.forEach(r => {
      const color = r.color1 || '(Sin color)';
      let regs = regsPorColor.get(color);
      if (!regs) regsPorColor.set(color, regs = []);
      regs.push(r);
    });
    const colores = [...regsPorColor.entries()]
      .map(([nombre, regs]) => ({ nombre, m: metricas(regs, sel) }))
      .sort((a, b) => b.m.kg - a.m.kg || a.nombre.localeCompare(b.nombre, 'es'));

    h += '<h4>Desempeño por color</h4>' +
      '<p class="sc8-tab-desc">Colores registrados para el artículo dentro del periodo y tono seleccionados.</p>' +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla sin-orden"><thead><tr>' +
      '<th>Color</th><th>Kg procesados</th><th>Cargas</th><th>Partidas</th><th>% BAP</th>' +
      '<th>Índice reproc.</th><th>Costo receta $/kg</th><th>Sobrecosto</th></tr></thead><tbody>';
    colores.forEach(({ nombre, m: mc }) => {
      h += '<tr class="sc8-tab-fila-enlace sc8-tab-fila-color">' +
        `<td><button type="button" class="sc8-tab-color-enlace" title="${esc(nombre)}" ` +
        `aria-label="Ver cargas del color ${esc(nombre)}">${esc(nombre)}</button></td>` +
        `<td>${fmt.kg(mc.kg)}</td><td>${mc.cargas}</td>` +
        `<td>${mc.partidas}</td><td class="${semBap(mc.balpPct)}">${fmt.pct(mc.balpPct)}</td>` +
        `<td class="${semIndice(mc.indice)}">${fmt.indice(mc.indice)}</td>` +
        `<td>${fmt.n(mc.costoKg, 2)}</td><td>${fmt.usd(mc.sobrecosto)}</td></tr>`;
    });
    h += '</tbody></table></div>';

    /* --- Evolución de defectos (filtrable por tono) --- */
    const tonoDet = estado.detTono === TODOS ? undefined : estado.detTono;
    const md = estado.detTono === TODOS ? m : agg(sel, art, estado.detTono);
    h += '<div class="sc8-tab-cab-sub"><h4>Evolución de defectos' +
      (tonoDet ? ` — Tono: ${esc(tonoDet)}` : '') + '</h4>' +
      '<div class="sc8-tab-fgroup en-linea"><label>Filtrar por tono</label>' +
      '<select id="tabSelDetTono" class="sc8-select">' +
      `<option value="${TODOS}"${estado.detTono === TODOS ? ' selected' : ''}>Todos los tonos</option>` +
      CONFIG.ORDEN_TONOS.map(t =>
        `<option value="${esc(t)}"${estado.detTono === t ? ' selected' : ''}>${esc(t)}</option>`).join('') +
      '</select></div></div>';

    const kgPorDef = new Map();
    md.regs.forEach(r => {
      if (!r.esReproceso) return;
      const d = r.defecto || 'Sin clasificar';
      kgPorDef.set(d, (kgPorDef.get(d) || 0) + r.kgCarga);
    });
    const defectos = [...kgPorDef.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);

    const datosPeriodo = periodos.map(p => {
      const r = agg({ a: p.a, b: p.b }, art, tonoDet);
      const porDef = new Map();
      r.regs.forEach(x => {
        if (!x.esReproceso) return;
        const d = x.defecto || 'Sin clasificar';
        let v = porDef.get(d);
        if (!v) porDef.set(d, v = { kg: 0, cargas: 0, costo: 0, partidas: new Set() });
        v.kg += x.kgCarga; v.cargas++; v.costo += x.kgCarga * x.costoPorKg;
        x.partidas.forEach(q => v.partidas.add(q));
      });
      return { p, r, porDef };
    });

    if (!md.kg) h += '<p class="sc8-tab-nota-pie">El artículo no produjo este tono en el periodo.</p>';
    else if (!defectos.length) h += '<p class="sc8-tab-nota-pie">Sin reprocesos de este tono en el periodo: todo salió bien a la primera.</p>';

    h += '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla sc8-tab-matriz sin-orden"><thead><tr>' +
      '<th class="metrica">Defecto / métrica</th>';
    periodos.forEach(p => { h += `<th>${esc(rotuloPeriodo(p))}</th>`; });
    h += '<th>Periodo</th></tr></thead><tbody>';

    defectos.forEach(d => {
      h += `<tr class="grupo"><td colspan="${periodos.length + 2}"><b>${esc(d.toUpperCase())}</b> ` +
        `<span class="nota">· ${fmt.kg(kgPorDef.get(d))} kg reprocesados en el periodo</span></td></tr>`;

      h += '<tr><td class="metrica">% kg reproc. / kg procesados</td>';
      let sKg = 0, sDef = 0;
      datosPeriodo.forEach(({ r, porDef }) => {
        if (!r.kg) { h += '<td class="sc8-tab-nd">N/A</td>'; return; }
        const kgd = porDef.has(d) ? porDef.get(d).kg : 0;
        sKg += r.kg; sDef += kgd;
        const v = 100 * kgd / r.kg;
        h += `<td${v >= 5 ? ' class="sem-r"' : ''}>${fmt.n(v, 1)}%</td>`;
      });
      h += `<td class="total-col"><b>${fmt.n(100 * sDef / (sKg || 1), 1)}%</b></td></tr>`;

      h += '<tr><td class="metrica">Cargas de reproceso</td>';
      let sc = 0;
      datosPeriodo.forEach(({ porDef }) => {
        const v = porDef.get(d);
        if (!v) { h += '<td class="sc8-tab-nd">—</td>'; return; }
        sc += v.cargas;
        h += `<td>${v.cargas}</td>`;
      });
      h += `<td class="total-col"><b>${sc}</b></td></tr>`;

      h += '<tr><td class="metrica">Cargas por partida afectada</td>';
      let sCar = 0, sPar = 0;
      datosPeriodo.forEach(({ porDef }) => {
        const v = porDef.get(d);
        if (!v || !v.partidas.size) { h += '<td class="sc8-tab-nd">—</td>'; return; }
        sCar += v.cargas; sPar += v.partidas.size;
        h += `<td>${fmt.n(v.cargas / v.partidas.size, 1)}</td>`;
      });
      h += `<td class="total-col"><b>${sPar ? fmt.n(sCar / sPar, 1) : '—'}</b></td></tr>`;

      h += '<tr><td class="metrica">Costo de reproceso (US$)</td>';
      let sCosto = 0;
      datosPeriodo.forEach(({ porDef }) => {
        const v = porDef.get(d);
        if (!v) { h += '<td class="sc8-tab-nd">—</td>'; return; }
        sCosto += v.costo;
        h += `<td>${fmt.usd(v.costo)}</td>`;
      });
      h += `<td class="total-col"><b>${fmt.usd(sCosto)}</b></td></tr>`;
    });

    h += `<tr class="grupo"><td colspan="${periodos.length + 2}"><b>ÍNDICE DE PROCESOS POR KILO</b> ` +
      '<span class="nota">· kg procesados / kg de primera — objetivo 1,00</span></td></tr>';
    h += '<tr><td class="metrica">Procesos por kilo</td>';
    datosPeriodo.forEach(({ r }) => {
      if (!r.kg) { h += '<td class="sc8-tab-nd">N/A</td>'; return; }
      h += `<td class="${semIndice(r.indice)}">${fmt.indice(r.indice)}</td>`;
    });
    h += `<td class="total-col ${semIndice(md.indice)}"><b>${fmt.indice(md.indice)}</b></td></tr>`;
    h += '<tr><td class="metrica">% BAP (kg)</td>';
    datosPeriodo.forEach(({ r }) => {
      if (!r.kg) { h += '<td class="sc8-tab-nd">N/A</td>'; return; }
      h += `<td class="${semBap(r.balpPct)}">${fmt.n(r.balpPct, 1)}%</td>`;
    });
    h += `<td class="total-col ${semBap(md.balpPct)}"><b>${fmt.n(md.balpPct, 1)}%</b></td></tr>`;
    h += '<tr><td class="metrica">Kg procesados</td>';
    datosPeriodo.forEach(({ r }) => {
      h += r.kg ? `<td>${fmt.kg(r.kg)}</td>` : '<td class="sc8-tab-nd">N/A</td>';
    });
    h += `<td class="total-col"><b>${fmt.kg(md.kg)}</b></td></tr>`;
    h += '</tbody></table></div>' + notaParcial(periodos);

    tarjeta.innerHTML = h;
    tarjeta.querySelectorAll('.sc8-tab-fila-color').forEach((fila, i) => {
      fila.addEventListener('click', () => {
        const color = colores[i];
        UI.modalRegistros(`Detalle por color — ${color.nombre}`, color.m.regs, {
          detalleColor: true
        });
      });
    });
    H.appendChild(tarjeta);
    return H;
  }

  /* ============================================================
     PESTAÑAS 6-8 · MATRICES (costo, tiempos, lavado)
     ============================================================
     Cada celda se colorea contra el periodo anterior del mismo
     artículo (verde si varió a favor, rojo si en contra) y la última
     columna compara el último periodo del rango contra el promedio
     de los 6 previos. */

  function semanaIsoLavado(fechaIso) {
    const fecha = desdeIso(fechaIso);
    const utc = new Date(Date.UTC(
      fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const diaSemana = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - diaSemana);
    const anio = utc.getUTCFullYear();
    const inicioAnio = new Date(Date.UTC(anio, 0, 1));
    const numero = Math.ceil((((utc - inicioAnio) / 86400000) + 1) / 7);
    const diaLocal = fecha.getDay() || 7;
    const lunes = sumarDias(fecha, 1 - diaLocal);
    return {
      clave: `${anio}-W${String(numero).padStart(2, '0')}`,
      etiqueta: `Sem ${numero}`,
      a: iso(lunes),
      b: iso(sumarDias(lunes, 6))
    };
  }

  function periodoTelaLavada(fechaIso) {
    if (estado.granularidad === 'semana') return semanaIsoLavado(fechaIso);
    const fecha = desdeIso(fechaIso);
    const clave = fechaIso.slice(0, 7);
    return {
      clave,
      etiqueta: Utils.mesCorto(clave),
      a: iso(dia(fecha.getFullYear(), fecha.getMonth(), 1)),
      b: iso(dia(fecha.getFullYear(), fecha.getMonth() + 1, 0))
    };
  }

  function periodosTelaLavada(sel) {
    const vistos = new Map();
    for (const r of DATOS.telaLavada) {
      if (r.fecha < sel.a || r.fecha > sel.b) continue;
      const periodo = periodoTelaLavada(r.fecha);
      if (!vistos.has(periodo.clave)) vistos.set(periodo.clave, periodo);
    }
    return [...vistos.values()]
      .sort((a, b) => a.a.localeCompare(b.a))
      .map(p => ({
        ...p,
        parcial: sel.a > p.a || sel.b < p.b,
        a: sel.a > p.a ? sel.a : p.a,
        b: sel.b < p.b ? sel.b : p.b
      }));
  }

  function aggTelaLavada(sel, articuloClave) {
    const clave = [sel.a, sel.b, articuloClave || ''].join('|');
    if (cacheAggLavado.has(clave)) return cacheAggLavado.get(clave);
    const grupo = articuloClave
      ? DATOS.lavadoPorArticulo.get(articuloClave)
      : null;
    const fuente = articuloClave ? (grupo ? grupo.regs : []) : DATOS.telaLavada;
    let kg = 0, kgLavada = 0;
    for (const r of fuente) {
      if (r.fecha < sel.a || r.fecha > sel.b) continue;
      kg += r.pesoKg;
      if (r.ruta === 'LAVADA') kgLavada += r.pesoKg;
    }
    const metrica = { kg, kgLavada, pct: kg ? 100 * kgLavada / kg : null };
    cacheAggLavado.set(clave, metrica);
    return metrica;
  }

  function articulosTelaLavada(sel) {
    return [...DATOS.lavadoPorArticulo.entries()]
      .map(([clave, grupo]) => ({
        clave,
        nombre: grupo.nombre,
        m: aggTelaLavada(sel, clave)
      }))
      .filter(x => x.m.kg > 0)
      .sort((a, b) => b.m.kg - a.m.kg || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function serieHistoricaTelaLavada(articuloClave) {
    if (!DATOS.lavadoMin || !DATOS.lavadoMax) return [];
    return periodosTelaLavada({ a: DATOS.lavadoMin, b: DATOS.lavadoMax })
      .map(p => ({ clave: p.clave, v: aggTelaLavada(p, articuloClave).pct }));
  }

  function varPreviosTelaLavada(articuloClave, periodos) {
    const serie = serieHistoricaTelaLavada(articuloClave);
    const indice = new Map(serie.map((s, i) => [s.clave, i]));
    let ultimo = null;
    for (let i = periodos.length - 1; i >= 0; i--) {
      const j = indice.get(periodos[i].clave);
      if (j !== undefined && serie[j].v !== null) {
        ultimo = { j, v: serie[j].v };
        break;
      }
    }
    if (!ultimo) return null;
    const previos = [];
    for (let j = ultimo.j - 1; j >= 0 && previos.length < 6; j--)
      if (serie[j].v !== null && isFinite(serie[j].v)) previos.push(serie[j].v);
    if (previos.length < 2) return null;
    const prom = previos.reduce((s, v) => s + v, 0) / previos.length;
    if (!prom) return null;
    return { d: (ultimo.v - prom) / prom, actual: ultimo.v, prom };
  }

  function celdaTelaLavada(articuloClave, periodos, indice, metrica) {
    if (!metrica.kg) return '<td class="sc8-tab-nd">N/A</td>';
    const serie = serieHistoricaTelaLavada(articuloClave);
    const pos = serie.findIndex(s => s.clave === periodos[indice].clave);
    let previo = null;
    for (let j = pos - 1; j >= 0; j--)
      if (serie[j].v !== null && isFinite(serie[j].v)) { previo = serie[j].v; break; }
    const valor = fmt.n(metrica.pct, 0) + '%';
    if (previo === null)
      return `<td data-tip="Peso total: ${esc(fmt.kg(metrica.kg))} kg` +
        `<br>Ruta LAVADA: ${esc(fmt.kg(metrica.kgLavada))} kg">${valor}</td>`;
    return `<td data-tip="Periodo anterior: ${esc(fmt.n(previo, 0))}%` +
      `<br>Peso total: ${esc(fmt.kg(metrica.kg))} kg` +
      `<br>Ruta LAVADA: ${esc(fmt.kg(metrica.kgLavada))} kg">${valor}</td>`;
  }

  function vistaTelaLavada(sel) {
    const H = el('div', 'sc8-card');
    if (!DATOS.telaLavada.length) {
      const error = Datos.Estado.telaLavadaError;
      H.innerHTML = `<p class="sc8-vacio">${error
        ? 'No se pudo leer la fuente de tela lavada: ' + esc(error)
        : 'Sin datos de tela lavada para mostrar.'}</p>`;
      return H;
    }
    const periodos = periodosTelaLavada(sel);
    const lista = articulosTelaLavada(sel);
    if (!lista.length || !periodos.length) {
      H.innerHTML = '<p class="sc8-vacio">Sin embalajes en el periodo seleccionado.</p>';
      return H;
    }

    let h = '<h3>% de tela lavada (sobre peso crudo) — por artículo</h3>' +
      '<p class="sc8-tab-desc">Peso kg crudo con ruta final LAVADA dividido entre el peso kg crudo total. ' +
      'La semana se obtiene de la fecha de embalaje. Esta fuente no contiene tono, por lo que ese filtro no aplica.</p>' +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla"><thead><tr><th class="sc8-tab-col-articulo">Artículo</th>';
    periodos.forEach(p => { h += `<th>${esc(rotuloPeriodo(p))}</th>`; });
    h += '<th>Var. vs prom. 6 previos</th></tr></thead><tbody>';
    lista.forEach(x => {
      h += `<tr><td class="sc8-tab-col-articulo">${rotuloArticulo(x.nombre)}</td>`;
      periodos.forEach((p, i) => {
        h += celdaTelaLavada(x.clave, periodos, i, aggTelaLavada(p, x.clave));
      });
      h += celdaVar(varPreviosTelaLavada(x.clave, periodos), 0,
        v => fmt.n(v, 0) + '%');
      h += '</tr>';
    });
    h += '<tr class="total"><td>Total (pond. por kg crudo)</td>';
    periodos.forEach(p => {
      const m = aggTelaLavada(p);
      h += m.kg ? `<td>${fmt.n(m.pct, 0)}%</td>` : '<td class="sc8-tab-nd">N/A</td>';
    });
    h += '<td></td></tr></tbody></table></div>' +
      '<div class="sc8-det-leyenda"><span class="sc8-muted">N/A = sin peso embalado en el periodo</span></div>' +
      notaParcial(periodos) +
      '<p class="sc8-tab-nota-pie">Fuente: hoja externa de producción · columnas articulo, ' +
      'peso_kg_crudo, ruta_tela_final y embalaje_fecha.</p>';
    H.innerHTML = h;
    return H;
  }

  function celdaMoM(articulo, periodos, indice, valor, opciones) {
    if (valor === null || valor === undefined || !isFinite(valor))
      return `<td>${opciones.fmtCelda(valor)}</td>`;
    const serie = serieHistorica(articulo, opciones.prop);
    const pos = serie.findIndex(s => String(s.clave) === String(periodos[indice].clave));
    let previo = null;
    for (let j = pos - 1; j >= 0; j--)
      if (serie[j].v !== null && isFinite(serie[j].v)) { previo = serie[j].v; break; }
    if (previo === null || previo === 0)
      return `<td>${opciones.fmtCelda(valor)}</td>`;
    const d = (valor - previo) / Math.abs(previo);
    if (Math.abs(d) < 0.01) return `<td>${opciones.fmtCelda(valor)}</td>`;
    const bueno = opciones.dir === 0 ? null : (d > 0 ? opciones.dir > 0 : opciones.dir < 0);
    const clase = opciones.dir === 0 ? '' : (bueno ? 'mom-buena' : 'mom-mala');
    const tip = `Periodo anterior: ${esc(opciones.fmtCelda(previo))} → ${esc(opciones.fmtCelda(valor))} ` +
      `(${d > 0 ? '+' : '−'}${fmt.n(Math.abs(d) * 100, 1)}%)`;
    return `<td class="${clase}" data-tip="${tip}">${opciones.fmtCelda(valor)}</td>`;
  }

  function vistaMatriz(opciones, sel, periodos) {
    const H = el('div', 'sc8-card');
    const lista = articulosPorVolumen(sel);
    if (!lista.length) {
      H.innerHTML = '<p class="sc8-vacio">Sin producción en el periodo o tono seleccionado.</p>';
      return H;
    }
    let h = `<h3>${opciones.titulo}${rotuloTono()}</h3>` +
      `<p class="sc8-tab-desc">${opciones.desc}</p>` +
      '<div class="responsive-table-wrap sc8-tab-scroll"><table class="sc8-table sc8-tab-tabla"><thead><tr><th class="sc8-tab-col-articulo">Artículo</th>';
    periodos.forEach(p => { h += `<th>${esc(rotuloPeriodo(p))}</th>`; });
    h += '<th>Var. vs prom. 6 previos</th></tr></thead><tbody>';
    lista.forEach(({ nombre }) => {
      h += `<tr><td class="sc8-tab-col-articulo">${rotuloArticulo(nombre)}</td>`;
      periodos.forEach((p, i) => {
        const r = agg({ a: p.a, b: p.b }, nombre);
        h += !r.kg ? '<td class="sc8-tab-nd">N/A</td>'
                   : celdaMoM(nombre, periodos, i, r[opciones.prop], opciones);
      });
      h += celdaVar(varPrevios(nombre, periodos, opciones.prop), opciones.dir, opciones.fmtCelda);
      h += '</tr>';
    });
    h += `<tr class="total"><td>${opciones.totalRotulo}</td>`;
    periodos.forEach(p => {
      const r = agg({ a: p.a, b: p.b });
      h += !r.kg ? '<td class="sc8-tab-nd">N/A</td>'
                 : `<td>${opciones.fmtCelda(r[opciones.prop])}</td>`;
    });
    h += '<td></td></tr></tbody></table></div>';
    h += '<div class="sc8-det-leyenda">' +
      '<span><i class="mom-buena"></i>Varió a favor vs el periodo anterior</span>' +
      '<span><i class="mom-mala"></i>Varió en contra vs el periodo anterior</span>' +
      '<span class="sc8-muted">Sin color = variación &lt; 1% · N/A = sin producción</span></div>' +
      notaParcial(periodos);
    if (opciones.pie) h += `<p class="sc8-tab-nota-pie">${opciones.pie}</p>`;
    H.innerHTML = h;
    return H;
  }

  /* ============================================================
     PESTAÑA 9 · INFORMACIÓN
     ============================================================
     Ficha de referencia del tablero: cómo se lee, de dónde sale cada
     indicador y qué NO está en la hoja. El último bloque se calcula
     con los datos cargados, así que envejece con ellos. */

  function vistaInformacion() {
    const H = el('div');

    const lista = items => '<ul class="sc8-tab-lista">' +
      items.map(x => `<li>${x}</li>`).join('') + '</ul>';

    /* --- Qué es esta vista --- */
    const c1 = el('div', 'sc8-card');
    c1.innerHTML = '<h3>Qué es esta vista</h3>' +
      '<p class="sc8-tab-desc">Tablero de gestión de tintorería de COFACO: evalúa el ' +
      'desempeño de la planta en un periodo y lo compara contra otro.</p>' +
      lista([
        'Es una vista <b>autónoma</b>: usa sus propios filtros (periodo de análisis, ' +
          'periodo de comparación y tono), no los del panel lateral. Por eso ese panel ' +
          'se oculta mientras estás aquí.',
        'El <b>periodo de análisis</b> manda sobre todas las pestañas. El selector ' +
          '<b>Columnas</b> solo cambia si las matrices se agrupan por mes o por semana.',
        '<b>BAP</b> = Bien A la Primera: la tela que salió bien sin pasar por reproceso. ' +
          'Es el mismo indicador que en el resto del dashboard llamamos BAP.'
      ]);
    H.appendChild(c1);

    /* --- Cómo leer los colores --- */
    const c2 = el('div', 'sc8-card');
    c2.innerHTML = '<h3>Cómo leer los colores</h3>' +
      lista([
        'Las <b>variaciones</b> (▲▼) se colorean según la dirección deseada de cada ' +
          'indicador, no según si el número sube o baja: ' +
          '<span class="sc8-tab-delta buena">verde</span> es favorable, ' +
          '<span class="sc8-tab-delta mala">rojo</span> desfavorable y ' +
          '<span class="sc8-tab-delta plana">gris</span> neutro o sin base de comparación. ' +
          'Bajar el costo es verde; bajar la producción es rojo.',
        `El <b>semáforo de % BAP</b> usa el objetivo de ${CONFIG.OBJETIVO_BAP}% ` +
          `(<code>CONFIG.OBJETIVO_BAP</code>): ≥ ${CONFIG.OBJETIVO_BAP}% verde, ` +
          `${CONFIG.OBJETIVO_BAP - 5}–${CONFIG.OBJETIVO_BAP}% amarillo, ` +
          `${CONFIG.OBJETIVO_BAP - 10}–${CONFIG.OBJETIVO_BAP - 5}% naranja y ` +
          `por debajo rojo.`,
        'El <b>índice de reprocesos</b> tiene objetivo 1,00: verde bajo 1,05, amarillo ' +
          'hasta 1,15, naranja hasta 1,30 y rojo por encima. <b>∞</b> significa que ese ' +
          'grupo no dejó ningún kg bueno.',
        'En las matrices, cada celda se colorea contra <b>el periodo anterior del mismo ' +
          'artículo</b>, y la última columna compara el último periodo contra el promedio ' +
          'de los 6 previos. Sin color = varió menos del 1%.',
        '<b>N/A</b> = el artículo no produjo en ese periodo. <b>—</b> = no hubo cargas de ' +
          'reproceso. Un <b>*</b> en el encabezado marca un periodo parcial: el rango ' +
          'elegido solo cubre parte de esa semana o mes.'
      ]);
    H.appendChild(c2);

    /* --- Definición de cada indicador --- */
    const definiciones = [
      ['Kg procesados', 'Suma de <code>Kg Carga</code> de todas las cargas del periodo.', 'Kg Carga'],
      ['Kg reprocesados', 'Igual, pero solo las cargas cuyo <code>Tipo Recetas</code> es REPROCESO.', 'Kg Carga · Tipo Recetas'],
      ['Producción de primera', 'Kg procesados − kg reprocesados.', '—'],
      ['% BAP', 'Producción de primera / kg procesados.', '—'],
      ['Índice de reprocesos', 'Kg procesados / producción de primera. Cuánto material pasa por máquina por cada kilo bueno; el objetivo es 1,00.', '—'],
      ['Sobrecosto por reprocesos', 'Suma de <code>Kg Carga × Costo US$/kg</code> de las cargas de reproceso.', 'Kg Carga · Costo US$ / kg'],
      ['Costo de receta', 'Suma de <code>Kg Carga × Costo US$/kg</code> de todas las cargas, dividida entre los kg procesados.', 'Kg Carga · Costo US$ / kg'],
      ['Consumo de agua', '<code>Vol Lt Utilizados</code> / kg procesados.', 'Vol Lt Utilizados'],
      ['Tiempo de teñido', 'Duración media de una carga en máquina: <code>Hora Fin − Hora Inicio</code>.', 'Hora Inicio · Hora Fin'],
      ['Tiempo total en tintorería', 'Ciclo completo de la partida: de su primera <code>Hora Inicio</code> a su última <code>Hora Fin</code>, así que incluye las esperas entre procesos.', 'Hora Inicio · Hora Fin · OP - Partida'],
      ['Reprocesos hasta resolver', 'Cargas de reproceso dividido entre las partidas afectadas. Puede ser menor que 1 si una misma carga recupera varias partidas a la vez.', 'OP - Partida · Tipo Recetas'],
      ['% Tela lavada', 'Suma de <code>peso_kg_crudo</code> cuya <code>ruta_tela_final</code> es LAVADA, dividida entre el peso crudo total del artículo. La semana se obtiene de <code>embalaje_fecha</code>.', 'articulo · peso_kg_crudo · ruta_tela_final · embalaje_fecha (hoja externa)'],
      ['Partidas', 'OP-Partidas distintas que aparecen en las cargas del periodo.', 'OP - Partida'],
      ['Defecto', `Se deduce del texto de <code>Tipo Procesos</code> de cada carga de reproceso con <code>CONFIG.MAPA_DEFECTOS</code> (${CONFIG.MAPA_DEFECTOS.length} reglas, gana la primera que coincida).`, 'Tipo Procesos']
    ];
    const c3 = el('div', 'sc8-card');
    c3.innerHTML = '<h3>De dónde sale cada indicador</h3>' +
      '<p class="sc8-tab-desc">Los indicadores se calculan sobre las cargas de la hoja que caen dentro ' +
      'del periodo de análisis (y del tono, si hay uno elegido). % Tela lavada usa su fuente externa ' +
      'y no aplica el filtro de tono porque esa hoja no contiene color.</p>' +
      '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla sc8-tab-defs sin-orden">' +
      '<thead><tr><th>Indicador</th><th class="txt">Cómo se calcula</th>' +
      '<th class="txt">Columnas de la hoja</th></tr></thead><tbody>' +
      definiciones.map(([k, v, cols]) =>
        `<tr><td><b>${k}</b></td><td class="txt">${v}</td>` +
        `<td class="txt sc8-tab-nd">${cols}</td></tr>`).join('') +
      '</tbody></table></div>';
    H.appendChild(c3);

    /* --- Convenciones --- */
    const c4 = el('div', 'sc8-card');
    c4.innerHTML = '<h3>Cómo se arma el artículo y el tono</h3>' +
      lista([
        'El <b>artículo</b> sale de <code>Descripcion Art.</code>, separada por ' +
          '<b>“ | ”</b>. No se usa la columna <code>Articulo</code>, que ' +
          'solo guarda la familia y agrupa construcciones muy distintas bajo un mismo nombre.',
        'Cuando una carga tiñe <b>dos telas juntas</b> (la tela y su rib), los kg son de las ' +
          'dos a la vez: repartirlos duplicaría el volumen, así que la pareja cuenta como un ' +
          'solo artículo. Las descripciones se separan con <b>“ | ”</b> —y no con “+”, porque ' +
          'las descripciones ya llevan signos “+”—.',
        'Encabeza la <b>tela del cuerpo</b>: ' +
          CONFIG.TELAS_PRINCIPALES.map(t => `<b>${esc(t)}</b>`).join(' o ') +
          ' (<code>CONFIG.TELAS_PRINCIPALES</code>, en orden de prioridad). Las demás telas ' +
          'conservan el orden de la hoja.',
        'El separador vigente es <b>“ | ”</b> y cada parte se respeta como un artículo. ' +
          'Solo para filas históricas sin pipe se usa <code>CONFIG.TIPOS_TELA</code> para ' +
          'reconocer descripciones antiguas separadas por doble espacio.',
        'El <b>tono</b> no existe como columna: se deduce del texto de <code>Colores</code> ' +
          `con <code>CONFIG.MAPA_TONOS</code> (${CONFIG.MAPA_TONOS.length} reglas, gana la ` +
          'primera que coincida). El orden importa: Negro va antes que Blanco para que ' +
          '<code>PFD+BLACK</code> no caiga en Blanco, y Claros antes que Oscuros para que ' +
          '<code>LIGHT GREY</code> no cuente como oscuro.'
      ]);
    H.appendChild(c4);

    /* --- Limitaciones --- */
    const c5 = el('div', 'sc8-card sc8-tab-avisos');
    c5.innerHTML = '<h3>Qué no está en la hoja</h3>' +
      '<p class="sc8-tab-desc">Conviene tenerlo presente al leer los números.</p>' +
      lista([
        'No hay <b>kg descartados</b>: la hoja no registra la tela que se pierde sin ' +
          'solución. Donde un tablero de merma la mostraría, aquí se muestra el ' +
          '<b>costo del reproceso</b>, que sí es un dato real.',
        'Los <b>tiempos</b> solo se calculan con las cargas que tienen <code>Hora Inicio</code> ' +
          'y <code>Hora Fin</code> registradas; las demás no entran en el promedio.',
        'El <b>costo</b> es el de la receta (<code>Costo US$ / kg</code> de cada carga), no ' +
          'el costo real por variación de inventarios.',
        'El artículo y el tono se deducen de texto libre. Si aparece una tela o un color ' +
          'nuevo que las listas no contemplan, cae en <b>(Sin descripción)</b> o ' +
          `<b>${esc(CONFIG.TONO_POR_DEFECTO)}</b>: son la señal de que hay que ampliar ` +
          '<code>CONFIG.TIPOS_TELA</code> o <code>CONFIG.MAPA_TONOS</code>.'
      ]);
    H.appendChild(c5);

    /* --- Estado de los datos cargados (se calcula en vivo) --- */
    const regs = DATOS.regs;
    const conHoras = regs.filter(r => r.horaInicio && r.horaFin).length;
    const sinDesc = regs.filter(r => r.articuloDesc === SIN_DESCRIPCION).length;
    const variasTelas = regs.filter(r => partesArticulo(r).length > 1).length;
    const porTono = new Map();
    regs.forEach(r => {
      const t = porTono.get(r.tono) || { cargas: 0, kg: 0 };
      t.cargas++; t.kg += r.kgCarga;
      porTono.set(r.tono, t);
    });
    const kgTotal = regs.reduce((s, r) => s + r.kgCarga, 0);
    const pct = n => regs.length ? fmt.n(100 * n / regs.length, 1) + '%' : '—';

    const c6 = el('div', 'sc8-card');
    c6.innerHTML = '<h3>Los datos cargados ahora mismo</h3>' +
      '<p class="sc8-tab-desc">Se recalcula con cada actualización de la hoja.</p>' +
      '<div class="sc8-tab-kpis-linea">' +
      `<div><span>Cargas con fecha válida</span><strong>${fmt.kg(regs.length)}</strong></div>` +
      `<div><span>Kg procesados</span><strong>${fmt.kg(kgTotal)}</strong></div>` +
      `<div><span>Histórico disponible</span><strong>${fmtFechaLarga(DATOS.min)} <small>a</small> ${fmtFechaLarga(DATOS.max)}</strong></div>` +
      `<div><span>Artículos distintos</span><strong>${DATOS.porArticulo.size}</strong></div>` +
      '</div>' +
      lista([
        `<b>${pct(conHoras)}</b> de las cargas (${fmt.kg(conHoras)}) tienen Hora Inicio y ` +
          'Hora Fin: son las que entran en los tiempos de proceso.',
        `<b>${pct(variasTelas)}</b> de las cargas (${fmt.kg(variasTelas)}) tiñen más de una ` +
          'tela a la vez.',
        `<b>${fmt.kg(sinDesc)}</b> cargas llegan sin descripción de artículo y se agrupan ` +
          'en <b>(Sin descripción)</b>.'
      ]) +
      '<div class="responsive-table-wrap"><table class="sc8-table sc8-tab-tabla sin-orden">' +
      '<thead><tr><th>Tono</th><th>Cargas</th><th>% de cargas</th><th>Kg</th>' +
      '<th>% de kg</th></tr></thead><tbody>' +
      CONFIG.ORDEN_TONOS.filter(t => porTono.has(t)).map(t => {
        const v = porTono.get(t);
        return `<tr><td>${esc(t)}</td><td>${fmt.kg(v.cargas)}</td>` +
          `<td>${pct(v.cargas)}</td><td>${fmt.kg(v.kg)}</td>` +
          `<td>${fmt.n(kgTotal ? 100 * v.kg / kgTotal : 0, 1)}%</td></tr>`;
      }).join('') +
      '</tbody></table></div>';
    H.appendChild(c6);

    return H;
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */

  function sincronizarControles(sel) {
    $('tabRangoTxt').textContent = rotulaRango(sel);
    $('tabCmpTxt').textContent = rotulaRango(estado.cmpCustom);
    $('tabCmpCustom').classList.toggle('oculto', estado.cmp !== 'custom');
  }

  function seleccionarVista(vista) {
    estado.vista = vista;
    document.querySelectorAll('#tabTabs button')
      .forEach(x => x.classList.toggle('activo', x.dataset.tab === vista));
    render();
  }

  function abrirDetalleArticulo(articulo) {
    estado.articulo = articulo;
    estado.detTono = TODOS;
    seleccionarVista('detalle');
    $('tabVista').scrollIntoView({ block: 'start' });
  }

  function render() {
    if (!DATOS || !DATOS.regs.length) return;
    const sel = estado.sel;
    const periodos = periodosEn(sel);
    const cmpRango = rangoComparacion(sel, estado.cmp, estado.cmpCustom);
    const actual = agg(sel);
    const base = cmpRango ? agg(cmpRango) : null;

    sincronizarControles(sel);

    const contenedor = $('tabVista');
    contenedor.innerHTML = '';
    let nodo;
    if (estado.vista === 'resumen')       nodo = vistaResumen(actual, base, sel, cmpRango);
    else if (estado.vista === 'pareto')   nodo = vistaPareto(sel, periodos);
    else if (estado.vista === 'balp')     nodo = vistaBalp(sel, periodos);
    else if (estado.vista === 'defectos') nodo = vistaDefectos(sel);
    else if (estado.vista === 'detalle')  nodo = vistaDetalleArticulo(sel, periodos);
    else if (estado.vista === 'costos')   nodo = vistaMatriz({
      titulo: 'Costo de receta por kilo ($/kg) — por artículo',
      desc: 'Costo de receta promedio ponderado del periodo por kg procesado, con la columna ' +
        '“Costo US$ / kg” de cada carga. Verde = abarató, rojo = encareció.',
      prop: 'costoKg', fmtCelda: v => fmt.n(v, 2), dir: -1,
      totalRotulo: 'Promedio planta (pond. por kg)',
      pie: 'Incluye todas las cargas (producción y reproceso). El sobrecosto atribuible solo a los ' +
        'reprocesos se ve en la pestaña “Resumen general”.'
    }, sel, periodos);
    else if (estado.vista === 'tiempos') {
      nodo = el('div');
      nodo.appendChild(vistaMatriz({
        titulo: 'Tiempo de teñido por carga (min, promedio)',
        desc: 'Duración media de una carga en máquina (Hora Fin − Hora Inicio). ' +
          'Verde = más rápido, rojo = más lento.',
        prop: 'curvaProm', fmtCelda: v => fmt.n(v, 0), dir: -1,
        totalRotulo: 'Promedio planta'
      }, sel, periodos));
      nodo.appendChild(vistaMatriz({
        titulo: 'Tiempo total del proceso en tintorería (min por partida, promedio)',
        desc: 'Ciclo completo de la partida: de la primera Hora Inicio a la última Hora Fin de todas ' +
          'sus cargas, así que incluye las esperas entre procesos. Verde = más rápido, rojo = más lento.',
        prop: 'totProm', fmtCelda: v => fmt.n(v, 0), dir: -1,
        totalRotulo: 'Promedio planta',
        pie: 'Se calcula solo con las cargas que tienen Hora Inicio y Hora Fin registradas ' +
          '(93% de los registros actuales).'
      }, sel, periodos));
    }
    else if (estado.vista === 'lavado')   nodo = vistaTelaLavada(sel);
    else if (estado.vista === 'info')     nodo = vistaInformacion();

    contenedor.appendChild(nodo);
    conectarTips(contenedor);
    hacerOrdenables(contenedor);

    // Controles que viven dentro de la vista (pestaña Detalle).
    const selArt = $('tabSelArt');
    if (selArt) selArt.addEventListener('change', () => {
      estado.articulo = selArt.value;
      estado.detTono = TODOS;
      render();
    });
    const selTono = $('tabSelDetTono');
    if (selTono) selTono.addEventListener('change', () => {
      estado.detTono = selTono.value;
      render();
    });
  }

  /* ============================================================
     CONEXIÓN DE CONTROLES E INICIO
     ============================================================ */

  function conectar() {
    if (conectado) return;
    conectado = true;

    selectorFechas($('tabPopRango'), $('tabRangoBtn'), () => estado.sel, s => {
      estado.sel = s;
      cacheAgg.clear();
      render();
    });
    selectorFechas($('tabPopCmp'), $('tabCmpBtn'), () => estado.cmpCustom, s => {
      estado.cmpCustom = s;
      cacheAgg.clear();
      render();
    });

    $('tabCmp').addEventListener('change', ev => {
      estado.cmp = ev.target.value;
      render();
    });
    $('tabTono').addEventListener('change', ev => {
      estado.tono = ev.target.value;
      cacheAgg.clear();
      render();
    });
    document.querySelectorAll('#tabGranularidad button').forEach(b => {
      b.addEventListener('click', () => {
        estado.granularidad = b.dataset.gran;
        document.querySelectorAll('#tabGranularidad button')
          .forEach(x => x.classList.toggle('activo', x === b));
        render();
      });
    });
    document.querySelectorAll('#tabTabs button').forEach(b => {
      b.addEventListener('click', () => {
        seleccionarVista(b.dataset.tab);
      });
    });
  }

  /* Se llama al cargar/recargar datos y al entrar en la vista. */
  function iniciar() {
    preparar();
    const vacio = !DATOS.regs.length;
    $('tabSinDatos').classList.toggle('oculto', !vacio);
    $('tabCuerpo').classList.toggle('oculto', vacio);
    if (vacio) return;

    /* Rango por defecto: los últimos 30 días con datos, para que el
       "periodo anterior" tenga histórico contra el cual comparar. Si ya
       había un rango elegido y sigue dentro de los datos, se respeta:
       al recargar la hoja no se pierde lo que el usuario estaba viendo. */
    const vigente = estado.sel &&
      estado.sel.a >= DATOS.min && estado.sel.b <= DATOS.max;
    if (!vigente) {
      const max = desdeIso(DATOS.max);
      const inicio = iso(sumarDias(max, -29));
      estado.sel = { a: inicio < DATOS.min ? DATOS.min : inicio, b: DATOS.max };
    }
    if (!estado.cmpCustom)
      estado.cmpCustom = rangoComparacion(estado.sel, 'prev') ||
        { a: DATOS.min, b: DATOS.max };

    // Tonos presentes en los datos, en el orden de CONFIG.ORDEN_TONOS.
    const presentes = new Set(DATOS.regs.map(r => r.tono));
    $('tabTono').innerHTML =
      `<option value="${TODOS}">Todos los tonos</option>` +
      CONFIG.ORDEN_TONOS.filter(t => presentes.has(t))
        .map(t => `<option value="${esc(t)}"${estado.tono === t ? ' selected' : ''}>${esc(t)}</option>`)
        .join('');

    conectar();
    render();
  }

  return { iniciar, render, estado };
})();
