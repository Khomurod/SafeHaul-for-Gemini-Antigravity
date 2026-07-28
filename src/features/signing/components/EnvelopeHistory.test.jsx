import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PRIVACY: recipient names, emails, phone numbers, signing links and document
// URLs are sensitive. Every fixture below is artificial — reserved example
// domains (RFC 2606) and fictional 555-01xx numbers (NANP reserved range). No
// real signing link or document URL is ever asserted, logged or snapshotted.
const fs = vi.hoisted(() => ({
    collection: vi.fn((_db, ...segments) => ({ __path: segments.join('/') })),
    query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
    orderBy: vi.fn((field, dir) => ({ __orderBy: [field, dir] })),
    onSnapshot: vi.fn(),
    doc: vi.fn((_db, ...segments) => ({ __docPath: segments.join('/') })),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__serverTimestamp__'),
}));
const callables = vi.hoisted(() => ({ getSigningLink: vi.fn(), getSignedDocumentUrl: vi.fn() }));
const fnMocks = vi.hoisted(() => ({
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn((_fns, name) => callables[name]),
}));
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('firebase/firestore', () => fs);
vi.mock('firebase/functions', () => fnMocks);
vi.mock('@lib/firebase', () => ({ db: {} }));
vi.mock('@shared/components/feedback', () => ({ useToast: () => toast }));

import EnvelopeHistory from './EnvelopeHistory';

let snapshotCb;
let errorCb;
let unsubSpy;

const SIGNING_LINK = 'https://sign.example.test/artificial-token';
const DOC_URL = 'https://files.example.test/artificial-signed.pdf';

function makeDoc(overrides = {}) {
    return {
        id: 'req-1',
        title: 'Offer Letter',
        recipientName: 'Pat Example',
        recipientEmail: 'pat@example.test',
        status: 'sent',
        sendEmail: true,
        createdAt: { seconds: 1700000000 },
        ...overrides,
    };
}

// Snapshot callbacks originate outside React, so they must be flushed in act().
function emit(docsArray) {
    React.act(() => {
        snapshotCb({
            docs: docsArray.map((d) => ({
                id: d.id,
                // Firestore's data() excludes the document id.
                data: () => Object.fromEntries(Object.entries(d).filter(([key]) => key !== 'id')),
            })),
        });
    });
}

function emitError(err) {
    React.act(() => { errorCb(err); });
}

function renderHistory(props = {}) {
    const onCorrect = props.onCorrect;
    // `companyId` is only omitted when the key is explicitly absent, so a test
    // can pass `companyId: undefined` to exercise the no-subscription guard.
    const companyId = 'companyId' in props ? props.companyId : 'co-1';
    const utils = render(<EnvelopeHistory companyId={companyId} onCorrect={onCorrect} />);
    return { onCorrect, ...utils };
}

beforeEach(() => {
    vi.clearAllMocks();
    unsubSpy = vi.fn();
    snapshotCb = undefined;
    errorCb = undefined;
    fs.onSnapshot.mockImplementation((q, onNext, onError) => {
        snapshotCb = onNext;
        errorCb = onError;
        return unsubSpy;
    });
    callables.getSigningLink.mockResolvedValue({ data: { signingLink: SIGNING_LINK } });
    callables.getSignedDocumentUrl.mockResolvedValue({ data: { url: DOC_URL } });
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue() },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('EnvelopeHistory — subscription', () => {
    it('does not subscribe without a companyId', () => {
        renderHistory({ companyId: undefined });
        expect(fs.onSnapshot).not.toHaveBeenCalled();
        expect(fs.collection).not.toHaveBeenCalled();
    });

    it('subscribes to the exact ordered signing_requests query and unsubscribes on unmount', () => {
        const { unmount } = renderHistory();
        expect(fs.collection).toHaveBeenCalledWith({}, 'companies', 'co-1', 'signing_requests');
        expect(fs.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
        expect(fs.onSnapshot).toHaveBeenCalledTimes(1);
        unmount();
        expect(unsubSpy).toHaveBeenCalledTimes(1);
    });

    it('announces loading before the first snapshot', () => {
        renderHistory();
        expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
        expect(screen.getByText('Loading document history')).toBeInTheDocument();
    });

    it('maps snapshot docs id-preservingly', () => {
        renderHistory();
        emit([makeDoc({ id: 'req-9', title: 'Policy Ack' })]);
        expect(screen.getByText('Policy Ack')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Link for Policy Ack' })).toBeInTheDocument();
    });

    it('shows the exact empty message when there are no documents', () => {
        renderHistory();
        emit([]);
        expect(screen.getByText('No documents sent yet.')).toBeInTheDocument();
    });

    it('surfaces a snapshot failure as an accessible alert', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        renderHistory();
        emitError(new Error('permission-denied'));
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Could not load document history/);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe('EnvelopeHistory — status presentation', () => {
    it.each([
        ['signed', 'Signed', 'success'],
        ['sent', 'Sent', 'info'],
        ['voided', 'Voided', 'danger'],
        ['pending_seal', 'Sealing...', 'warning'],
        ['error_sealing', 'Seal Failed', 'danger'],
        ['processing', 'Processing', 'warning'],
    ])('maps %s to "%s" with tone %s and text (never colour-only)', (status, label, tone) => {
        renderHistory();
        emit([makeDoc({ status })]);
        const badge = screen.getByText(label);
        expect(badge.closest('.ds-badge')).toHaveAttribute('data-tone', tone);
    });

    it('falls back to the raw status text for an unknown status', () => {
        renderHistory();
        emit([makeDoc({ status: 'archived_by_admin' })]);
        expect(screen.getByText('archived_by_admin')).toBeInTheDocument();
    });

    it('lets an email failure override the document status', () => {
        renderHistory();
        emit([makeDoc({ status: 'sent', emailStatus: 'failed', emailError: 'SMTP 550 rejected' })]);
        expect(screen.getByText('Delivery Failed')).toBeInTheDocument();
        expect(screen.queryByText('Sent')).not.toBeInTheDocument();
        expect(screen.getByText('SMTP 550 rejected')).toBeInTheDocument();
    });

    it('truncates an email error after 80 characters with an ellipsis', () => {
        renderHistory();
        const longError = 'E'.repeat(120);
        emit([makeDoc({ emailStatus: 'failed', emailError: longError })]);
        expect(screen.getByText(`${'E'.repeat(80)}…`)).toBeInTheDocument();
    });

    it('keeps an 80-character error untruncated', () => {
        renderHistory();
        emit([makeDoc({ emailStatus: 'failed', emailError: 'E'.repeat(80) })]);
        expect(screen.getByText('E'.repeat(80))).toBeInTheDocument();
    });

    it('uses the exact fallback when the failure carries no detail', () => {
        renderHistory();
        emit([makeDoc({ emailStatus: 'failed' })]);
        expect(screen.getByText('Email delivery failed')).toBeInTheDocument();
    });
});

describe('EnvelopeHistory — delivery method and fallbacks', () => {
    it('shows Email and SMS badges together when both are set', () => {
        renderHistory();
        emit([makeDoc({ sendEmail: true, sendSms: true })]);
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('SMS')).toBeInTheDocument();
        expect(screen.queryByText('Manual')).not.toBeInTheDocument();
    });

    it('shows Manual only when sendEmail is false and sendSms is not true', () => {
        renderHistory();
        emit([makeDoc({ sendEmail: false, sendSms: false })]);
        expect(screen.getByText('Manual')).toBeInTheDocument();
        expect(screen.queryByText('Email')).not.toBeInTheDocument();
    });

    it('does not show Manual when sendSms is true', () => {
        renderHistory();
        emit([makeDoc({ sendEmail: false, sendSms: true })]);
        expect(screen.queryByText('Manual')).not.toBeInTheDocument();
        expect(screen.getByText('SMS')).toBeInTheDocument();
    });

    it('falls back to Untitled, the em dash contact, and -- for a missing date', () => {
        renderHistory();
        emit([makeDoc({ title: undefined, recipientEmail: undefined, recipientPhone: undefined, createdAt: undefined })]);
        expect(screen.getByText('Untitled')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('falls back to the phone number when there is no email', () => {
        renderHistory();
        emit([makeDoc({ recipientEmail: undefined, recipientPhone: '555-0142' })]);
        expect(screen.getByText('555-0142')).toBeInTheDocument();
    });

    it('renders the date from createdAt.seconds', () => {
        renderHistory();
        emit([makeDoc({ createdAt: { seconds: 1700000000 } })]);
        expect(screen.getByText(new Date(1700000000 * 1000).toLocaleDateString())).toBeInTheDocument();
    });
});

describe('EnvelopeHistory — action visibility', () => {
    it('offers only Download for a signed document', () => {
        renderHistory();
        emit([makeDoc({ status: 'signed' })]);
        expect(screen.getByRole('button', { name: 'Download Offer Letter' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Link for/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Void/ })).not.toBeInTheDocument();
    });

    it('offers only Details for a voided document', () => {
        renderHistory();
        emit([makeDoc({ status: 'voided' })]);
        // A voided document is read-only: the row still opens its details (which
        // is how an operator sees why it was voided) but exposes no action that
        // could change it.
        expect(screen.getByRole('button', { name: 'Details for Offer Letter' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Link for|Void|Correct|Download/ })).not.toBeInTheDocument();
    });

    it('offers Link, Correct and Void for a sent document when onCorrect exists', () => {
        renderHistory({ onCorrect: vi.fn() });
        emit([makeDoc({ status: 'sent' })]);
        expect(screen.getByRole('button', { name: 'Link for Offer Letter' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Correct Offer Letter' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Void Offer Letter' })).toBeInTheDocument();
    });

    it('hides Correct when no onCorrect handler is supplied', () => {
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);
        expect(screen.queryByRole('button', { name: /Correct/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Void Offer Letter' })).toBeInTheDocument();
    });

    it('offers only Link for a non-sent, non-signed, non-voided document', () => {
        renderHistory({ onCorrect: vi.fn() });
        emit([makeDoc({ status: 'processing' })]);
        expect(screen.getByRole('button', { name: 'Link for Offer Letter' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Void|Correct/ })).not.toBeInTheDocument();
    });

    it('passes the exact document object to onCorrect', () => {
        const onCorrect = vi.fn();
        renderHistory({ onCorrect });
        emit([makeDoc({ status: 'sent' })]);
        fireEvent.click(screen.getByRole('button', { name: 'Correct Offer Letter' }));
        expect(onCorrect).toHaveBeenCalledTimes(1);
        expect(onCorrect.mock.calls[0][0]).toMatchObject({ id: 'req-1', title: 'Offer Letter', status: 'sent' });
    });
});

describe('EnvelopeHistory — void action', () => {
    /** Opens the void confirmation for a row and returns the dialog. */
    async function openVoidConfirmation(rowLabel = 'Void Offer Letter') {
        fireEvent.click(screen.getByRole('button', { name: rowLabel }));
        return screen.findByRole('dialog');
    }

    it('writes the exact update after the exact confirmation and reports success', async () => {
        const confirmMock = vi.fn(() => true);
        vi.stubGlobal('confirm', confirmMock);
        fs.updateDoc.mockResolvedValue();
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        const dialog = await openVoidConfirmation();
        // The blocking prompt is gone; the dialog names the envelope and warns.
        expect(dialog).toHaveAccessibleName('Void "Offer Letter"?');
        expect(dialog).toHaveTextContent(/cannot be undone/i);
        expect(confirmMock).not.toHaveBeenCalled();
        expect(fs.updateDoc).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Void document' }));

        await waitFor(() => expect(fs.updateDoc).toHaveBeenCalledTimes(1));
        expect(fs.doc).toHaveBeenCalledWith({}, 'companies', 'co-1', 'signing_requests', 'req-1');
        expect(fs.updateDoc.mock.calls[0][1]).toEqual({ status: 'voided', voidedAt: '__serverTimestamp__' });
        await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith('Document voided successfully.'));
    });

    it('uses the this-document fallback in the confirmation when untitled', async () => {
        renderHistory();
        emit([makeDoc({ status: 'sent', title: undefined })]);

        const dialog = await openVoidConfirmation('Void Untitled');
        expect(dialog).toHaveAccessibleName('Void "this document"?');
    });

    it('does not void when the confirmation is cancelled or dismissed', async () => {
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        let dialog = await openVoidConfirmation();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep document' }));
        expect(fs.updateDoc).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        dialog = await openVoidConfirmation();
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(fs.updateDoc).not.toHaveBeenCalled();
    });

    it('voids once even when confirmed twice in the same tick', async () => {
        let resolveVoid;
        fs.updateDoc.mockReturnValue(new Promise((resolve) => { resolveVoid = resolve; }));
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        const dialog = await openVoidConfirmation();
        const confirm = within(dialog).getByRole('button', { name: 'Void document' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        expect(fs.updateDoc).toHaveBeenCalledTimes(1);
        await React.act(async () => { resolveVoid(); });
    });

    it('reports a void failure with the exact message', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        fs.updateDoc.mockRejectedValueOnce(new Error('offline'));
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        const dialog = await openVoidConfirmation();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Void document' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Failed to void document.'));
        consoleError.mockRestore();
    });

    it('shows a busy state on the voiding row only', async () => {
        let resolveVoid;
        fs.updateDoc.mockReturnValue(new Promise((resolve) => { resolveVoid = resolve; }));
        renderHistory();
        emit([makeDoc({ status: 'sent' }), makeDoc({ id: 'req-2', title: 'NDA', status: 'sent' })]);

        const dialog = await openVoidConfirmation();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Void document' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Void Offer Letter' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'Void NDA' })).toBeEnabled();

        await React.act(async () => { resolveVoid(); });
    });
});

describe('EnvelopeHistory — copy link action', () => {
    it('calls getSigningLink with the exact payload and copies the result', async () => {
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Link for Offer Letter' }));

        await waitFor(() => expect(fnMocks.httpsCallable).toHaveBeenCalledWith({}, 'getSigningLink'));
        expect(callables.getSigningLink).toHaveBeenCalledWith({ companyId: 'co-1', requestId: 'req-1' });
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SIGNING_LINK));
        await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith('Full signing link copied to clipboard!'));
    });

    it('surfaces the callable error message, falling back when absent', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        callables.getSigningLink.mockRejectedValueOnce(new Error('permission denied'));
        renderHistory();
        emit([makeDoc({ status: 'sent' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Link for Offer Letter' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('permission denied'));

        toast.showError.mockClear();
        const bare = new Error();
        bare.message = '';
        callables.getSigningLink.mockRejectedValueOnce(bare);
        fireEvent.click(screen.getByRole('button', { name: 'Link for Offer Letter' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Could not retrieve signing link.'));
        consoleError.mockRestore();
    });

    it('shows a busy state on the copying row only', async () => {
        let resolveLink;
        callables.getSigningLink.mockReturnValue(new Promise((resolve) => { resolveLink = resolve; }));
        renderHistory();
        emit([makeDoc({ status: 'sent' }), makeDoc({ id: 'req-2', title: 'NDA', status: 'sent' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Link for Offer Letter' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Link for Offer Letter' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'Link for NDA' })).toBeEnabled();

        await React.act(async () => { resolveLink({ data: { signingLink: SIGNING_LINK } }); });
    });
});

describe('EnvelopeHistory — download action', () => {
    it('calls getSignedDocumentUrl with the raw path and opens the url', async () => {
        const openSpy = vi.fn();
        vi.stubGlobal('open', openSpy);
        renderHistory();
        emit([makeDoc({ status: 'signed', signedPdfUrl: 'companies/co-1/signed/artificial.pdf' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Download Offer Letter' }));

        await waitFor(() => expect(fnMocks.httpsCallable).toHaveBeenCalledWith({}, 'getSignedDocumentUrl'));
        expect(callables.getSignedDocumentUrl).toHaveBeenCalledWith({ storagePath: 'companies/co-1/signed/artificial.pdf' });
        await waitFor(() => expect(openSpy).toHaveBeenCalledWith(DOC_URL, '_blank'));
    });

    it('strips the gs:// bucket prefix before calling the callable', async () => {
        vi.stubGlobal('open', vi.fn());
        renderHistory();
        emit([makeDoc({ status: 'signed', signedPdfUrl: 'gs://example-bucket.appspot.com/companies/co-1/signed/artificial.pdf' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Download Offer Letter' }));
        await waitFor(() => {
            expect(callables.getSignedDocumentUrl).toHaveBeenCalledWith({ storagePath: 'companies/co-1/signed/artificial.pdf' });
        });
    });

    it('falls back to storagePath when signedPdfUrl is absent', async () => {
        vi.stubGlobal('open', vi.fn());
        renderHistory();
        emit([makeDoc({ status: 'signed', signedPdfUrl: undefined, storagePath: 'companies/co-1/raw/artificial.pdf' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Download Offer Letter' }));
        await waitFor(() => {
            expect(callables.getSignedDocumentUrl).toHaveBeenCalledWith({ storagePath: 'companies/co-1/raw/artificial.pdf' });
        });
    });

    it('maps functions/not-found to its exact message', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const notFound = new Error('missing');
        notFound.code = 'functions/not-found';
        callables.getSignedDocumentUrl.mockRejectedValue(notFound);
        renderHistory();
        emit([makeDoc({ status: 'signed', signedPdfUrl: 'companies/co-1/signed/artificial.pdf' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Download Offer Letter' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('File not found. It may have been deleted or moved.'));
        consoleError.mockRestore();
    });

    it('maps any other download failure to the generic message', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        callables.getSignedDocumentUrl.mockRejectedValue(new Error('network'));
        renderHistory();
        emit([makeDoc({ status: 'signed', signedPdfUrl: 'companies/co-1/signed/artificial.pdf' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Download Offer Letter' }));
        await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Could not download file. Please try again.'));
        consoleError.mockRestore();
    });
});

describe('EnvelopeHistory — accessibility', () => {
    it('exposes a labelled, keyboard-focusable horizontal scroll region', () => {
        renderHistory();
        emit([makeDoc()]);
        const region = screen.getByRole('region', { name: /Document history/ });
        expect(region).toHaveAttribute('tabindex', '0');
    });

    it('uses no unsupported 9px or 10px interface text', () => {
        const { container } = renderHistory();
        emit([makeDoc({ emailStatus: 'failed', emailError: 'SMTP 550', sendEmail: true, sendSms: true })]);
        expect(container.innerHTML).not.toMatch(/text-\[9px\]|text-\[10px\]/);
    });

    it('activates an action from the keyboard', () => {
        const onCorrect = vi.fn();
        renderHistory({ onCorrect });
        emit([makeDoc({ status: 'sent' })]);

        const correct = screen.getByRole('button', { name: 'Correct Offer Letter' });
        correct.focus();
        expect(correct).toHaveFocus();
        fireEvent.click(correct); // Enter/Space on a native button dispatches click
        expect(onCorrect).toHaveBeenCalledTimes(1);
    });

    it('has no accessibility violations across mixed row states', async () => {
        const { container } = renderHistory({ onCorrect: vi.fn() });
        emit([
            makeDoc({ id: 'a', status: 'sent' }),
            makeDoc({ id: 'b', status: 'signed', title: 'Signed Doc' }),
            makeDoc({ id: 'c', status: 'voided', title: 'Voided Doc' }),
            makeDoc({ id: 'd', title: 'Failed Doc', emailStatus: 'failed', emailError: 'SMTP 550 rejected' }),
        ]);
        expect((await axe(container)).violations).toEqual([]);
    });

    it('does not leak the signing link into the DOM', async () => {
        const { container } = renderHistory();
        emit([makeDoc({ status: 'sent' })]);
        fireEvent.click(screen.getByRole('button', { name: 'Link for Offer Letter' }));
        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
        expect(container.innerHTML).not.toContain(SIGNING_LINK);
    });
});
