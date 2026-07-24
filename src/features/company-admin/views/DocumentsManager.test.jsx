// Focused coverage for the Documents Center page header only: the three header
// actions and their exact navigation / state behaviour. The tabs, history table,
// templates panel, send flow and every Firebase operation are out of scope for
// this slice and are stubbed here so the header can be asserted in isolation.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const useDataMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
// Records the props EnvelopeCreator is mounted with, so the two "create" actions
// can be asserted by their resulting mode/edit-id state rather than by internals.
const creatorProps = vi.hoisted(() => ({ current: null }));

vi.mock('@/context/DataContext', () => ({ useData: () => useDataMock() }));
vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigateMock,
}));
vi.mock('@lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-1' } } }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    onSnapshot: vi.fn(() => () => {}),
    deleteDoc: vi.fn(),
    doc: vi.fn(() => ({})),
    updateDoc: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: [] })),
    Timestamp: { fromMillis: vi.fn(() => ({})) },
    writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
    serverTimestamp: vi.fn(() => '__ts__'),
}));
vi.mock('@features/signing/EnvelopeCreator', () => ({
    default: (props) => {
        creatorProps.current = props;
        return <div data-testid="envelope-creator">Envelope Creator</div>;
    },
}));
vi.mock('@features/signing/components/EnvelopeHistory', () => ({
    default: () => <div data-testid="envelope-history">History</div>,
}));
vi.mock('../components/documents/TemplatesPanel', () => ({
    TemplatesPanel: () => <div data-testid="templates-panel">Templates</div>,
}));
vi.mock('../components/documents/SendTemplateModal', () => ({
    SendTemplateModal: () => <div data-testid="send-template-modal">Send</div>,
}));
vi.mock('@shared/components/feedback', () => ({
    GlobalLoadingState: () => <div>Loading…</div>,
    useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

import DocumentsManager from './DocumentsManager';

const company = { id: 'company-1', companyName: 'Artificial Freight Co', features: { eDocs: true } };

function renderManager({ currentCompanyProfile = company, loading = false } = {}) {
    useDataMock.mockReturnValue({ currentCompanyProfile, loading });
    return render(
        <MemoryRouter initialEntries={['/company/e-docs']}>
            <DocumentsManager />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    creatorProps.current = null;
});

describe('DocumentsManager header', () => {
    it('names the page with the Documents Center heading', () => {
        renderManager();
        expect(screen.getByRole('heading', { level: 1, name: 'Documents Center' })).toBeInTheDocument();
    });

    it('navigates back to the company dashboard', () => {
        renderManager();
        fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
        expect(navigateMock).toHaveBeenCalledTimes(1);
        expect(navigateMock).toHaveBeenCalledWith('/company/dashboard');
    });

    it('opens the creator in template mode with no edit ids from Create Template', () => {
        renderManager();
        expect(screen.getByTestId('envelope-history')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Create Template' }));

        expect(screen.getByTestId('envelope-creator')).toBeInTheDocument();
        expect(creatorProps.current).toMatchObject({
            companyId: 'company-1',
            companyName: 'Artificial Freight Co',
            initialMode: 'template',
            editRequestId: null,
            editTemplateId: null,
        });
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it('opens the creator in request mode with no edit ids from Send One-off', () => {
        renderManager();

        fireEvent.click(screen.getByRole('button', { name: 'Send One-off' }));

        expect(screen.getByTestId('envelope-creator')).toBeInTheDocument();
        expect(creatorProps.current).toMatchObject({
            initialMode: 'request',
            editRequestId: null,
            editTemplateId: null,
        });
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it('returns to the header view when the creator closes', () => {
        renderManager();
        fireEvent.click(screen.getByRole('button', { name: 'Send One-off' }));

        // The creator owns its own close control; invoke the handler it was given.
        React.act(() => { creatorProps.current.onClose(); });

        expect(screen.getByRole('heading', { level: 1, name: 'Documents Center' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Template' })).toBeInTheDocument();
    });

    it('uses approved Button primitives for all three header actions', () => {
        renderManager();
        for (const name of ['Back to Dashboard', 'Create Template', 'Send One-off']) {
            expect(screen.getByRole('button', { name })).toHaveClass('ds-button');
        }
        expect(screen.getByRole('button', { name: 'Send One-off' })).toHaveAttribute('data-variant', 'primary');
    });

    it('uses no legacy gray canvas or hard-coded header colours', () => {
        const { container } = renderManager();
        const header = container.querySelector('.ds-page-header');
        expect(header).toBeTruthy();
        expect(container.querySelector('.ds-page-container')).toBeTruthy();
        expect(container.innerHTML).not.toContain('bg-gray-50');
        expect(header.innerHTML).not.toMatch(/text-blue-600|text-purple-600|bg-blue-600/);
    });

    it('lets the header actions wrap instead of overflowing', () => {
        const { container } = renderManager();
        expect(container.querySelector('.ds-page-header')).toHaveClass('flex-wrap');
        expect(container.querySelector('.ds-page-header__actions .ds-inline')).toHaveAttribute('data-wrap', 'true');
    });

    it('has no accessibility violations in the header region', async () => {
        const { container } = renderManager();
        expect((await axe(container)).violations).toEqual([]);
    });
});
