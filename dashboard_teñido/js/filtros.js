/* ============================================================
   FILTROS.JS — Construcción y estado del panel de filtros
   ============================================================ */

const Filtros = (() => {

  /* Universos de opciones de cada control. Se recalculan EN CASCADA en
     actualizarOpciones() (llamada en cada App.refrescar): cada filtro
     ofrece solo los valores presentes tras aplicar todos los DEMÁS
     filtros activos (el propio se excluye para poder cambiar o ampliar
     la selección actual). */

  // Sugerencias de Artículo (código + nombre); se filtra en vivo al escribir.
  let opcionesArticuloTodas = [];

  // Valores de Defecto.
  let opcionesDefectoTodas = [];

  // Filtros de periodo (combos Semana y Mes): [{clave, etiqueta}] con
  // etiqueta corta ("Sem23" / "Jul26"). El pill Sem/Mes decide cuál filtra.
  let opcionesSemanaTodas = [];
  let opcionesMesTodas = [];

  const estado = {
    modoPeriodo: 'semana',   // pill Sem/Mes: qué combo filtra y el eje X de tendencia
    metrica: 'kg',           // pill Ptda/Kg: unidad de Resumen y gráficos de reproceso
    pxMaqModo: 'dia',        // período exclusivo de PxMAQ: mes | semana | dia
    pxMaqPeriodo: '',        // vacío: día anterior al último registro disponible
    lavModo: 'dia',          // período exclusivo de la vista LAV
    lavPeriodo: '',
    semanas: new Set(),      // vacío = todas
    meses: new Set(),        // vacío = todos (claves "AAAA-MM")
    defectos: new Set(),     // vacío = todos
    maqOrigen: '',
    maqRecuperacion: '',
    cliente: '',
    opTela: '',
    articulos: new Set(),    // selección múltiple (chips): código o nombre
    color: ''
  };

  function valoresUnicos(registros, fn) {
    return [...new Set(registros.map(fn).filter(Boolean))].sort();
  }

  /* La opción actualmente seleccionada se conserva en la lista aunque
     la cascada de los demás filtros la deje sin registros: si no, el
     <select> se vería en "Todas" mientras el filtro sigue aplicado y
     no habría forma de deseleccionarla. */
  function llenarSelect(id, opciones, seleccion) {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (seleccion && !opciones.includes(seleccion))
      opciones = [...opciones, seleccion].sort();
    sel.innerHTML = '<option value="">Todas</option>' +
      opciones.map(o =>
        `<option value="${Utils.escapeHtml(o)}">${Utils.escapeHtml(o)}</option>`
      ).join('');
    sel.value = seleccion || '';
  }

  /* Combobox de Artículo: usa los valores únicos de Cod. Art. y
     Descripcion Art. de los registros de la hoja. Los campos compuestos
     aportan una opción por cada código (por ejemplo 30199 y 30200). */
  function opcionesArticulo(registros) {
    const catalogo = Datos.Estado.articulosUnicos.length
      ? Datos.Estado.articulosUnicos
      : registros.flatMap(r => {
          const codigos = r.codArts.length ? r.codArts : [''];
          const descripciones =
            codigos.length === r.descArts.length
              ? r.descArts
              : codigos.map(() => r.descArt);
          return codigos.map((codigo, i) => ({
            codigo,
            descripcion: descripciones[i] || r.descArt || ''
          }));
        });
    const vistos = new Set();
    const opciones = catalogo.map(a => {
      const separador = a.codigo && a.descripcion ? ' — ' : '';
      return `${a.codigo}${separador}${a.descripcion}`;
    }).filter(opcion => {
      const clave = Utils.clave(opcion);
      if (!clave || vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
    estado.articulos.forEach(v => {
      if (!opciones.includes(v)) opciones.push(v);
    });
    return opciones.sort((a, b) =>
      a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  }

  /* ---------- Combos multi-selección (Semana, Mes y Defecto) ----------
     Un botón con apariencia de <select> abre un panel flotante de
     checkboxes. El panel es position:fixed (no absolute) porque en
     escritorio el sidebar tiene su propio scroll y "absolute" quedaría
     recortado; se posiciona a mano con getBoundingClientRect().
     Marcar todo = sin filtro (Set vacío); desmarcar todo = '__NINGUNO__'
     (conjunto sin coincidencias). */

  function comboMulti(cfg) {
    const el = id => document.getElementById(id);

    function actualizarTexto() {
      const span = el(cfg.texto);
      if (!span) return;
      const sel = cfg.seleccion();
      if (!sel.size) span.textContent = cfg.femenino ? 'Todas' : 'Todos';
      else if (sel.has('__NINGUNO__')) span.textContent = 'Ninguno';
      else span.textContent =
        `${sel.size} seleccionad${cfg.femenino ? 'a' : 'o'}${sel.size === 1 ? '' : 's'}`;
    }

    function renderizar() {
      const panel = el(cfg.panel);
      if (!panel) return;
      const opciones = cfg.opciones();
      const sel = cfg.seleccion();
      panel.innerHTML = opciones.length
        ? `
          <label class="sc8-combo-opcion sc8-combo-todos">
            <input type="checkbox" data-todos="1" ${!sel.size ? 'checked' : ''}>
            <span>${cfg.femenino ? 'Todas' : 'Todos'}</span>
          </label>` +
          opciones.map(o => `
          <label class="sc8-combo-opcion">
            <input type="checkbox" value="${Utils.escapeHtml(o.clave)}"
                   ${(!sel.size || sel.has(o.clave)) ? 'checked' : ''}>
            <span>${Utils.escapeHtml(o.etiqueta)}</span>
          </label>`).join('')
        : '<div class="sc8-combo-vacio">Sin datos.</div>';

      /* Casilla "Todos/Todas": marca o desmarca todas las opciones de
         una vez (marcada = sin filtro). Con una selección parcial se
         muestra en estado intermedio (guion). */
      const chkTodos = panel.querySelector('input[data-todos]');
      if (chkTodos) {
        chkTodos.indeterminate = !!sel.size && !sel.has('__NINGUNO__');
        chkTodos.addEventListener('change', () => {
          const activo = cfg.seleccion();
          activo.clear();                          // marcada => todos
          if (!chkTodos.checked) activo.add('__NINGUNO__');
          renderizar();
          actualizarTexto();
          App.refrescar();
        });
      }

      panel.querySelectorAll('input[type="checkbox"]:not([data-todos])')
        .forEach(chk => {
        chk.addEventListener('change', () => {
          const marcados = [...panel.querySelectorAll(
            'input[type="checkbox"]:not([data-todos]):checked')].map(c => c.value);
          const activo = cfg.seleccion();
          activo.clear();
          // Si todos están marcados => sin filtro (Set vacío).
          if (marcados.length && marcados.length < opciones.length)
            marcados.forEach(v => activo.add(v));
          if (!marcados.length) activo.add('__NINGUNO__');
          actualizarTexto();
          App.refrescar();
        });
      });
    }

    function posicionar() {
      const panel = el(cfg.panel), btn = el(cfg.btn);
      if (!panel || !btn) return;
      const r = btn.getBoundingClientRect();
      panel.style.left = Math.round(r.left) + 'px';
      panel.style.top = Math.round(r.bottom + 4) + 'px';
      panel.style.minWidth = Math.round(r.width) + 'px';
    }

    function abrir() {
      const panel = el(cfg.panel), btn = el(cfg.btn);
      if (!panel) return;
      renderizar();
      posicionar();
      panel.classList.remove('oculto');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function cerrar() {
      const panel = el(cfg.panel), btn = el(cfg.btn);
      if (!panel) return;
      panel.classList.add('oculto');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function abierto() {
      const panel = el(cfg.panel);
      return !!panel && !panel.classList.contains('oculto');
    }

    function conectar() {
      const btn = el(cfg.btn);
      if (btn) btn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (abierto()) cerrar(); else abrir();
      });
    }

    function contiene(objetivo) {
      const combo = el(cfg.combo);
      return !!combo && combo.contains(objetivo);
    }

    return { actualizarTexto, renderizar, abrir, cerrar, abierto, conectar, contiene };
  }

  const comboSemana = comboMulti({
    combo: 'comboSemana', btn: 'filtroSemanaBtn', panel: 'listaSemanas',
    texto: 'filtroSemanaTexto', femenino: true,
    opciones: () => opcionesSemanaTodas,
    seleccion: () => estado.semanas
  });

  const comboMes = comboMulti({
    combo: 'comboMes', btn: 'filtroMesBtn', panel: 'listaMeses',
    texto: 'filtroMesTexto', femenino: false,
    opciones: () => opcionesMesTodas,
    seleccion: () => estado.meses
  });

  const comboDefecto = comboMulti({
    combo: 'comboDefecto', btn: 'filtroDefectoBtn', panel: 'listaDefectos',
    texto: 'filtroDefectoTexto', femenino: false,
    opciones: () => opcionesDefectoTodas.map(o => ({ clave: o, etiqueta: o })),
    seleccion: () => estado.defectos
  });

  /* ---------- Periodo: pill Sem/Mes + combos Semana y Mes ----------
     El pill decide la granularidad: solo filtra el combo del modo activo
     (el otro se deshabilita y queda en "Todas/Todos" para que semana y
     mes nunca se combinen); la gráfica de tendencia usa esa granularidad
     en el eje X (ver Datos.calcularModelo). */

  function actualizarControlesPeriodo() {
    const btnSemana = document.getElementById('filtroSemanaBtn');
    const btnMes = document.getElementById('filtroMesBtn');
    if (btnSemana) btnSemana.disabled = estado.modoPeriodo === 'mes';
    if (btnMes) btnMes.disabled = estado.modoPeriodo !== 'mes';
    comboSemana.actualizarTexto();
    comboMes.actualizarTexto();
  }

  /* Sincroniza los dos pills de PxMAQ con las opciones calculadas por el
     modelo. También guarda el período de respaldo escogido por Datos
     (en Día, el anterior al último registro) para conservarlo en los
     siguientes refrescos. */
  function actualizarControlPxMaq(pxMaq) {
    const px = pxMaq || {};
    const modo = px.modoPeriodo || estado.pxMaqModo || 'dia';
    const periodo = px.periodoSeleccionado || '';
    const opciones = px.periodos || [];
    estado.pxMaqModo = modo;
    estado.pxMaqPeriodo = periodo;

    const toggle = document.getElementById('togglePxMaqPeriodo');
    if (toggle)
      toggle.querySelectorAll('button[data-pxmaq-modo]').forEach(btn =>
        btn.classList.toggle('activo', btn.dataset.pxmaqModo === modo));

    const select = document.getElementById('filtroPxMaqPeriodo');
    if (!select) return;
    select.innerHTML = opciones.length
      ? opciones.map(o => `
          <option value="${Utils.escapeHtml(o.clave)}">
            ${Utils.escapeHtml(o.etiqueta)}
          </option>`).join('')
      : '<option value="">Sin fechas</option>';
    select.disabled = !opciones.length;
    select.value = periodo;
  }

  function actualizarControlLav(programacion) {
    const p = programacion || {};
    const modo = p.modoPeriodo || estado.lavModo || 'dia';
    const periodo = p.periodoSeleccionado || '';
    const opciones = p.periodos || [];
    estado.lavModo = modo;
    estado.lavPeriodo = periodo;

    const toggle = document.getElementById('toggleLavPeriodo');
    if (toggle)
      toggle.querySelectorAll('button[data-lav-modo]').forEach(btn =>
        btn.classList.toggle('activo', btn.dataset.lavModo === modo));

    const select = document.getElementById('filtroLavPeriodo');
    if (!select) return;
    select.innerHTML = opciones.length
      ? opciones.map(o => `<option value="${Utils.escapeHtml(o.clave)}">` +
          `${Utils.escapeHtml(o.etiqueta)}</option>`).join('')
      : '<option value="">Sin fechas</option>';
    select.disabled = !opciones.length;
    select.value = periodo;
  }

  /* Selección por defecto del modo activo: los últimos
     CONFIG.PERIODOS_INICIALES periodos (semanas o meses) con datos.
     Si hay esa cantidad o menos, se deja "Todas" (Set vacío). */
  function seleccionarPeriodoPorDefecto() {
    const registros = Datos.Estado.registros;
    const n = CONFIG.PERIODOS_INICIALES;
    if (estado.modoPeriodo === 'mes') {
      const meses = [...new Set(registros.map(r => r.mesPeriodo).filter(Boolean))].sort();
      if (meses.length > n) meses.slice(-n).forEach(m => estado.meses.add(m));
    } else {
      const semanas = [...new Set(registros.map(r => r.semanaPeriodo).filter(Boolean))]
        .sort((a, b) => Utils.numero(a) - Utils.numero(b));
      if (semanas.length > n) semanas.slice(-n).forEach(s => estado.semanas.add(s));
    }
  }

  // Al cargar datos por primera vez en la sesión: últimas 6 semanas.
  let periodoInicialAplicado = false;
  function aplicarPeriodoInicial() {
    if (periodoInicialAplicado || !Datos.Estado.registros.length) return;
    periodoInicialAplicado = true;
    seleccionarPeriodoPorDefecto();
  }

  /* ---------- Chips de selección múltiple (filtro Artículo) ---------- */

  function renderizarChipsArticulo() {
    const cont = document.getElementById('chipsArticulo');
    if (!cont) return;
    cont.innerHTML = [...estado.articulos].map(valor => `
      <span class="sc8-chip">
        <span title="${Utils.escapeHtml(valor)}">${Utils.escapeHtml(valor)}</span>
        <button type="button" data-valor="${Utils.escapeHtml(valor)}"
                aria-label="Quitar ${Utils.escapeHtml(valor)}">×</button>
      </span>`).join('');
    cont.querySelectorAll('button[data-valor]').forEach(btn => {
      btn.addEventListener('click', () => {
        estado.articulos.delete(btn.dataset.valor);
        renderizarChipsArticulo();
        App.refrescar();
      });
    });
    actualizarBotonLimpiarArticulo();
  }

  // El "×" incrustado en el cuadro de texto solo se ve si hay algo que
  // limpiar: texto escrito o artículos ya seleccionados (chips).
  function actualizarBotonLimpiarArticulo() {
    const btn = document.getElementById('btnLimpiarArticulo');
    const input = document.getElementById('filtroArticulo');
    if (!btn || !input) return;
    btn.classList.toggle('oculto', !input.value && !estado.articulos.size);
  }

  function limpiarArticulo() {
    estado.articulos.clear();
    const input = document.getElementById('filtroArticulo');
    if (input) input.value = '';
    renderizarChipsArticulo();
    renderizarPanelArticulo();
    cerrarPanelArticulo();
    App.refrescar();
  }

  /* ---------- Panel flotante con checkboxes (filtro Artículo) ----------
     Sustituye al <datalist> nativo: el navegador renderiza ese popup
     fuera del control del CSS (ancho/alto propios), lo que deformaba
     el bloque del sidebar. Este panel es un <div> propio (position:fixed,
     ver posicionarPanelArticulo), así que flota SIN afectar el tamaño
     del bloque ni quedar recortado por el scroll del sidebar. */

  function opcionesFiltradasArticulo(texto) {
    const q = Utils.clave(texto);
    const base = q
      ? opcionesArticuloTodas.filter(o => Utils.clave(o).includes(q))
      : opcionesArticuloTodas;
    return base.slice(0, 60);
  }

  function renderizarPanelArticulo() {
    const panel = document.getElementById('listaArticulos');
    const input = document.getElementById('filtroArticulo');
    if (!panel || !input) return;
    const opciones = opcionesFiltradasArticulo(input.value);

    panel.innerHTML = opciones.length
      ? opciones.map(o => `
        <label class="sc8-combo-opcion">
          <input type="checkbox" value="${Utils.escapeHtml(o)}"
                 ${estado.articulos.has(o) ? 'checked' : ''}>
          <span title="${Utils.escapeHtml(o)}">${Utils.escapeHtml(o)}</span>
        </label>`).join('')
      : '<div class="sc8-combo-vacio">Sin coincidencias.</div>';

    panel.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', () => {
        if (chk.checked) estado.articulos.add(chk.value);
        else estado.articulos.delete(chk.value);
        renderizarChipsArticulo();
        App.refrescar();
      });
    });
  }

  /* El panel es position:fixed (no absolute) porque en escritorio el
     sidebar tiene su propio scroll (overflow-y:auto) y "absolute"
     quedaría recortado por ese contenedor; se posiciona a mano con
     getBoundingClientRect() para que siga flotando junto al input. */
  function posicionarPanelArticulo() {
    const panel = document.getElementById('listaArticulos');
    const input = document.getElementById('filtroArticulo');
    if (!panel || !input) return;
    const r = input.getBoundingClientRect();
    panel.style.left = Math.round(r.left) + 'px';
    panel.style.top = Math.round(r.bottom + 4) + 'px';
    panel.style.minWidth = Math.round(r.width) + 'px';
  }

  function abrirPanelArticulo() {
    const panel = document.getElementById('listaArticulos');
    const input = document.getElementById('filtroArticulo');
    if (!panel) return;
    renderizarPanelArticulo();
    posicionarPanelArticulo();
    panel.classList.remove('oculto');
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function cerrarPanelArticulo() {
    const panel = document.getElementById('listaArticulos');
    const input = document.getElementById('filtroArticulo');
    if (!panel) return;
    panel.classList.add('oculto');
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  /* Recalcula EN CASCADA las opciones de todos los controles: para cada
     filtro se aplican todos los demás filtros activos (el propio se
     omite) y se listan solo los valores presentes en ese resultado.
     Se llama en cada App.refrescar, así que las listas siempre reflejan
     la selección vigente. */
  function actualizarOpciones() {
    const F = actuales();

    /* Si hay un filtro específico de reproceso activo (defecto o alguna
       de las máquinas), la vista queda acotada a esos reprocesos, por lo
       que los filtros generales también se calculan sobre ellos; si no,
       sobre toda la base (producción + reproceso). */
    const hayFiltroReproceso =
      !!(estado.defectos.size || estado.maqOrigen || estado.maqRecuperacion);
    const fuente = res => hayFiltroReproceso ? res.reprocesos : res.base;

    llenarSelect('filtroCliente',
      valoresUnicos(fuente(Datos.aplicarFiltros(F, 'cliente')), r => r.clienteCorto),
      estado.cliente);
    llenarSelect('filtroColor',
      valoresUnicos(fuente(Datos.aplicarFiltros(F, 'color')), r => r.color1),
      estado.color);

    // Máquinas: origen = donde se produjo la carga reprocesada (valor
    // calculado, puede ser "Sin registro"); recuperación = donde se reprocesó.
    const resOrigen = Datos.aplicarFiltros(F, 'maqOrigen');
    llenarSelect('filtroMaqOrigen',
      [...new Set(resOrigen.reprocesos.map(r => resOrigen.origenDe.get(r)).filter(Boolean))].sort(),
      estado.maqOrigen);
    llenarSelect('filtroMaqRecuperacion',
      valoresUnicos(Datos.aplicarFiltros(F, 'maqRecuperacion').reprocesos, r => r.maquina),
      estado.maqRecuperacion);

    opcionesArticuloTodas =
      opcionesArticulo(fuente(Datos.aplicarFiltros(F, 'articulos')));

    // Periodo y Defecto: las claves ya seleccionadas se conservan en el
    // panel aunque la cascada las deje sin registros, para poder desmarcarlas.
    // Las opciones usan el periodo de ORIGEN de la OP-Partida (primer
    // proceso de PRODUCCIÓN), igual que el filtro que aplican.
    const regsPeriodo = fuente(Datos.aplicarFiltros(F, 'periodo'));
    const semanasSel = [...estado.semanas].filter(s => s !== '__NINGUNO__');
    opcionesSemanaTodas =
      [...new Set([...regsPeriodo.map(r => r.semanaPeriodo).filter(Boolean), ...semanasSel])]
        .sort((a, b) => Utils.numero(a) - Utils.numero(b))
        .map(clave => ({ clave, etiqueta: 'Sem' + clave }));
    const mesesSel = [...estado.meses].filter(m => m !== '__NINGUNO__');
    opcionesMesTodas =
      [...new Set([...regsPeriodo.map(r => r.mesPeriodo).filter(Boolean), ...mesesSel])]
        .sort()
        .map(clave => ({ clave, etiqueta: Utils.mesCorto(clave) }));

    const defectosSel = [...estado.defectos].filter(d => d !== '__NINGUNO__');
    opcionesDefectoTodas =
      [...new Set([
        ...Datos.aplicarFiltros(F, 'defectos').reprocesos.map(r => r.defecto),
        ...defectosSel
      ])].filter(Boolean).sort();

    actualizarControlesPeriodo();
    comboDefecto.actualizarTexto();

    // Los paneles flotantes abiertos se re-renderizan con las nuevas opciones.
    [comboSemana, comboMes, comboDefecto].forEach(c => {
      if (c.abierto()) c.renderizar();
    });
    const panelArticulo = document.getElementById('listaArticulos');
    if (panelArticulo && !panelArticulo.classList.contains('oculto'))
      renderizarPanelArticulo();
  }

  function construir() {
    actualizarOpciones();
    renderizarChipsArticulo();
  }

  function conectarSelects() {
    const mapa = {
      filtroMaqOrigen: 'maqOrigen',
      filtroMaqRecuperacion: 'maqRecuperacion',
      filtroCliente: 'cliente',
      filtroColor: 'color'
    };
    Object.entries(mapa).forEach(([id, propiedad]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => {
        estado[propiedad] = el.value;
        App.refrescar();
      });
    });

    // OP-Tela: cuadro de texto simple, filtra en vivo por coincidencia
    // parcial de "OP - Partida".
    const inputOpTela = document.getElementById('filtroOpTela');
    if (inputOpTela) {
      let temporizador = null;
      inputOpTela.addEventListener('input', () => {
        estado.opTela = inputOpTela.value.trim();
        clearTimeout(temporizador);
        temporizador = setTimeout(() => App.refrescar(), 150);
      });
    }

    // Artículo: cuadro de texto que abre un panel propio con checkboxes
    // (no un <select> ni un <datalist>), así que la selección múltiple
    // se hace marcando/desmarcando opciones sin deformar el bloque.
    const inputArticulo = document.getElementById('filtroArticulo');
    const comboArticulo = document.getElementById('comboArticulo');
    if (inputArticulo) {
      inputArticulo.addEventListener('focus', abrirPanelArticulo);
      inputArticulo.addEventListener('input', () => {
        abrirPanelArticulo();
        actualizarBotonLimpiarArticulo();
      });
      inputArticulo.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          cerrarPanelArticulo();
          inputArticulo.blur();
        }
        // Enter marca/desmarca la primera coincidencia visible.
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const [primero] = opcionesFiltradasArticulo(inputArticulo.value);
          if (primero) {
            if (estado.articulos.has(primero)) estado.articulos.delete(primero);
            else estado.articulos.add(primero);
            renderizarChipsArticulo();
            renderizarPanelArticulo();
            App.refrescar();
          }
        }
      });
    }
    // Pill Sem/Mes: cambia la granularidad del periodo. La selección del
    // modo saliente se descarta y el entrante arranca con los últimos
    // CONFIG.PERIODOS_INICIALES periodos; el combo del otro modo queda
    // deshabilitado y en "Todas/Todos".
    const togglePeriodo = document.getElementById('togglePeriodo');
    if (togglePeriodo) {
      togglePeriodo.querySelectorAll('button[data-modo]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (estado.modoPeriodo === btn.dataset.modo) return;
          estado.modoPeriodo = btn.dataset.modo;
          togglePeriodo.querySelectorAll('button').forEach(b =>
            b.classList.toggle('activo', b === btn));
          estado.semanas.clear();
          estado.meses.clear();
          seleccionarPeriodoPorDefecto();
          comboSemana.cerrar();
          comboMes.cerrar();
          actualizarControlesPeriodo();
          App.refrescar();
        });
      });
    }

    // Pill Ptda/Kg: cambia la unidad de medida de Resumen y de los gráficos
    // de reproceso (# partidas o kg). No es un filtro: solo re-renderiza.
    const toggleMetrica = document.getElementById('toggleMetrica');
    if (toggleMetrica) {
      toggleMetrica.querySelectorAll('button[data-metrica]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (estado.metrica === btn.dataset.metrica) return;
          estado.metrica = btn.dataset.metrica;
          toggleMetrica.querySelectorAll('button').forEach(b =>
            b.classList.toggle('activo', b === btn));
          App.refrescar();
        });
      });
    }

    // Filtros exclusivos de PxMAQ. El primer pill cambia la granularidad;
    // el segundo selecciona un único período. Al cambiar Mes/Sem/Día se
    // deja la clave vacía para que Datos aplique el valor predeterminado
    // (en Día, la segunda fecha más reciente con datos).
    const togglePxMaq = document.getElementById('togglePxMaqPeriodo');
    if (togglePxMaq) {
      togglePxMaq.querySelectorAll('button[data-pxmaq-modo]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (estado.pxMaqModo === btn.dataset.pxmaqModo) return;
          estado.pxMaqModo = btn.dataset.pxmaqModo;
          estado.pxMaqPeriodo = '';
          App.refrescar();
        });
      });
    }
    const selectPxMaq = document.getElementById('filtroPxMaqPeriodo');
    if (selectPxMaq)
      selectPxMaq.addEventListener('change', () => {
        estado.pxMaqPeriodo = selectPxMaq.value;
        App.refrescar();
      });

    const toggleLav = document.getElementById('toggleLavPeriodo');
    if (toggleLav)
      toggleLav.querySelectorAll('button[data-lav-modo]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (estado.lavModo === btn.dataset.lavModo) return;
          estado.lavModo = btn.dataset.lavModo;
          estado.lavPeriodo = '';
          App.refrescar();
        });
      });
    const selectLav = document.getElementById('filtroLavPeriodo');
    if (selectLav)
      selectLav.addEventListener('change', () => {
        estado.lavPeriodo = selectLav.value;
        App.refrescar();
      });

    // Semana, Mes y Defecto: botones que abren un panel propio con
    // checkboxes (misma mecánica que Artículo) para selección múltiple.
    comboSemana.conectar();
    comboMes.conectar();
    comboDefecto.conectar();
    actualizarControlesPeriodo();   // al abrir, el combo Mes queda deshabilitado

    // Cierra los paneles flotantes al hacer clic fuera de su combobox.
    document.addEventListener('click', ev => {
      if (comboArticulo && !comboArticulo.contains(ev.target)) cerrarPanelArticulo();
      if (!comboSemana.contiene(ev.target)) comboSemana.cerrar();
      if (!comboMes.contiene(ev.target)) comboMes.cerrar();
      if (!comboDefecto.contiene(ev.target)) comboDefecto.cerrar();
    });
    // Los paneles son position:fixed calculados a mano: si el sidebar
    // hace scroll (o cambia el tamaño de la ventana) se cierran en vez
    // de quedar flotando en un sitio que ya no corresponde al control.
    const cerrarPaneles = () => {
      cerrarPanelArticulo();
      comboSemana.cerrar();
      comboMes.cerrar();
      comboDefecto.cerrar();
    };
    const sidebar = document.querySelector('.sc8-sidebar');
    if (sidebar) sidebar.addEventListener('scroll', cerrarPaneles);
    window.addEventListener('resize', cerrarPaneles);

    // Limpieza acotada solo al filtro de Artículo (chips + input),
    // disparada por el "×" incrustado en el cuadro de texto.
    const btnLimpiarArticulo = document.getElementById('btnLimpiarArticulo');
    if (btnLimpiarArticulo)
      btnLimpiarArticulo.addEventListener('click', limpiarArticulo);
  }

  function limpiar() {
    // Vuelve al estado inicial del dashboard: pill en Semana con las
    // últimas CONFIG.PERIODOS_INICIALES semanas y Mes en "Todos".
    estado.modoPeriodo = 'semana';
    const togglePeriodo = document.getElementById('togglePeriodo');
    if (togglePeriodo)
      togglePeriodo.querySelectorAll('button[data-modo]').forEach(b =>
        b.classList.toggle('activo', b.dataset.modo === 'semana'));
    estado.metrica = 'kg';
    const toggleMetrica = document.getElementById('toggleMetrica');
    if (toggleMetrica)
      toggleMetrica.querySelectorAll('button[data-metrica]').forEach(b =>
        b.classList.toggle('activo', b.dataset.metrica === 'kg'));
    estado.pxMaqModo = 'dia';
    estado.pxMaqPeriodo = '';
    estado.lavModo = 'dia';
    estado.lavPeriodo = '';
    estado.semanas.clear();
    estado.meses.clear();
    seleccionarPeriodoPorDefecto();
    estado.defectos.clear();
    estado.articulos.clear();
    estado.maqOrigen = estado.maqRecuperacion = '';
    estado.cliente = estado.opTela = estado.color = '';
    ['filtroMaqOrigen', 'filtroMaqRecuperacion', 'filtroCliente',
     'filtroOpTela', 'filtroArticulo', 'filtroColor'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderizarChipsArticulo();
    renderizarPanelArticulo();
    cerrarPanelArticulo();
    comboSemana.cerrar();
    comboMes.cerrar();
    comboDefecto.cerrar();
    actualizarControlesPeriodo();
    comboDefecto.actualizarTexto();
    App.refrescar();
  }

  function actuales() {
    // '__NINGUNO__' fuerza conjunto sin coincidencias (todo desmarcado).
    return {
      modoPeriodo: estado.modoPeriodo,   // granularidad de la tendencia
      metrica: estado.metrica,           // unidad de los gráficos (partidas | kg)
      pxMaqModo: estado.pxMaqModo,
      pxMaqPeriodo: estado.pxMaqPeriodo,
      lavModo: estado.lavModo,
      lavPeriodo: estado.lavPeriodo,
      semanas: estado.semanas,
      meses: estado.meses,
      defectos: estado.defectos,
      maqOrigen: estado.maqOrigen,
      maqRecuperacion: estado.maqRecuperacion,
      cliente: estado.cliente,
      opTela: estado.opTela,
      articulos: estado.articulos,
      color: estado.color
    };
  }

  return { construir, actualizarOpciones, conectarSelects, limpiar,
           actuales, aplicarPeriodoInicial, actualizarControlPxMaq,
           actualizarControlLav, estado };
})();
