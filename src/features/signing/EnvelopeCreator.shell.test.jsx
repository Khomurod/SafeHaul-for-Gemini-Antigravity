import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sub-slice A covers the EnvelopeCreator *shell* only: the top bar (heading
// matrix, mode toggle, Cancel, Save), the hydrating screen and the layout
// wrapper. The PDF workbench, sidebar and properties panel are out of scope, so
// they are replaced with prop-recording doubles — which also proves the shell
// still hands them exactly the same props.
const sidebarProps = vi.hoisted(() => []);
const workbenchProps = vi.hoisted(() => []);
const panelProps = vi.hoisted(() => []);
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
const fs = vi.hoisted(() => ({ getDoc: vi.fn() }));

vi.mock('@lib/firebase', () => ({
    db: {},
    storage: {},
    auth: { currentUser: { uid: 'user-1', displayName: 'Artificial Sender' } },
}));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
    Timestamp: { fromMillis: vi.fn() }, writeBatch: vi.fn(), doc: vi.fn(),
    getDoc: (...a) => fs.getDoc(...a), updateDoc: vi.fn(),
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('uuid', () => ({ v4: () => 'uuid-fixed' }));
vi.mock('@shared/components/feedback', () => ({
    useToast: () => ({ showSuccess: toast.showSuccess, showError: toast.showError }),
}));

vi.mock('./components/envelope-creator/EnvelopeSidebar', () => ({
    EnvelopeSidebar: (props) => {
        sidebarProps.push(props);
        return (
            <div data-testid="sidebar">
                <button type="button" onClick={() => props.setSelectedFieldId('field-1')}>select field</button>
            </div>
        );
    },
}));
vi.mock('./components/envelope-creator/PdfFieldWorkbench', () => ({
    PdfFieldWorkbench: (props) => {
        workbenchProps.push(props);
        return <div data-testid="workbench" />;
    },
}));
vi.mock('./components/envelope-creator/FieldPropertiesPanel', () => ({
    FieldPropertiesPanel: (props) => {
        panelProps.push(props);
        return <div data-testid="properties-panel" />;
    },
}));

import EnvelopeCreator from './EnvelopeCreator';

const setup = (overrides = {}) => {
    const props = {
        companyId: 'co-1',
        onClose: vi.fn(),
        companyName: 'Artificial Carrier',
        ...overrides,
    };
    return { props, ...render(<EnvelopeCreator {...props} />) };
};

beforeEach(() => {
    vi.clearAllMocks();
    sidebarProps.length = 0;
    workbenchProps.length = 0;
    panelProps.length = 0;
    fs.getDoc.mockResolvedValue({ exists: () => false });
});

describe('EnvelopeCreator shell — heading matrix', () => {
    it.each([
        ['New Envelope', {}],
        ['Create Template', { initialMode: 'template' }],
        ['Correct Document', { editRequestId: 'req-1' }],
        ['Edit Template', { editTemplateId: 'tpl-1' }],
    ])('renders the %s heading', async (heading, overrides) => {
        setup(overrides);
        expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    });
});

describe('EnvelopeCreator shell — mode toggle', () => {
    it('shows the toggle only when creating something new', async () => {
        const { unmount } = setup();
        expect(screen.getByRole('group', { name: 'Creator mode' })).toBeInTheDocument();
        unmount();

        setup({ editRequestId: 'req-1' });
        await screen.findByRole('heading', { name: 'Correct Document' });
        expect(screen.queryByRole('group', { name: 'Creator mode' })).not.toBeInTheDocument();
    });

    it('hides the toggle when editing a template', async () => {
        setup({ editTemplateId: 'tpl-1' });
        await screen.findByRole('heading', { name: 'Edit Template' });
        expect(screen.queryByRole('group', { name: 'Creator mode' })).not.toBeInTheDocument();
    });

    it('exposes the selected mode with aria-pressed and switches both ways', () => {
        setup();
        const group = screen.getByRole('group', { name: 'Creator mode' });
        const oneOff = within(group).getByRole('button', { name: 'One-off Send' });
        const template = within(group).getByRole('button', { name: 'Save Template' });

        expect(oneOff).toHaveAttribute('aria-pressed', 'true');
        expect(template).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(template);
        expect(screen.getByRole('heading', { name: 'Create Template' })).toBeInTheDocument();
        expect(within(group).getByRole('button', { name: 'Save Template' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(within(group).getByRole('button', { name: 'One-off Send' }));
        expect(screen.getByRole('heading', { name: 'New Envelope' })).toBeInTheDocument();
    });

    it('keeps both toggle options keyboard reachable', () => {
        setup();
        const group = screen.getByRole('group', { name: 'Creator mode' });
        within(group).getAllByRole('button').forEach((b) => {
            expect(b.tagName).toBe('BUTTON');
            b.focus();
            expect(b).toHaveFocus();
        });
    });
});

describe('EnvelopeCreator shell — primary actions', () => {
    // In template mode the mode toggle also reads "Save Template", so the save
    // action is resolved as the match outside the "Creator mode" group.
    const findSaveAction = async (label) => {
        await screen.findByRole('heading');
        const matches = screen.getAllByRole('button', { name: label });
        const action = matches.find(b => !b.closest('[role="group"][aria-label="Creator mode"]'));
        expect(action).toBeDefined();
        return action;
    };

    it.each([
        ['Send Document', {}],
        ['Save Template', { initialMode: 'template' }],
        ['Save Correction', { editRequestId: 'req-1' }],
        ['Save Template Changes', { editTemplateId: 'tpl-1' }],
    ])('labels the save action %s', async (label, overrides) => {
        setup(overrides);
        expect(await findSaveAction(label)).toBeInTheDocument();
    });

    it('closes through the exact onClose callback', () => {
        const { props } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the save action wired to handleSave with its validation intact', async () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Send Document' }));
        // No file and no fields — the preserved guard must fire, unchanged.
        await waitFor(() => {
            expect(toast.showError).toHaveBeenCalledWith('Please upload a file and place at least one field.');
        });
    });
});

describe('EnvelopeCreator shell — hydrating state', () => {
    it('announces the hydrating screen and hides the workbench', async () => {
        let resolveDoc;
        fs.getDoc.mockReturnValue(new Promise((r) => { resolveDoc = r; }));
        setup({ editRequestId: 'req-1' });

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Loading document for editing...');
        expect(screen.queryByTestId('workbench')).not.toBeInTheDocument();

        await React.act(async () => { resolveDoc({ exists: () => false }); });
    });
});

describe('EnvelopeCreator shell — layout and child contracts', () => {
    it('collapses the properties rail until a field is selected', () => {
        // The rail became responsive in the sub-slice F close-out: it collapses to
        // `md:w-0` and is `hidden` below the breakpoint (where a 320px column had
        // nowhere to go and was clipped off-screen), and when a field is selected
        // it is a full-width sheet below `md` and the original `md:w-80` column
        // above it. The behaviour asserted here is unchanged.
        const { container } = setup();
        const collapsed = container.querySelector('.overflow-y-auto');
        expect(collapsed.className).toContain('md:w-0');
        expect(collapsed.className).toContain('hidden');
        expect(screen.queryByTestId('properties-panel')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'select field' }));
        const rail = container.querySelector('.overflow-y-auto.border-l');
        expect(rail.className).toContain('md:w-80');
        expect(rail).toHaveAccessibleName('Field properties');
        expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
    });

    it('offers a dismiss control only in the mobile sheet presentation', () => {
        const { container } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'select field' }));

        const close = screen.getByRole('button', { name: 'Close field properties' });
        // Present in the DOM but scoped to below the md breakpoint, because on
        // mobile the sheet covers the canvas that would otherwise deselect.
        expect(close.closest('div').className).toContain('md:hidden');

        fireEvent.click(close);
        expect(screen.queryByTestId('properties-panel')).not.toBeInTheDocument();
        expect(container.querySelector('.overflow-y-auto').className).toContain('hidden');
    });

    it('passes the frozen prop sets to the sidebar and workbench', () => {
        setup();

        const sidebar = sidebarProps.at(-1);
        [
            'creatorMode', 'isEditingTemplate', 'recipientName', 'setRecipientName',
            'recipientEmail', 'setRecipientEmail', 'recipientPhone', 'setRecipientPhone',
            'deliveryMethod', 'setDeliveryMethod', 'file', 'handleFileChange', 'addField',
            'fields', 'selectedFieldId', 'setSelectedFieldId', 'removeField', 'getIcon',
        ].forEach((key) => expect(sidebar).toHaveProperty(key));

        const workbench = workbenchProps.at(-1);
        [
            'workbenchRef', 'file', 'numPages', 'setNumPages', 'activePage', 'pageRefs',
            'pageDimensions', 'onPageLoadSuccess', 'pdfViewportWidth', 'setPdfViewportWidth',
            'fields', 'selectedFieldId', 'setSelectedFieldId', 'updateFieldPosition',
            'updateFieldSize', 'removeField', 'updateFieldLabel', 'getIcon',
        ].forEach((key) => expect(workbench).toHaveProperty(key));

        // The shell must not change the initial editor state it hands down.
        expect(sidebar.creatorMode).toBe('request');
        expect(sidebar.fields).toEqual([]);
        expect(sidebar.deliveryMethod).toBe('email');
        expect(workbench.pdfViewportWidth).toBeGreaterThan(0);
    });

    it('starts a template-mode creator from initialMode', () => {
        setup({ initialMode: 'template' });
        expect(sidebarProps.at(-1).creatorMode).toBe('template');
    });
});

describe('EnvelopeCreator shell — presentation guardrails', () => {
    it('uses no unsupported 9px or 10px interface text in the shell', () => {
        const { container } = setup();
        expect(container.querySelector('[class*="text-[10px]"]')).toBeNull();
        expect(container.querySelector('[class*="text-[9px]"]')).toBeNull();
    });

    it('has no accessibility violations in the shell', async () => {
        const { container } = setup();
        expect((await axe(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
    });

    it('has no accessibility violations on the hydrating screen', async () => {
        let resolveDoc;
        fs.getDoc.mockReturnValue(new Promise((r) => { resolveDoc = r; }));
        const { container } = setup({ editRequestId: 'req-1' });
        expect((await axe(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
        await React.act(async () => { resolveDoc({ exists: () => false }); });
    });
});
