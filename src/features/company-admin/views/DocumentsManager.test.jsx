// Focused coverage for the Documents Center page header and its History /
// Templates tab interface: the header actions with their exact navigation and
// state behaviour, plus the tab contract (roles, ARIA relationships, roving
// tabIndex, keyboard navigation, and the exact props each panel receives).
// The history table, templates panel, send flow and Firebase operations are
// stubbed so this view can be asserted in isolation; all template fixtures are
// artificial.
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
// Records the props each panel is mounted with, so the frozen child contracts
// can be asserted without reaching into either child's internals.
const historyProps = vi.hoisted(() => ({ current: null }));
const panelProps = vi.hoisted(() => ({ current: null }));
const firestoreMocks = vi.hoisted(() => ({
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
    getDocs: vi.fn(async () => ({ docs: [] })),
}));
const functionsMocks = vi.hoisted(() => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn(() => vi.fn()) }));

vi.mock('@/context/DataContext', () => ({ useData: () => useDataMock() }));
vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigateMock,
}));
vi.mock('@lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'user-1' } } }));
vi.mock('firebase/functions', () => functionsMocks);
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    onSnapshot: vi.fn(() => () => {}),
    doc: vi.fn(() => ({})),
    Timestamp: { fromMillis: vi.fn(() => ({})) },
    serverTimestamp: vi.fn(() => '__ts__'),
    ...firestoreMocks,
}));
vi.mock('@features/signing/EnvelopeCreator', () => ({
    default: (props) => {
        creatorProps.current = props;
        return <div data-testid="envelope-creator">Envelope Creator</div>;
    },
}));
vi.mock('@features/signing/components/EnvelopeHistory', () => ({
    default: (props) => {
        historyProps.current = props;
        return <div data-testid="envelope-history">History</div>;
    },
}));
vi.mock('../components/documents/TemplatesPanel', () => ({
    TemplatesPanel: (props) => {
        panelProps.current = props;
        return <div data-testid="templates-panel">Templates</div>;
    },
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
    historyProps.current = null;
    panelProps.current = null;
});

function tabs() {
    return {
        history: screen.getByRole('tab', { name: /^History/ }),
        templates: screen.getByRole('tab', { name: /^Templates/ }),
    };
}

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

describe('DocumentsManager tabs', () => {
    it('selects History by default and renders the history panel', () => {
        renderManager();
        const { history, templates } = tabs();
        expect(history).toHaveAttribute('aria-selected', 'true');
        expect(templates).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('envelope-history')).toBeInTheDocument();
        expect(screen.queryByTestId('templates-panel')).not.toBeInTheDocument();
    });

    it('switches to Templates and back to History', () => {
        renderManager();
        fireEvent.click(tabs().templates);
        expect(tabs().templates).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('templates-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('envelope-history')).not.toBeInTheDocument();

        fireEvent.click(tabs().history);
        expect(tabs().history).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('envelope-history')).toBeInTheDocument();
        expect(screen.queryByTestId('templates-panel')).not.toBeInTheDocument();
    });

    it('exposes a labelled tablist with connected tabs and panel', () => {
        renderManager();
        const tablist = screen.getByRole('tablist', { name: 'Document Center views' });
        expect(tablist).toBeInTheDocument();

        const panel = screen.getByRole('tabpanel');
        const { history, templates } = tabs();
        expect(history).toHaveAttribute('aria-controls', panel.id);
        expect(templates).toHaveAttribute('aria-controls', panel.id);
        expect(panel).toHaveAttribute('aria-labelledby', history.id);
        expect(history.id).toBeTruthy();
        expect(templates.id).toBeTruthy();
        expect(history.id).not.toEqual(templates.id);

        fireEvent.click(templates);
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs().templates.id);
    });

    it('keeps a roving tabIndex on the selected tab only', () => {
        renderManager();
        expect(tabs().history).toHaveAttribute('tabindex', '0');
        expect(tabs().templates).toHaveAttribute('tabindex', '-1');

        fireEvent.click(tabs().templates);
        expect(tabs().history).toHaveAttribute('tabindex', '-1');
        expect(tabs().templates).toHaveAttribute('tabindex', '0');
    });

    it('states the selected tab with text as well as colour', () => {
        renderManager();
        expect(tabs().history).toHaveTextContent('(selected)');
        expect(tabs().templates).not.toHaveTextContent('(selected)');
    });

    it('moves selection and focus with ArrowRight and ArrowLeft, wrapping at the ends', () => {
        renderManager();
        const tablist = screen.getByRole('tablist');
        tabs().history.focus();

        fireEvent.keyDown(tabs().history, { key: 'ArrowRight' });
        expect(tabs().templates).toHaveAttribute('aria-selected', 'true');
        expect(tabs().templates).toHaveFocus();

        fireEvent.keyDown(tabs().templates, { key: 'ArrowLeft' });
        expect(tabs().history).toHaveAttribute('aria-selected', 'true');
        expect(tabs().history).toHaveFocus();

        // ArrowLeft from the first tab wraps to the last.
        fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
        expect(tabs().templates).toHaveAttribute('aria-selected', 'true');

        // ArrowRight from the last tab wraps to the first.
        fireEvent.keyDown(tablist, { key: 'ArrowRight' });
        expect(tabs().history).toHaveAttribute('aria-selected', 'true');
    });

    it('moves to the first and last tab with Home and End', () => {
        renderManager();
        const tablist = screen.getByRole('tablist');

        fireEvent.keyDown(tablist, { key: 'End' });
        expect(tabs().templates).toHaveAttribute('aria-selected', 'true');
        expect(tabs().templates).toHaveFocus();

        fireEvent.keyDown(tablist, { key: 'Home' });
        expect(tabs().history).toHaveAttribute('aria-selected', 'true');
        expect(tabs().history).toHaveFocus();
    });

    it('ignores keys that are not part of the tab contract', () => {
        renderManager();
        const tablist = screen.getByRole('tablist');
        fireEvent.keyDown(tablist, { key: 'ArrowDown' });
        fireEvent.keyDown(tablist, { key: 'a' });
        expect(tabs().history).toHaveAttribute('aria-selected', 'true');
    });

    it('passes EnvelopeHistory exactly companyId and onCorrect', () => {
        renderManager();
        expect(Object.keys(historyProps.current).sort()).toEqual(['companyId', 'onCorrect']);
        expect(historyProps.current.companyId).toBe('company-1');
        expect(typeof historyProps.current.onCorrect).toBe('function');
    });

    it('opens the creator in request mode when history requests a correction', () => {
        renderManager();
        React.act(() => { historyProps.current.onCorrect({ id: 'req-1', title: 'Artificial Form' }); });

        expect(screen.getByTestId('envelope-creator')).toBeInTheDocument();
        expect(creatorProps.current).toMatchObject({
            initialMode: 'request',
            editRequestId: 'req-1',
            editTemplateId: null,
        });
    });

    it('passes TemplatesPanel every existing prop', () => {
        renderManager();
        fireEvent.click(tabs().templates);

        const expected = [
            'templates',
            'templatesLoading',
            'postSubmitTemplateIds',
            'postSubmitRequiredById',
            'togglePostSubmitRequired',
            'savingPostSubmitTemplates',
            'handleSavePostSubmitTemplates',
            'movePostSubmitTemplate',
            'isTemplateEnabledPostSubmit',
            'togglePostSubmitTemplate',
            'handleUseTemplate',
            'handleEditTemplate',
            'handleDeleteTemplate',
        ];
        expect(Object.keys(panelProps.current).sort()).toEqual([...expected].sort());
        for (const callback of [
            'togglePostSubmitRequired',
            'handleSavePostSubmitTemplates',
            'movePostSubmitTemplate',
            'isTemplateEnabledPostSubmit',
            'togglePostSubmitTemplate',
            'handleUseTemplate',
            'handleEditTemplate',
            'handleDeleteTemplate',
        ]) {
            expect(typeof panelProps.current[callback]).toBe('function');
        }
        expect(Array.isArray(panelProps.current.templates)).toBe(true);
        expect(Array.isArray(panelProps.current.postSubmitTemplateIds)).toBe(true);
        expect(panelProps.current.postSubmitRequiredById).toEqual({});
    });

    it('performs no Firebase write, callable or send action when switching tabs', () => {
        renderManager();
        functionsMocks.httpsCallable.mockClear();

        fireEvent.click(tabs().templates);
        fireEvent.click(tabs().history);
        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });

        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
        expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled();
        expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
        expect(functionsMocks.httpsCallable).not.toHaveBeenCalled();
        expect(screen.queryByTestId('send-template-modal')).not.toBeInTheDocument();
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it('has no accessibility violations on either tab', async () => {
        const { container } = renderManager();
        expect((await axe(container)).violations).toEqual([]);

        fireEvent.click(tabs().templates);
        expect((await axe(container)).violations).toEqual([]);
    });
});
