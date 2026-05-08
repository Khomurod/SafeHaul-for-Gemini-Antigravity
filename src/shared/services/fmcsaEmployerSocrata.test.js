import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildFmcsaEmployerSearchUrl,
  escapeSoqlStringLiteral,
  sanitizeEmployerSearchPrefix,
  fetchFmcsaEmployerSuggestions,
  mapFmcsaRowToEmployerFields,
} from './fmcsaEmployerSocrata';

describe('fmcsaEmployerSocrata', () => {
  it('escapeSoqlStringLiteral doubles single quotes', () => {
    expect(escapeSoqlStringLiteral("O'Brien")).toBe("O''Brien");
  });

  it('sanitizeEmployerSearchPrefix trims length and removes risky chars', () => {
    expect(sanitizeEmployerSearchPrefix('  Acme & Co.  ')).toBe('Acme & Co.');
    expect(sanitizeEmployerSearchPrefix("Test'; DROP--")).not.toContain(';');
  });

  it('buildFmcsaEmployerSearchUrl returns null for short prefix', () => {
    expect(buildFmcsaEmployerSearchUrl('a')).toBeNull();
    expect(buildFmcsaEmployerSearchUrl('ab')).not.toBeNull();
  });

  it('escapes apostrophe in SoQL literal for SQL-injection style input', () => {
    const url = buildFmcsaEmployerSearchUrl("O'Neill Trucking");
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain("upper('O''Neill Trucking')");
  });

  it('buildFmcsaEmployerSearchUrl encodes SoQL and uses starts_with upper(legal_name)', () => {
    const url = buildFmcsaEmployerSearchUrl('Swift');
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain('$select=dot_number,legal_name,phy_street,phy_city,phy_state');
    expect(decoded).toContain("starts_with(upper(legal_name), upper('Swift'))");
    expect(decoded).toContain('$limit=5');
  });

  it('mapFmcsaRowToEmployerFields maps API columns', () => {
    const m = mapFmcsaRowToEmployerFields(
      {
        dot_number: '12345',
        legal_name: 'Acme Trucking LLC',
        phy_street: '1 Main St',
        phy_city: 'Dallas',
        phy_state: 'TX',
      },
      ['TX'],
    );
    expect(m).toEqual({
      companyName: 'Acme Trucking LLC',
      dotNumber: '12345',
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
    });
  });

  describe('fetchFmcsaEmployerSuggestions', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ legal_name: 'X', dot_number: '1' }]),
          }),
        ),
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends X-App-Token header and returns array', async () => {
      const rows = await fetchFmcsaEmployerSuggestions('Ab', {
        appToken: 'test-token',
      });
      expect(rows).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('az4n-8mr2.json'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-App-Token': 'test-token',
          }),
        }),
      );
    });
  });

  it('fetchFmcsaEmployerSuggestions returns empty without app token (no network)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('should not run')),
    );
    const rows = await fetchFmcsaEmployerSuggestions('Ab', {});
    expect(rows).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
