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
    ├── tablero.js      Vista DETALLE: tablero de gestión autónomo
    ├── ui.js           KPIs, ficha rápida, resumen y modal de detalle
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

## Vista DETALLE (tablero de gestión)

La pestaña **DETALLE** es un tablero de gestión **autónomo**: no obedece los
filtros del panel lateral, sino los suyos propios, y por eso el panel lateral se
oculta mientras está activa (`.sc8-app.sin-sidebar`). Toda su lógica vive en
`js/tablero.js` y es independiente de `Datos.calcularModelo()`.

### Sus filtros

- **Periodo de análisis:** selector de rango con doble calendario y atajos
  (últimos 30/90 días, últimos 6 meses, este mes, mes anterior, este año, todo
  el histórico). Los días fuera del rango de datos aparecen deshabilitados.
- **Comparar contra:** periodo anterior, mismo periodo del año anterior, los 6
  o 12 meses previos, o fechas personalizadas. Cada indicador muestra su
  variación con el color de la dirección deseada (verde favorable, rojo
  desfavorable). Si no hay histórico suficiente lo dice y los chips quedan en
  “sin base”.
- **Tono:** Blanco, Claros, Oscuros, Negro y Sin clasificar.
- **Columnas:** agrupa las matrices por mes o por semana.

### El artículo

El artículo **no** sale de la columna `Articulo` de la hoja (la AH), que es solo
la familia deducida de `CONFIG.FAMILIAS_ARTICULO` y agrupa construcciones muy
distintas bajo un mismo nombre. Sale de las columnas reales
**`Descripcion Art. 1`** y **`Descripcion Art. 2`**, que llegan combinadas en
`Descripcion Art.` separadas por doble espacio y que `Utils.splitDobleEspacio`
devuelve ya divididas en `r.descArts`.

El 64% de las cargas tiñe **dos telas juntas** (la tela y su rib) y sus kg son de
las dos a la vez: repartirlos entre ambas duplicaría el volumen y descuadraría
los totales del Pareto y de la planta. Por eso cada combinación es un artículo
propio, con las descripciones separadas por **` | `** (no por `+`, porque las
descripciones ya llevan signos `+`: `0 + 20Dn SPANDEX`). Las cargas sin
descripción quedan en `(Sin descripción)`.

Cuando una de las telas es un **JERSEY** o un **FRENCH TERRY** se muestra
primero, porque es la tela del cuerpo y el resto (rib, cuello) la acompaña. En la
hoja el JERSEY viene en segundo o tercer lugar en 569 de las 951 cargas que lo
llevan, y el FRENCH TERRY en las 64 cargas que lo llevan sin JERSEY. La lista y
su prioridad están en `CONFIG.TELAS_PRINCIPALES`: si una carga lleva las dos,
manda la primera de la lista (hoy, el JERSEY). Las telas que no están en la lista
conservan el orden de la hoja. Ningún par aparece en dos órdenes distintos, así
que reordenar no fusiona ni parte grupos.

Hay un detalle del dato que hay que corregir al leer: algunas descripciones
llevan un doble espacio **dentro**
(`BABY RIB1x1 40/1 COP ORG 0 + 75/72/1x2  PES RECIC 0+40D SPD`), así que al
dividir aparecen trozos sueltos que no son artículos (`PES RECIC 0+40D SPD`,
`T"Z"`, `FULL MATE`). Un trozo abre descripción nueva solo si nombra un tipo de
tela de `CONFIG.TIPOS_TELA`; si no, se vuelve a unir a la anterior. Con los datos
actuales se reúnen 7 trozos distintos, todos continuaciones evidentes.

Como las descripciones son largas, en las tablas se recortan (subrayado punteado)
y el texto completo aparece al pasar el cursor; las tablas por artículo se
desplazan dentro de su propia caja porque el histórico completo tiene ~160
artículos.

Las gráficas *Top 5* de las vistas REPROCESO y H2O siguen usando el nombre corto
de familia: una descripción de 110 caracteres no cabe como etiqueta de barra.

### El tono

La hoja no trae columna de tono, así que se deduce del texto de `Colores`
(Color 1) con `CONFIG.MAPA_TONOS`: una lista ordenada de `{ contiene, tono }`
en la que gana la primera coincidencia, igual que `MAPA_DEFECTOS`. El orden
importa: Negro va antes que Blanco para que `PFD+BLACK` no caiga en Blanco, y
Claros antes que Oscuros para que `LIGHT GREY` no se cuente como oscuro. Con los
datos actuales clasifica el 99,8% de los colores con nombre; lo que no coincide
queda en `TONO_POR_DEFECTO` y se ve en el selector, para poder afinar la lista.

### Sus nueve pestañas

1. **Resumen general:** doce indicadores con su variación contra el periodo de
   comparación, la serie histórica de producción de primera y de % BAP (con el
   rango elegido resaltado) y los ocho artículos de mayor volumen.
2. **Pareto de artículos:** participación de cada artículo en los kg del
   periodo, con la línea que marca el grupo que acumula ~80%.
3. **% BAP:** matriz artículo × periodo con semáforo.
4. **Ranking de defectos:** kg reprocesados por tipo de defecto, ranking
   artículo·defecto (≥5% del artículo = fuera de control) y ranking de
   artículos más defectuosos.
5. **Detalle por artículo:** desempeño por tono y evolución de cada defecto
   periodo a periodo, más el índice de procesos por kilo.
6. **Costo de receta:** matriz de `$/kg` por artículo y periodo.
7. **Tiempos de proceso:** duración media de una carga en máquina y ciclo
   completo de la partida.
8. **% Tela lavada:** proporción de kg que pasaron por un proceso de LAVADO.
9. **Información:** la ficha de referencia del tablero — cómo leer los colores,
   la definición y las columnas de origen de cada indicador, cómo se arman el
   artículo y el tono, y qué no está en la hoja. Cierra con el estado de los
   datos cargados (cargas, histórico disponible, artículos, cobertura de horas
   y reparto por tono), que se recalcula en cada actualización, así que la ficha
   envejece con los datos en vez de quedarse desfasada.

En las matrices cada celda se colorea contra el periodo anterior del mismo
artículo y la última columna compara el último periodo contra el promedio de
los 6 previos.

### Equivalencias con el tablero de referencia

`docs/tablero-tintoreria-cofaco_4 yarek.html` usaba datos simulados. Estas son
las métricas reales que los sustituyen:

| Tablero original | Dato real |
| --- | --- |
| tono | se deduce de `Colores` (`CONFIG.MAPA_TONOS`) |
| kg de primera | kg procesados − kg reprocesados |
| % BALP | % BAP = kg de primera / kg procesados |
| índice de reprocesos | kg procesados / kg de primera |
| sobrecosto | `suma(Kg Carga × Costo US$/kg)` de los reprocesos |
| costo de receta | `suma(Kg Carga × Costo US$/kg) / kg` |
| consumo de agua | `Vol Lt Utilizados / kg` |
| tiempo de teñido | `Hora Fin − Hora Inicio` de cada carga |
| tiempo total | ciclo de la partida: de su primera `Hora Inicio` a su última `Hora Fin` (incluye esperas) |
| reprocesos hasta resolver | cargas de reproceso por partida afectada |
| % tela lavada | kg con `Procesos` = LAVADO, sin contar `LAVADO MÁQUINA` |

La **merma** ("tela defectuosa sin solución") del tablero original no existe en
la hoja: no hay columna de kg descartados. Donde el original la usaba, aquí se
muestra el costo del reproceso, que sí es un dato real. Los tiempos se calculan
solo con las cargas que tienen `Hora Inicio` y `Hora Fin` (93% de los registros
actuales).

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
