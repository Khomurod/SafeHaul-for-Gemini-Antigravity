import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleSelectionModal } from './RoleSelectionModal';
import { FeatureLockedModal } from './FeatureLockedModal';

afterEach(cleanup);

describe('Modal adoption (C4)', () => {
    it('RoleSelectionModal renders as a labelled dialog and still selects a portal', () => {
        const onSelect = vi.fn();
        render(<RoleSelectionModal onSelect={onSelect} />);
        expect(screen.getByRole('dialog')).toHaveAccessibleName(/welcome back/i);
        fireEvent.click(screen.getByRole('button', { name: /driver portal/i }));
        expect(onSelect).toHaveBeenCalledWith('driver');
    });

    it('RoleSelectionModal is non-dismissable (no Escape close)', () => {
        const onSelect = vi.fn();
        render(<RoleSelectionModal onSelect={onSelect} />);
        // No onClose wired: Escape must not select or remove the dialog.
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('FeatureLockedModal closes on Escape and via the close button', () => {
        const onClose = vi.fn();
        render(<FeatureLockedModal onClose={onClose} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        // Two affordances are labelled "Close" (the X and the footer button).
        fireEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
