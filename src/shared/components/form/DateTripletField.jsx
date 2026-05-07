import React, { useEffect, useMemo, useState } from 'react';
import {
    parseIsoDateParts,
    buildIsoDate,
    daysInMonth,
} from '@shared/utils/dateFormHelpers';

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const emptyTriplet = () => ({ year: '', month: '', day: '' });

/**
 * Month / Day / Year dropdowns — stores YYYY-MM-DD in parent when complete.
 * Keeps partial selections locally so users can fill in any order.
 */
export default function DateTripletField({
    label,
    idPrefix,
    name,
    value,
    onChange,
    required = false,
    helpText,
    minYear = 1920,
    maxYear,
    maxToday = false,
}) {
    const today = new Date();
    const ty = today.getFullYear();
    const tm = today.getMonth() + 1;
    const td = today.getDate();
    const capIso = `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`;

    const computedMaxYear = maxYear ?? (maxToday ? ty : ty + 15);

    const parsedFromProp = parseIsoDateParts(value);

    const [inner, setInner] = useState(() =>
        parsedFromProp ? { year: parsedFromProp.year, month: parsedFromProp.month, day: parsedFromProp.day } : emptyTriplet()
    );

    useEffect(() => {
        const parsed = parseIsoDateParts(value);
        if (parsed) {
            setInner({ year: parsed.year, month: parsed.month, day: parsed.day });
        } else if (!value) {
            setInner(emptyTriplet());
        }
    }, [value]);

    const p = inner;

    const yearOptions = useMemo(() => {
        const ys = [];
        for (let y = computedMaxYear; y >= minYear; y--) ys.push(y);
        return ys;
    }, [computedMaxYear, minYear]);

    const maxMonthThisYear = maxToday ? tm : 12;

    const clampDay = (y, m, d) => {
        if (!y || !m || !d) return d;
        let dim = daysInMonth(y, m);
        let next = Math.min(d, dim);
        if (maxToday && y === ty && m === tm) next = Math.min(next, td);
        return next;
    };

    const tryEmit = (next) => {
        const { year: y, month: m, day: d } = next;
        if (!y || !m || !d) {
            setInner(next);
            onChange(name, '');
            return;
        }
        let iso = buildIsoDate(y, m, d);
        if (maxToday && iso > capIso) iso = capIso;
        const clamped = parseIsoDateParts(iso);
        setInner({ year: clamped.year, month: clamped.month, day: clamped.day });
        onChange(name, iso);
    };

    const onYearChange = (e) => {
        const y = e.target.value ? Number(e.target.value) : '';
        if (!y) {
            tryEmit(emptyTriplet());
            return;
        }
        let m = p.month;
        let d = p.day;
        if (maxToday && y === ty && m && m > maxMonthThisYear) m = maxMonthThisYear;
        if (m && d) d = clampDay(y, m, d);
        tryEmit({ year: y, month: m || '', day: d || '' });
    };

    const onMonthChange = (e) => {
        const m = e.target.value ? Number(e.target.value) : '';
        if (!m) {
            tryEmit({ ...p, month: '', day: '' });
            return;
        }
        const y = p.year;
        if (!y) {
            setInner({ ...p, month: m, day: '' });
            onChange(name, '');
            return;
        }
        let mm = m;
        if (maxToday && y === ty && mm > maxMonthThisYear) mm = maxMonthThisYear;
        let d = p.day;
        if (d) d = clampDay(y, mm, d);
        tryEmit({ year: y, month: mm, day: d || '' });
    };

    const onDayChange = (e) => {
        const d = e.target.value ? Number(e.target.value) : '';
        if (!d) {
            tryEmit({ ...p, day: '' });
            return;
        }
        const y = p.year;
        const m = p.month;
        if (!y || !m) {
            setInner({ ...p, day: d });
            onChange(name, '');
            return;
        }
        tryEmit({ year: y, month: m, day: clampDay(y, m, d) });
    };

    const monthSelectMax =
        maxToday && p.year === ty ? maxMonthThisYear : 12;

    let dayCount = 31;
    if (p.year && p.month) {
        dayCount = daysInMonth(p.year, p.month);
        if (maxToday && p.year === ty && p.month === tm) dayCount = Math.min(dayCount, td);
    }

    return (
        <div className="space-y-1">
            {label ? (
                <span className="block text-sm font-medium text-gray-700 mb-1">
                    {label} {required && <span className="text-red-500">*</span>}
                </span>
            ) : (
                required && <span className="sr-only">Required date</span>
            )}
            {helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="sr-only" htmlFor={`${idPrefix}-month`}>Month</label>
                    <select
                        id={`${idPrefix}-month`}
                        value={p.month === '' ? '' : String(p.month)}
                        onChange={onMonthChange}
                        required={required}
                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 text-sm"
                    >
                        <option value="">Month</option>
                        {MONTH_NAMES.map((nm, i) => {
                            const mv = i + 1;
                            if (p.year === ty && maxToday && mv > monthSelectMax) return null;
                            return (
                                <option key={mv} value={mv}>
                                    {nm}
                                </option>
                            );
                        })}
                    </select>
                </div>
                <div>
                    <label className="sr-only" htmlFor={`${idPrefix}-day`}>Day</label>
                    <select
                        id={`${idPrefix}-day`}
                        value={p.day === '' ? '' : String(p.day)}
                        onChange={onDayChange}
                        required={required}
                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 text-sm"
                    >
                        <option value="">Day</option>
                        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="sr-only" htmlFor={`${idPrefix}-year`}>Year</label>
                    <select
                        id={`${idPrefix}-year`}
                        value={p.year === '' ? '' : String(p.year)}
                        onChange={onYearChange}
                        required={required}
                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 text-sm"
                    >
                        <option value="">Year</option>
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
