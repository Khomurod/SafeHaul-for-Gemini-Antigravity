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
let mockCsvData = [];

vi.mock('../hooks/useCampaignTargeting', () => ({
    useCampaignTargeting: () => ({
        matchCount: 10,
        isLoading: false,
        excludedPhones: new Set(),
    })
}));

vi.mock('@/shared/hooks/useBulkImport', () => ({
    useBulkImport: () => ({
        csvData: mockCsvData,
        processingSheet: false,
        handleFileChange: vi.fn(),
        handleSheetImport: vi.fn(),
        sheetUrl: '',
        setSheetUrl: vi.fn(),
        reset: vi.fn(),
    })
}));

vi.mock('./VirtualLeadList', () => ({
    default: ({ filters, excludedIds, onToggleExclusion }) => (
        <div data-testid="virtual-lead-list">
            <label>
                <input
                    type="checkbox"
                    checked={!excludedIds?.includes('lead1')}
                    onChange={() => onToggleExclusion('lead1')}
                />
                Alice Driver
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={!excludedIds?.includes('lead2')}
                    onChange={() => onToggleExclusion('lead2')}
                />
                Bob Trucker
            </label>
        </div>
    )
}));

describe('AudienceBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCsvData = [];
    });

    it('renders and handles exclusions', () => {
        const handleChange = vi.fn();
        // Initial filters prop
        const filters = { limit: 100, excludedLeadIds: [] };

        const { rerender } = render(<AudienceBuilder companyId="123" filters={filters} onChange={handleChange} />);

        // Check if leads are displayed
        expect(screen.getByText('Alice Driver')).toBeInTheDocument();
        expect(screen.getByText('Bob Trucker')).toBeInTheDocument();

        // Check initial selection count
        expect(screen.getByText('10')).toBeInTheDocument(); // Match count display

        // Find checkboxes
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);

        // Alice is first. Expect checked.
        expect(checkboxes[0]).toBeChecked();

        // Uncheck Alice
        fireEvent.click(checkboxes[0]);

        // Expect handleChange to be called with excludedLeadIds containing 'lead1'
        expect(handleChange).toHaveBeenCalledWith(
            expect.objectContaining({
                excludedLeadIds: ['lead1']
            }),
            10
        );

        // Simulate parent updating props (as real app would)
        const newFilters = { ...filters, excludedLeadIds: ['lead1'] };
        rerender(<AudienceBuilder companyId="123" filters={newFilters} onChange={handleChange} />);

        // Now Alice should be unchecked
        const newCheckboxes = screen.getAllByRole('checkbox');
        expect(newCheckboxes[0]).not.toBeChecked();

        // Bob should still be checked
        expect(newCheckboxes[1]).toBeChecked();

        // Check if "excluded manually" text appears
        expect(screen.getByText('1 manually excluded')).toBeInTheDocument();
    });

    it('resets manual skips when upload list fingerprint changes', () => {
        mockCsvData = [
            { normalizedPhone: '+15550000001', firstName: 'Alice', lastName: 'One' },
            { normalizedPhone: '+15550000002', firstName: 'Bob', lastName: 'Two' },
        ];
        const handleChange = vi.fn();
        const filters = { leadType: 'import', excludedLeadIds: [] };
        const props = { companyId: '123', filters, onChange: handleChange, campaignScopeKey: 'cmp-a' };

        const { rerender } = render(<AudienceBuilder {...props} />);

        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // exclude lead1

        expect(handleChange).toHaveBeenCalledWith(
            expect.objectContaining({ excludedLeadIds: ['lead1'] }),
            10
        );

        mockCsvData = [
            { normalizedPhone: '+15559999991', firstName: 'Carol', lastName: 'Three' },
            { normalizedPhone: '+15559999992', firstName: 'Dan', lastName: 'Four' },
        ];
        rerender(<AudienceBuilder {...props} />);

        const lastCall = handleChange.mock.calls.at(-1);
        expect(lastCall[0].excludedLeadIds || []).toEqual([]);
    });

    it('resets manual skips when campaign scope changes', () => {
        mockCsvData = [{ normalizedPhone: '+15550000001', firstName: 'Alice' }];
        const handleChange = vi.fn();
        const filters = { leadType: 'import', excludedLeadIds: [] };
        const { rerender } = render(
            <AudienceBuilder
                companyId="123"
                filters={filters}
                onChange={handleChange}
                campaignScopeKey="cmp-a"
            />
        );

        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // exclude lead1
        expect(handleChange).toHaveBeenCalledWith(
            expect.objectContaining({ excludedLeadIds: ['lead1'] }),
            10
        );

        rerender(
            <AudienceBuilder
                companyId="123"
                filters={filters}
                onChange={handleChange}
                campaignScopeKey="cmp-b"
            />
        );

        const lastCall = handleChange.mock.calls.at(-1);
        expect(lastCall[0].excludedLeadIds || []).toEqual([]);
    });

    it('keeps manual skips for normal filter tweaks in same campaign/list', () => {
        mockCsvData = [{ normalizedPhone: '+15550000001', firstName: 'Alice' }];
        const handleChange = vi.fn();
        const filters = { leadType: 'import', excludedLeadIds: [], excludeRecentDays: '7' };

        render(
            <AudienceBuilder
                companyId="123"
                filters={filters}
                onChange={handleChange}
                campaignScopeKey="cmp-a"
            />
        );

        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // exclude lead1

        const excludeSelect = screen.getAllByRole('combobox').at(-1);
        fireEvent.change(excludeSelect, { target: { value: '30' } });

        const lastCall = handleChange.mock.calls.at(-1);
        expect(lastCall[0].excludedLeadIds || []).toEqual(['lead1']);
        expect(lastCall[0].excludeRecentDays).toBe('30');
    });
});
