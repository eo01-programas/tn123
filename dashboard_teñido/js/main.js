/* ============================================================
   MAIN.JS — Inicialización y orquestación del dashboard
   ============================================================ */

const App = (() => {

  // El resumen gerencial es la portada; Dashboard conserva el análisis
  // operativo detallado y queda disponible en la pestaña contigua.
  let vistaActual = 'vistaResumen';

  function renderizarGraficosActivos(modelo) {
    if (vistaActual === 'vistaResumen') Graficos.renderizarResumen(modelo);
    if (vistaActual === 'vistaPxMaq') Graficos.renderizarPxMaq(modelo);
    if (vistaActual === 'vistaDashboard') Graficos.renderizar(modelo);
    if (vistaActual === 'vistaProgramacion') Graficos.renderizarProgramacion(modelo);
    if (vistaActual === 'vistaH2O') Graficos.renderizarH2O(modelo);
    if (vistaActual === 'vistaCosto') Graficos.renderizarCostos(modelo);
  }

  function refrescar() {
    if (!Datos.Estado.registros.length) return;
    const modelo = Datos.calcularModelo(Filtros.actuales());
    Filtros.actualizarControlPxMaq(modelo.pxMaq);
    Filtros.actualizarControlLav(modelo.programacion);
    // Filtros en cascada: cada control ofrece solo los valores que
    // quedan tras aplicar los demás filtros activos.
    Filtros.actualizarOpciones();
    UI.renderizar(modelo);
    // Los gráficos (Chart.js) solo se redibujan si su vista está visible:
    // un canvas oculto (display:none) mide 0x0 y el gráfico queda roto.
    // Si el usuario filtra en otra vista, se redibuja al volver a Dashboard.
    renderizarGraficosActivos(modelo);
  }

  function mostrarVista(id) {
    vistaActual = id;
    document.querySelectorAll('.sc8-vista').forEach(v => {
      v.classList.toggle('oculto', v.id !== id);
    });
    // DETALLE es un tablero autónomo con sus propios filtros (periodo,
    // comparación y tono): el panel lateral no le aplica, así que se
    // oculta para no ofrecer controles que no hacen nada en esa vista.
    document.querySelector('.sc8-app')
      .classList.toggle('sin-sidebar', id === 'vistaDetalle');
    if (id === 'vistaDetalle' && Datos.Estado.registros.length) Tablero.iniciar();
    const main = document.querySelector('.sc8-main');
    // En Dashboard las dos filas de gráficos reparten el alto disponible
    // 60/40 (fila 1 / fila 2); ver .sc8-main.vista-graficos en CSS.
    if (main) main.classList.toggle('vista-graficos', id === 'vistaDashboard');
    document.querySelectorAll('.sc8-nav button[data-vista]').forEach(b => {
      b.classList.toggle('activo', b.dataset.vista === id);
    });
    if ((id === 'vistaDashboard' || id === 'vistaResumen' ||
         id === 'vistaProgramacion' ||
         id === 'vistaPxMaq' || id === 'vistaH2O' ||
         id === 'vistaCosto') &&
        Datos.Estado.modelo)
      renderizarGraficosActivos(Datos.Estado.modelo);
  }

  function alCargarDatos() {
    // Primera carga de la sesión: se marcan por defecto las últimas
    // CONFIG.PERIODOS_INICIALES semanas (el pill arranca en Sem).
    Filtros.aplicarPeriodoInicial();
    Filtros.construir();
    document.getElementById('estadoCarga').classList.add('oculto');
    document.getElementById('estadoVacio').classList.add('oculto');
    document.getElementById('contenidoDashboard').classList.remove('oculto');
    refrescar();
    // El tablero de DETALLE se alimenta directo de Datos.Estado.registros,
    // así que hay que reconstruirlo cuando cambian los datos.
    if (vistaActual === 'vistaDetalle') Tablero.iniciar();
  }

  /* Sin datos que mostrar: oculta el skeleton y presenta el aviso con la
     causa (hoja vacía, sin conexión o WEB_APP_URL sin configurar). Si el
     dashboard ya está visible (falló una actualización), se conserva y
     solo se avisa con el toast. */
  function mostrarVacio(titulo) {
    document.getElementById('estadoCarga').classList.add('oculto');
    document.getElementById('estadoVacioTitulo').textContent = titulo;
    if (document.getElementById('contenidoDashboard').classList.contains('oculto'))
      document.getElementById('estadoVacio').classList.remove('oculto');
  }

  /* La hoja de Google Sheets es la fuente de verdad: el dashboard
     se construye con sus datos al abrir la página y al actualizar. */
  async function cargarDesdeSheets() {
    // Skeleton parpadeante solo mientras no hay nada renderizado; al
    // actualizar con datos visibles el dashboard permanece en pantalla.
    if (document.getElementById('contenidoDashboard').classList.contains('oculto')) {
      document.getElementById('estadoVacio').classList.add('oculto');
      document.getElementById('estadoCarga').classList.remove('oculto');
    }
    UI.estadoImportacion('Cargando datos…', 'info');
    try {
      const n = await Importar.cargarDesdeSheets();
      if (n) {
        alCargarDatos();
        UI.estadoImportacion('Datos actualizados', 'ok');
      } else {
        mostrarVacio('La hoja de Google Sheets está vacía');
        UI.estadoImportacion(
          'La hoja de Google Sheets está vacía. Importa un Excel para comenzar.',
          'info');
      }
    } catch (e) {
      mostrarVacio('No se pudo conectar con Google Sheets');
      UI.estadoImportacion('No se pudo leer Google Sheets: ' + e.message, 'error');
    }
  }

  function cargarCacheYSincronizar() {
    const nCache = Importar.cargarCacheLocal ? Importar.cargarCacheLocal() : 0;
    if (nCache) {
      alCargarDatos();
      UI.estadoImportacion('Cache local, verificando cambios...', 'info');
      Importar.cargarDesdeSheets({ soloSiCambio: true })
        .then(n => {
          if (n) {
            alCargarDatos();
            UI.estadoImportacion('Datos actualizados', 'ok');
          }
        })
        .catch(e => {
          UI.estadoImportacion(
            'Se muestran datos locales. No se pudo verificar Google Sheets: ' +
            e.message, 'error');
        });
      return;
    }
    cargarDesdeSheets();
  }

  /* Flujo único del botón DATOS:
     Excel -> guardar en Google Sheets -> recargar desde la hoja. */
  async function importarYGuardar(archivo) {
    try {
      await Importar.importarExcel(archivo);
      alCargarDatos(); // vista previa inmediata con los datos del Excel
      await Importar.enviarAGoogleSheets();
    } catch (e) {
      UI.estadoImportacion('Error al importar: ' + e.message, 'error');
      return;
    }
    try {
      const total = await Importar.cargarDesdeSheets();
      alCargarDatos();
      UI.estadoImportacion(
        `Guardado sin duplicados (costos existentes actualizados). ` +
        `${total} registros totales en la hoja.`, 'ok');
    } catch (e) {
      UI.estadoImportacion(
        'Se guardó en Google Sheets, pero no se pudo recargar la hoja: ' +
        e.message + '. Se muestran los datos del Excel importado.', 'error');
    }
  }

  function conectarEventos() {
    // Botón único de DATOS: importar Excel y guardar en Google Sheets
    const inputArchivo = document.getElementById('inputExcel');
    document.getElementById('btnImportar')
      .addEventListener('click', () => inputArchivo.click());
    inputArchivo.addEventListener('change', async () => {
      const archivo = inputArchivo.files[0];
      if (!archivo) return;
      try {
        await importarYGuardar(archivo);
      } finally {
        inputArchivo.value = '';
      }
    });

    // Filtros
    Filtros.conectarSelects();
    document.getElementById('btnLimpiarFiltros')
      .addEventListener('click', Filtros.limpiar);
    document.getElementById('btnActualizarTodo')
      .addEventListener('click', cargarDesdeSheets);

    // Buscador de ficha rápida
    const buscar = document.getElementById('buscarPartida');
    document.getElementById('btnBuscarPartida')
      .addEventListener('click', () => UI.fichaRapida(buscar.value));
    buscar.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') UI.fichaRapida(buscar.value);
    });

    // Navegación inferior: alterna entre las 3 vistas (sin scroll manual)
    document.querySelectorAll('.sc8-nav button[data-vista]').forEach(btn => {
      btn.addEventListener('click', () => mostrarVista(btn.dataset.vista));
    });

    // Instrucciones (modal simple)
    const modal = document.getElementById('modalInstrucciones');
    document.getElementById('btnInstrucciones')
      .addEventListener('click', () => modal.classList.remove('oculto'));
    document.getElementById('btnCerrarInstrucciones')
      .addEventListener('click', () => modal.classList.add('oculto'));
    modal.addEventListener('click', ev => {
      if (ev.target === modal) modal.classList.add('oculto');
    });

    // Modal de detalle (drill-down al clicar una barra del Dashboard)
    const modalReg = document.getElementById('modalRegistros');
    document.getElementById('btnCerrarRegistros')
      .addEventListener('click', () => modalReg.classList.add('oculto'));
    modalReg.addEventListener('click', ev => {
      if (ev.target === modalReg) modalReg.classList.add('oculto');
    });

    // Escape cierra cualquier modal abierto.
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      modal.classList.add('oculto');
      modalReg.classList.add('oculto');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    conectarEventos();
    mostrarVista(vistaActual);
    if (WEB_APP_URL.startsWith('PEGA_AQUI')) {
      mostrarVacio('Configura WEB_APP_URL en js/config.js');
      UI.estadoImportacion(
        'Configura WEB_APP_URL en js/config.js para conectar con Google Sheets.',
        'info');
      return;
    }
    cargarCacheYSincronizar(); // cache local inmediato + verificacion remota
  });

  return { refrescar, cargarDesdeSheets };
})();
