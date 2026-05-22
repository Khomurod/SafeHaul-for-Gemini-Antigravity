import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const getEnvelopeFn = vi.fn();

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => getEnvelopeFn),
}));

vi.mock('@lib/firebase', () => ({
  functions: {},
}));

vi.mock('react-pdf', () => ({
  Document: ({ children, onLoadSuccess }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ numPages: 1 });
    }, [onLoadSuccess]);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: () => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

vi.mock('@lib/signature', () => ({
  initializeSignatureCanvas: vi.fn(),
  clearCanvas: vi.fn(),
  isCanvasEmpty: vi.fn(() => false),
  getSignatureDataUrl: vi.fn(() => 'data:image/png;base64,sig'),
}));

vi.mock('@lib/runtime/e2eMode', () => ({
  isE2ETestMode: false,
  getE2EQueryParam: vi.fn(() => ''),
}));

import SigningRoom from './SigningRoom';

function renderRoom(token = 'valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/sign/co1/req1?token=${token}`]}>
      <Routes>
        <Route path="/sign/:companyId/:requestId" element={<SigningRoom />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SigningRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvelopeFn.mockResolvedValue({
      data: {
        title: 'Employment Agreement',
        recipientName: 'Test Signer',
        status: 'sent',
        pdfUrl: 'https://example.com/doc.pdf',
        fields: [
          { id: 'text1', type: 'text', pageNumber: 1, required: true, xPosition: 10, yPosition: 10, width: 20, height: 5 },
          { id: 'date1', type: 'date', pageNumber: 1, required: true, xPosition: 10, yPosition: 20, width: 20, height: 5 },
          {
            id: 'check1',
            type: 'checkbox',
            pageNumber: 1,
            required: true,
            xPosition: 10,
            yPosition: 30,
            width: 4,
            height: 3,
          },
          {
            id: 'sig1',
            type: 'signature',
            pageNumber: 1,
            required: true,
            xPosition: 10,
            yPosition: 40,
            width: 20,
            height: 8,
          },
        ],
      },
    });
  });

  it('loads envelope and blocks submit until e-sign consent', async () => {
    renderRoom();
    await waitFor(() => {
      expect(screen.getByText('Employment Agreement')).toBeInTheDocument();
    });
    expect(screen.getByText(/Electronic Records and Signatures/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finish & Submit/i })).not.toBeInTheDocument();
  });

  it('renders field types after consent and requires completion', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Employment Agreement')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /I Agree - Proceed to Sign/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Finish & Submit/i })).toBeInTheDocument();
    });
    expect(getEnvelopeFn).toHaveBeenCalledWith({
      companyId: 'co1',
      requestId: 'req1',
      accessToken: 'valid-token',
    });
  });

  it('field overlays use stored percent dimensions without 44px layout minimum', async () => {
    const { container } = renderRoom();
    await waitFor(() => expect(screen.getByText('Employment Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /I Agree - Proceed to Sign/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId('field-overlay').length).toBeGreaterThan(0);
    });

    const checkboxOverlay = container.querySelector('[data-field-id="check1"]');
    expect(checkboxOverlay).toBeTruthy();
    expect(checkboxOverlay.style.width).toBe('4%');
    expect(checkboxOverlay.style.height).toBe('3%');
    expect(checkboxOverlay.style.minWidth).toBe('');
    expect(checkboxOverlay.style.minHeight).toBe('');
  });

  it('normalizes legacy x/y coordinates from API into positioned overlays', async () => {
    getEnvelopeFn.mockResolvedValueOnce({
      data: {
        title: 'Legacy Coords',
        recipientName: 'Test Signer',
        status: 'sent',
        pdfUrl: 'https://example.com/doc.pdf',
        fields: [
          { id: 'legacy1', type: 'text', pageNumber: 1, required: false, x: 15, y: 25, width: 20, height: 5 },
        ],
      },
    });
    const { container } = renderRoom();
    await waitFor(() => expect(screen.getByText('Legacy Coords')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /I Agree - Proceed to Sign/i }));

    await waitFor(() => {
      const overlay = container.querySelector('[data-field-id="legacy1"]');
      expect(overlay).toBeTruthy();
      expect(overlay.style.left).toBe('15%');
      expect(overlay.style.top).toBe('25%');
    });
  });

  it('shows error when access token is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/sign/co1/req1']}>
        <Routes>
          <Route path="/sign/:companyId/:requestId" element={<SigningRoom />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Invalid Link/i)).toBeInTheDocument();
    });
  });
});
