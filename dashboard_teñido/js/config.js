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
