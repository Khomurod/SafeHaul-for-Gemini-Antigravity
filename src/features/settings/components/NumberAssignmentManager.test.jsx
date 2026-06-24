import { render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

vi.mock('@shared/components/feedback/ToastProvider', () => ({
    useToast: vi.fn(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))
}));
vi.mock('@/context/DataContext', () => ({ useData: vi.fn(() => ({})) }));
vi.mock('./SMSDiagnosticModal', () => ({ SMSDiagnosticModal: () => <div /> }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock('@lib/firebase', () => ({ db: {}, functions: {} }));

let CONFIG_DATA;
let MEMBERSHIPS;
let USERS;
let getDocsCall = 0;

vi.mock('firebase/firestore', () => ({
    doc: vi.fn((...args) => ({ __type: 'doc', path: args.slice(1).join('/') })),
    collection: vi.fn((...args) => ({ __type: 'collection', path: args.slice(1).join('/') })),
    query: vi.fn((c) => c),
    where: vi.fn(() => ({})),
    documentId: vi.fn(() => '__name__'),
    updateDoc: vi.fn(() => Promise.resolve()),
    onSnapshot: (ref, cb) => {
        cb({ exists: () => !!CONFIG_DATA, data: () => CONFIG_DATA });
        return vi.fn();
    },
    getDocs: vi.fn(() => {
        if (getDocsCall === 0) {
            getDocsCall++;
            return Promise.resolve({
                docs: MEMBERSHIPS.map(m => ({ id: 'mem_' + m.userId, data: () => m }))
            });
        }
        return Promise.resolve({
            docs: USERS.map(u => ({ id: u.id, data: () => ({ name: u.name, email: u.email }) }))
        });
    }),
}));

import { NumberAssignmentManager } from './NumberAssignmentManager';

beforeEach(() => {
    getDocsCall = 0;
    vi.clearAllMocks();
});

const userRowSelect = (name) => {
    const row = screen.getByText(name).closest('tr');
    return within(row).getByRole('combobox');
};

describe('NumberAssignmentManager — linked-number display', () => {
    it('CASE A: clean E.164 assignment shows the linked number', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [
                { phoneNumber: '+15550000001', usageType: 'DirectNumber' },
                { phoneNumber: '+15550000002', usageType: 'DirectNumber' },
            ],
            defaultPhoneNumber: '+15550000001',
            assignments: { uidTom: '+15550000002' },
        };
        MEMBERSHIPS = [{ userId: 'uidTom', companyId: 'c1', role: 'company_admin' }];
        USERS = [{ id: 'uidTom', name: 'Tom Robinson', email: 'tom@x.com' }];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Tom Robinson')).toBeInTheDocument());
        expect(userRowSelect('Tom Robinson').value).toBe('+15550000002');
    });

    it('CASE B: assignment stored in a different format still matches inventory (no false mismatch)', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+15550000002', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '+15550000002',
            assignments: { uidTom: '(555) 000-0002' }, // unformatted, no country code
        };
        MEMBERSHIPS = [{ userId: 'uidTom', companyId: 'c1', role: 'company_admin' }];
        USERS = [{ id: 'uidTom', name: 'Tom Robinson', email: 'tom@x.com' }];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Tom Robinson')).toBeInTheDocument());

        const row = screen.getByText('Tom Robinson').closest('tr');
        // Resolves to canonical E.164 and matches the inventory entry exactly.
        expect(within(row).getByRole('combobox').value).toBe('+15550000002');
        // ...so it must NOT be flagged as out-of-sync.
        expect(within(row).queryByText('Inventory Mismatch')).not.toBeInTheDocument();
    });

    it('CASE C: configured default not in synced inventory is still shown selected', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+15550000001', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '+15559999999', // configured + sending, but not in inventory
            assignments: {},
        };
        MEMBERSHIPS = [];
        USERS = [];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Company Default Line')).toBeInTheDocument());
        const defaultSelect = screen.getAllByRole('combobox')[0];
        expect(defaultSelect.value).toBe('+15559999999');
        expect(screen.getByText(/Missing from sync/)).toBeInTheDocument();
    });

    it('CASE D: default stored in a different format matches inventory and shows selected', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+15550000001', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '5550000001', // 10-digit, no +1
            assignments: {},
        };
        MEMBERSHIPS = [];
        USERS = [];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Company Default Line')).toBeInTheDocument());
        const defaultSelect = screen.getAllByRole('combobox')[0];
        expect(defaultSelect.value).toBe('+15550000001');
        // matched inventory, so no stale-sync marker
        expect(screen.queryByText(/Missing from sync/)).not.toBeInTheDocument();
    });

    it('CASE F: a "+"-prefixed line without a country code is preserved exactly (keychain safety)', async () => {
        // Backend keychain/inventory store this 10-digit number as "+5550000002" (just a
        // leading +). We must NOT rewrite it to +1..., or it would stop matching the
        // inventory option and line verification would fail.
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+5550000002', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '+5550000002',
            assignments: { uidTom: '+5550000002' },
        };
        MEMBERSHIPS = [{ userId: 'uidTom', companyId: 'c1', role: 'company_admin' }];
        USERS = [{ id: 'uidTom', name: 'Tom Robinson', email: 'tom@x.com' }];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Tom Robinson')).toBeInTheDocument());
        expect(userRowSelect('Tom Robinson').value).toBe('+5550000002');
        expect(screen.getAllByRole('combobox')[0].value).toBe('+5550000002');
        expect(screen.queryByText(/Missing from sync/)).not.toBeInTheDocument();
    });

    it('CASE G: malformed/blank line ("+") resolves to empty (no false assignment)', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+15550000001', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '+',
            assignments: { uidTom: '+' },
        };
        MEMBERSHIPS = [{ userId: 'uidTom', companyId: 'c1', role: 'company_admin' }];
        USERS = [{ id: 'uidTom', name: 'Tom Robinson', email: 'tom@x.com' }];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Tom Robinson')).toBeInTheDocument());
        expect(userRowSelect('Tom Robinson').value).toBe('');
        expect(screen.getAllByRole('combobox')[0].value).toBe('');
        expect(screen.queryByText(/Missing from sync/)).not.toBeInTheDocument();
    });

    it('CASE E: empty assignment correctly shows "No Direct Line"', async () => {
        CONFIG_DATA = {
            isActive: true,
            inventory: [{ phoneNumber: '+15550000001', usageType: 'DirectNumber' }],
            defaultPhoneNumber: '+15550000001',
            assignments: {}, // no assignment for the user
        };
        MEMBERSHIPS = [{ userId: 'uidTom', companyId: 'c1', role: 'company_admin' }];
        USERS = [{ id: 'uidTom', name: 'Tom Robinson', email: 'tom@x.com' }];

        render(<NumberAssignmentManager companyId="c1" />);
        await waitFor(() => expect(screen.getByText('Tom Robinson')).toBeInTheDocument());
        expect(userRowSelect('Tom Robinson').value).toBe('');
    });
});
