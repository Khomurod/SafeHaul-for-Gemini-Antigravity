import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@shared/components/feedback';

const getEnvelopeFn = vi.fn();

// Toggled per-test to simulate a page whose canvas never finishes painting
// (slow 3G). vi.hoisted because the mock factory runs before module body.
const pdfMockState = vi.hoisted(() => ({ pageRenderEnabled: true }));

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
  // The unified view gates field interactivity on the page canvas actually
  // painting, so the mock must fire both load + render callbacks.
  Page: ({ onLoadSuccess, onRenderSuccess, pageNumber }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ getViewport: () => ({ width: 850, height: 1100 }) });
      if (pdfMockState.pageRenderEnabled) onRenderSuccess?.();
    }, [onLoadSuccess, onRenderSuccess, pageNumber]);
    return <div data-testid="pdf-page" />;
  },
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

// The drawing pad needs a real 2D canvas context, which happy-dom lacks.
vi.mock('react-signature-canvas', () => ({
  default: React.forwardRef(function MockSignatureCanvas(props, ref) {
    React.useImperativeHandle(ref, () => ({
      clear: vi.fn(),
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,mock-ink',
      getTrimmedCanvas: () => ({ toDataURL: () => 'data:image/png;base64,mock-ink' }),
    }));
    return <canvas data-testid="signature-sheet-canvas" />;
  }),
}));

vi.mock('@lib/runtime/e2eMode', () => ({
  isE2ETestMode: false,
  getE2EQueryParam: vi.fn(() => ''),
}));

// Desktop chrome by default; the document area itself is viewport-agnostic.
vi.mock('@shared/hooks', () => ({
  useIsMobile: () => false,
}));

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* jsdom-only — best effort */
  }
});

import SigningRoom from './SigningRoom';

function renderRoom(token = 'valid-token') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/sign/co1/req1?token=${token}`]}>
        <Routes>
          <Route path="/sign/:companyId/:requestId" element={<SigningRoom />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function renderRoomPastConsent() {
  const utils = renderRoom();
  await waitFor(() => expect(screen.getByText('Employment Agreement')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /I Agree - Proceed to Sign/i }));
  await waitFor(() => {
    expect(utils.container.querySelectorAll('[data-testid="field-overlay"]').length).toBeGreaterThan(0);
  });
  return utils;
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
    const { container } = await renderRoomPastConsent();

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
      <ToastProvider>
        <MemoryRouter initialEntries={['/sign/co1/req1']}>
          <Routes>
            <Route path="/sign/:companyId/:requestId" element={<SigningRoom />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Invalid Link/i)).toBeInTheDocument();
    });
  });

  it('renders the document page at a larger width after zooming in', async () => {
    const { container } = await renderRoomPastConsent();

    const pageEl = container.querySelector('[data-signing-page="1"]');
    expect(pageEl).toBeTruthy();
    const initialWidth = parseInt(pageEl.style.width, 10);
    expect(initialWidth).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Zoom in' })[0]);

    await waitFor(() => {
      const zoomedWidth = parseInt(container.querySelector('[data-signing-page="1"]').style.width, 10);
      expect(zoomedWidth).toBe(Math.round(initialWidth * 1.5));
    });

    // Overlay geometry stays percent-based, so it re-anchors with the page.
    const overlay = container.querySelector('[data-field-id="check1"]');
    expect(overlay.style.width).toBe('4%');
  });

  it('Enter advances focus to the next field in reading order', async () => {
    const { container } = await renderRoomPastConsent();

    const textInput = container.querySelector('[data-signer-input="text1"]');
    const dateInput = container.querySelector('[data-signer-input="date1"]');
    expect(textInput).toBeTruthy();
    expect(dateInput).toBeTruthy();

    textInput.focus();
    fireEvent.keyDown(textInput, { key: 'Enter' });

    await waitFor(() => {
      expect(document.activeElement).toBe(dateInput);
    });
  });

  it('opens the signature sheet on tap and stamps adopted ink onto the field', async () => {
    const { container } = await renderRoomPastConsent();

    fireEvent.click(screen.getByRole('button', { name: /Tap to sign/i }));
    const sheet = await screen.findByRole('dialog', { name: /Draw your signature/i });
    expect(sheet).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Adopt & continue/i }));

    await waitFor(() => {
      const overlay = container.querySelector('[data-field-id="sig1"]');
      const img = overlay.querySelector('img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('data:image/png;base64,mock-ink');
    });
  });

  it('keeps overlays inert until the page canvas has rendered', async () => {
    pdfMockState.pageRenderEnabled = false; // canvas never finishes painting (slow 3G)
    try {
      const { container } = await renderRoomPastConsent();

      // The overlay exists (layout is stable) but its wrapper must block
      // interaction and show the rendering hint until the canvas paints.
      const overlay = container.querySelector('[data-field-id="check1"]');
      expect(overlay).toBeTruthy();
      expect(overlay.closest('.pointer-events-none')).toBeTruthy();
      expect(screen.getByText(/Rendering page 1/i)).toBeInTheDocument();
    } finally {
      pdfMockState.pageRenderEnabled = true;
    }
  });

  it('overlays become interactive once the page canvas paints', async () => {
    const { container } = await renderRoomPastConsent();
    const overlay = container.querySelector('[data-field-id="check1"]');
    expect(overlay.closest('.pointer-events-none')).toBeNull();
    expect(screen.queryByText(/Rendering page 1/i)).not.toBeInTheDocument();
  });
});
