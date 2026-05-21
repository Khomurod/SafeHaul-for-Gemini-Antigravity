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
  Document: ({ children }) => <div data-testid="pdf-document">{children}</div>,
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
          { id: 'text1', type: 'text', pageNumber: 1, required: true, x: 10, y: 10, width: 20, height: 5 },
          { id: 'date1', type: 'date', pageNumber: 1, required: true, x: 10, y: 20, width: 20, height: 5 },
          {
            id: 'check1',
            type: 'checkbox',
            pageNumber: 1,
            required: true,
            x: 10,
            y: 30,
            width: 10,
            height: 5,
          },
          {
            id: 'sig1',
            type: 'signature',
            pageNumber: 1,
            required: true,
            x: 10,
            y: 40,
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
