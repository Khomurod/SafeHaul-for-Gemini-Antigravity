import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

const mockCallable = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: (_f, name) => (...a) => mockCallable(name, ...a) }));
vi.mock('@lib/firebase', () => ({ functions: {} }));
vi.mock('@lib/runtime/e2eMode', () => ({ isE2ETestMode: false, getE2EQueryParam: () => '' }));

import { ReviewChangePortal } from './ReviewChangePortal';

const REVIEW = {
    data: {
        applicantName: 'John Doe',
        status: 'open',
        changes: [
            { fieldKey: 'firstName', fieldLabel: 'First Name', originalValue: 'John', proposedValue: 'Jonathan', status: 'pending' },
            { fieldKey: 'city', fieldLabel: 'City', originalValue: 'Reno', proposedValue: 'Sparks', status: 'pending' },
        ],
    },
};

function renderPortal() {
    return render(
        <MemoryRouter initialEntries={['/review-change/tok-1']}>
            <Routes>
                <Route path="/review-change/:token" element={<ReviewChangePortal />} />
            </Routes>
        </MemoryRouter>,
    );
}

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mockCallable.mockImplementation((name) => {
        if (name === 'getChangeReview') return Promise.resolve(REVIEW);
        return Promise.resolve({ data: { success: true, completed: true } });
    });
});

describe('ReviewChangePortal', () => {
    it('loads the review and shows before → after for each change', async () => {
        renderPortal();
        await waitFor(() => expect(screen.getByText('First Name')).toBeInTheDocument());
        expect(screen.getByText('Jonathan')).toBeInTheDocument();
        expect(screen.getByText('Sparks')).toBeInTheDocument();
        expect(mockCallable).toHaveBeenCalledWith('getChangeReview', { token: 'tok-1' });
    });

    it('submits per-field resolutions (approve default, reject, edit-final)', async () => {
        renderPortal();
        await waitFor(() => screen.getByText('First Name'));

        // firstName: switch to Edit and type a driver value
        const firstNameGroup = screen.getByRole('group', { name: /First Name/i });
        fireEvent.click(within(firstNameGroup).getByRole('button', { name: /edit/i }));
        fireEvent.change(screen.getByLabelText(/Corrected value for First Name/i), { target: { value: 'Johnny' } });

        // city: reject (firstName edit, city reject; defaults were approve)
        const cityGroup = screen.getByRole('group', { name: /City/i });
        fireEvent.click(within(cityGroup).getByRole('button', { name: /reject/i }));

        fireEvent.click(screen.getByRole('button', { name: /Submit my responses/i }));

        await waitFor(() => expect(mockCallable).toHaveBeenCalledWith('submitChangeResolution', {
            token: 'tok-1',
            resolutions: [
                { fieldKey: 'firstName', action: 'edit', value: 'Johnny' },
                { fieldKey: 'city', action: 'reject' },
            ],
        }));
        await waitFor(() => expect(screen.getByText(/Thank you/i)).toBeInTheDocument());
    });

    it('shows an error for an invalid/expired link', async () => {
        mockCallable.mockImplementationOnce(() => Promise.reject(new Error('This review link has expired.')));
        renderPortal();
        await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    });
});
