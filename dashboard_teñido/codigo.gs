const SHEET_ID = '1WW7l1SEds-XKuQyUjQrFlBLBPvcqBXxYiJSDU042Bn8';

/* Nombre de la pestaña donde se guardan los datos.
   Déjalo vacío ('') para usar la PRIMERA pestaña (gid=0).
   Si indicas un nombre y no existe, se crea automáticamente. */
const NOMBRE_HOJA = '';

/* El costo es un decimal, no una hora. Este formato evita que valores como
   0.4 se muestren como fechas de diciembre de 1899 en Google Sheets. */
const FORMATO_COSTO_POR_KG = '0.####';

/* Encabezados de la hoja. Incluyen los campos compuestos divididos:
   - Cod. Art. y Colores separados por " | "
   - Descripcion Art. separada por doble espacio
   La CLAVE_UNICA evita duplicados:
   OP-Partida + Cod. Art. + Descripcion Art. + Colores + Fecha + N° Carga
   (Fecha y N° Carga se incluyen para no descartar cargas distintas de
   una misma partida: blanqueo, teñido, reproceso...). */
const ENCABEZADOS = [
  'Fecha', 'N° Carga', 'Semana', 'Maquina', 'OP - Partida', 'Cliente',
  'Cod. Art.', 'Cod. Art. 1', 'Cod. Art. 2',
  'Descripcion Art.', 'Descripcion Art. 1', 'Descripcion Art. 2',
  'Colores', 'Color 1', 'Color 2',
  'Tipo Recetas', 'Tipo Procesos', 'Procesos',
  'Vol Lt Utilizados', 'Nº Orden Proceso', 'Kg Carga', 'Estado Carga',
  'Hora Inicio', 'Usuario Inicio', 'Hora Fin', 'Usuario Fin', 'Turno',
  'Completado', 'Fecha Completado', 'Vb Supervisor', 'Fecha Vb Supervisor',
  'Es Reproceso', 'Defecto', 'Articulo', 'Observacion',
  'CLAVE_UNICA', 'FECHA_IMPORTACION', 'Costo US$ / kg'
];

/* Orden de propiedades del payload que envía el frontend
   (js/importar.js), alineado con los encabezados desde Fecha hasta
   CLAVE_UNICA. FECHA_IMPORTACION y Costo US$ / kg se agregan aparte. */
const CAMPOS = [
  'fecha', 'nCarga', 'semana', 'maquina', 'opPartida', 'cliente',
  'codArt', 'codArt1', 'codArt2',
  'descArt', 'descArt1', 'descArt2',
  'colores', 'color1', 'color2',
  'tipoRecetas', 'tipoProcesos', 'procesos',
  'volLt', 'ordenProceso', 'kgCarga', 'estadoCarga',
  'horaInicio', 'usuarioInicio', 'horaFin', 'usuarioFin', 'turno',
  'completado', 'fechaCompletado', 'vbSupervisor', 'fechaVbSupervisor',
  'esReproceso', 'defecto', 'articulo', 'observacion',
  'claveUnica'
];

/* ============================================================
   doPost(e) — Recibe los datos del frontend.
   El frontend envía fetch() POST con mode:'no-cors' y body JSON:
   { origen: 'dashboard-tintoreria', registros: [ {...}, ... ] }
   ============================================================ */
function doPost(e) {
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000); // evita choques entre lotes simultáneos

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respuestaJson({ ok: false, error: 'Sin datos en el POST.' });
    }

    const cuerpo = JSON.parse(e.postData.contents);
    const registros = cuerpo.registros;
    if (!Array.isArray(registros) || !registros.length) {
      return respuestaJson({ ok: false, error: 'El payload no contiene registros.' });
    }

    const hoja = obtenerHoja();
    const encabezadosHoja = asegurarEncabezados(hoja);
    const idxHoja = {};
    encabezadosHoja.forEach(function (h, i) { idxHoja[h] = i; });

    /* --- Deduplicación: leer claves ya existentes --- */
    const colClave = idxHoja['CLAVE_UNICA'] + 1;
    const colCosto = idxHoja['Costo US$ / kg'] + 1;
    const ultimaFila = hoja.getLastRow();
    const existentes = new Map();

    /* Repara también hojas existentes cuya columna quedó con formato de
       fecha/hora. Se aplica antes de leer para recuperar números decimales. */
    if (ultimaFila > 1) {
      hoja.getRange(2, colCosto, ultimaFila - 1, 1)
          .setNumberFormat(FORMATO_COSTO_POR_KG);
    }
    const costosExistentes = ultimaFila > 1
      ? hoja.getRange(2, colCosto, ultimaFila - 1, 1).getValues()
      : [];
    if (ultimaFila > 1) {
      hoja.getRange(2, colClave, ultimaFila - 1, 1)
          .getValues()
          .forEach(function (f, i) {
            if (f[0]) existentes.set(String(f[0]), i);
          });
    }

    /* --- Construir filas nuevas y actualizar el costo de duplicados --- */
    const ahora = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    const nuevas = [];
    let duplicados = 0;
    let costosActualizados = 0;
    let primerCostoActualizado = null;
    let ultimoCostoActualizado = null;

    registros.forEach(reg => {
      const clave = String(reg.claveUnica || claveDesdeRegistro(reg));
      if (existentes.has(clave)) {
        duplicados++;
        const iExistente = existentes.get(clave);
        const tieneCosto = reg.costoPorKg !== undefined &&
          reg.costoPorKg !== null && reg.costoPorKg !== '';
        if (iExistente !== null && tieneCosto &&
            String(costosExistentes[iExistente][0]) !== String(reg.costoPorKg)) {
          costosExistentes[iExistente][0] = reg.costoPorKg;
          costosActualizados++;
          primerCostoActualizado = primerCostoActualizado === null
            ? iExistente : Math.min(primerCostoActualizado, iExistente);
          ultimoCostoActualizado = ultimoCostoActualizado === null
            ? iExistente : Math.max(ultimoCostoActualizado, iExistente);
        }
        return;
      }
      // null distingue los duplicados internos del lote de filas ya guardadas.
      existentes.set(clave, null);

      const fila = encabezadosHoja.map(function (encabezado) {
        if (encabezado === 'FECHA_IMPORTACION') return ahora;
        if (encabezado === 'Costo US$ / kg')
          return reg.costoPorKg === undefined || reg.costoPorKg === null
            ? '' : reg.costoPorKg;
        const iEncabezado = ENCABEZADOS.indexOf(encabezado);
        const campo = iEncabezado >= 0 ? CAMPOS[iEncabezado] : '';
        return campo && reg[campo] !== undefined && reg[campo] !== null
          ? reg[campo] : '';
      });
      fila[colClave - 1] = clave;
      nuevas.push(fila);
    });

    if (costosActualizados) {
      const cantidad = ultimoCostoActualizado - primerCostoActualizado + 1;
      hoja.getRange(2 + primerCostoActualizado, colCosto, cantidad, 1)
          .setValues(costosExistentes.slice(
            primerCostoActualizado, ultimoCostoActualizado + 1))
          .setNumberFormat(FORMATO_COSTO_POR_KG);
    }

    if (nuevas.length) {
      const primeraFilaNueva = hoja.getLastRow() + 1;
      hoja.getRange(primeraFilaNueva, 1, nuevas.length, encabezadosHoja.length)
          .setValues(nuevas);
      hoja.getRange(primeraFilaNueva, colCosto, nuevas.length, 1)
          .setNumberFormat(FORMATO_COSTO_POR_KG);
    }
    if (nuevas.length || costosActualizados) marcarVersionDatos();

    return respuestaJson({
      ok: true,
      recibidos: registros.length,
      insertados: nuevas.length,
      duplicados: duplicados,
      costosActualizados: costosActualizados
    });

  } catch (err) {
    return respuestaJson({ ok: false, error: String(err) });
  } finally {
    bloqueo.releaseLock();
  }
}

/* ============================================================
   doGet(e) — Dos usos:
   1) Sin parámetros: verificación rápida en el navegador.
   2) ?accion=datos : devuelve TODOS los registros de la hoja en
      formato JSON con los nombres de columna del Excel original,
      para que el dashboard se construya desde Google Sheets.
   ============================================================ */
function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || '';

  if (accion === 'datos') {
    try {
      const registros = leerRegistros();
      return respuestaJson({
        ok: true,
        total: registros.length,
        version: versionDatos(),
        registros: registros,
        articulosUnicos: leerArticulosUnicos()
      });
    } catch (err) {
      return respuestaJson({ ok: false, error: String(err) });
    }
  }

  if (accion === 'version') {
    try {
      return respuestaJson({ ok: true, version: versionDatos() });
    } catch (err) {
      return respuestaJson({ ok: false, error: String(err) });
    }
  }

  return respuestaJson({
    ok: true,
    servicio: 'API Dashboard de Tintorería',
    hoja: SHEET_ID.startsWith('PEGA_AQUI') ? 'SHEET_ID sin configurar' : 'configurada',
    fecha: new Date().toISOString()
  });
}

/* Lee la hoja completa y devuelve objetos con los encabezados del
   Excel original (los que espera Datos.normalizarFila en el
   frontend). Las columnas divididas (Cod. Art. 1/2, Color 1/2...)
   no se devuelven porque el dashboard las recalcula. */
function leerRegistros() {
  const hoja = obtenerHoja();
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 2 || ultimaCol < 1) return [];

  const tz = Session.getScriptTimeZone();
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  const idx = {};
  encabezados.forEach(function (h, i) { idx[String(h).trim()] = i; });

  /* Corrige el formato incluso si la hoja se consulta antes de una nueva
     importación. Tras aplicar formato numérico, getValues devuelve el costo
     como decimal y no como objeto Date. */
  const iCosto = idx['Costo US$ / kg'];
  if (iCosto !== undefined) {
    hoja.getRange(2, iCosto + 1, ultimaFila - 1, 1)
        .setNumberFormat(FORMATO_COSTO_POR_KG);
  }
  const filas = hoja.getRange(2, 1, ultimaFila - 1, ultimaCol).getValues();

  /* [columna en la hoja, encabezado que espera el frontend].
     'Vb Supervidor' conserva la errata del reporte original. */
  const SALIDA = [
    ['Fecha', 'Fecha'], ['N° Carga', 'N° Carga'], ['Semana', 'Semana'],
    ['Maquina', 'Maquina'], ['OP - Partida', 'OP - Partida'],
    ['Cliente', 'Cliente'], ['Cod. Art.', 'Cod. Art.'],
    ['Descripcion Art.', 'Descripcion Art.'], ['Colores', 'Colores'],
    ['Tipo Recetas', 'Tipo Recetas'], ['Tipo Procesos', 'Tipo Procesos'],
    ['Procesos', 'Procesos'], ['Vol Lt Utilizados', 'Vol Lt Utilizados'],
    ['Nº Orden Proceso', 'Nº Orden Proceso'], ['Kg Carga', 'Kg Carga'],
    ['Estado Carga', 'Estado Carga'], ['Hora Inicio', 'Hora Inicio'],
    ['Usuario Inicio', 'Usuario Inicio'], ['Hora Fin', 'Hora Fin'],
    ['Usuario Fin', 'Usuario Fin'], ['Turno', 'Turno'],
    ['Completado', 'Completado'], ['Fecha Completado', 'Fecha Completado'],
    ['Vb Supervisor', 'Vb Supervidor'],
    ['Fecha Vb Supervisor', 'Fecha Vb Supervisor'],
    ['Observacion', 'Observacion'],
    ['Costo US$ / kg', 'Costo US$ / kg']
  ];

  /* Sheets convierte a Date los textos con forma de fecha; aquí se
     devuelven en el formato de texto que el frontend sabe parsear:
     - Fecha            -> dd/MM/yyyy       (Utils.parseFechaDMA)
     - Hora Inicio/Fin  -> MM/dd/yyyy HH:mm (Utils.parseFechaHoraMDA) */
  function formatear(columna, v) {
    if (!(v instanceof Date)) return v;
    if (columna === 'Fecha') return Utilities.formatDate(v, tz, 'dd/MM/yyyy');
    if (columna === 'Hora Inicio' || columna === 'Hora Fin')
      return Utilities.formatDate(v, tz, 'MM/dd/yyyy HH:mm:ss');
    return Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm');
  }

  /* La columna combinada "Descripcion Art." se guardó con los espacios
     colapsados (Utils.texto en el frontend), así que ya no conserva el
     DOBLE espacio que separa los artículos y el dashboard no puede
     volver a dividirlos. Se reconstruye a partir de las columnas
     divididas "Descripcion Art. 1" y "Descripcion Art. 2" (que sí
     conservan el separador). Si esas columnas no existen o van vacías,
     se deja el valor de la columna combinada tal cual (respaldo). */
  const iDesc1 = idx['Descripcion Art. 1'];
  const iDesc2 = idx['Descripcion Art. 2'];
  const celda = (fila, i) =>
    i === undefined || fila[i] === null || fila[i] === undefined
      ? '' : String(fila[i]).trim();

  return filas.map(function (fila) {
    const reg = {};
    SALIDA.forEach(function (par) {
      const i = idx[par[0]];
      reg[par[1]] = i === undefined ? '' : formatear(par[0], fila[i]);
    });
    const d1 = celda(fila, iDesc1);
    const d2 = celda(fila, iDesc2);
    if (d1 || d2) reg['Descripcion Art.'] = d2 ? (d1 + '  ' + d2) : d1;
    return reg;
  });
}

/* Catálogo del filtro Artículo. Usa la pestaña "valores unicos" si existe;
   de lo contrario obtiene los pares únicos de las columnas divididas de
   la hoja principal (Cod. Art. 1/2 y Descripcion Art. 1/2). */
function leerArticulosUnicos() {
  const libro = SpreadsheetApp.openById(SHEET_ID);
  const hojaValores = libro.getSheets().find(function (h) {
    return normalizarNombreHoja(h.getName()) === 'VALORES UNICOS';
  });
  const hoja = hojaValores || obtenerHoja();
  if (!hoja || hoja.getLastRow() < 2) return [];

  const ultimaCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  const idx = {};
  encabezados.forEach(function (h, i) { idx[String(h).trim()] = i; });
  const pares = [
    [idx['Cod. Art. 1'], idx['Descripcion Art. 1']],
    [idx['Cod. Art. 2'], idx['Descripcion Art. 2']],
    [idx['Cod. Art.'], idx['Descripcion Art.']]
  ].filter(function (par) {
    return par[0] !== undefined && par[1] !== undefined;
  });
  if (!pares.length) return [];

  const vistos = {};
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ultimaCol)
    .getDisplayValues()
    .reduce(function (salida, fila) {
      pares.forEach(function (par) {
        const codigo = String(fila[par[0]] || '').trim().replace(/^0+(?=\d)/, '');
        const descripcion = String(fila[par[1]] || '').trim();
        if (codigo || descripcion)
          salida.push({ 'Cod. Art.': codigo, 'Descripcion Art.': descripcion });
      });
      return salida;
    }, [])
    .filter(function (articulo) {
      /* Las columnas divididas tienen prioridad. Si existen, se omite el
         valor compuesto de Cod. Art. para no crear "30199 | 30200". */
      return !String(articulo['Cod. Art.']).includes('|');
    })
    .filter(function (articulo) {
      if (!articulo['Cod. Art.'] && !articulo['Descripcion Art.']) return false;
      const clave = articulo['Cod. Art.'].toUpperCase() + '||' +
        articulo['Descripcion Art.'].toUpperCase();
      if (vistos[clave]) return false;
      vistos[clave] = true;
      return true;
    });
}

function normalizarNombreHoja(nombre) {
  return String(nombre || '').trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* ============================================================
   Funciones de apoyo
   ============================================================ */

function obtenerHoja() {
  if (SHEET_ID.startsWith('PEGA_AQUI')) {
    throw new Error('Configura SHEET_ID al inicio de codigo.gs.');
  }
  const libro = SpreadsheetApp.openById(SHEET_ID);
  if (!NOMBRE_HOJA) return libro.getSheets()[0]; // primera pestaña (gid=0)
  return libro.getSheetByName(NOMBRE_HOJA) || libro.insertSheet(NOMBRE_HOJA);
}

function asegurarEncabezados(hoja) {
  const primera = hoja.getRange(1, 1).getValue();
  if (String(primera).trim() === '') {
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length)
        .setFontWeight('bold')
        .setBackground('#dfeccd')       // tono Sc8_Ceropegia
        .setFontColor('#3f7550');
    hoja.setFrozenRows(1);
    return ENCABEZADOS.slice();
  }

  /* En hojas creadas con una versión anterior, agrega al final cualquier
     encabezado nuevo sin mover las columnas ni los datos existentes. */
  const ultimaCol = hoja.getLastColumn();
  const actuales = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  const presentes = new Set(actuales);
  const faltantes = ENCABEZADOS.filter(function (h) { return !presentes.has(h); });
  if (faltantes.length) {
    const rango = hoja.getRange(1, ultimaCol + 1, 1, faltantes.length);
    rango.setValues([faltantes])
        .setFontWeight('bold')
        .setBackground('#dfeccd')
        .setFontColor('#3f7550');
  }
  hoja.setFrozenRows(1);
  return actuales.concat(faltantes);
}

function versionDatos() {
  const props = PropertiesService.getScriptProperties();
  const version = props.getProperty('DATOS_VERSION');
  if (version) return version;
  const hoja = obtenerHoja();
  return [
    hoja.getLastRow(),
    hoja.getLastColumn(),
    hoja.getRange(1, 1).getValue()
  ].join(':');
}

function marcarVersionDatos() {
  PropertiesService.getScriptProperties()
    .setProperty('DATOS_VERSION', String(Date.now()));
}

/* Respaldo por si un registro llega sin claveUnica:
   se reconstruye con los mismos campos clave que usa el frontend. */
function claveDesdeRegistro(reg) {
  const norm = v => String(v === undefined || v === null ? '' : v)
    .replace(/\s+/g, ' ').trim().toUpperCase();
  return [
    norm(reg.opPartida), norm(reg.codArt), norm(reg.descArt),
    norm(reg.colores), norm(reg.fecha), norm(reg.nCarga)
  ].join('||');
}

function respuestaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
