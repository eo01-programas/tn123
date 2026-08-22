/* ============================================================
   IMPORTAR.JS — Intercambio de datos con Google Sheets:
   - cargarDesdeSheets(): GET a WEB_APP_URL?accion=datos; la hoja
     es la fuente de verdad del dashboard.
   - importarExcel() + enviarAGoogleSheets(): lee el Excel local
     (SheetJS) y lo guarda en la hoja vía fetch() POST no-cors.
   ============================================================ */

const Importar = (() => {

  const CACHE_KEY = typeof LOCALSTORAGE_KEY !== 'undefined'
    ? LOCALSTORAGE_KEY
    : 'dashboard_tenido_appscript_cache_v1';

  function verificarUrl() {
    if (!WEB_APP_URL || WEB_APP_URL.startsWith('PEGA_AQUI'))
      throw new Error('Configura WEB_APP_URL en js/config.js.');
  }

  function leerCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (!cache || !Array.isArray(cache.registros)) return null;
      return cache;
    } catch (e) {
      return null;
    }
  }

  function guardarCache(registros, version, articulosUnicos, telaLavada, telaLavadaError) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        version: version || '',
        guardadoEn: Date.now(),
        registros: registros || [],
        articulosUnicos: articulosUnicos || [],
        telaLavada: telaLavada || [],
        telaLavadaError: telaLavadaError || ''
      }));
    } catch (e) {
      // Si localStorage falla, se conserva la carga normal desde Apps Script.
    }
  }

  function cargarCacheLocal() {
    const cache = leerCache();
    if (!cache || !cache.registros.length) return 0;
    Datos.cargarArticulosUnicos(cache.articulosUnicos || []);
    Datos.cargarTelaLavada(cache.telaLavada || [], cache.telaLavadaError || '');
    return Datos.cargarRegistros(cache.registros);
  }

  async function obtenerVersionRemota() {
    verificarUrl();
    const respuesta = await fetch(WEB_APP_URL + '?accion=version', { cache: 'no-store' });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    return datos && datos.ok ? (datos.version || '') : null;
  }

  /* ---------- Carga desde Google Sheets (fuente de verdad) ---------- */

  async function cargarDesdeSheets(opciones = {}) {
    verificarUrl();
    const cache = leerCache();

    const cacheTelaVigente = cache && Array.isArray(cache.telaLavada) &&
      cache.guardadoEn && Date.now() - cache.guardadoEn < 2 * 60 * 1000;
    if (opciones.soloSiCambio && cache && cache.version && cacheTelaVigente) {
      const versionRemota = await obtenerVersionRemota();
      if (versionRemota && versionRemota === cache.version)
        return Datos.Estado.registros.length || cargarCacheLocal();
    }

    const respuesta = await fetch(WEB_APP_URL + '?accion=datos', { cache: 'no-store' });
    if (!respuesta.ok)
      throw new Error('Google Sheets respondió HTTP ' + respuesta.status);

    const datos = await respuesta.json();
    if (!datos.ok)
      throw new Error(datos.error || 'Respuesta inválida de Apps Script.');

    const registros = datos.registros || [];
    Datos.cargarArticulosUnicos(datos.articulosUnicos || []);
    Datos.cargarTelaLavada(datos.telaLavada || [], datos.telaLavadaError || '');
    const total = Datos.cargarRegistros(registros);
    guardarCache(registros, datos.version, datos.articulosUnicos,
      datos.telaLavada, datos.telaLavadaError);
    return total;
  }

  /* ---------- Lectura del archivo Excel ---------- */

  function leerArchivo(archivo) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
      lector.onload = ev => {
        try {
          const libro = XLSX.read(ev.target.result, { type: 'array' });
          const nombre = libro.SheetNames.includes(CONFIG.NOMBRE_HOJA_EXCEL)
            ? CONFIG.NOMBRE_HOJA_EXCEL
            : libro.SheetNames[0];
          const hoja = libro.Sheets[nombre];
          // raw:true => números como números; fechas/hora de este reporte
          // llegan como texto y las parsea Utils (dd/mm/yyyy y mm/dd/yyyy hh:mm)
          const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
          const nombreValores = libro.SheetNames.find(n =>
            Utils.clave(n) === 'VALORES UNICOS');
          const articulosUnicos = nombreValores
            ? XLSX.utils.sheet_to_json(libro.Sheets[nombreValores],
                { defval: '', raw: true })
            : [];
          resolver({ filas, articulosUnicos });
        } catch (e) { rechazar(e); }
      };
      lector.readAsArrayBuffer(archivo);
    });
  }

  async function importarExcel(archivo) {
    UI.estadoImportacion('Leyendo archivo…', 'info');
    const { filas, articulosUnicos } = await leerArchivo(archivo);
    if (!filas.length) throw new Error('El archivo no contiene filas de datos.');

    Datos.cargarArticulosUnicos(articulosUnicos);
    const n = Datos.cargarRegistros(filas);
    UI.estadoImportacion(
      `Importado: ${n} registros únicos (${filas.length} filas leídas).`, 'ok');
    return n;
  }

  /* ---------- Envío a Google Sheets ----------
     Requisito: fetch() con método POST y mode: 'no-cors' hacia
     WEB_APP_URL. Con 'no-cors' la respuesta es opaca (no se puede
     leer), por eso la deduplicación definitiva la hace codigo.gs
     en el servidor usando la columna CLAVE_UNICA; si la carga ya
     existe, actualiza su Costo US$ / kg sin duplicar la fila.    */

  function aFilaPayload(r) {
    return {
      fecha: r.fechaTxt,
      nCarga: r.nCarga,
      semana: r.semana,
      maquina: r.maquina,
      opPartida: r.opPartida,
      cliente: r.cliente,
      codArt: r.codArt,
      descArt: r.descArt,
      colores: r.colores,
      tipoRecetas: r.tipoRecetas,
      tipoProcesos: r.tipoProcesos,
      procesos: r.procesos,
      volLt: r.volLt,
      ordenProceso: r.ordenProceso,
      kgCarga: r.kgCarga,
      estadoCarga: r.estadoCarga,
      horaInicio: r.horaInicio ? Utils.fmtFechaHora(r.horaInicio) : '',
      usuarioInicio: r.usuarioInicio,
      horaFin: r.horaFin ? Utils.fmtFechaHora(r.horaFin) : '',
      usuarioFin: r.usuarioFin,
      turno: r.turno,
      completado: r.completado,
      fechaCompletado: r.fechaCompletado,
      vbSupervisor: r.vbSupervisor,
      fechaVbSupervisor: r.fechaVbSupervisor,
      esReproceso: r.esReproceso ? 'SI' : 'NO',
      defecto: r.defecto,
      articulo: r.articulo,
      observacion: r.observacion,
      costoPorKg: r.costoPorKg,
      claveUnica: r.claveUnica
    };
  }

  async function enviarAGoogleSheets() {
    const registros = Datos.Estado.registros;
    if (!registros.length) throw new Error('No hay registros para enviar.');
    verificarUrl();

    const payload = registros.map(aFilaPayload);
    const lotes = [];
    for (let i = 0; i < payload.length; i += CONFIG.TAM_LOTE_ENVIO)
      lotes.push(payload.slice(i, i + CONFIG.TAM_LOTE_ENVIO));

    let enviados = 0;
    for (let i = 0; i < lotes.length; i++) {
      UI.estadoImportacion(
        `Guardando en Google Sheets: lote ${i + 1} de ${lotes.length}…`, 'info');

      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          origen: 'dashboard-tintoreria',
          registros: lotes[i]
        })
      });
      enviados += lotes[i].length;
    }
    return enviados;
  }

  return { importarExcel, enviarAGoogleSheets, cargarDesdeSheets,
           cargarCacheLocal };
})();
