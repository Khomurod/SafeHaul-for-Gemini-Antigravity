// Focused coverage for the Documents Center Templates panel. Every fixture is
// artificial: no real template, recipient, document or signing information
// appears here, and nothing is snapshotted.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplatesPanel } from './TemplatesPanel';

const TEMPLATE_A = { id: 'tpl-a', title: 'Artificial Offer Letter', fields: [{ id: 'f1' }, { id: 'f2' }] };
const TEMPLATE_B = { id: 'tpl-b', title: 'Artificial Policy Acknowledgement', fields: [{ id: 'f1' }] };
const TEMPLATE_C = { id: 'tpl-c', title: 'Artificial Equipment Checklist' };

let handlers;

function renderPanel(overrides = {}) {
    const props = {
        templates: [TEMPLATE_A, TEMPLATE_B, TEMPLATE_C],
        templatesLoading: false,
        postSubmitTemplateIds: [],
        savingPostSubmitTemplates: false,
        ...handlers,
        ...overrides,
    };
    return { ...render(<TemplatesPanel {...props} />), props };
}

beforeEach(() => {
    handlers = {
        togglePostSubmitRequired: vi.fn(),
        handleSavePostSubmitTemplates: vi.fn(),
        movePostSubmitTemplate: vi.fn(),
        isTemplateEnabledPostSubmit: vi.fn(() => false),
        togglePostSubmitTemplate: vi.fn(),
        handleUseTemplate: vi.fn(),
        handleEditTemplate: vi.fn(),
        handleDeleteTemplate: vi.fn(),
    };
});

describe('TemplatesPanel — post-application forms section', () => {
    it('keeps the exact heading and explanatory copy', () => {
        renderPanel();
        expect(screen.getByRole('heading', { name: 'Post-Application Success Page Forms' })).toBeInTheDocument();
        expect(screen.getByText(/Choose which templates appear right after a driver submits the application/)).toBeInTheDocument();
        expect(screen.getByText(/Untick "Required" to make a form optional/)).toBeInTheDocument();
    });

    it('shows the exact empty message when no forms are enabled', () => {
        renderPanel({ postSubmitTemplateIds: [] });
        expect(screen.getByText('No follow-up forms enabled yet.')).toBeInTheDocument();
    });

    it('calls handleSavePostSubmitTemplates from Save Forms', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: /Save Forms/ }));
        expect(handlers.handleSavePostSubmitTemplates).toHaveBeenCalledTimes(1);
    });

    it('disables and announces Save Forms while saving', () => {
        renderPanel({ savingPostSubmitTemplates: true });
        const save = screen.getByRole('button', { name: /Save Forms/ });
        expect(save).toBeDisabled();
        expect(save).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByText('Saving post-application forms…')).toBeInTheDocument();
    });

    it('leaves Save Forms enabled when not saving', () => {
        renderPanel({ savingPostSubmitTemplates: false });
        expect(screen.getByRole('button', { name: /Save Forms/ })).toBeEnabled();
    });

    it('treats a template with no recorded requirement as required by default', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        expect(screen.getByRole('checkbox', { name: /Required for Artificial Offer Letter/ })).toBeChecked();
    });

    it('honours an explicit optional state', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'], postSubmitRequiredById: { 'tpl-a': false } });
        expect(screen.getByRole('checkbox', { name: /Required for Artificial Offer Letter/ })).not.toBeChecked();
    });

    it('treats any non-false value as required', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'], postSubmitRequiredById: { 'tpl-a': true } });
        expect(screen.getByRole('checkbox', { name: /Required for Artificial Offer Letter/ })).toBeChecked();
    });

    it('toggles required with the exact template id', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b'] });
        fireEvent.click(screen.getByRole('checkbox', { name: /Required for Artificial Policy Acknowledgement/ }));
        expect(handlers.togglePostSubmitRequired).toHaveBeenCalledTimes(1);
        expect(handlers.togglePostSubmitRequired).toHaveBeenCalledWith('tpl-b');
    });

    it('does not throw when togglePostSubmitRequired is not supplied', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'], togglePostSubmitRequired: undefined });
        expect(() => fireEvent.click(screen.getByRole('checkbox', { name: /Required for/ }))).not.toThrow();
    });

    it('skips ids whose template is missing', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-missing'] });
        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent('Artificial Offer Letter');
        expect(screen.getAllByRole('checkbox', { name: /Required for/ })).toHaveLength(1);
    });

    it('renders enabled forms in the postSubmitTemplateIds order', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-b', 'tpl-a'] });
        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Artificial Policy Acknowledgement');
        expect(rows[1]).toHaveTextContent('Artificial Offer Letter');
    });

    it('falls back to Complete Form for an untitled enabled form', () => {
        renderPanel({
            templates: [{ id: 'tpl-x', fields: [] }],
            postSubmitTemplateIds: ['tpl-x'],
        });
        expect(screen.getByRole('checkbox', { name: /Required for Complete Form/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Move Complete Form up' })).toBeInTheDocument();
    });

    it('names the move controls with the template title and passes the direction', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b'] });

        fireEvent.click(screen.getByRole('button', { name: 'Move Artificial Policy Acknowledgement up' }));
        expect(handlers.movePostSubmitTemplate).toHaveBeenCalledWith('tpl-b', 'up');

        fireEvent.click(screen.getByRole('button', { name: 'Move Artificial Offer Letter down' }));
        expect(handlers.movePostSubmitTemplate).toHaveBeenCalledWith('tpl-a', 'down');
    });

    it('disables move-up on the first row and move-down on the last row', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b', 'tpl-c'] });

        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter up' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter down' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Policy Acknowledgement up' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Policy Acknowledgement down' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Equipment Checklist up' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Equipment Checklist down' })).toBeDisabled();
    });

    it('explains a disabled ordering control through its tooltip', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b'] });
        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter up' }))
            .toHaveAttribute('title', 'Artificial Offer Letter is already first');
        expect(screen.getByRole('button', { name: 'Move Artificial Policy Acknowledgement down' }))
            .toHaveAttribute('title', 'Artificial Policy Acknowledgement is already last');
    });

    it('keeps the single-row form both first and last', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter up' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter down' })).toBeDisabled();
    });
});

describe('TemplatesPanel — template collection', () => {
    it('announces the loading state instead of an empty grid', () => {
        renderPanel({ templatesLoading: true, templates: [] });
        expect(screen.getByText('Loading templates').closest('[role="status"]')).toBeInTheDocument();
        expect(screen.queryByText('No templates saved yet.')).not.toBeInTheDocument();
    });

    it('prefers the loading state over rendering stale templates', () => {
        renderPanel({ templatesLoading: true });
        expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
    });

    it('shows the exact empty message when there are no templates', () => {
        renderPanel({ templates: [], templatesLoading: false, postSubmitTemplateIds: [] });
        expect(screen.getByText('No templates saved yet.')).toBeInTheDocument();
    });

    it('renders templates in the supplied array order', () => {
        renderPanel();
        const titles = screen.getAllByRole('heading', { level: 3 })
            .map((node) => node.textContent)
            .filter((text) => text !== 'Post-Application Success Page Forms');
        expect(titles).toEqual([
            'Artificial Offer Letter',
            'Artificial Policy Acknowledgement',
            'Artificial Equipment Checklist',
        ]);
    });

    it('shows the field count, defaulting to zero without a fields array', () => {
        renderPanel();
        expect(screen.getByText('2 Fields')).toBeInTheDocument();
        expect(screen.getByText('1 Fields')).toBeInTheDocument();
        expect(screen.getByText('0 Fields')).toBeInTheDocument();
    });

    it('deletes with the exact template id from a keyboard-reachable control', () => {
        renderPanel();
        const del = screen.getByRole('button', { name: 'Delete Artificial Policy Acknowledgement' });
        expect(del).toBeEnabled();
        del.focus();
        expect(del).toHaveFocus();
        fireEvent.click(del);
        expect(handlers.handleDeleteTemplate).toHaveBeenCalledTimes(1);
        expect(handlers.handleDeleteTemplate).toHaveBeenCalledWith('tpl-b');
    });

    it('reflects the post-submit enabled value per template and toggles by id', () => {
        handlers.isTemplateEnabledPostSubmit = vi.fn((id) => id === 'tpl-b');
        renderPanel();

        const checkboxes = screen.getAllByRole('checkbox', { name: /Show on post-submit success page/ });
        expect(checkboxes).toHaveLength(3);
        expect(checkboxes[0]).not.toBeChecked();
        expect(checkboxes[1]).toBeChecked();

        fireEvent.click(checkboxes[2]);
        expect(handlers.togglePostSubmitTemplate).toHaveBeenCalledTimes(1);
        expect(handlers.togglePostSubmitTemplate).toHaveBeenCalledWith('tpl-c');
    });

    it('passes the whole template object to Use and Edit', () => {
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Use Artificial Offer Letter' }));
        expect(handlers.handleUseTemplate).toHaveBeenCalledWith(TEMPLATE_A);

        fireEvent.click(screen.getByRole('button', { name: 'Edit Artificial Equipment Checklist' }));
        expect(handlers.handleEditTemplate).toHaveBeenCalledWith(TEMPLATE_C);
    });

    it('keeps Use and Edit visible as text with unique accessible names', () => {
        renderPanel();
        const use = screen.getByRole('button', { name: 'Use Artificial Offer Letter' });
        const edit = screen.getByRole('button', { name: 'Edit Artificial Offer Letter' });
        expect(use).toHaveTextContent('Use');
        expect(edit).toHaveTextContent('Edit');
        // Every card action is uniquely addressable.
        expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(3);
    });

    it('activates a card action from the keyboard', () => {
        renderPanel();
        const use = screen.getByRole('button', { name: 'Use Artificial Policy Acknowledgement' });
        use.focus();
        expect(use).toHaveFocus();
        fireEvent.click(use); // Enter/Space on a native button dispatches click
        expect(handlers.handleUseTemplate).toHaveBeenCalledWith(TEMPLATE_B);
    });
});

describe('TemplatesPanel — presentation and accessibility', () => {
    it('uses approved primitives for the actions', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        expect(screen.getByRole('button', { name: /Save Forms/ })).toHaveClass('ds-button');
        expect(screen.getByRole('button', { name: 'Move Artificial Offer Letter down' })).toHaveClass('ds-icon-button');
        expect(screen.getByRole('button', { name: 'Delete Artificial Offer Letter' })).toHaveClass('ds-icon-button');
        expect(screen.getByRole('button', { name: 'Use Artificial Offer Letter' })).toHaveAttribute('data-variant', 'primary');
    });

    it('uses no unsupported 9px or 10px interface text and no raw hex colours', () => {
        const { container } = renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b'] });
        expect(container.innerHTML).not.toMatch(/text-\[9px\]|text-\[10px\]/);
        expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it('drops the legacy hard-coded colour classes', () => {
        const { container } = renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        expect(container.innerHTML).not.toMatch(/bg-purple-600|text-purple-600|bg-blue-600|text-blue-900|text-gray-400/);
    });

    it('labels both native checkboxes programmatically', () => {
        renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        for (const checkbox of screen.getAllByRole('checkbox')) {
            expect(checkbox).toHaveAccessibleName();
        }
    });

    it('keeps checkbox rows at a 44px activation height with no nested controls', () => {
        const { container } = renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        const labels = Array.from(container.querySelectorAll('label'));
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            expect(label.className).toContain('min-h-11');
            expect(within(label).queryByRole('button')).toBeNull();
        }
    });

    it('lets long titles wrap instead of forcing horizontal overflow', () => {
        const longTitle = 'Artificial '.repeat(12).trim();
        const { container } = renderPanel({
            templates: [{ id: 'tpl-long', title: longTitle, fields: [] }],
            postSubmitTemplateIds: ['tpl-long'],
        });
        const rowTitle = container.querySelector('li span');
        expect(rowTitle.className).toContain('overflow-wrap:anywhere');
        const cardTitle = screen.getByRole('heading', { level: 3, name: longTitle });
        expect(cardTitle.className).toContain('overflow-wrap:anywhere');
        // The control names stay intact next to the long title.
        expect(screen.getByRole('button', { name: `Move ${longTitle} up` })).toBeInTheDocument();
    });

    it('wraps the post-application row controls rather than overlapping them', () => {
        const { container } = renderPanel({ postSubmitTemplateIds: ['tpl-a'] });
        const row = container.querySelector('li');
        expect(row.className).toContain('flex-wrap');
    });

    it('has no accessibility violations across loading, empty and populated states', async () => {
        const populated = renderPanel({ postSubmitTemplateIds: ['tpl-a', 'tpl-b'] });
        expect((await axe(populated.container)).violations).toEqual([]);
        populated.unmount();

        const empty = renderPanel({ templates: [], postSubmitTemplateIds: [] });
        expect((await axe(empty.container)).violations).toEqual([]);
        empty.unmount();

        const loading = renderPanel({ templatesLoading: true, templates: [] });
        expect((await axe(loading.container)).violations).toEqual([]);
    });
});
