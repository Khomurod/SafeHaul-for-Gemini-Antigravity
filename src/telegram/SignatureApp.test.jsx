import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignatureApp from './SignatureApp';

vi.mock('@lib/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock('@lib/signature', () => ({
  clearCanvas: vi.fn(),
  getSignatureDataUrl: vi.fn(() => 'data:image/png;base64,' + 'A'.repeat(120)),
  initializeSignatureCanvas: vi.fn(),
}));

vi.mock('@lib/runtime/e2eMode', () => ({
  isE2ETestMode: true,
  getE2EQueryParam: vi.fn((name, fallback) => {
    if (name === 'e2eTelegram') return 'mock';
    if (name === 'e2eTelegramSig') return 'mock';
    return fallback;
  }),
}));

describe('Telegram SignatureApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/telegram/sign?token=e2e-token');
    window.Telegram = {
      WebApp: {
        initData: '',
        ready: vi.fn(),
        expand: vi.fn(),
        close: vi.fn(),
      },
    };
  });

  it('renders signature UI and disables submit until signature is saved', async () => {
    render(<SignatureApp />);

    await waitFor(() => {
      expect(screen.getByText(/Sign application/i)).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /Submit signature/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(submit).not.toBeDisabled();
  });

  it('submits in E2E mock mode and shows confirmation', async () => {
    render(<SignatureApp />);

    await waitFor(() => screen.getByText(/Sign application/i));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit signature/i }));

    await waitFor(() => {
      expect(screen.getByText(/Application submitted/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/SAF-2026-E2E01/i)).toBeInTheDocument();
  });
});
