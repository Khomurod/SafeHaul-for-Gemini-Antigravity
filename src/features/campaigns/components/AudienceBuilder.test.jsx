import { render, screen, fireEvent } from '@testing-library/react';
import { AudienceBuilder } from './AudienceBuilder';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Mocks
vi.mock('@/shared/hooks/useCompanyTeam', () => ({
    useCompanyTeam: () => ({
        team: [
            { id: 'recruiter1', name: 'John Doe' },
            { id: 'recruiter2', name: 'Jane Smith' }
        ],
        isLoading: false
    })
}));

vi.mock('@/context/DataContext', () => ({
    useData: () => ({ currentUser: { uid: 'user1' } })
}));

const mockSetFilters = vi.fn();

vi.mock('../hooks/useCampaignTargeting', () => ({
    useCampaignTargeting: () => ({
        // matchCount is used by the component
        matchCount: 10,
        isLoading: false,
        // These are not directly used by AudienceBuilder anymore but good to keep if needed
        previewLeads: [],
        previewError: null,
        setFilters: mockSetFilters
    })
}));

// Mock VirtualLeadList to render the leads that the test expects
vi.mock('./VirtualLeadList', () => ({
    default: ({ onToggleExclusion, excludedIds }) => (
        <div data-testid="virtual-list">
            <div className="lead-row">
                <span>Alice Driver</span>
                <input
                    type="checkbox"
                    checked={!excludedIds?.includes('lead1')}
                    onChange={() => onToggleExclusion('lead1')}
                    aria-label="Include Alice Driver"
                />
            </div>
            <div className="lead-row">
                <span>Bob Trucker</span>
                <input
                    type="checkbox"
                    checked={!excludedIds?.includes('lead2')}
                    onChange={() => onToggleExclusion('lead2')}
                    aria-label="Include Bob Trucker"
                />
            </div>
        </div>
    )
}));

describe('AudienceBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders and handles exclusions', () => {
        const handleChange = vi.fn();
        // Initial filters prop
        const filters = { limit: 100, excludedLeadIds: [] };

        const { rerender } = render(<AudienceBuilder companyId="123" filters={filters} onChange={handleChange} />);

        // Check if leads are displayed (rendered by our mock)
        expect(screen.getByText('Alice Driver')).toBeInTheDocument();
        expect(screen.getByText('Bob Trucker')).toBeInTheDocument();

        // Check initial selection count
        expect(screen.getByText('10')).toBeInTheDocument(); // Match count display
        expect(screen.getByText('recipients')).toBeInTheDocument();

        // Find checkboxes
        const checkboxes = screen.getAllByRole('checkbox');
        // We expect at least 2 for the leads. There might be others in the filter panel.
        // The test specifically targeted the lead checkboxes.
        // Let's filter by the ones we care about or use the ones from our mock.
        // The filter panel has "Exclude Recent" checkbox.

        // Let's interact with the specific checkboxes we created in the mock
        const aliceCheckbox = screen.getByLabelText('Include Alice Driver');
        const bobCheckbox = screen.getByLabelText('Include Bob Trucker');

        // Alice is first. Expect checked (default is include).
        expect(aliceCheckbox).toBeChecked();

        // Uncheck Alice (exclude her)
        fireEvent.click(aliceCheckbox);

        // Expect handleChange to be called with excludedLeadIds containing 'lead1'
        // Note: The component logic handles the toggle.
        expect(handleChange).toHaveBeenCalledWith(
            expect.objectContaining({
                excludedLeadIds: ['lead1']
            }),
            10 // matchCount is 10
        );

        // Simulate parent updating props (as real app would)
        const newFilters = { ...filters, excludedLeadIds: ['lead1'] };
        rerender(<AudienceBuilder companyId="123" filters={newFilters} onChange={handleChange} />);

        // Now Alice should be unchecked
        expect(aliceCheckbox).not.toBeChecked();

        // Bob should still be checked
        expect(bobCheckbox).toBeChecked();

        // Check if "excluded manually" text appears
        expect(screen.getByText('1 manually excluded')).toBeInTheDocument();
    });
});
