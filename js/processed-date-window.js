(() => {
    'use strict';

    // Ventana por defecto del subtab "Procesado": los N dias mas recientes que
    // realmente contienen datos (se saltan los dias sin registros).
    const DEFAULT_WINDOW_DAYS = 3;

    // Override por vista: viewId -> timestamp de inicio-de-dia | (ausente = sin override)
    const overrides = Object.create(null);

    function startOfDayMs(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return null;
        }
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    function toDay(record, getDate) {
        try {
            return startOfDayMs(getDate(record));
        } catch (error) {
            return null;
        }
    }

    function getOverride(viewId) {
        const value = overrides[viewId];
        return typeof value === 'number' && !Number.isNaN(value) ? value : null;
    }

    function setOverride(viewId, dayMs) {
        if (typeof dayMs === 'number' && !Number.isNaN(dayMs)) {
            overrides[viewId] = dayMs;
        } else {
            delete overrides[viewId];
        }
    }

    function clearOverride(viewId) {
        delete overrides[viewId];
    }

    // Timestamps de dias distintos (desc) que tienen al menos un registro con fecha.
    function distinctDays(records, getDate) {
        const set = new Set();
        (records || []).forEach((record) => {
            const day = toDay(record, getDate);
            if (day !== null) {
                set.add(day);
            }
        });
        return Array.from(set).sort((a, b) => b - a);
    }

    // Los N dias distintos mas recientes que contienen datos.
    function recentDays(records, getDate, count = DEFAULT_WINDOW_DAYS) {
        return distinctDays(records, getDate).slice(0, count);
    }

    // Filtra una lista YA ordenada a la ventana activa de la vista:
    // - Con override: deja solo los registros de ese dia.
    // - Sin override: deja los registros dentro de los N dias mas recientes con datos.
    // Los registros sin fecha se descartan siempre.
    function filterToWindow(viewId, records, getDate) {
        const list = Array.isArray(records) ? records : [];
        const override = getOverride(viewId);

        if (override !== null) {
            return list.filter((record) => toDay(record, getDate) === override);
        }

        const allowed = new Set(recentDays(list, getDate));
        if (!allowed.size) {
            return [];
        }
        return list.filter((record) => {
            const day = toDay(record, getDate);
            return day !== null && allowed.has(day);
        });
    }

    window.TintoreriaProcessedWindow = {
        DEFAULT_WINDOW_DAYS,
        startOfDayMs,
        getOverride,
        setOverride,
        clearOverride,
        distinctDays,
        recentDays,
        filterToWindow
    };
})();
