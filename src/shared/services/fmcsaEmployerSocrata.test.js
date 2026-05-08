import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildFmcsaEmployerSearchUrl,
  buildFmcsaEmployerSearchUrlFromCompanyName,
  buildFmcsaEmployerLikeSearchUrl,
  fmcsaPrefixTokenFromCompanyName,
  FMCSA_SELECT_EXTENDED,
  FMCSA_SELECT_MINIMAL,
  escapeSoqlStringLiteral,
  sanitizeEmployerSearchPrefix,
  fetchFmcsaEmployerSuggestions,
  fetchFmcsaCarrierCandidatesForPev,
  mapFmcsaRowToEmployerFields,
  mapFmcsaRowToPevContact,
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

  it('buildFmcsaEmployerSearchUrl accepts custom $select fields', () => {
    const url = buildFmcsaEmployerSearchUrl('Swift', 'dot_number,legal_name');
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain('$select=dot_number,legal_name');
  });

  it('fmcsaPrefixTokenFromCompanyName uses first significant word', () => {
    expect(fmcsaPrefixTokenFromCompanyName('Intercontinental Carriers LLC')).toBe(
      'Intercontinental',
    );
  });

  it('buildFmcsaEmployerSearchUrlFromCompanyName uses prefix token', () => {
    const url = buildFmcsaEmployerSearchUrlFromCompanyName('Swift Transportation Inc');
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain("starts_with(upper(legal_name), upper('Swift'))");
  });

  it('buildFmcsaEmployerLikeSearchUrl uses LIKE on sanitized full name', () => {
    const url = buildFmcsaEmployerLikeSearchUrl('Acme Trucking');
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain(
      "like(upper(legal_name), '%' || upper('Acme Trucking') || '%')",
    );
    expect(decoded).toContain(`$select=${FMCSA_SELECT_MINIMAL}`);
  });

  it('mapFmcsaRowToPevContact maps census columns', () => {
    expect(
      mapFmcsaRowToPevContact({
        legal_name: 'X LLC',
        dot_number: '1',
        phy_city: 'Dallas',
        phy_state: 'TX',
        telephone: '214',
        fax: '215',
        email_address: 'x@y.com',
      }),
    ).toMatchObject({
      legalName: 'X LLC',
      dotNumber: '1',
      phyCity: 'Dallas',
      phyState: 'TX',
      phone: '214',
      fax: '215',
      email: 'x@y.com',
    });
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

    it('retries with minimal $select when extended columns are rejected', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('unknown column foo'),
          json: () => Promise.reject(new Error('no json')),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ legal_name: 'OK', dot_number: '1' }]),
        });
      vi.stubGlobal('fetch', fetchMock);

      const rows = await fetchFmcsaEmployerSuggestions('Ab', {
        appToken: 't',
        selectFields: FMCSA_SELECT_EXTENDED,
      });
      expect(rows).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondUrl = fetchMock.mock.calls[1][0];
      const decoded = decodeURIComponent(String(secondUrl)).replace(/\+/g, ' ');
      expect(decoded).toContain('$select=');
      expect(decoded).toContain('dot_number,legal_name,phy_street,phy_city,phy_state');
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

  describe('fetchFmcsaCarrierCandidatesForPev', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns empty without app token', async () => {
      const spy = vi.spyOn(globalThis, 'fetch');
      const rows = await fetchFmcsaCarrierCandidatesForPev('Swift Trucking', {});
      expect(rows).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('uses LIKE fallback when prefix search returns no rows', async () => {
      const fetchMock = vi.fn((url) => {
        const u = String(url);
        const decoded = decodeURIComponent(u).replace(/\+/g, ' ');
        if (decoded.includes('starts_with')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (decoded.includes('like(') && decoded.includes('legal_name')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { dot_number: '99', legal_name: 'Swift Express', phy_city: 'Austin', phy_state: 'TX' },
              ]),
          });
        }
        return Promise.reject(new Error(`unexpected url ${u}`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const rows = await fetchFmcsaCarrierCandidatesForPev('Swift Express LLC', {
        appToken: 'tok',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].legal_name).toBe('Swift Express');
      expect(fetchMock.mock.calls.length).toBe(2);
    });

    it('does not call LIKE when prefix search returns rows', async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([{ dot_number: '1', legal_name: 'Swift', phy_city: 'X', phy_state: 'TX' }]),
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const rows = await fetchFmcsaCarrierCandidatesForPev('Swift Trans', { appToken: 'tok' });
      expect(rows).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('starts_with');
    });
  });
});
