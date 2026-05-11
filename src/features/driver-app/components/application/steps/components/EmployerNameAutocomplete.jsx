import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  fetchFmcsaEmployerSuggestions,
  mapFmcsaRowToEmployerFields,
} from '@shared/services/fmcsaEmployerSocrata';
import InputField from '@shared/components/form/InputField';

const DEBOUNCE_MS = 400;

export { mapFmcsaRowToEmployerFields };

export default function EmployerNameAutocomplete({
  id,
  label = 'Company Name',
  value,
  required = false,
  onChange,
  statesAllowlist = [],
}) {
  const token = import.meta.env.VITE_SOCRATA_APP_TOKEN;
  const listboxId = useId();
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const fetchGenerationRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const runFetch = useCallback(
    async (prefix) => {
      if (!token) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++fetchGenerationRef.current;
      setLoading(true);
      setFetchError(null);
      try {
        const rows = await fetchFmcsaEmployerSuggestions(prefix, {
          signal: controller.signal,
          appToken: token,
        });
        if (gen !== fetchGenerationRef.current) return;
        setItems(rows);
        setOpen(rows.length > 0);
        setHighlightIndex(rows.length > 0 ? 0 : -1);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (gen !== fetchGenerationRef.current) return;
        console.warn('[EmployerNameAutocomplete]', e);
        setFetchError('Lookup temporarily unavailable.');
        setItems([]);
        setOpen(false);
      } finally {
        if (gen === fetchGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    return () => {
      debounceRef.current && clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const applyRow = useCallback(
    (row) => {
      const m = mapFmcsaRowToEmployerFields(row, statesAllowlist);
      onChange('companyName', m.companyName);
      onChange('dotNumber', m.dotNumber);
      onChange('address', m.address);
      onChange('city', m.city);
      if (m.state) onChange('state', m.state);
      setOpen(false);
      setItems([]);
      setHighlightIndex(-1);
    },
    [onChange, statesAllowlist],
  );

  const handleInputChange = useCallback(
    (name, nextValue) => {
      onChange(name, nextValue);
      setFetchError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!token) return;

      abortRef.current?.abort();

      const trimmed = String(nextValue ?? '').trim();
      if (trimmed.length < 2) {
        fetchGenerationRef.current += 1;
        setItems([]);
        setOpen(false);
        setLoading(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void runFetch(trimmed);
      }, DEBOUNCE_MS);
    },
    [onChange, runFetch, token],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (!open || items.length === 0) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(items.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter' && highlightIndex >= 0 && items[highlightIndex]) {
        e.preventDefault();
        applyRow(items[highlightIndex]);
      }
    },
    [applyRow, highlightIndex, items, open],
  );

  if (!token) {
    return (
      <InputField
        label={label}
        id={id}
        name="companyName"
        value={value}
        onChange={handleInputChange}
        required={required}
        placeholder="Employer legal name"
      />
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div onKeyDown={onKeyDown}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-1">
          <label htmlFor={id} className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <span className="text-xs text-gray-500">FMCSA carrier lookup</span>
          {loading && <span className="text-xs text-gray-400">Searching…</span>}
        </div>
        <input
          type="text"
          id={id}
          name="companyName"
          autoComplete="organization"
          required={required}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          role="combobox"
          value={value || ''}
          placeholder="Start typing employer legal name…"
          className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
          onChange={(e) => handleInputChange(e.target.name, e.target.value)}
        />
      </div>
      {fetchError && <p className="text-xs text-amber-700 mt-1">{fetchError}</p>}
      {open && items.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-[100] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {items.map((row, idx) => {
            const name = row?.legal_name ?? 'Unknown';
            const dot = row?.dot_number != null ? String(row.dot_number) : '—';
            const city = row?.phy_city ?? '';
            const st = row?.phy_state ?? '';
            const sub = [city, st].filter(Boolean).join(', ');
            return (
              <li key={`${dot}-${name}-${idx}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === highlightIndex}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-b-0 hover:bg-blue-50 ${idx === highlightIndex ? 'bg-blue-50' : ''
                    }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRow(row)}
                >
                  <span className="font-medium text-gray-900 block truncate">{name}</span>
                  <span className="text-xs text-gray-500">
                    USDOT {dot}
                    {sub ? ` · ${sub}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
