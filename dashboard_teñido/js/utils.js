/* ============================================================
   UTILS.JS — Funciones de apoyo (normalización, splits, fechas,
   formatos numéricos estilo dashboard: 1.234,56)
   ============================================================ */

const Utils = (() => {

  /* ---------- Texto ---------- */

  function texto(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function sinTildes(s) {
    return texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function clave(s) {
    return sinTildes(s).toUpperCase();
  }

  /* ---------- Splits de campos compuestos ----------
     - "Cod. Art." y "Colores": valores separados por " | "
     - "Descripcion Art.": valores separados por DOS espacios     */

  function splitPipe(v) {
    return texto(v)
      .split('|')
      .map(x => x.trim())
      .filter(x => x.length > 0);
  }

  function splitDobleEspacio(v) {
    if (v === null || v === undefined) return [];
    return String(v)
      .split(/\s{2,}/)          // dos o más espacios seguidos
      .map(x => x.replace(/\s+/g, ' ').trim())
      .filter(x => x.length > 0);
  }

  /* "OP - Partida" puede traer varias partidas: "A-1, 1084" o "A | B". */
  function splitPartidas(v) {
    return texto(v)
      .split(/[|,]/)
      .map(x => x.trim())
      .filter(x => x.length > 0);
  }

  /* ---------- Fechas ---------- */

  // Serial de Excel -> Date
  function fechaDesdeSerial(n) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms);
  }

  // "Fecha" del reporte: dd/mm/yyyy
  function parseFechaDMA(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number' && isFinite(v)) return fechaDesdeSerial(v);
    const s = texto(v);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }

  // "Hora Inicio/Fin/Completado": mm/dd/yyyy hh:mm:ss
  function parseFechaHoraMDA(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number' && isFinite(v)) return fechaDesdeSerial(v);
    const s = texto(v);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0));
  }

  function fmtFecha(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function fmtFechaHora(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${fmtFecha(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------- Números (estilo 1.234,56) ---------- */

  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = texto(v);
    if (!s) return 0;
    const coma = s.includes(','), punto = s.includes('.');
    if (coma && punto) {
      // El separador que aparece al final es el decimal.
      if (s.lastIndexOf(',') > s.lastIndexOf('.'))
        s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
      else
        s = s.replace(/,/g, '');                      // 1,234.56
    } else if (coma) {
      s = s.replace(',', '.');                        // 690,15
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function fmtEntero(n) {
    const neg = n < 0 ? '-' : '';
    const s = Math.round(Math.abs(n)).toString();
    return neg + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function fmtDecimal(n, dec = 2) {
    const neg = n < 0 ? '-' : '';
    const fijo = Math.abs(n).toFixed(dec);           // "1234.56"
    const [ent, d] = fijo.split('.');
    const entMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return neg + entMiles + (dec > 0 ? ',' + d : '');
  }

  function fmtPct(fraccion, dec = 2) {
    return fmtDecimal(fraccion * 100, dec) + '%';
  }

  function fmtKg(n) {
    return fmtEntero(n);
  }

  function fmtDolares(n) {
    return '$ ' + fmtEntero(n);
  }

  /* Etiqueta corta de mes: "2026-07" -> "Jul26" (filtro Mes y eje X
     de la tendencia cuando el pill Sem/Mes está en Mes). */
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  function mesCorto(claveMes) {
    const [anio, mes] = texto(claveMes).split('-');
    const nombre = MESES_CORTOS[+mes - 1];
    return nombre ? nombre + anio.slice(-2) : texto(claveMes);
  }

  /* ---------- Varios ---------- */

  function escapeHtml(s) {
    return texto(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function truncar(s, max = 28) {
    s = texto(s);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  return {
    texto, sinTildes, clave,
    splitPipe, splitDobleEspacio, splitPartidas,
    parseFechaDMA, parseFechaHoraMDA, fmtFecha, fmtFechaHora,
    numero, fmtEntero, fmtDecimal, fmtPct, fmtKg, fmtDolares,
    mesCorto, escapeHtml, truncar
  };
})();
