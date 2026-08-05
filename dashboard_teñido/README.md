# Dashboard de Tintorería — Trazabilidad de Reprocesos (COFACO)

Dashboard HTML que replica la estructura del indicador de defectos/reprocesos,
aplicando los skills **scriptcase-sc8-ceropegia-design** (identidad visual verde
Sc8_Ceropegia) y **responsive-ui-design** (mobile-first, breakpoints 480 / 768 /
1024 / 1280 px, tablas con scroll horizontal, botones ≥ 40 px).

## Estructura del proyecto

```text
dashboard-tintoreria/
├── index.html          Página única del dashboard
├── codigo.gs           API receptora (Google Apps Script)
├── css/
│   └── estilos.css     Tema Sc8_Ceropegia + reglas responsive
└── js/
    ├── config.js       ★ WEB_APP_URL y parámetros de negocio
    ├── utils.js        Normalización, splits, fechas, formatos
    ├── datos.js        Modelo: KPIs, defectos, máquina origen/recuperación
    ├── filtros.js      Panel de filtros
    ├── graficos.js     Gráficos y drill-downs (Chart.js)
    ├── ui.js           KPIs, tabla detalle, ficha rápida, resumen
    ├── importar.js     Carga desde Sheets, lectura del Excel y envío
    └── main.js         Inicialización y eventos
```

## Resumen gerencial (vista inicial)

La pestaña **RESUMEN** abre por defecto y presenta cuatro tendencias en una
matriz de 2 × 2: kg procesados, kg reprocesados con su incidencia, kg bien a la
primera (BAP) con su porcentaje y costo estimado del reproceso. El eje X cambia
entre Semana y Mes con el mismo selector del panel lateral y todos los valores
se recalculan al aplicar filtros.

Cada bloque muestra la tendencia, el último período y el promedio. Las fórmulas
de volumen son:

- `% kg reprocesados = kg reprocesados / kg procesados`.
- `kg BAP = kg procesados − kg reprocesados`.
- `% BAP = kg BAP / kg procesados`.
- `costo reproceso = suma(Kg Carga × Costo US$ / kg)` de cada reproceso.

## Vista PxMAQ (producción por máquina)

La pestaña **PxMAQ**, ubicada entre RESUMEN y REPROCESO, presenta cuatro
gráficas en una matriz de 2 × 2:

- cargas de PRODUCCIÓN por máquina;
- kg de PRODUCCIÓN por máquina;
- cargas de REPROCESO por máquina;
- kg de REPROCESO por máquina.

Las barras se construyen con `Fecha`, `N° Carga`, `Maquina`, `Kg Carga` y
`Tipo Recetas`, obedecen los filtros laterales y abren al hacer clic el detalle
auditable de las cargas que las componen. Sobre las gráficas se muestran los
totales de las cinco clases de receta.

A la derecha de la etiqueta **NN** hay dos filtros propios de PxMAQ, apilados
en dos filas. El primero cambia entre **Mes / Sem / Día** y el segundo permite
elegir un período exacto de esa granularidad. Las opciones aparecen desde la
más reciente hasta la más antigua. PxMAQ inicia en **Día** y selecciona la
segunda fecha más reciente con datos (el día anterior al último registro
disponible); si solo existe una fecha, usa esa única fecha. Mes y Sem siguen
seleccionando el período más reciente. Este período usa la `Fecha` real de la
carga, es independiente del filtro temporal lateral y actualiza tanto las
cinco etiquetas como las cuatro gráficas de PxMAQ.

`Tipo Recetas` se clasifica de forma exclusiva y en este orden:
**PRODUCCIÓN → REPROCESO → PROCESO → NINGUNO → NN**. Por eso
`PRODUCCIÓN REPROCESO` cuenta como PRODUCCIÓN, `EN PROCESO REPROCESO` como
REPROCESO y un valor vacío o desconocido como NN.

## Vista $COSTO (impacto económico)

La pestaña **$COSTO**, ubicada entre DETALLE y H2O, reúne cuatro indicadores
económicos y seis análisis simétricos:

- costo total, costo por 1.000 kg producidos, promedio por carga y costo
  ponderado por kg reprocesado;
- Pareto de costo por familia de teñido de origen y por defecto;
- costo por máquina de origen y por receta de recuperación;
- matriz frecuencia versus costo promedio por defecto;
- tendencia semanal o mensual apilada por defecto, con línea de costo por
  1.000 kg producidos.

El teñido y la máquina de origen se recuperan desde la última carga de
PRODUCCIÓN asociada a la familia de la OP-Partida. Esto permite separar dónde
se originó el reproceso de dónde y cómo fue recuperado. Todas las gráficas
obedecen los filtros laterales y permiten abrir el detalle económico de las
cargas.

## Vista H2O (consumo de agua)

La pestaña **H2O** (a la derecha de $COSTO) presenta cinco gráficas
(2 arriba + 3 abajo) construidas con la columna `Vol Lt Utilizados`:

- **Agua consumida (Lt):** columnas apiladas por período: el segmento
  ámbar de la base son los litros de `Procesos = LAVADO MÁQUINA`
  (ajustable con `CONFIG.PROCESO_LAVADO_MAQUINA`) y el azul el resto de
  procesos; la línea punteada es el promedio del total.
- **Agua por kg procesado (Lt/Kg):** `litros / Kg Carga` de cada período.
- **Agua por artículo / por color (Top 5) y por proceso (todos los
  valores únicos de `Procesos`):** el largo de la barra son los litros
  totales (eje X en Lt, millones abreviados como `10M`) y la etiqueta
  al final muestra su intensidad Lt/kg (se omite si el grupo no tiene
  kg, como el lavado de máquina sin tela); el tooltip desglosa litros,
  kg y Lt/kg.

Obedece los mismos filtros del panel lateral y el selector Sem/Mes. El agua
se mide sobre todas las cargas filtradas (producción + reproceso); si hay un
filtro específico de reproceso activo (defecto o máquinas), la vista queda
acotada a esos reprocesos. Clic en cualquier barra abre el detalle de las
cargas que la componen con su columna de litros.

## Puesta en marcha (5 pasos)

1. **Apps Script:** en tu Google Sheet → Extensiones → Apps Script, pega el
   contenido de `codigo.gs`. Al inicio, reemplaza:
   ```js
   const SHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_GOOGLE_SHEET';
   ```
   Para tu hoja el ID es `1WW7l1SEds-XKuQyUjQrFlBLBPvcqBXxYiJSDU042Bn8`
   (la parte de la URL entre `/d/` y `/edit`).

2. **Implementar:** Implementar → Nueva implementación → tipo **Aplicación
   web** → Ejecutar como: *tú* → Quién tiene acceso: **Cualquier usuario**.
   Copia la URL `https://script.google.com/macros/s/…/exec`.

3. **Frontend:** pega esa URL en `js/config.js`:
   ```js
   const WEB_APP_URL = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';
   ```

4. **Abrir `index.html`** (doble clic o servidor local). El dashboard
   descarga automáticamente los datos guardados en Google Sheets
   (`GET WEB_APP_URL?accion=datos`) y se construye con ellos: KPIs, Pareto,
   tendencia, máquinas, Top 5 y trazabilidad. El botón **Actualizar todo**
   vuelve a leer la hoja.

5. **Importar Excel → Google Sheets:** el botón único del panel DATOS lee
   `grid_vista_consulta_tenido.xlsx`, envía los registros por lotes con
   `fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', … })` y recarga
   el dashboard desde la hoja (la fuente de verdad es Google Sheets).

> **Importante:** si actualizas `codigo.gs` en un proyecto ya implementado,
> ve a Implementar → **Administrar implementaciones** → ✏️ → Versión:
> **Nueva versión**. Sin ese paso la app web sigue sirviendo el código
> antiguo (la URL no cambia).

## Deduplicación (sin datos repetidos)

- **Frontend:** al importar, descarta filas repetidas dentro del archivo.
- **Servidor (`codigo.gs`):** compara contra la columna `CLAVE_UNICA` de la
  hoja y solo inserta lo nuevo. Si una carga ya existe, actualiza su
  `Costo US$ / kg`; puedes reenviar el mismo Excel sin duplicar filas.
- La clave combina: **OP - Partida + Cod. Art. + Descripcion Art. + Colores +
  Fecha + N° Carga** (Fecha y N° Carga se incluyen para no perder cargas
  distintas de una misma partida: blanqueo, teñido y reproceso son filas
  legítimas diferentes).

## Campos compuestos

| Campo             | Separador     | Columnas en la hoja                          |
|-------------------|---------------|----------------------------------------------|
| Cod. Art.         | `" | "`       | `Cod. Art.`, `Cod. Art. 1`, `Cod. Art. 2`    |
| Descripcion Art.  | doble espacio | `Descripcion Art.`, `… 1`, `… 2`             |
| Colores           | `" | "`       | `Colores`, `Color 1`, `Color 2`              |

Si un campo trae más de dos valores, los adicionales quedan unidos en la
columna `… 2`.

## Lógica de reprocesos

- Una carga es **reproceso** si la clasificación priorizada de `Tipo Recetas`
  resulta en `REPROCESO` (ver la regla de la vista PxMAQ).
- El **defecto** se clasifica desde `Tipo Procesos` con `CONFIG.MAPA_DEFECTOS`
  (editable en `js/config.js`): quebraduras, degradé, mala igualación y
  fuera de tono (matizado / reteñido / desmontado / migración).
- **Máquina origen** = máquina de la última carga de producción de esa misma
  partida antes del reproceso; **máquina de recuperación** = máquina donde se
  ejecutó el reproceso.
- **Costo de reproceso** = suma de `Kg Carga × Costo US$ / kg` para cada
  carga clasificada como reproceso. La tarifa se toma de la receta particular
  informada en el Excel, no de un valor fijo.

## Filtros de periodo (Semana/Mes): periodo de origen

Los filtros de **Semana** y **Mes** (y el eje X de la gráfica de tendencia)
no usan la fecha propia de cada registro, sino el **periodo de origen** de
su OP - Partida: la `Fecha` de su **primer proceso de PRODUCCIÓN**
(`Tipo Recetas` contiene `PRODUCCIÓN`).

- Si una OP - Partida se procesó por primera vez en junio y sus procesos
  siguientes o reprocesos corrieron en julio/agosto, **toda** la partida
  cuenta en junio: es el mes donde se generó el defecto.
- Los reprocesos heredan el periodo de la producción que los originó a
  través de la **familia de la partida**: el primer dígito del sufijo de
  4 marca la iteración de reproceso (`0093 → 1093 → 1193`), así que
  `X-1093` se asocia a la producción de `X-0093`.
- **Respaldo:** si una partida no tiene ningún registro de PRODUCCIÓN en la
  base cargada (p. ej. un reproceso cuya producción quedó fuera del rango
  de datos), el registro usa su propia fecha/semana.
- Este cálculo (`asignarPeriodoOrigen` en `js/datos.js`) se ejecuta al
  cargar los datos y solo afecta filtros y tendencia: el dato enviado a
  Google Sheets conserva la `Fecha` y `Semana` originales de cada fila.

## Notas

- Librerías cargadas desde cdnjs: **SheetJS 0.18.5** (leer .xlsx) y
  **Chart.js 4.4.1** (gráficos). Si necesitas trabajar sin internet,
  descárgalas y apunta los `<script>` de `index.html` a copias locales.
- Con `mode: 'no-cors'` el navegador no puede leer la respuesta del Apps
  Script (respuesta opaca); la confirmación de duplicados/insertados se
  verifica directamente en la hoja. Para probar la implementación, abre la
  `WEB_APP_URL` en el navegador: `doGet()` responde un JSON de estado.
