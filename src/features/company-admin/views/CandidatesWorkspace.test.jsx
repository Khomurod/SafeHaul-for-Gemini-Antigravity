import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the two heavy child pages so the test focuses on toggle/URL behaviour.
vi.mock('./CompanyCandidatesListPage', () => ({
    CompanyCandidatesListPage: ({ scope }) => <div data-testid="list-view">list:{scope}</div>,
}));
vi.mock('./PipelineSheetPage', () => ({
    PipelineSheetPage: () => <div data-testid="sheet-view">sheet</div>,
}));

import { CandidatesWorkspace } from './CandidatesWorkspace';

afterEach(cleanup);

const renderAt = (entries, props = {}) =>
    render(
        <MemoryRouter initialEntries={entries}>
            <CandidatesWorkspace {...props} />
        </MemoryRouter>,
    );

describe('CandidatesWorkspace (List <-> Sheet toggle)', () => {
    it('renders List by default and passes the scope through', () => {
        renderAt(['/'], { scope: 'company_leads' });
        expect(screen.getByTestId('list-view')).toHaveTextContent('list:company_leads');
        expect(screen.queryByTestId('sheet-view')).toBeNull();
    });

    it('honors ?view=sheet from the URL', () => {
        renderAt(['/?view=sheet'], { scope: 'applications' });
        expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
        expect(screen.queryByTestId('list-view')).toBeNull();
    });

    it('honors defaultView=sheet (legacy /drivers/pipeline deep link)', () => {
        renderAt(['/'], { defaultView: 'sheet' });
        expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
    });

    it('switches to Sheet when the Sheet tab is clicked', () => {
        renderAt(['/'], { scope: 'applications' });
        fireEvent.click(screen.getByRole('tab', { name: /sheet/i }));
        expect(screen.getByTestId('sheet-view')).toBeInTheDocument();
        expect(screen.queryByTestId('list-view')).toBeNull();
    });

    it('exposes accessible tablist semantics with the active tab selected', () => {
        renderAt(['/'], {});
        expect(screen.getByRole('tablist', { name: /candidate view mode/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /list/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /sheet/i })).toHaveAttribute('aria-selected', 'false');
    });
});
