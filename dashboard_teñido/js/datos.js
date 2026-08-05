/* ============================================================
   DATOS.JS — Estado de la aplicación y modelo de cálculo
   (clasificación producción / reproceso, defectos, KPIs,
   máquina origen vs. máquina de recuperación, agregados)
   ============================================================ */

const Datos = (() => {

  /* ---------- Estado global ---------- */
  const Estado = {
    registros: [],          // filas normalizadas del Excel
    articulosUnicos: [],    // catálogo de la hoja "valores unicos"
    modelo: null            // resultado de calcularModelo() con filtros
  };

  function cargarArticulosUnicos(filas) {
    const vistos = new Set();
    Estado.articulosUnicos = (filas || []).map(f => {
      const codigo = Utils.texto(f['Cod. Art.']).replace(/^0+(?=\d)/, '');
      const descripcion = Utils.texto(f['Descripcion Art.']);
      return { codigo, descripcion };
    }).filter(a => {
      if (!a.codigo && !a.descripcion) return false;
      const clave = Utils.clave(a.codigo + '||' + a.descripcion);
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
    return Estado.articulosUnicos.length;
  }

  /* ---------- Normalización de una fila del Excel ---------- */

  function clasificarDefecto(tipoProcesos) {
    const t = Utils.clave(tipoProcesos);
    for (const regla of CONFIG.MAPA_DEFECTOS) {
      if (t.includes(Utils.clave(regla.contiene))) return regla.defecto;
    }
    return CONFIG.DEFECTO_POR_DEFECTO;
  }

  function normalizarCliente(clienteRaw) {
    const c = Utils.clave(clienteRaw);
    for (const regla of CONFIG.MAPA_CLIENTES) {
      if (c.includes(Utils.clave(regla.contiene))) return regla.abrev;
    }
    return Utils.texto(clienteRaw);
  }

  /* Clasificación exclusiva de "Tipo Recetas". Se evalúa en este orden
     para reproducir la regla de negocio de la hoja: una fila como
     "PRODUCCIÓN REPROCESO" pertenece a PRODUCCIÓN, mientras que
     "EN PROCESO REPROCESO" pertenece a REPROCESO. Los vacíos y textos
     que no contienen ninguna de las cuatro palabras conocidas son NN. */
  function clasificarTipoReceta(tipoRecetas) {
    const t = Utils.clave(tipoRecetas);
    if (t.includes('PRODUCCION')) return 'PRODUCCIÓN';
    if (t.includes('REPROCESO'))  return 'REPROCESO';
    if (t.includes('PROCESO'))    return 'PROCESO';
    if (t.includes('NINGUNO'))    return 'NINGUNO';
    return 'NN';
  }

  /* Familia de teñido de la PRODUCCIÓN que originó el reproceso. El campo
     "Tipo Procesos" puede contener una ruta completa (blanqueo + lavado +
     uno o más teñidos); para el tablero económico se conservan las familias
     de teñido y, cuando no hay ninguna, el proceso preparatorio principal. */
  function familiaTenido(tipoProcesos) {
    const t = Utils.clave(tipoProcesos);
    if (!t) return 'Sin registro';
    const familias = [];
    if (t.includes('TENIDO ACIDO'))    familias.push('ÁCIDO');
    if (t.includes('TENIDO DISPERSO')) familias.push('DISPERSO');
    if (t.includes('TENIDO REACTIVO')) familias.push('REACTIVO');
    if (familias.length) return familias.join(' + ');
    if (t.includes('BLANQUEO')) return 'BLANQUEO';
    if (t.includes('LAVADO'))    return 'LAVADO';
    return 'OTROS';
  }

  /* Los códigos "OP - Partida" traen un prefijo fijo del ERP que no
     aporta información (p. ej. "1000040653-0107" -> "40653-107"): el
     OP real son los últimos 5 dígitos y la partida real los últimos 3
     (el primer dígito del sufijo de 4 marca la iteración de reproceso,
     ver familiaPartida). Se recorta SOLO para mostrar/filtrar; el dato
     original (opPartida) se conserva intacto para dedup y Sheets. */
  function acortarSegmento(valor, digitosFinales) {
    let s = Utils.texto(valor);
    if (s.length > digitosFinales) s = s.slice(-digitosFinales);
    s = s.replace(/^0+(?=\d)/, '');
    return s;
  }

  function acortarOpPartida(p) {
    const idx = p.lastIndexOf('-');
    if (idx < 0) return acortarSegmento(p, 5);
    const opCorto = acortarSegmento(p.slice(0, idx), 5);
    const partidaCorto = acortarSegmento(p.slice(idx + 1), 3);
    return `${opCorto}-${partidaCorto}`;
  }

  function extraerArticulo(descArt) {
    const d = Utils.clave(descArt);
    if (!d) return '';
    for (const fam of CONFIG.FAMILIAS_ARTICULO) {
      if (d.includes(Utils.clave(fam))) return fam;
    }
    return '';
  }

  function normalizarFila(f) {
    const opPartida  = Utils.texto(f['OP - Partida']);
    const codArt     = Utils.texto(f['Cod. Art.']);
    const descArtRaw = f['Descripcion Art.'];
    const colores    = Utils.texto(f['Colores']);

    /* Códigos divididos sin ceros a la izquierda ("00030199" -> "30199"),
       igual que las columnas Cod. Art. 1/2 de la hoja: así el panel de
       Artículo no muestra el mismo código dos veces y el filtro compara
       por igualdad. codArt conserva el valor original (clave única). */
    const codArts     = Utils.splitPipe(codArt)
      .map(c => c.replace(/^0+(?=\d)/, ''));
    const descArts    = Utils.splitDobleEspacio(descArtRaw);
    const coloresList = Utils.splitPipe(colores);
    const partidas    = Utils.splitPartidas(opPartida);
    const opPartidasCortas = partidas.map(acortarOpPartida);
    const opTela = (opPartidasCortas[0] || '').split('-')[0] || '';

    const tipoRecetas = Utils.texto(f['Tipo Recetas']);
    const tipoRecetaClase = clasificarTipoReceta(tipoRecetas);
    const esReproceso = tipoRecetaClase === 'REPROCESO';
    const tipoProc    = Utils.texto(f['Tipo Procesos']);

    const horaInicio = Utils.parseFechaHoraMDA(f['Hora Inicio']);
    const horaFin    = Utils.parseFechaHoraMDA(f['Hora Fin']);
    const fecha      = Utils.parseFechaDMA(f['Fecha']);

    const reg = {
      fecha,
      fechaTxt:     Utils.texto(f['Fecha']),
      // Clave de mes "AAAA-MM" para el filtro de periodo (toggle Sem/Mes).
      mes: fecha
        ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
        : '',
      nCarga:       Utils.texto(f['N° Carga']),
      semana:       Utils.texto(f['Semana']),
      maquina:      Utils.texto(f['Maquina']),
      opPartida, partidas,
      opPartidaCorta: opPartidasCortas.join(' | '),
      opTela,
      cliente:      Utils.texto(f['Cliente']),
      clienteCorto: normalizarCliente(f['Cliente']),
      codArt, codArts,
      descArt:      Utils.texto(descArtRaw),
      descArts,
      colores, coloresList,
      tipoRecetas,
      tipoRecetaClase,
      tipoProcesos: tipoProc,
      procesos:     Utils.texto(f['Procesos']),
      esLavadoMaquina: Utils.clave(f['Procesos'])
        .includes(Utils.clave(CONFIG.PROCESO_LAVADO_MAQUINA)),
      volLt:        Utils.numero(f['Vol Lt Utilizados']),
      ordenProceso: Utils.texto(f['Nº Orden Proceso']),
      kgCarga:      Utils.numero(f['Kg Carga']),
      costoPorKg:   Utils.numero(f['Costo US$ / kg']),
      estadoCarga:  Utils.texto(f['Estado Carga']),
      horaInicio, horaFin,
      usuarioInicio:Utils.texto(f['Usuario Inicio']),
      usuarioFin:   Utils.texto(f['Usuario Fin']),
      turno:        Utils.texto(f['Turno']),
      completado:   Utils.texto(f['Completado']),
      fechaCompletado:   Utils.texto(f['Fecha Completado']),
      vbSupervisor:      Utils.texto(f['Vb Supervidor']),
      fechaVbSupervisor: Utils.texto(f['Fecha Vb Supervisor']),
      tipoPrueba:   Utils.texto(f['Tipo Prueba']),
      status:       Utils.texto(f['Status']),
      detalleStatus:Utils.texto(f['Detalle Status']),
      observacion:  Utils.texto(f['Observacion']),
      esReproceso,
      defecto:      esReproceso ? clasificarDefecto(tipoProc) : '',
      articulo:     extraerArticulo(descArtRaw),
      color1:       coloresList[0] || '(Sin color)'
    };

    /* Clave única para deduplicación (frontend y Google Sheets).
       Incluye Fecha + N° Carga para no descartar cargas distintas
       de una misma partida (blanqueo, teñido, reproceso...). */
    reg.claveUnica = [
      Utils.clave(reg.opPartida),
      Utils.clave(reg.codArt),
      Utils.clave(reg.descArt),
      Utils.clave(reg.colores),
      Utils.clave(reg.fechaTxt),
      Utils.clave(reg.nCarga)
    ].join('||');

    return reg;
  }

  /* Periodo de ORIGEN por OP-Partida: para los filtros de Semana/Mes
     (y el eje X de la tendencia) cada partida cuenta en el periodo de
     su PRIMER proceso de PRODUCCIÓN (columna Fecha, Tipo Recetas con
     "PRODUCCIÓN"), aunque los procesos siguientes o los reprocesos
     caigan en semanas/meses posteriores: el defecto se generó allí.
     La familia de la partida (sufijo 0093 -> 1093 -> 1193) une cada
     reproceso con su producción. Si la partida no tiene producción en
     la base, el registro conserva su propia fecha como respaldo. */
  function asignarPeriodoOrigen(registros) {
    const primeraProd = new Map();   // familia -> producción más antigua
    for (const r of registros) {
      if (!r.fecha || !Utils.clave(r.tipoRecetas).includes('PRODUCCION')) continue;
      for (const p of r.partidas) {
        const fam = familiaPartida(p);
        const actual = primeraProd.get(fam);
        if (!actual || r.fecha < actual.fecha) primeraProd.set(fam, r);
      }
    }
    for (const r of registros) {
      let origen = null;
      for (const p of r.partidas) {
        const cand = primeraProd.get(familiaPartida(p));
        if (cand && (!origen || cand.fecha < origen.fecha)) origen = cand;
      }
      r.mesPeriodo    = (origen && origen.mes)    || r.mes;
      r.semanaPeriodo = (origen && origen.semana) || r.semana;
    }
  }

  function cargarRegistros(filas) {
    const vistos = new Set();
    const limpios = [];
    for (const f of filas) {
      const r = normalizarFila(f);
      const vacia = !r.opPartida && !r.nCarga && !r.maquina && !r.kgCarga;
      if (vacia) continue;
      if (vistos.has(r.claveUnica)) continue;   // dedup dentro del archivo
      vistos.add(r.claveUnica);
      limpios.push(r);
    }
    asignarPeriodoOrigen(limpios);
    Estado.registros = limpios;
    return limpios.length;
  }

  /* ---------- Cálculo del modelo (con filtros aplicados) ---------- */

  /* Aplica los filtros sobre Estado.registros y devuelve:
       base       — registros (producción + reproceso) que pasan los
                    filtros generales,
       reprocesos — reprocesos de esa base con los filtros específicos
                    de reproceso (defecto y máquinas) ya aplicados,
       origenDe   — Map registro -> máquina origen calculado sobre esa base.
     `omitir` excluye UN filtro por nombre ('periodo', 'cliente',
     'opTela', 'articulos', 'color', 'defectos', 'maqOrigen',
     'maqRecuperacion'): así cada control del panel calcula sus opciones
     en cascada con todos los demás filtros aplicados menos el propio. */
  function aplicarFiltros(filtros, omitir) {
    const F = filtros || {};
    const usar = nombre => nombre !== omitir;

    const base = Estado.registros.filter(r => {
      if (usar('periodo')) {
        // Se filtra por el periodo de ORIGEN de la OP-Partida (primer
        // proceso de PRODUCCIÓN), no por la fecha propia del registro.
        if (F.semanas && F.semanas.size && !F.semanas.has(r.semanaPeriodo)) return false;
        if (F.meses   && F.meses.size   && !F.meses.has(r.mesPeriodo))      return false;
      }
      if (usar('cliente') && F.cliente && r.clienteCorto !== F.cliente) return false;
      if (usar('opTela') && F.opTela) {
        const q = Utils.clave(F.opTela);
        const enCompleto = Utils.clave(r.opPartida).includes(q);
        const enCorto     = Utils.clave(r.opPartidaCorta).includes(q);
        if (!enCompleto && !enCorto) return false;
      }
      if (usar('articulos') && F.articulos && F.articulos.size) {
        const nombre = Utils.clave(r.descArt);
        /* El código se compara por IGUALDAD EXACTA contra cada código
           dividido del registro (equivalentes a Cod. Art. 1/2 de la
           hoja), ignorando ceros a la izquierda: "30199" coincide con
           "30199" y con "00030199", pero NO con "130199". */
        const sinCeros = s => s.replace(/^0+(?=\d)/, '');
        const codigoIgual = q =>
          r.codArts.some(c => Utils.clave(c) === sinCeros(q));
        const coincide = [...F.articulos].some(v => {
          const q = Utils.clave(v);
          /* Opción del panel "código — nombre": manda el código. Una
             opción sin código (solo nombre) filtra por el nombre; el
             texto libre prueba código exacto o inclusión en el nombre. */
          const sep = q.indexOf(' — ');
          if (sep >= 0) {
            const qCod = q.slice(0, sep).trim();
            if (qCod) return codigoIgual(qCod);
            const qNom = q.slice(sep + 3).trim();
            return !!qNom && nombre.includes(qNom);
          }
          return codigoIgual(q) || nombre.includes(q);
        });
        if (!coincide) return false;
      }
      if (usar('color') && F.color && r.color1 !== F.color) return false;
      return true;
    });

    /* Índices de producción para hallar la máquina origen de un reproceso:
       - por partida exacta
       - por OP (prefijo antes del guion), como respaldo               */
    const prodPorPartida = new Map();
    const prodPorOP = new Map();
    for (const r of base) {
      if (r.tipoRecetaClase !== 'PRODUCCIÓN' || !r.partidas.length) continue;
      for (const p of r.partidas) {
        if (!prodPorPartida.has(p)) prodPorPartida.set(p, []);
        prodPorPartida.get(p).push(r);
        const op = p.split('-')[0];
        if (op && op !== p) {
          if (!prodPorOP.has(op)) prodPorOP.set(op, []);
          prodPorOP.get(op).push(r);
        }
      }
    }
    const ordenar = lista =>
      lista.sort((a, b) => (a.horaInicio || 0) - (b.horaInicio || 0));
    prodPorPartida.forEach(ordenar);
    prodPorOP.forEach(ordenar);

    const ultimaPrevia = (lista, rep) => {
      const previas = lista.filter(x =>
        !rep.horaInicio || !x.horaInicio || x.horaInicio <= rep.horaInicio);
      return (previas.length ? previas : lista).slice(-1)[0];
    };

    /* Cascada de búsqueda:
       1) Partida exacta.
       2) Partida base: en COFACO el sufijo de 4 dígitos marca la
          iteración de reproceso (0093 -> 1093 -> 1193), así que
          "X-1093" se busca también como "X-0093".
       3) Misma OP (aproximación: última producción de la OP).      */
    function registroOrigen(rep) {
      for (const p of rep.partidas) {
        const lista = prodPorPartida.get(p);
        if (lista && lista.length) return ultimaPrevia(lista, rep);
      }
      for (const p of rep.partidas) {
        const m = p.match(/^(.*)-(\d)(\d{3})$/);
        if (m && m[2] !== '0') {
          const lista = prodPorPartida.get(`${m[1]}-0${m[3]}`);
          if (lista && lista.length) return ultimaPrevia(lista, rep);
        }
      }
      for (const p of rep.partidas) {
        const lista = prodPorOP.get(p.split('-')[0]);
        if (lista && lista.length) return ultimaPrevia(lista, rep);
      }
      return null;
    }

    /* Reprocesos (con filtros específicos de reproceso). La máquina
       origen se guarda en un Map aparte para no mutar los registros
       cuando esta función se usa para calcular opciones en cascada;
       calcularModelo la vuelca a r.maqOrigen para la tabla de detalle. */
    const origenDe = new Map();
    const registroOrigenDe = new Map();
    let reprocesos = base.filter(r => r.esReproceso);
    reprocesos.forEach(r => {
      const origen = registroOrigen(r);
      registroOrigenDe.set(r, origen);
      origenDe.set(r, origen ? origen.maquina : 'Sin registro');
    });

    if (usar('defectos') && F.defectos && F.defectos.size)
      reprocesos = reprocesos.filter(r => F.defectos.has(r.defecto));
    if (usar('maqOrigen') && F.maqOrigen)
      reprocesos = reprocesos.filter(r => origenDe.get(r) === F.maqOrigen);
    if (usar('maqRecuperacion') && F.maqRecuperacion)
      reprocesos = reprocesos.filter(r => r.maquina === F.maqRecuperacion);

    return { base, reprocesos, origenDe, registroOrigenDe };
  }

  function calcularModelo(filtros) {
    const { base, reprocesos, origenDe, registroOrigenDe } =
      aplicarFiltros(filtros);
    reprocesos.forEach(r => {
      const origen = registroOrigenDe.get(r);
      r.maqOrigen = origenDe.get(r);
      r.tipoProcesoOrigen = origen ? origen.tipoProcesos : 'Sin registro';
      r.tipoTenidoOrigen = origen
        ? familiaTenido(origen.tipoProcesos)
        : 'Sin registro';
      r.costoReproceso = r.kgCarga * r.costoPorKg;
    });

    /* KPIs por partida. */
    const setProc = new Set(), setRep = new Set();
    let kgProc = 0, kgRep = 0, horasPerdidas = 0;
    for (const r of base) {
      kgProc += r.kgCarga;
      r.partidas.forEach(p => setProc.add(p));
    }
    for (const r of reprocesos) {
      kgRep += r.kgCarga;
      r.partidas.forEach(p => setRep.add(p));
      if (r.horaInicio && r.horaFin && r.horaFin > r.horaInicio)
        horasPerdidas += (r.horaFin - r.horaInicio) / 3600000;
    }

    const nProc = setProc.size;
    const nRep  = setRep.size;
    const pctRep = nProc ? nRep / nProc : 0;
    const rft    = nProc ? 1 - pctRep : 0;
    const pctKgRep = kgProc ? kgRep / kgProc : 0;
    const kgBap = Math.max(0, kgProc - kgRep);
    const pctBapKg = kgProc ? kgBap / kgProc : 0;
    const costoTotal = reprocesos.reduce(
      (total, r) => total + r.kgCarga * r.costoPorKg, 0);

    /* ---- Agregados para gráficos ---- */

    const conteo = (lista, fnClave) => {
      const m = new Map();
      for (const r of lista) {
        const k = fnClave(r);
        if (!k) continue;
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    /* Pill Ptda/Kg: en modo Kg los gráficos de reproceso (tendencia,
       máquinas, artículo, color y cliente) suman kg de carga en vez de
       contar eventos. El Pareto y la dona siguen en # eventos porque
       ahí lo relevante es la frecuencia del defecto. */
    const porKg = !!(filtros && filtros.metrica === 'kg');
    const sumaKg = (lista, fnClave) => {
      const m = new Map();
      for (const r of lista) {
        const k = fnClave(r);
        if (!k) continue;
        m.set(k, (m.get(k) || 0) + r.kgCarga);
      }
      return [...m.entries()]
        .map(([k, v]) => [k, Math.round(v)])
        .sort((a, b) => b[1] - a[1]);
    };
    const medida = porKg ? sumaKg : conteo;

    const pareto = conteo(reprocesos, r => r.defecto);
    const totalEventos = pareto.reduce((s, [, n]) => s + n, 0);
    let acum = 0;
    const paretoConAcum = pareto.map(([def, n]) => {
      acum += n;
      return { defecto: def, eventos: n, acumulado: totalEventos ? acum / totalEventos : 0 };
    });

    /* Tendencia por semana o por mes según el pill Sem/Mes: el eje X de
       la gráfica de tendencia sigue la granularidad del filtro activo.
       Se agrupa por el periodo de ORIGEN de la OP-Partida (primer
       proceso de PRODUCCIÓN), igual que el filtro de periodo. */
    const porMes = !!(filtros && filtros.modoPeriodo === 'mes');
    const clavePeriodo = r => porMes ? r.mesPeriodo : r.semanaPeriodo;
    const claves = [...new Set(base.map(clavePeriodo).filter(Boolean))]
      .sort(porMes ? undefined : (a, b) => Utils.numero(a) - Utils.numero(b));
    /* En modo Kg las barras son kg reprocesados del periodo y la línea
       es kg reprocesados / kg procesados (misma fórmula que el KPI
       "KG REPROC."), así la tarjeta y la gráfica siempre cuadran. */
    const reprocesosFiltrados = new Set(reprocesos);
    const tendencia = claves.map(k => {
      const sp = new Set(), sr = new Set();
      let kgP = 0, kgR = 0, costoR = 0;
      for (const r of base) {
        if (clavePeriodo(r) !== k) continue;
        r.partidas.forEach(p => sp.add(p));
        kgP += r.kgCarga;
        // Usa la colección ya filtrada por defecto y máquinas. Así la
        // tendencia, los KPIs y el resumen gerencial siempre cuadran.
        if (reprocesosFiltrados.has(r)) {
          r.partidas.forEach(p => sr.add(p));
          kgR += r.kgCarga;
          costoR += r.kgCarga * r.costoPorKg;
        }
      }
      const kgBapPeriodo = Math.max(0, kgP - kgR);
      const partidasBapPeriodo = Math.max(0, sp.size - sr.size);
      return {
        // Clave cruda del periodo (semana o "AAAA-MM") además de la
        // etiqueta legible: el drill-down del Dashboard filtra los
        // reprocesos de la barra por esta clave (ver graficos.js).
        periodo: k,
        etiqueta: porMes ? Utils.mesCorto(k) : 'Sem' + k,
        reprocesadas: porKg ? Math.round(kgR) : sr.size,
        pct: porKg ? (kgP ? kgR / kgP : 0)
                   : (sp.size ? sr.size / sp.size : 0),
        partidasProcesadas: sp.size,
        partidasReprocesadas: sr.size,
        pctPartidasReprocesadas: sp.size ? sr.size / sp.size : 0,
        partidasBap: partidasBapPeriodo,
        pctBapPartidas: sp.size ? partidasBapPeriodo / sp.size : 0,
        kgProcesados: kgP,
        kgReprocesados: kgR,
        pctKgReprocesados: kgP ? kgR / kgP : 0,
        kgBap: kgBapPeriodo,
        pctBap: kgP ? kgBapPeriodo / kgP : 0,
        costoReproceso: costoR
      };
    });

    /* ---- Vista COSTO: impacto económico de los reprocesos ---- */
    const finalizarCosto = items => {
      items.sort((a, b) => b.costo - a.costo);
      const total = items.reduce((s, i) => s + i.costo, 0);
      let acumulado = 0;
      items.forEach(i => {
        acumulado += i.costo;
        i.participacion = total ? i.costo / total : 0;
        i.acumulado = total ? acumulado / total : 0;
        i.costoPromedio = i.cargas ? i.costo / i.cargas : 0;
        i.costoPorKg = i.kg ? i.costo / i.kg : 0;
        i.costoPorMilKg = i.kgProcesados
          ? i.costo / i.kgProcesados * 1000
          : 0;
      });
      return items;
    };

    const agruparCosto = (lista, fnEtiqueta) => {
      const grupos = new Map();
      for (const r of lista) {
        const etiqueta = Utils.texto(fnEtiqueta(r)) || 'Sin registro';
        const clave = Utils.clave(etiqueta) || 'SIN REGISTRO';
        if (!grupos.has(clave)) {
          grupos.set(clave, {
            clave, etiqueta, costo: 0, kg: 0, cargas: 0,
            kgProcesados: 0, registros: []
          });
        }
        const item = grupos.get(clave);
        item.costo += r.costoReproceso;
        item.kg += r.kgCarga;
        item.cargas++;
        item.registros.push(r);
      }
      return finalizarCosto([...grupos.values()]);
    };

    const limitarCosto = (items, maximo) => {
      if (items.length <= maximo) return finalizarCosto(items);
      const visibles = items.slice(0, maximo - 1);
      const resto = items.slice(maximo - 1).reduce((o, i) => {
        o.costo += i.costo;
        o.kg += i.kg;
        o.cargas += i.cargas;
        o.kgProcesados += i.kgProcesados || 0;
        o.registros.push(...i.registros);
        return o;
      }, {
        clave: 'OTROS', etiqueta: 'Otros', costo: 0, kg: 0, cargas: 0,
        kgProcesados: 0, registros: []
      });
      return finalizarCosto(visibles.concat(resto));
    };

    const produccionCosto = base.filter(r =>
      r.tipoRecetaClase === 'PRODUCCIÓN' &&
      (!(filtros && filtros.maqOrigen) || r.maquina === filtros.maqOrigen));
    const kgProduccionCosto = produccionCosto.reduce(
      (s, r) => s + r.kgCarga, 0);

    const sumarKgProduccion = fnEtiqueta => {
      const mapa = new Map();
      for (const r of produccionCosto) {
        const clave = Utils.clave(fnEtiqueta(r)) || 'SIN REGISTRO';
        mapa.set(clave, (mapa.get(clave) || 0) + r.kgCarga);
      }
      return mapa;
    };

    const kgPorTenido = sumarKgProduccion(r =>
      familiaTenido(r.tipoProcesos));
    let costoPorTenido = agruparCosto(reprocesos, r =>
      r.tipoTenidoOrigen);
    costoPorTenido.forEach(i => {
      i.kgProcesados = kgPorTenido.get(i.clave) || 0;
    });
    costoPorTenido = limitarCosto(finalizarCosto(costoPorTenido), 8);

    const kgPorMaquina = sumarKgProduccion(r =>
      r.maquina || 'Sin registro');
    let costoPorMaquina = agruparCosto(reprocesos, r =>
      r.maqOrigen || 'Sin registro');
    costoPorMaquina.forEach(i => {
      i.kgProcesados = kgPorMaquina.get(i.clave) || 0;
    });
    costoPorMaquina = finalizarCosto(costoPorMaquina).slice(0, 7);

    const costoPorDefecto = limitarCosto(
      agruparCosto(reprocesos, r => r.defecto), 8);
    const etiquetaRecuperacion = valor =>
      (Utils.texto(valor) || 'Sin registro')
        .replace(/\bBANO\b/gi, 'BAÑO');
    const costoPorReceta = agruparCosto(reprocesos, r =>
      etiquetaRecuperacion(r.tipoProcesos)).slice(0, 7);

    const defectosTendencia = costoPorDefecto
      .filter(i => i.etiqueta !== 'Otros')
      .slice(0, 4)
      .map(i => i.etiqueta);
    const tendenciaCosto = claves.map(k => {
      const enPeriodo = reprocesos.filter(r => clavePeriodo(r) === k);
      const porDefectoPeriodo = {};
      defectosTendencia.forEach(d => { porDefectoPeriodo[d] = 0; });
      let costoPeriodo = 0;
      let costoOtros = 0;
      for (const r of enPeriodo) {
        costoPeriodo += r.costoReproceso;
        if (defectosTendencia.includes(r.defecto))
          porDefectoPeriodo[r.defecto] += r.costoReproceso;
        else
          costoOtros += r.costoReproceso;
      }
      const kgProduccionPeriodo = produccionCosto
        .filter(r => clavePeriodo(r) === k)
        .reduce((s, r) => s + r.kgCarga, 0);
      return {
        periodo: k,
        etiqueta: porMes ? Utils.mesCorto(k) : 'Sem' + k,
        costo: costoPeriodo,
        costoPorMilKg: kgProduccionPeriodo
          ? costoPeriodo / kgProduccionPeriodo * 1000
          : 0,
        porDefecto: porDefectoPeriodo,
        otros: costoOtros,
        registros: enPeriodo
      };
    });

    const costoPorCarga = reprocesos.length
      ? costoTotal / reprocesos.length
      : 0;
    const costoPorKgReprocesado = kgRep ? costoTotal / kgRep : 0;
    const costos = {
      kpis: {
        total: costoTotal,
        costoPorMilKg: kgProduccionCosto
          ? costoTotal / kgProduccionCosto * 1000
          : 0,
        costoPorCarga,
        costoPorKgReprocesado,
        kgProduccion: kgProduccionCosto,
        kgReprocesados: kgRep,
        cargas: reprocesos.length
      },
      porTenido: costoPorTenido,
      porDefecto: costoPorDefecto,
      porMaquinaOrigen: costoPorMaquina,
      porRecetaRecuperacion: costoPorReceta,
      prioridad: costoPorDefecto.filter(i => i.etiqueta !== 'Otros'),
      tendencia: tendenciaCosto,
      defectosTendencia,
      principalTenido: costoPorTenido[0] || null,
      principalDefecto: costoPorDefecto[0] || null
    };

    const topN = (pares) => pares.slice(0, CONFIG.TOP_N);

    /* ---- PxMAQ: producción/reproceso por máquina ----
       Su período es independiente del selector Semana/Mes lateral y
       obedece exclusivamente a su selector propio Mes/Sem/Día. Conserva
       los demás filtros: artículo, cliente, color, OP-Tela, defecto y
       máquinas. */
    const pxFiltrado = aplicarFiltros(filtros, 'periodo');
    const modosPx = ['mes', 'semana', 'dia'];
    const modoPx = modosPx.includes(filtros && filtros.pxMaqModo)
      ? filtros.pxMaqModo
      : 'dia';

    const periodoDePx = r => {
      if (!r.fecha) return null;
      const anio = r.fecha.getFullYear();
      const mes = r.fecha.getMonth() + 1;
      const dia = r.fecha.getDate();
      if (modoPx === 'mes') {
        const clave = `${anio}-${String(mes).padStart(2, '0')}`;
        return { clave, etiqueta: Utils.mesCorto(clave), orden: anio * 100 + mes };
      }
      if (modoPx === 'semana') {
        const semana = Utils.texto(r.semana);
        if (!semana) return null;
        const numeroSemana = Utils.numero(semana);
        return {
          clave: `${anio}-S${String(numeroSemana).padStart(2, '0')}`,
          etiqueta: `Sem ${semana} · ${anio}`,
          orden: anio * 100 + numeroSemana
        };
      }
      const clave = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      return { clave, etiqueta: Utils.fmtFecha(r.fecha), orden: anio * 10000 + mes * 100 + dia };
    };

    const periodosMap = new Map();
    for (const r of pxFiltrado.base) {
      const p = periodoDePx(r);
      if (p && !periodosMap.has(p.clave)) periodosMap.set(p.clave, p);
    }
    const periodosPx = [...periodosMap.values()].sort((a, b) =>
      b.orden - a.orden || b.clave.localeCompare(a.clave));
    const solicitadoPx = Utils.texto(filtros && filtros.pxMaqPeriodo);
    // Día abre por defecto en la fecha disponible inmediatamente anterior
    // a la última fecha con registros. Si solo hay una, usa esa única fecha.
    const indicePredeterminadoPx = modoPx === 'dia' && periodosPx.length > 1 ? 1 : 0;
    const periodoSeleccionadoPx = periodosMap.has(solicitadoPx)
      ? solicitadoPx
      : ((periodosPx[indicePredeterminadoPx] || {}).clave || '');
    const pertenecePeriodoPx = r => {
      const p = periodoDePx(r);
      return p && p.clave === periodoSeleccionadoPx;
    };
    const basePx = periodoSeleccionadoPx
      ? pxFiltrado.base.filter(pertenecePeriodoPx)
      : pxFiltrado.base;
    const reprocesosPx = periodoSeleccionadoPx
      ? pxFiltrado.reprocesos.filter(pertenecePeriodoPx)
      : pxFiltrado.reprocesos;

    /* Cada registro normalizado representa una carga. Las cuatro gráficas
       usan exactamente las mismas agrupaciones: cantidad de cargas y suma
       de Kg Carga, separadas por la clasificación exclusiva de Tipo Recetas. */
    const agruparPorMaquina = lista => {
      const m = new Map();
      for (const r of lista) {
        const maquina = r.maquina || '(Sin máquina)';
        const acc = m.get(maquina) || {
          maquina, cargas: 0, kg: 0, registros: []
        };
        acc.cargas += 1;
        acc.kg += r.kgCarga;
        acc.registros.push(r);
        m.set(maquina, acc);
      }
      return [...m.values()].sort((a, b) =>
        b.kg - a.kg || b.cargas - a.cargas ||
        a.maquina.localeCompare(b.maquina, 'es'));
    };

    const tiposPxMaq = ['PRODUCCIÓN', 'PROCESO', 'REPROCESO', 'NINGUNO', 'NN'];
    const resumenTipos = tiposPxMaq.map(tipo => {
      const registros = tipo === 'REPROCESO'
        ? reprocesosPx
        : basePx.filter(r => r.tipoRecetaClase === tipo);
      return {
        tipo,
        cargas: registros.length,
        kg: registros.reduce((s, r) => s + r.kgCarga, 0)
      };
    });
    const produccionPxMaq = basePx.filter(r => r.tipoRecetaClase === 'PRODUCCIÓN');
    const pxMaq = {
      produccion: agruparPorMaquina(produccionPxMaq),
      reproceso:  agruparPorMaquina(reprocesosPx),
      resumenTipos,
      modoPeriodo: modoPx,
      periodoSeleccionado: periodoSeleccionadoPx,
      periodos: periodosPx.map(({ clave, etiqueta }) => ({ clave, etiqueta }))
    };

    /* ---- Agua (vista H2O): Vol Lt Utilizados ----
       Toda carga consume agua, así que se mide sobre la base filtrada
       (producción + reproceso). Si hay un filtro específico de reproceso
       activo (defecto o máquinas), la vista queda acotada a esos
       reprocesos, igual que el resto del dashboard. */
    const hayFiltroReproceso = !!(filtros &&
      ((filtros.defectos && filtros.defectos.size) ||
        filtros.maqOrigen || filtros.maqRecuperacion));
    const regsAgua = hayFiltroReproceso ? reprocesos : base;

    let aguaLt = 0, aguaKg = 0, aguaLtLavado = 0;
    for (const r of regsAgua) {
      aguaLt += r.volLt;
      aguaKg += r.kgCarga;
      if (r.esLavadoMaquina) aguaLtLavado += r.volLt;
    }

    const aguaTendencia = claves.map(k => {
      let lt = 0, kg = 0, lavado = 0;
      for (const r of regsAgua) {
        if (clavePeriodo(r) !== k) continue;
        lt += r.volLt;
        kg += r.kgCarga;
        if (r.esLavadoMaquina) lavado += r.volLt;
      }
      return {
        periodo: k,
        etiqueta: porMes ? Utils.mesCorto(k) : 'Sem' + k,
        litros: Math.round(lt),
        litrosLavado: Math.round(lavado),
        kg,
        ltPorKg: kg ? lt / kg : 0
      };
    });

    /* Litros y kg acumulados por clave (artículo o color), ordenados por
       litros: la barra mide el consumo total y ltPorKg su intensidad. */
    const aguaPor = fnClave => {
      const m = new Map();
      for (const r of regsAgua) {
        const k = fnClave(r);
        if (!k) continue;
        const acc = m.get(k) || { litros: 0, kg: 0 };
        acc.litros += r.volLt;
        acc.kg += r.kgCarga;
        m.set(k, acc);
      }
      return [...m.entries()]
        .map(([clave, v]) => ({
          clave,
          litros: Math.round(v.litros),
          kg: v.kg,
          ltPorKg: v.kg ? v.litros / v.kg : 0
        }))
        .sort((a, b) => b.litros - a.litros);
    };

    const agua = {
      litros: aguaLt,
      kg: aguaKg,
      ltPorKg: aguaKg ? aguaLt / aguaKg : 0,
      litrosLavado: aguaLtLavado,
      pctLavado: aguaLt ? aguaLtLavado / aguaLt : 0,
      tendencia: aguaTendencia,
      porArticulo: topN(aguaPor(r => r.articulo)),
      porColor:    topN(aguaPor(r => r.color1)),
      // Todos los valores únicos de "Procesos" (sin Top N).
      porProceso:  aguaPor(r => r.procesos),
      registros: regsAgua
    };

    /* ---- Programación: lavados frente a cargas productivas ---- */
    const resultadoLavSinPeriodo = aplicarFiltros(filtros, 'periodo');
    const baseLavSinPeriodo = resultadoLavSinPeriodo.base;
    const modosLav = ['mes', 'semana', 'dia'];
    const modoLav = modosLav.includes(filtros && filtros.lavModo)
      ? filtros.lavModo : 'dia';
    const periodoDeLav = r => {
      if (!r.fecha) return null;
      const anio = r.fecha.getFullYear();
      const mes = r.fecha.getMonth() + 1;
      const dia = r.fecha.getDate();
      if (modoLav === 'mes') {
        const clave = `${anio}-${String(mes).padStart(2, '0')}`;
        return { clave, etiqueta: Utils.mesCorto(clave), orden: anio * 100 + mes };
      }
      if (modoLav === 'semana') {
        const semana = Utils.texto(r.semana);
        if (!semana) return null;
        const numero = Utils.numero(semana);
        return {
          clave: `${anio}-S${String(numero).padStart(2, '0')}`,
          etiqueta: `Sem ${semana} · ${anio}`,
          orden: anio * 100 + numero
        };
      }
      const clave = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      return { clave, etiqueta: Utils.fmtFecha(r.fecha), orden: anio * 10000 + mes * 100 + dia };
    };
    const periodosLavMap = new Map();
    baseLavSinPeriodo.forEach(r => {
      const p = periodoDeLav(r);
      if (p && !periodosLavMap.has(p.clave)) periodosLavMap.set(p.clave, p);
    });
    const periodosLav = [...periodosLavMap.values()].sort((a, b) =>
      b.orden - a.orden || b.clave.localeCompare(a.clave));
    const solicitadoLav = Utils.texto(filtros && filtros.lavPeriodo);
    const indiceLav = modoLav === 'dia' && periodosLav.length > 1 ? 1 : 0;
    const periodoSeleccionadoLav = periodosLavMap.has(solicitadoLav)
      ? solicitadoLav : ((periodosLav[indiceLav] || {}).clave || '');
    const diasCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                         'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const etiquetaTendenciaLav = p => {
      if (modoLav === 'mes') {
        const mes = Number(p.clave.slice(5, 7));
        return mesesCortos[mes - 1] || p.etiqueta;
      }
      if (modoLav === 'semana')
        return 'Sem' + String(p.clave).split('S').pop().replace(/^0/, '');
      const partes = p.clave.split('-').map(Number);
      const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
      return `${diasCortos[fecha.getDay()]} ${partes[2]}/${mesesCortos[partes[1] - 1]}`;
    };
    const periodosLavAsc = periodosLav.slice().reverse();
    const indiceSeleccionadoLav = periodosLavAsc.findIndex(
      p => p.clave === periodoSeleccionadoLav);
    const finTendenciaLav = indiceSeleccionadoLav >= 0
      ? indiceSeleccionadoLav + 1 : periodosLavAsc.length;
    const ventanaLav = periodosLavAsc.slice(
      Math.max(0, finTendenciaLav - 10), finTendenciaLav);
    const reprocesosLavTodosSet = new Set(resultadoLavSinPeriodo.reprocesos);
    const tendenciaLav = ventanaLav.map(p => {
      const registrosPeriodo = baseLavSinPeriodo.filter(r => {
        const periodo = periodoDeLav(r);
        return periodo && periodo.clave === p.clave;
      });
      const registros = registrosPeriodo.filter(r => r.esLavadoMaquina);
      const registrosDetalle = registrosPeriodo.filter(r =>
        r.esLavadoMaquina ||
        r.tipoRecetaClase === 'PRODUCCIÓN' ||
        (r.tipoRecetaClase === 'REPROCESO' && reprocesosLavTodosSet.has(r)));
      const colores = new Set();
      registrosPeriodo.filter(r => !r.esLavadoMaquina).forEach(r => {
        const lista = r.coloresList && r.coloresList.length
          ? r.coloresList : [r.color1];
        lista.filter(Boolean).forEach(color => colores.add(Utils.clave(color)));
      });
      const horas = registros.reduce((s, r) => {
        const ms = r.horaInicio && r.horaFin ? r.horaFin - r.horaInicio : 0;
        return s + (ms > 0 ? ms / 3600000 : 0);
      }, 0);
      return {
        clave: p.clave,
        etiqueta: etiquetaTendenciaLav(p),
        lavados: registros.length,
        litros: registros.reduce((s, r) => s + (r.volLt || 0), 0),
        horas,
        colores: colores.size,
        registros,
        registrosDetalle
      };
    });
    const baseLav = periodoSeleccionadoLav
      ? baseLavSinPeriodo.filter(r => {
          const p = periodoDeLav(r);
          return p && p.clave === periodoSeleccionadoLav;
        })
      : baseLavSinPeriodo;
    const reprocesosLav = resultadoLavSinPeriodo.reprocesos.filter(r => {
      if (!periodoSeleccionadoLav) return true;
      const p = periodoDeLav(r);
      return p && p.clave === periodoSeleccionadoLav;
    });
    const reprocesosLavSet = new Set(reprocesosLav);

    const progMap = new Map();
    const progItem = maquina => {
      const clave = maquina || '(Sin máquina)';
      if (!progMap.has(clave)) progMap.set(clave, {
        maquina: clave, productivas: 0, reprocesos: 0, lavados: 0,
        litros: 0, horas: 0, registrosProductivos: [],
        registrosReproceso: [], registrosLavado: []
      });
      return progMap.get(clave);
    };
    for (const r of baseLav) {
      const item = progItem(r.maquina);
      if (r.esLavadoMaquina) {
        item.lavados++;
        item.litros += r.volLt || 0;
        const ms = r.horaInicio && r.horaFin ? r.horaFin - r.horaInicio : 0;
        if (ms > 0) item.horas += ms / 3600000;
        item.registrosLavado.push(r);
      } else if (r.tipoRecetaClase === 'PRODUCCIÓN') {
        item.productivas++;
        item.registrosProductivos.push(r);
      } else if (r.tipoRecetaClase === 'REPROCESO' && reprocesosLavSet.has(r)) {
        item.reprocesos++;
        item.registrosReproceso.push(r);
      }
    }
    const porMaquinaProgramacion = [...progMap.values()]
      .filter(i => i.productivas || i.reprocesos || i.lavados)
      .map(i => Object.assign(i, {
        lavadosPor10: i.productivas ? i.lavados / i.productivas * 10 : 0
      }))
      .sort((a, b) => a.maquina.localeCompare(b.maquina, 'es',
        { numeric: true, sensitivity: 'base' }));
    const totalLavados = porMaquinaProgramacion.reduce((s, i) => s + i.lavados, 0);
    const totalProductivas = porMaquinaProgramacion.reduce((s, i) => s + i.productivas, 0);
    const totalReprocesos = porMaquinaProgramacion.reduce((s, i) => s + i.reprocesos, 0);
    const programacion = {
      porMaquina: porMaquinaProgramacion,
      totalLavados,
      totalProductivas,
      totalReprocesos,
      lavadosPor10: totalProductivas ? totalLavados / totalProductivas * 10 : 0,
      litrosLavado: porMaquinaProgramacion.reduce((s, i) => s + i.litros, 0),
      horasLavado: porMaquinaProgramacion.reduce((s, i) => s + i.horas, 0),
      modoPeriodo: modoLav,
      periodoSeleccionado: periodoSeleccionadoLav,
      periodos: periodosLav.map(({ clave, etiqueta }) => ({ clave, etiqueta })),
      tendencia: tendenciaLav
    };

    const modelo = {
      base, reprocesos,
      kpis: {
        partidasProcesadas: nProc,
        partidasReprocesadas: nRep,
        kgProcesados: kgProc,
        kgReprocesados: kgRep,
        pctKgReprocesados: pctKgRep,
        kgBap,
        pctBapKg,
        rft, pctReproceso: pctRep,
        costoEstimado: costoTotal,
        horasPerdidas
      },
      pareto: paretoConAcum,
      tendencia,
      resumenTendencia: tendencia,
      agua,
      costo: costos,
      pxMaq,
      programacion,
      granularidad: porMes ? 'mes' : 'semana',
      metrica: porKg ? 'kg' : 'partidas',
      porMaqOrigen:      medida(reprocesos, r => r.maqOrigen),
      porMaqRecuperacion:medida(reprocesos, r => r.maquina),
      porArticulo:  topN(medida(reprocesos, r => r.articulo)),
      porColor:     topN(medida(reprocesos, r => r.color1)),
      porCliente:   topN(medida(reprocesos, r => r.clienteCorto))
    };

    Estado.modelo = modelo;
    return modelo;
  }

  /* Historial completo de una partida (para la ficha rápida).
     Incluye las iteraciones de la misma familia: en COFACO el sufijo
     de 4 dígitos marca el reproceso (0093 -> 1093 -> 1193), por lo que
     buscar "…-1093" también muestra "…-0093" y viceversa. */
  function familiaPartida(p) {
    const m = Utils.clave(p).match(/^(.*)-(\d)(\d{3})$/);
    return m ? `${m[1]}-*${m[3]}` : Utils.clave(p);
  }

  /* Coincidencia flexible: además de la clave completa admite formas
     abreviadas — "40653-40" (sufijo de la OP + partida sin ceros a la
     izquierda) y "4065340" (dígitos corridos) encuentran
     "1000040653-0040". */
  function coincidePartida(pc, q) {
    if (pc === q || pc.endsWith(q)) return true;
    const m = pc.match(/^(\d+)-(\d+)$/);
    if (!m) return false;
    const [, op, par] = m;
    const parCorta = par.replace(/^0+/, '') || '0';
    const qm = q.match(/^(\d+)-(\d+)$/);
    if (qm) {
      const qPar = qm[2].replace(/^0+/, '') || '0';
      return op.endsWith(qm[1]) && (parCorta === qPar || par === qm[2]);
    }
    if (/^\d+$/.test(q))
      return (op + par).endsWith(q) || (op + parCorta).endsWith(q);
    return false;
  }

  function historialPartida(idPartida) {
    const id = Utils.clave(idPartida).replace(/\s+/g, '');
    if (!id) return [];
    const famQ = familiaPartida(id);
    // 1ª pasada: familias de las partidas que coinciden con lo buscado.
    const familias = new Set();
    for (const r of Estado.registros)
      for (const p of r.partidas) {
        const pc = Utils.clave(p);
        if (coincidePartida(pc, id) || familiaPartida(pc) === famQ)
          familias.add(familiaPartida(pc));
      }
    if (!familias.size) return [];
    // 2ª pasada: registros de esas familias (0093 -> 1093 -> 1193).
    return Estado.registros
      .filter(r => r.partidas.some(p =>
        familias.has(familiaPartida(Utils.clave(p)))))
      .sort((a, b) => (a.horaInicio || 0) - (b.horaInicio || 0));
  }

  return { Estado, cargarRegistros, cargarArticulosUnicos, aplicarFiltros, calcularModelo,
           historialPartida, clasificarDefecto, extraerArticulo,
           clasificarTipoReceta, normalizarFila };
})();
