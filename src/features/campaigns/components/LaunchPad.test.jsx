import { render, screen, fireEvent } from '@testing-library/react';
import { LaunchPad } from './LaunchPad';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('@lib/firebase', () => ({
    functions: {},
    db: {}
}));
vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn(),
}));

// Mock useToast
vi.mock('@shared/components/feedback/ToastProvider', () => ({
    useToast: () => ({
        showSuccess: vi.fn(),
        showError: vi.fn()
    })
}));

describe('LaunchPad', () => {
    beforeEach(() => {
        vi.mocked(httpsCallable).mockReturnValue(
            vi.fn().mockResolvedValue({ data: { success: true, targetCount: 10, sessionId: 'abc' } })
        );
    });

    const mockCampaign = {
        name: 'Test Campaign',
        matchCount: 10,
        filters: { status: ['new'] },
        messageConfig: { message: 'Hi' }
    };

    it('requires confirmation before launching', async () => {
        const initBulkSession = vi.fn().mockResolvedValue({ data: { success: true, targetCount: 5, sessionId: 'sess1' } });
        vi.mocked(httpsCallable).mockReturnValue(initBulkSession);

        render(
            <BrowserRouter>
                <LaunchPad companyId="123" campaign={mockCampaign} />
            </BrowserRouter>
        );

        fireEvent.click(screen.getByText('Launch Immediately'));
        expect(screen.getByText('Confirm campaign launch')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Confirm Launch'));
        expect(initBulkSession).toHaveBeenCalledTimes(1);
    });

    it('renders launch immediately button', () => {
        render(
            <BrowserRouter>
                <LaunchPad companyId="123" campaign={mockCampaign} />
            </BrowserRouter>
        );

        expect(screen.getByText('Launch Immediately')).toBeInTheDocument();
        // Ensure schedule input is NOT present
        expect(screen.queryByLabelText(/Schedule/i)).not.toBeInTheDocument();
    });
});
