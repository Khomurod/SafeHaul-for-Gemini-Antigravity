import { render, screen, fireEvent } from '@testing-library/react';
import { CampaignCard } from './CampaignCard';
import { describe, it, expect, vi } from 'vitest';
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

    it('opens menu and triggers delete', () => {
        const onDelete = vi.fn();
        const campaign = {
            id: '3',
            name: 'Delete Me',
            status: 'draft'
        };

        render(<CampaignCard campaign={campaign} onDelete={onDelete} />);

        // Find menu button (it has MoreVertical icon)
        // Since we don't have aria-labels, we can look for the button containing the icon or by role if unique enough.
        // There are multiple buttons (View Details is text).
        // Let's rely on class or structure if needed, or add aria-label.
        // But for now, let's try to click the button that is likely the menu.
        // The menu button is the one in the top right.

        // Let's add an aria-label to the button in the component to make it easier to find?
        // Or finding by the icon?
        // Actually, let's assume it's the first button? No, let's verify.

        // Easier: add aria-label "Campaign options" to the button in CampaignCard.jsx.
        // But I don't want to modify the file again just for tests if I can avoid it.
        // The button contains `<MoreVertical />`.

        const menuButton = screen.getAllByRole('button')[0]; // It's the first button in the DOM order (top right)
        fireEvent.click(menuButton);

        // Now the menu should be open. Check for "Delete Campaign" text.
        const deleteButton = screen.getByText('Delete Campaign');
        fireEvent.click(deleteButton);

        expect(onDelete).toHaveBeenCalledWith(campaign);
    });

    it.each(['active', 'queued', 'scheduled', 'paused'])(
        'offers Cancel (not Delete) for a live %s session',
        (status) => {
            const onCancel = vi.fn();
            const onDelete = vi.fn();
            const campaign = { id: '4', name: 'Live', status };

            render(<CampaignCard campaign={campaign} onCancel={onCancel} onDelete={onDelete} />);
            fireEvent.click(screen.getAllByRole('button')[0]);

            expect(screen.queryByText('Delete Campaign')).not.toBeInTheDocument();
            fireEvent.click(screen.getByText('Cancel Campaign'));
            expect(onCancel).toHaveBeenCalledWith(campaign);
            expect(onDelete).not.toHaveBeenCalled();
        },
    );

    it('offers Delete for a terminal session even when onCancel is wired', () => {
        const onCancel = vi.fn();
        const onDelete = vi.fn();
        const campaign = { id: '5', name: 'Done', status: 'completed' };

        render(<CampaignCard campaign={campaign} onCancel={onCancel} onDelete={onDelete} />);
        fireEvent.click(screen.getAllByRole('button')[0]);

        expect(screen.queryByText('Cancel Campaign')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Delete Campaign'));
        expect(onDelete).toHaveBeenCalledWith(campaign);
        expect(onCancel).not.toHaveBeenCalled();
    });
});
