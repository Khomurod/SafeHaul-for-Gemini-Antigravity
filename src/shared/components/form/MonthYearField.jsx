import React, { useEffect, useMemo, useState } from 'react';
import { parseMonthYear, formatMonthYearIso } from '@shared/utils/dateFormHelpers';

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const empty = () => ({ year: '', month: '' });

/** Month + year dropdowns; value stored as YYYY-MM. */
export default function MonthYearField({
    label,
    idPrefix,
    name,
    value,
    onChange,
    required = false,
    helpText,
    minYear = 1970,
    maxYear,
    maxToday = false,
}) {
    const today = new Date();
    const ty = today.getFullYear();
    const tm = today.getMonth() + 1;

    const computedMaxYear = maxYear ?? (maxToday ? ty : ty + 10);

    const parsedFromProp = parseMonthYear(value);

    const [inner, setInner] = useState(() =>
        parsedFromProp.year && parsedFromProp.month
            ? { year: parsedFromProp.year, month: parsedFromProp.month }
            : empty()
    );

    useEffect(() => {
        const parsed = parseMonthYear(value);
        if (parsed.year && parsed.month) {
            setInner({ year: parsed.year, month: parsed.month });
        } else if (!value) {
            setInner(empty());
        }
    }, [value]);

    const p = inner;

    const yearOptions = useMemo(() => {
        const ys = [];
        for (let y = computedMaxYear; y >= minYear; y--) ys.push(y);
        return ys;
    }, [computedMaxYear, minYear]);

    const maxMonthForYear = maxToday && p.year === ty ? tm : 12;

    const tryEmit = (next) => {
        const { year: y, month: m } = next;
        if (!y || !m) {
            setInner(next);
            onChange(name, '');
            return;
        }
        let mm = m;
        if (maxToday && y === ty && mm > maxMonthForYear) mm = maxMonthForYear;
        const iso = formatMonthYearIso(y, mm);
        setInner({ year: y, month: mm });
        onChange(name, iso);
    };

    const onYearChange = (e) => {
        const y = e.target.value ? Number(e.target.value) : '';
        if (!y) {
            tryEmit(empty());
            return;
        }
        let m = p.month;
        if (maxToday && y === ty && m && m > maxMonthForYear) m = maxMonthForYear;
        tryEmit({ year: y, month: m || '' });
    };

    const onMonthChange = (e) => {
        const m = e.target.value ? Number(e.target.value) : '';
        if (!m) {
            tryEmit({ ...p, month: '' });
            return;
        }
        const y = p.year;
        if (!y) {
            setInner({ ...p, month: m });
            onChange(name, '');
            return;
        }
        tryEmit({ year: y, month: m });
    };

    return (
        <div className="space-y-1">
            <span className="block text-sm font-medium text-gray-700 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {helpText && <p className="text-xs text-gray-500 mb-1">{helpText}</p>}
            <div className="grid grid-cols-2 gap-2">
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
                            if (p.year === ty && maxToday && mv > maxMonthForYear) return null;
                            return (
                                <option key={mv} value={mv}>
                                    {nm}
                                </option>
                            );
                        })}
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
