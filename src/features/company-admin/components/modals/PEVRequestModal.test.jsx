import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PEVRequestModal } from './PEVRequestModal';

describe('PEVRequestModal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SOCRATA_APP_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
      ),
    );
  });

  afterEach(async () => {
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const baseEmployer = {
    companyName: 'Swift Transportation',
    companyEmail: '',
    email: '',
    fax: '',
    phone: '',
  };

  it('hides FMCSA registry section when no Socrata token', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_SOCRATA_APP_TOKEN', '');
    render(
      <PEVRequestModal
        employer={baseEmployer}
        applicant={{}}
        onClose={() => {}}
        onProceed={() => {}}
      />,
    );
    expect(screen.queryByText(/FMCSA company match/i)).not.toBeInTheDocument();
  });

  it('shows Missing Info on email delivery when no address on file', async () => {
    render(
      <PEVRequestModal
        employer={baseEmployer}
        applicant={{}}
        onClose={() => {}}
        onProceed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(screen.getAllByText(/Missing Info/i).length).toBeGreaterThanOrEqual(1);
  });

  it('fetches FMCSA candidates and fills contact fields when a row is chosen', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              dot_number: '42',
              legal_name: 'Swift LLC',
              phy_city: 'Phoenix',
              phy_state: 'AZ',
              email_address: 'hr@swift.test',
              fax: '4805551212',
              telephone: '4805550100',
            },
          ]),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PEVRequestModal
        employer={baseEmployer}
        applicant={{}}
        onClose={() => {}}
        onProceed={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Swift LLC/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('az4n-8mr2');

    fireEvent.click(screen.getByRole('button', { name: /Swift LLC/i }));

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText('hr@company.com');
      expect(emailInput.value).toBe('hr@swift.test');
    });
  });

  it('prefers companyEmail over legacy email when seeding contact info', async () => {
    render(
      <PEVRequestModal
        employer={{
          ...baseEmployer,
          companyEmail: 'ops@carrier.test',
          email: 'legacy@old.test',
        }}
        applicant={{}}
        onClose={() => {}}
        onProceed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const emailInput = screen.getByPlaceholderText('hr@company.com');
    expect(emailInput.value).toBe('ops@carrier.test');
  });
});
