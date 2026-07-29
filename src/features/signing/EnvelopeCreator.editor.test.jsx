// The redesigned editor shell wired into EnvelopeCreator: save state, unsaved-
// change protection, global undo/redo with gesture coalescing, page navigation,
// and the signer preview.
//
// The workbench and sidebar are prop-recording doubles so the shell's own
// behaviour can be driven directly; react-pdf never runs. All data is artificial.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sidebarProps = vi.hoisted(() => []);
const workbenchProps = vi.hoisted(() => []);
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
const fs = vi.hoisted(() => ({ getDoc: vi.fn(), updateDoc: vi.fn(), addDoc: vi.fn() }));

vi.mock('@lib/firebase', () => ({
    db: {},
    storage: {},
    auth: { currentUser: { uid: 'user-1', displayName: 'Artificial Sender' } },
}));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    serverTimestamp: vi.fn(),
    Timestamp: { fromMillis: vi.fn() },
    writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
    doc: vi.fn(),
    getDoc: (...a) => fs.getDoc(...a),
    updateDoc: (...a) => fs.updateDoc(...a),
    addDoc: (...a) => fs.addDoc(...a),
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('@shared/components/feedback', () => ({
    useToast: () => ({ showSuccess: toast.showSuccess, showError: toast.showError }),
}));
vi.mock('./components/envelope-creator/EnvelopeSidebar', () => ({
    EnvelopeSidebar: (props) => {
        sidebarProps.push(props);
        return (
            <div data-testid="sidebar">
                {/* Stands in for the real sidebar's upload control, wired to the
                    same `handleFileChange` the shell hands down. */}
                <label htmlFor="mock-file-input">Choose a PDF file</label>
                <input id="mock-file-input" type="file" onChange={props.handleFileChange} />
                <button type="button" onClick={() => props.addField('text')}>add text field</button>
                <button type="button" onClick={() => props.addField('signature')}>add signature field</button>
                <button type="button" onClick={() => props.removeField(props.fields[0]?.id)}>remove first</button>
                <button type="button" onClick={() => props.setSelectedFieldId(props.fields[0]?.id)}>select first</button>
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
    FieldPropertiesPanel: () => <div data-testid="properties-panel" />,
}));
vi.mock('./components/envelope-creator/SignerPreviewDialog', () => ({
    SignerPreviewDialog: (props) => (
        <div role="dialog" aria-label="Preview as signer">
            <span data-testid="preview-field-count">{props.fields.length}</span>
            <span data-testid="preview-initial-page">{props.initialPage}</span>
            <button type="button" onClick={props.onClose}>close preview</button>
        </div>
    ),
}));

import EnvelopeCreator from './EnvelopeCreator';

const PDF_FILE = new File(['%PDF-1.4 artificial'], 'artificial.pdf', { type: 'application/pdf' });

const setup = (overrides = {}) => {
    const props = { companyId: 'co-1', onClose: vi.fn(), companyName: 'Artificial Carrier', ...overrides };
    return { props, ...render(<EnvelopeCreator {...props} />) };
};

const latestWorkbench = () => workbenchProps[workbenchProps.length - 1];
const currentFields = () => latestWorkbench().fields;

/**
 * The save state is shown as a badge AND announced in the top bar's live
 * region, so it is never conveyed by the badge colour alone. Both must carry it.
 */
function expectSaveStateAnnounced(label) {
    const nodes = screen.getAllByText(label);
    expect(nodes.length).toBeGreaterThan(1);
    expect(nodes.some((node) => node.closest('[role="status"]'))).toBe(true);
}

/** Load a PDF through the real file input and settle the page count. */
async function loadPdf(pages = 3) {
    fireEvent.change(screen.getByLabelText('Choose a PDF file'), { target: { files: [PDF_FILE] } });
    await waitFor(() => expect(latestWorkbench().file).toBeTruthy());
    await React.act(async () => {
        latestWorkbench().setNumPages(pages);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    sidebarProps.length = 0;
    workbenchProps.length = 0;
    fs.getDoc.mockResolvedValue({ exists: () => false });
});

describe('save state', () => {
    it('starts with nothing to report', () => {
        setup();
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });

    it('marks the document unsaved as soon as a field is placed', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        expectSaveStateAnnounced('Unsaved changes');
    });

    it('marks the document unsaved when the title is edited', async () => {
        setup();
        await loadPdf();
        const input = screen.getByLabelText('Document title');
        fireEvent.change(input, { target: { value: 'Renamed' } });
        fireEvent.blur(input);
        expectSaveStateAnnounced('Unsaved changes');
    });

    it('never claims Saved merely because a save was attempted', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));

        // No recipient name: the existing validation rejects the send before
        // any write, so the document is still unsaved.
        fireEvent.click(screen.getByRole('button', { name: 'Send Document' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalled());
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });
});

describe('unsaved-change protection', () => {
    it('leaves immediately when there is nothing to lose', () => {
        const { props } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Back to Documents' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('asks before discarding unsaved work', async () => {
        const { props } = setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));

        fireEvent.click(screen.getByRole('button', { name: 'Back to Documents' }));
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    });

    it('keeps editing when the confirmation is dismissed', async () => {
        const { props } = setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back to Documents' }));

        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(props.onClose).not.toHaveBeenCalled();
        expect(currentFields()).toHaveLength(1);
    });

    it('leaves once the discard is confirmed', async () => {
        const { props } = setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back to Documents' }));

        fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
        await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    });
});

describe('global undo and redo', () => {
    it('is unavailable until something changes', () => {
        setup();
        expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeDisabled();
        expect(screen.getAllByRole('button', { name: 'Redo' })[0]).toBeDisabled();
    });

    it('undoes and redoes adding a field', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        expect(currentFields()).toHaveLength(1);

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(currentFields()).toHaveLength(0);

        fireEvent.click(screen.getAllByRole('button', { name: 'Redo' })[0]);
        expect(currentFields()).toHaveLength(1);
    });

    it('undoes removing a field', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'remove first' }));
        expect(currentFields()).toHaveLength(0);

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(currentFields()).toHaveLength(1);
    });

    it('treats one completed drag as one history entry', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        const id = currentFields()[0].id;

        // react-draggable commits once on stop; the coalesce key also merges a
        // run of keyboard nudges into the same entry.
        await React.act(async () => { latestWorkbench().updateFieldPosition(id, 1, 20, 20); });
        await React.act(async () => { latestWorkbench().updateFieldPosition(id, 1, 21, 21); });
        await React.act(async () => { latestWorkbench().updateFieldPosition(id, 1, 22, 22); });
        expect(currentFields()[0]).toMatchObject({ x: 22, y: 22 });

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        // One undo reverses the whole gesture, back to the placed position.
        expect(currentFields()[0]).toMatchObject({ x: 10, y: 10 });
    });

    it('keeps a move and a resize as separate history entries', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        const id = currentFields()[0].id;

        await React.act(async () => { latestWorkbench().updateFieldPosition(id, 1, 30, 30); });
        await React.act(async () => { latestWorkbench().updateFieldSize(id, 40, 9); });

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(currentFields()[0]).toMatchObject({ x: 30, y: 30, width: 30 });
    });

    it('does not record zoom or page navigation as history', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));

        fireEvent.click(screen.getAllByRole('button', { name: 'Zoom in' })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);

        // The single undo available is still the field placement.
        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(currentFields()).toHaveLength(0);
        expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeDisabled();
    });

    it('responds to the keyboard shortcuts', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        expect(currentFields()).toHaveLength(0);

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
        expect(currentFields()).toHaveLength(1);

        fireEvent.keyDown(window, { key: 'z', metaKey: true });
        expect(currentFields()).toHaveLength(0);

        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
        expect(currentFields()).toHaveLength(1);
    });

    it('starts a fresh history when a different PDF replaces the document', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeEnabled();

        const replacement = new File(['%PDF-1.4 second'], 'second.pdf', { type: 'application/pdf' });
        fireEvent.change(screen.getByLabelText('Choose a PDF file'), { target: { files: [replacement] } });

        await waitFor(() => expect(currentFields()).toHaveLength(0));
        // Undo must not be able to reach fields that belonged to the old PDF.
        expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeDisabled();
    });

    it('drops the selection when undo removes the selected field', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'select first' }));
        expect(screen.getByTestId('properties-panel')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(screen.queryByTestId('properties-panel')).not.toBeInTheDocument();
    });
});

describe('page navigation and counts', () => {
    it('reports the page and field counts in the top bar', async () => {
        setup();
        await loadPdf(4);
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'add signature field' }));

        expect(screen.getByText('4 pages')).toBeInTheDocument();
        expect(screen.getByText('2 fields')).toBeInTheDocument();
    });

    it('moves through pages from the canvas toolbar', async () => {
        setup();
        await loadPdf(3);
        expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);
        expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Previous page' })[0]);
        expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
    });

    it('places a new field on the page being viewed', async () => {
        setup();
        await loadPdf(3);
        fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        expect(currentFields()[0].page).toBe(2);
    });

    it('hides the canvas toolbar until a document is loaded', () => {
        setup();
        expect(screen.queryByRole('toolbar', { name: 'Document canvas tools' })).not.toBeInTheDocument();
    });
});

describe('inspector', () => {
    it('opens the Properties tab on the selected field', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        expect(screen.getByText(/Select a field on the document/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'select first' }));
        expect(screen.getByTestId('properties-panel')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps the AI tab reachable without disturbing the placed fields', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getByRole('button', { name: 'select first' }));

        fireEvent.click(screen.getByRole('tab', { name: /AI Suggestions/ }));
        expect(screen.getByRole('tab', { name: /AI Suggestions/ })).toHaveAttribute('aria-selected', 'true');
        // Switching tabs is a view change, not an edit: no field is touched and
        // nothing is added to the undo history.
        expect(currentFields()).toHaveLength(1);

        fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
        expect(currentFields()).toHaveLength(0);
        expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeDisabled();
    });

    it('moves between tabs with the arrow keys', async () => {
        setup();
        await loadPdf();
        const properties = screen.getByRole('tab', { name: 'Properties' });

        fireEvent.keyDown(properties, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: /AI Suggestions/ })).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(screen.getByRole('tab', { name: /AI Suggestions/ }), { key: 'ArrowLeft' });
        expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    });

    it('takes only the selected tab out of the tab order', async () => {
        setup();
        await loadPdf();
        expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('tab', { name: /AI Suggestions/ })).toHaveAttribute('tabindex', '-1');
    });
});

describe('preview as signer', () => {
    it('is disabled until a PDF is loaded', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Preview as signer' })).toBeDisabled();
    });

    it('opens with the current fields and page, and closes again', async () => {
        setup();
        await loadPdf(3);
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);

        // Offered in the top bar and again on the canvas toolbar; either opens it.
        fireEvent.click(screen.getAllByRole('button', { name: 'Preview as signer' })[0]);
        expect(screen.getByRole('dialog', { name: 'Preview as signer' })).toBeInTheDocument();
        expect(screen.getByTestId('preview-field-count')).toHaveTextContent('1');
        expect(screen.getByTestId('preview-initial-page')).toHaveTextContent('2');

        fireEvent.click(screen.getByRole('button', { name: 'close preview' }));
        expect(screen.queryByRole('dialog', { name: 'Preview as signer' })).not.toBeInTheDocument();
    });

    it('writes nothing when opened', async () => {
        setup();
        await loadPdf();
        fireEvent.click(screen.getByRole('button', { name: 'add text field' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Preview as signer' })[0]);

        expect(fs.updateDoc).not.toHaveBeenCalled();
        expect(fs.addDoc).not.toHaveBeenCalled();
    });
});
