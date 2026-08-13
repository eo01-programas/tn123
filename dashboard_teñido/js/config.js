/* ============================================================
   CONFIG.JS — CONFIGURACION CENTRAL DEL DASHBOARD DE TINTORERIA
   ============================================================
   ▼▼▼ PASO OBLIGATORIO ▼▼▼
   Pega aquí la URL de tu implementación de Google Apps Script
   (Implementar > Nueva implementación > Aplicación web > URL).
   ============================================================ */

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzPjgH5B8bxmFnSxnhGe9XQIpC-aJwDffmeAY2M7019RKYNcKz97uuWS-SyT8sHhh7L3g/exec';
const LOCALSTORAGE_KEY = 'dashboard_tenido_appscript_cache_v1';

/* ============================================================
   PARÁMETROS DE NEGOCIO (ajustables)
   ============================================================ */
const CONFIG = {

  // Cantidad de registros por lote al enviar a Google Sheets.
  TAM_LOTE_ENVIO: 60,

  // Cantidad de elementos en los rankings "Top N".
  TOP_N: 5,

  // Periodos seleccionados por defecto en el filtro Semana/Mes: al abrir
  // (y al cambiar el pill Sem/Mes) se marcan los últimos N con datos.
  PERIODOS_INICIALES: 6,

  // Nombre de la hoja del Excel que contiene los datos.
  NOMBRE_HOJA_EXCEL: 'Consulta',

  // Proceso cuyos litros se separan como segmento propio en la gráfica
  // "AGUA CONSUMIDA" de la vista H2O (columna "Procesos"; la comparación
  // ignora tildes y mayúsculas).
  PROCESO_LAVADO_MAQUINA: 'LAVADO MÁQUINA',

  /* Clasificación de defectos a partir del campo "Tipo Procesos"
     de las cargas de REPROCESO. Se evalúa EN ORDEN (la primera
     coincidencia gana). La comparación ignora tildes y mayúsculas. */
  MAPA_DEFECTOS: [
    { contiene: 'LAVADO POR IGUALACIÓN Y/O DEGRADE',  defecto: 'Mala igualación(lv)' },
    { contiene: 'QUEBRADURA',  defecto: 'Quebraduras' },
    { contiene: 'DEGRADE',     defecto: 'Degradé' },
    { contiene: 'IGUALACION',  defecto: 'Mala igualación' },
    { contiene: 'MATIZADO',    defecto: 'Fuera de tono' },
    { contiene: 'RETEÑIDO',    defecto: 'Mala igualación' },
    { contiene: 'RETENIDO',    defecto: 'Mala igualación' },
    { contiene: 'DESMONTADO',  defecto: 'Mala igualación' },
    { contiene: 'MIGRACION',   defecto: 'Migración' },
    { contiene: 'MALA SOLIDEZ',     defecto: 'Solidez' },
    { contiene: 'MANCHAS',  defecto: 'Manchas' },
    { contiene: 'PILLING',  defecto: 'Pilling' }
  ],
  DEFECTO_POR_DEFECTO: 'Otros',

  /* Nombres cortos de cliente para filtros, tabla y gráficos.
     Se evalúa en orden (la primera coincidencia gana); si ningún
     patrón coincide se usa el nombre original tal como viene del
     Excel/Sheets. El dato enviado a Google Sheets no se toca:
     la columna Cliente conserva siempre el nombre completo. */
  MAPA_CLIENTES: [
    { contiene: 'ALLBIRDS',  abrev: 'ALLB' },
    { contiene: 'AM RETAIL', abrev: 'AMR'  },
    { contiene: 'ATHLETA',   abrev: 'ATH'  },
    { contiene: 'BANANA',    abrev: 'BNN'  },
    { contiene: 'COFACO',    abrev: 'COF'  },
    { contiene: 'DUER',      abrev: 'DUER' },
    { contiene: 'LACOSTE',   abrev: 'LAC'  },
    { contiene: 'LULU',      abrev: 'LULU' },
    { contiene: 'REVTOWN',   abrev: 'REV'  },
    { contiene: 'SKECHERS',  abrev: 'SKE'  },
    { contiene: 'THEORY',    abrev: 'THE'  }
  ],

  /* ---------- TONO (vista DETALLE / tablero de gestión) ----------
     El tablero agrupa los colores en cuatro tonos porque comparten
     ruta y receta de teñido. Como la hoja no trae una columna de tono,
     se deduce del texto de "Colores" (Color 1) con la misma mecánica
     que MAPA_DEFECTOS: se evalúa EN ORDEN y la primera coincidencia
     gana, ignorando tildes y mayúsculas.

     El orden importa: Negro va primero para que "PFD+BLACK" o
     "WASHED BLACK" no caigan en Blanco; Claros va antes que Oscuros
     para que "LIGHT GREY" o "PALE PLUM" no se cuenten como oscuros.
     Con los datos actuales clasifica el 99,8% de los colores con
     nombre; los que no coincidan quedan en TONO_POR_DEFECTO, así se
     ven en el selector y se puede afinar esta lista. */
  MAPA_TONOS: [
    /* --- Negro (incluye teñidos negros sobre base blanqueada) --- */
    { contiene: 'BLACK',     tono: 'Negro' },
    { contiene: 'NEGRO',     tono: 'Negro' },
    { contiene: 'NOIR',      tono: 'Negro' },
    { contiene: 'COAL',      tono: 'Negro' },
    { contiene: 'ONYX',      tono: 'Negro' },
    { contiene: 'PHANTOM',   tono: 'Negro' },
    { contiene: 'CARBON',    tono: 'Negro' },
    { contiene: 'ASPHALT',   tono: 'Negro' },
    { contiene: 'GOTHIC',    tono: 'Negro' },

    /* --- Blanco / crudo (sin teñir, blanqueo óptico o químico) --- */
    { contiene: 'BLANQUEO',  tono: 'Blanco' },
    { contiene: 'BCO',       tono: 'Blanco' },
    { contiene: 'PFD',       tono: 'Blanco' },
    { contiene: 'CRUDO',     tono: 'Blanco' },
    { contiene: 'WHITE',     tono: 'Blanco' },
    { contiene: 'BLANCO',    tono: 'Blanco' },
    { contiene: 'IVORY',     tono: 'Blanco' },
    { contiene: 'OPTICO',    tono: 'Blanco' },
    { contiene: 'ECRU',      tono: 'Blanco' },
    { contiene: 'NATURAL',   tono: 'Blanco' },
    { contiene: 'CREAM',     tono: 'Blanco' },
    { contiene: 'OATMEAL',   tono: 'Blanco' },
    { contiene: 'VAPOR',     tono: 'Blanco' },
    { contiene: 'PEARL',     tono: 'Blanco' },
    { contiene: 'SAIL',      tono: 'Blanco' },
    { contiene: 'FOSSIL',    tono: 'Blanco' },

    /* --- Claros (antes que Oscuros: "LIGHT GREY" es claro) --- */
    { contiene: 'LIGHT',     tono: 'Claros' },
    { contiene: 'PALE',      tono: 'Claros' },
    { contiene: 'SOFT',      tono: 'Claros' },
    { contiene: 'BABY',      tono: 'Claros' },
    { contiene: 'PASTEL',    tono: 'Claros' },
    { contiene: 'BLUSH',     tono: 'Claros' },
    { contiene: 'ICY',       tono: 'Claros' },
    { contiene: 'ICED',      tono: 'Claros' },
    { contiene: 'SILVER',    tono: 'Claros' },
    { contiene: 'SEAFOAM',   tono: 'Claros' },
    { contiene: 'MINT',      tono: 'Claros' },
    { contiene: 'SAND',      tono: 'Claros' },
    { contiene: 'TAUPE',     tono: 'Claros' },
    { contiene: 'BEIGE',     tono: 'Claros' },
    { contiene: 'TAN',       tono: 'Claros' },
    { contiene: 'LILAC',     tono: 'Claros' },
    { contiene: 'LAVENDER',  tono: 'Claros' },
    { contiene: 'SAGE',      tono: 'Claros' },
    { contiene: 'PINK',      tono: 'Claros' },
    { contiene: 'ROSE',      tono: 'Claros' },
    { contiene: 'MAUVE',     tono: 'Claros' },
    { contiene: 'QUARTZ',    tono: 'Claros' },
    { contiene: 'MOONLIGHT', tono: 'Claros' },
    { contiene: 'HAILSTONE', tono: 'Claros' },
    { contiene: 'DUSTY DIAMOND', tono: 'Claros' },
    { contiene: 'CLOUDY',    tono: 'Claros' },
    { contiene: 'SHELL',     tono: 'Claros' },
    { contiene: 'NUDE',      tono: 'Claros' },
    { contiene: 'LIME',      tono: 'Claros' },
    { contiene: 'SEA ROCK',  tono: 'Claros' },
    { contiene: 'LUNAR',     tono: 'Claros' },
    { contiene: 'ABALONE',   tono: 'Claros' },
    { contiene: 'BREEZE',    tono: 'Claros' },
    { contiene: 'MOUSSE',    tono: 'Claros' },
    { contiene: 'VANILLA',   tono: 'Claros' },
    { contiene: 'STONE',     tono: 'Claros' },
    { contiene: 'OAK',       tono: 'Claros' },
    { contiene: 'BAYLEAF',   tono: 'Claros' },
    { contiene: 'VERA',      tono: 'Claros' },
    { contiene: 'DREAM REMIX', tono: 'Claros' },

    /* --- Oscuros --- */
    { contiene: 'NAVY',      tono: 'Oscuros' },
    { contiene: 'MARINE',    tono: 'Oscuros' },
    { contiene: 'MARINO',    tono: 'Oscuros' },
    { contiene: 'NUIT',      tono: 'Oscuros' },
    { contiene: 'NIGHT',     tono: 'Oscuros' },
    { contiene: 'DARK',      tono: 'Oscuros' },
    { contiene: 'DEEP',      tono: 'Oscuros' },
    { contiene: 'FOREST',    tono: 'Oscuros' },
    { contiene: 'OLIVE',     tono: 'Oscuros' },
    { contiene: 'BROWN',     tono: 'Oscuros' },
    { contiene: 'CHOCOLATE', tono: 'Oscuros' },
    { contiene: 'MOCHA',     tono: 'Oscuros' },
    { contiene: 'COCOA',     tono: 'Oscuros' },
    { contiene: 'BORDEAUX',  tono: 'Oscuros' },
    { contiene: 'BURGUNDY',  tono: 'Oscuros' },
    { contiene: 'WINE',      tono: 'Oscuros' },
    { contiene: 'PLUM',      tono: 'Oscuros' },
    { contiene: 'UMBER',     tono: 'Oscuros' },
    { contiene: 'GRAPHITE',  tono: 'Oscuros' },
    { contiene: 'CHARCOAL',  tono: 'Oscuros' },
    { contiene: 'TEAL',      tono: 'Oscuros' },
    { contiene: 'COBALT',    tono: 'Oscuros' },
    { contiene: 'SAPPHIRE',  tono: 'Oscuros' },
    { contiene: 'REDWOOD',   tono: 'Oscuros' },
    { contiene: 'MAHOGANY',  tono: 'Oscuros' },
    { contiene: 'CYPRESS',   tono: 'Oscuros' },
    { contiene: 'SPRUCE',    tono: 'Oscuros' },
    { contiene: 'INKLING',   tono: 'Oscuros' },
    { contiene: 'CASTOR',    tono: 'Oscuros' },
    { contiene: 'FLINT',     tono: 'Oscuros' },
    { contiene: 'TERRA',     tono: 'Oscuros' },
    { contiene: 'VERT',      tono: 'Oscuros' },
    { contiene: 'RUBY',      tono: 'Oscuros' },
    { contiene: 'CHERRY',    tono: 'Oscuros' },
    { contiene: 'CRANBERRY', tono: 'Oscuros' },
    { contiene: 'BERRY',     tono: 'Oscuros' },
    { contiene: 'SPICE',     tono: 'Oscuros' },
    { contiene: 'PINECONE',  tono: 'Oscuros' },
    { contiene: 'CINDERS',   tono: 'Oscuros' },
    { contiene: 'SHADOW',    tono: 'Oscuros' },
    { contiene: 'MARTEN',    tono: 'Oscuros' },
    { contiene: 'FIG',       tono: 'Oscuros' },
    { contiene: 'POSEIDON',  tono: 'Oscuros' },
    { contiene: 'JEWEL',     tono: 'Oscuros' },
    { contiene: 'PERIDOT',   tono: 'Oscuros' },
    { contiene: 'RICH',      tono: 'Oscuros' },
    { contiene: 'BOLD',      tono: 'Oscuros' },
    { contiene: 'HEATHER',   tono: 'Oscuros' },
    { contiene: 'GREY',      tono: 'Oscuros' },
    { contiene: 'GRIS',      tono: 'Oscuros' },
    { contiene: 'TREES',     tono: 'Oscuros' },
    { contiene: 'WASHED',    tono: 'Oscuros' },
    { contiene: 'RED',       tono: 'Oscuros' },
    { contiene: 'ROJO',      tono: 'Oscuros' },
    { contiene: 'BLUE',      tono: 'Oscuros' },
    { contiene: 'AZUL',      tono: 'Oscuros' },
    { contiene: 'GREEN',     tono: 'Oscuros' },
    { contiene: 'VERDE',     tono: 'Oscuros' },
    { contiene: 'ORANGE',    tono: 'Oscuros' },
    { contiene: 'GERANIUM',  tono: 'Oscuros' },
    { contiene: 'POPPY',     tono: 'Oscuros' },
    { contiene: 'CHAMBRAY',  tono: 'Oscuros' },
    { contiene: 'EARTHSHADE',tono: 'Oscuros' },
    { contiene: 'SPELLBOUND',tono: 'Oscuros' },
    { contiene: 'CERAMIC',   tono: 'Oscuros' },
    { contiene: 'SUMMER',    tono: 'Oscuros' },
    { contiene: 'OMBRE',     tono: 'Oscuros' }
  ],
  TONO_POR_DEFECTO: 'Sin clasificar',

  /* Orden en el selector de Tono del tablero. */
  ORDEN_TONOS: ['Blanco', 'Claros', 'Oscuros', 'Negro', 'Sin clasificar'],

  /* Objetivo de % BAP del tablero: fija la línea de referencia de la
     gráfica y el corte verde del semáforo. */
  OBJETIVO_BAP: 95,

  /* ---------- TIPOS DE TELA (vista DETALLE / tablero) ----------
     "Descripcion Art." trae las descripciones separadas por doble
     espacio, pero algunas descripciones llevan un doble espacio DENTRO
     ("BABY RIB1x1 40/1 COP ORG 0 + 75/72/1x2  PES RECIC 0+40D SPD"),
     así que al dividir aparecen trozos sueltos que no son artículos
     ("PES RECIC 0+40D SPD", "T\"Z\"", "FULL MATE").

     Un trozo empieza una descripción nueva solo si nombra un tipo de
     tela de esta lista; si no, se vuelve a unir a la descripción
     anterior. Con los datos actuales solo se reunen 7 trozos distintos,
     todos continuaciones evidentes. La comparación ignora tildes y
     mayúsculas. */
  TIPOS_TELA: [
    'JERSEY', 'RIB', 'FRENCH TERRY', 'TERRY', 'CUELLO', 'JACQUARD',
    'DOUBLE KNIT', 'DOBLE KNT', 'DOUBLE FACE', 'DOBLE FACE', 'INTERLOCK',
    'PIQUE', 'WAFFLE', 'FELPA', 'SUPLEX', 'GAMUZA', 'MESH', 'FLEECE',
    'POLAR'
  ],

  /* Telas principales: si una carga tiñe varias telas, estas se
     muestran primero (son la tela del cuerpo y el resto —rib, cuello—
     la acompaña). El ORDEN de la lista es el de prioridad: si una carga
     lleva JERSEY y FRENCH TERRY a la vez, manda el JERSEY. Las telas
     que no están aquí conservan el orden de la hoja. */
  TELAS_PRINCIPALES: ['JERSEY', 'FRENCH'],

  /* Lista cerrada de familias para crear la columna "Articulo" a partir
     de "Descripcion Art.". "MINI JACQUARD" debe evaluarse antes que
     "JACQUARD" porque también contiene ese texto. */
  FAMILIAS_ARTICULO: [
    'MINI JACQUARD',
    'JACQUARD',
    'CUELLO',
    'DOBLE FACE',
    'DOBLE KNT',
    'FELPA',
    'FRENCH TERRY',
    'INTERLOCK',
    'JERSEY 20/1',
    'JERSEY 30/1',
    'JERSEY 32/1',
    'JERSEY 36/1',
    'JERSEY 40/1',
    'JERSEY 60/1',
    'JERSEY PEACHED',
    'JERSEY PLAITED',
    'JERSEY PPT',
    'SUPLEX',
    'WAFFLE'
  ],

  /* Encabezados esperados en el Excel (vista_consulta_tenido). */
  COLUMNAS_EXCEL: [
    'Fecha', 'N° Carga', 'Semana', 'Maquina', 'OP - Partida', 'Cliente',
    'Cod. Art.', 'Descripcion Art.', 'Colores', 'Tipo Recetas',
    'Tipo Procesos', 'Procesos', 'Vol Lt Utilizados', 'Nº Orden Proceso',
    'Kg Carga', 'Estado Carga', 'Hora Inicio', 'Usuario Inicio',
    'Hora Fin', 'Usuario Fin', 'Turno', 'Completado', 'Fecha Completado',
    'Vb Supervidor', 'Fecha Vb Supervisor', 'Tipo Prueba', 'Status',
    'Detalle Status', 'Observacion', 'Costo US$ / kg'
  ]
};

/* Paleta de gráficos alineada al tema Sc8_Ceropegia (ver css/estilos.css). */
const PALETA_SC8 = {
  primario:      '#4f8f62',
  primarioOscuro:'#3f7550',
  secundario:    '#8aa76d',
  acento:        '#6fa37f',
  peligro:       '#b65b5b',
  alerta:        '#d39b36',
  info:          '#4c8ca8',
  neutro:        '#667466',
  suave:         '#d9ead3',
  series: ['#4f8f62', '#b65b5b', '#d39b36', '#4c8ca8', '#8aa76d', '#6fa37f', '#667466']
};
