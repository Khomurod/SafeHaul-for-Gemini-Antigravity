import { render, screen } from '@testing-library/react';
import { CampaignCard } from './CampaignCard';
import { describe, it, expect } from 'vitest';
import React from 'react';

describe('CampaignCard', () => {
    it('renders progress bar for active campaigns', () => {
        const campaign = {
            id: '1',
            name: 'Test Campaign',
            status: 'active',
            progress: {
                processedCount: 25,
                totalCount: 100,
                failedCount: 2
            },
            messageConfig: { method: 'SMS' }
        };

        render(<CampaignCard campaign={campaign} />);

        expect(screen.getByText('Progress')).toBeInTheDocument();
        expect(screen.getByText('25 / 100')).toBeInTheDocument();
        expect(screen.getByText('2 Failed')).toBeInTheDocument();
    });

    it('renders standard layout for drafts', () => {
        const campaign = {
            id: '2',
            name: 'Draft Campaign',
            status: 'draft',
            matchCount: 50,
            messageConfig: { method: 'Email' }
        };

        render(<CampaignCard campaign={campaign} />);

        expect(screen.getByText('50 leads')).toBeInTheDocument();
        expect(screen.queryByText('Progress')).not.toBeInTheDocument();
    });
});
