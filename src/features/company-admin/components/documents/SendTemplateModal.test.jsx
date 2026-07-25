import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendTemplateModal } from './SendTemplateModal';

// DateTripletField is out of scope for this slice, so it is replaced with a
// prop-recording double: the migration must pass it exactly the same props.
const tripletProps = vi.hoisted(() => []);
vi.mock('@shared/components/form/DateTripletField', () => ({
    default: (props) => {
        tripletProps.push(props);
        return (
            <button
                type="button"
                data-testid={`triplet-${props.name}`}
                onClick={() => props.onChange(props.name, '2020-05-06')}
            >
                triplet {props.name}
            </button>
        );
    },
}));

// Artificial fixtures only: reserved example.test domains and fictional 555-01xx
// numbers. No real recipient data, signing links or document URLs.
const driver = (id, over = {}) => ({
    id,
    firstName: 'Artificial',
    lastName: id.toUpperCase(),
    email: `${id}@example.test`,
    phone: '555-0100',
    ...over,
});

const emptyPartition = { groups: [], plainFields: [] };

function setup(overrides = {}) {
    const props = {
        selectedTemplate: { id: 'tpl-1', title: 'Artificial Template' },
        onClose: vi.fn(),
        manualName: '',
        setManualName: vi.fn(),
        manualEmail: '',
        setManualEmail: vi.fn(),
        manualPhone: '',
        setManualPhone: vi.fn(),
        deliveryMethod: 'email',
        setDeliveryMethod: vi.fn(),
        editablePrefillPartition: emptyPartition,
        prefillValues: {},
        setPrefillValues: vi.fn(),
        prefillValuesByGroupKey: {},
        setPrefillValuesByGroupKey: vi.fn(),
        sending: false,
        executeTemplateSend: vi.fn(),
        filteredDrivers: [],
        searchQuery: '',
        setSearchQuery: vi.fn(),
        handleQuickSelect: vi.fn(),
        ...overrides,
    };
    return { props, ...render(<SendTemplateModal {...props} />) };
}

beforeEach(() => {
    vi.clearAllMocks();
    tripletProps.length = 0;
});

describe('SendTemplateModal — dialog contract', () => {
    it('is an accessible dialog named by its title and described by the template subtitle', () => {
        setup();
        const dialog = screen.getByRole('dialog', { name: 'Send Document' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleDescription(/Sending:\s*Artificial Template/);
        expect(screen.getByRole('heading', { name: 'Send Document' })).toBeInTheDocument();
    });

    it('closes through the exact onClose callback', () => {
        const { props } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on a backdrop click', () => {
        const { props } = setup();
        const dialog = screen.getByRole('dialog');
        fireEvent.mouseDown(dialog.parentElement);
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape while not sending', () => {
        const { props } = setup();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape while sending', () => {
        const { props } = setup({ sending: true, manualName: 'Artificial One' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('disables the Close control while sending', () => {
        setup({ sending: true, manualName: 'Artificial One' });
        expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    });

    it('moves initial focus to the recipient name field', () => {
        setup();
        expect(screen.getByLabelText('Recipient name')).toHaveFocus();
    });

    it('traps Tab inside the dialog', () => {
        setup();
        const dialog = screen.getByRole('dialog');
        const focusable = within(dialog).getAllByRole('button');
        const last = focusable[focusable.length - 1];
        last.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('restores focus to the previously focused element on close', () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        const { unmount } = setup();
        unmount();

        expect(trigger).toHaveFocus();
        trigger.remove();
    });

    it('announces the busy state while sending', () => {
        setup({ sending: true, manualName: 'Artificial One' });
        expect(screen.getByRole('status')).toHaveTextContent('Sending document, please wait…');
    });
});

describe('SendTemplateModal — recipient fields', () => {
    it('renders the exact initial values, placeholders and types', () => {
        setup({ manualName: 'Artificial One', manualEmail: 'one@example.test', manualPhone: '555-0101' });

        const name = screen.getByLabelText('Recipient name');
        const email = screen.getByLabelText('Email address');
        const phone = screen.getByLabelText('Phone number');

        expect(name).toHaveValue('Artificial One');
        expect(name).toHaveAttribute('type', 'text');
        expect(name).toHaveAttribute('placeholder', 'Recipient name *');

        expect(email).toHaveValue('one@example.test');
        expect(email).toHaveAttribute('type', 'email');
        expect(email).toHaveAttribute('placeholder', 'Email address');

        expect(phone).toHaveValue('555-0101');
        expect(phone).toHaveAttribute('type', 'tel');
        expect(phone).toHaveAttribute('placeholder', 'Phone number');
    });

    it('keeps the placeholders addressable for existing selectors', () => {
        setup();
        expect(screen.getByPlaceholderText('Recipient name *')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Phone number')).toBeInTheDocument();
    });

    it('calls each setter with the exact input value', () => {
        const { props } = setup();

        fireEvent.change(screen.getByLabelText('Recipient name'), { target: { value: 'Artificial Two' } });
        expect(props.setManualName).toHaveBeenCalledWith('Artificial Two');

        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'two@example.test' } });
        expect(props.setManualEmail).toHaveBeenCalledWith('two@example.test');

        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '555-0102' } });
        expect(props.setManualPhone).toHaveBeenCalledWith('555-0102');
    });
});

describe('SendTemplateModal — delivery method', () => {
    const EXPECTED = [
        ['email', 'Email'],
        ['sms', 'SMS'],
        ['both', 'Both'],
        ['copy', 'Copy Link'],
    ];

    it('renders exactly four options in the frozen order with the exact labels', () => {
        setup();
        const group = screen.getByRole('group', { name: 'Delivery Method' });
        const buttons = within(group).getAllByRole('button');
        expect(buttons).toHaveLength(4);
        expect(buttons.map(b => b.textContent.trim())).toEqual(EXPECTED.map(([, label]) => label));
    });

    it.each(EXPECTED)('calls setDeliveryMethod with the exact %s key', (key, label) => {
        const { props } = setup();
        const group = screen.getByRole('group', { name: 'Delivery Method' });
        fireEvent.click(within(group).getByRole('button', { name: label }));
        expect(props.setDeliveryMethod).toHaveBeenCalledWith(key);
    });

    it('exposes the selected option with aria-pressed', () => {
        setup({ deliveryMethod: 'both' });
        const group = screen.getByRole('group', { name: 'Delivery Method' });
        expect(within(group).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(group).getByRole('button', { name: 'Email' })).toHaveAttribute('aria-pressed', 'false');
        expect(within(group).getByRole('button', { name: 'SMS' })).toHaveAttribute('aria-pressed', 'false');
        expect(within(group).getByRole('button', { name: 'Copy Link' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps every option keyboard reachable as a native button', () => {
        setup();
        const group = screen.getByRole('group', { name: 'Delivery Method' });
        within(group).getAllByRole('button').forEach((button) => {
            expect(button.tagName).toBe('BUTTON');
            expect(button).not.toHaveAttribute('tabindex', '-1');
            button.focus();
            expect(button).toHaveFocus();
        });
    });
});

describe('SendTemplateModal — prefill fields', () => {
    const group = (over = {}) => ({
        groupKey: 'group.one',
        uiLabel: 'Group One',
        appliesCount: 1,
        useDateTriplet: false,
        members: [{ id: 'm1', label: 'Member One' }],
        ...over,
    });

    it('hides the section when there are no groups or plain fields', () => {
        setup();
        expect(screen.queryByText('Pre-fill Fields (Optional)')).not.toBeInTheDocument();
    });

    it('shows the section for groups only, and for plain fields only', () => {
        const { unmount } = setup({ editablePrefillPartition: { groups: [group()], plainFields: [] } });
        expect(screen.getByText('Pre-fill Fields (Optional)')).toBeInTheDocument();
        unmount();

        setup({ editablePrefillPartition: { groups: [], plainFields: [{ id: 'f1', label: 'Field One' }] } });
        expect(screen.getByText('Pre-fill Fields (Optional)')).toBeInTheDocument();
    });

    it('preserves group order then plain-field order', () => {
        setup({
            editablePrefillPartition: {
                groups: [group({ groupKey: 'g1', uiLabel: 'Alpha' }), group({ groupKey: 'g2', uiLabel: 'Beta' })],
                plainFields: [{ id: 'p1', label: 'Gamma' }, { id: 'p2', label: 'Delta' }],
            },
        });
        const labels = screen.getAllByText(/Alpha|Beta|Gamma|Delta/).map(n => n.textContent.trim());
        expect(labels).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    });

    it.each([
        ['simple', 'plain_key-1', 'edoc-grp-plain_key-1'],
        ['special characters', 'a.b c/d:e', 'edoc-grp-a_b_c_d_e'],
        ['long key truncated to 96', 'x'.repeat(120), `edoc-grp-${'x'.repeat(96)}`],
    ])('slugs the group key with %s', (_label, groupKey, expectedId) => {
        setup({ editablePrefillPartition: { groups: [group({ groupKey })], plainFields: [] } });
        expect(document.getElementById(expectedId)).not.toBeNull();
    });

    it('shows the member tooltip and the applies-count only above 1', () => {
        const { unmount } = setup({
            editablePrefillPartition: {
                groups: [group({
                    appliesCount: 3,
                    members: [{ id: 'm1', label: 'Member One' }, { id: 'm2' }],
                })],
                plainFields: [],
            },
        });
        expect(screen.getByText(/— applies to 3 places/)).toBeInTheDocument();
        // A member without a label falls back to its id.
        expect(document.querySelector('[title="Member One, m2"]')).not.toBeNull();
        unmount();

        setup({ editablePrefillPartition: { groups: [group({ appliesCount: 1 })], plainFields: [] } });
        expect(screen.queryByText(/applies to/)).not.toBeInTheDocument();
    });

    it('passes DateTripletField the exact frozen props', () => {
        setup({
            editablePrefillPartition: {
                groups: [group({ groupKey: 'dob.group', uiLabel: 'Date Of Birth', useDateTriplet: true })],
                plainFields: [],
            },
            prefillValuesByGroupKey: {},
        });

        expect(tripletProps).toHaveLength(1);
        expect(tripletProps[0]).toMatchObject({
            label: '',
            idPrefix: 'edoc-grp-dob_group',
            name: 'prefill-dob.group',
            value: '',
            required: false,
            maxToday: true,
            minYear: 1920,
        });
    });

    it('merges a date-triplet update while preserving other keys', () => {
        const { props } = setup({
            editablePrefillPartition: {
                groups: [group({ groupKey: 'dob', useDateTriplet: true })],
                plainFields: [],
            },
            prefillValuesByGroupKey: { other: 'keep' },
        });

        fireEvent.click(screen.getByTestId('triplet-prefill-dob'));
        const updater = props.setPrefillValuesByGroupKey.mock.calls[0][0];
        expect(updater({ other: 'keep' })).toEqual({ other: 'keep', dob: '2020-05-06' });
    });

    it('merges a grouped text update while preserving other keys', () => {
        // The updater must run inside the change handler: the input is
        // controlled, so React restores its DOM value once the handler returns.
        const applied = [];
        setup({
            editablePrefillPartition: { groups: [group({ groupKey: 'g1', uiLabel: 'Alpha' })], plainFields: [] },
            prefillValuesByGroupKey: { other: 'keep' },
            setPrefillValuesByGroupKey: vi.fn((updater) => applied.push(updater({ other: 'keep' }))),
        });

        const input = document.getElementById('edoc-grp-g1');
        expect(input).toHaveAttribute('placeholder', 'Enter Alpha...');
        fireEvent.change(input, { target: { value: 'typed' } });

        expect(applied).toEqual([{ other: 'keep', g1: 'typed' }]);
    });

    it('merges a plain-field update while preserving other keys', () => {
        const applied = [];
        setup({
            editablePrefillPartition: { groups: [], plainFields: [{ id: 'p1', label: 'Gamma' }] },
            prefillValues: { other: 'keep' },
            setPrefillValues: vi.fn((updater) => applied.push(updater({ other: 'keep' }))),
        });

        const input = document.getElementById('edoc-plain-p1');
        expect(input).toHaveAttribute('placeholder', 'Enter Gamma...');
        fireEvent.change(input, { target: { value: 'typed' } });

        expect(applied).toEqual([{ other: 'keep', p1: 'typed' }]);
    });

    it('falls back to the field id for the label and "text" for the placeholder', () => {
        setup({ editablePrefillPartition: { groups: [], plainFields: [{ id: 'no_label' }] } });
        expect(screen.getByText('no_label')).toBeInTheDocument();
        expect(document.getElementById('edoc-plain-no_label')).toHaveAttribute('placeholder', 'Enter text...');
    });

    it('shows current prefill values', () => {
        setup({
            editablePrefillPartition: {
                groups: [group({ groupKey: 'g1' })],
                plainFields: [{ id: 'p1', label: 'Gamma' }],
            },
            prefillValuesByGroupKey: { g1: 'group value' },
            prefillValues: { p1: 'plain value' },
        });
        expect(document.getElementById('edoc-grp-g1')).toHaveValue('group value');
        expect(document.getElementById('edoc-plain-p1')).toHaveValue('plain value');
    });
});

describe('SendTemplateModal — primary action', () => {
    const submit = () => screen.getByRole('button', { name: /Send Document|Copy Signing Link/ });

    it('is disabled with an empty or whitespace-only recipient name', () => {
        const { unmount } = setup({ manualName: '' });
        expect(submit()).toBeDisabled();
        unmount();

        setup({ manualName: '   ' });
        expect(submit()).toBeDisabled();
    });

    it('is disabled while sending even with a valid name', () => {
        setup({ manualName: 'Artificial One', sending: true });
        expect(submit()).toBeDisabled();
    });

    it('is enabled with a trimmed name and not sending', () => {
        setup({ manualName: 'Artificial One' });
        expect(submit()).toBeEnabled();
    });

    it('shows "Send Document" for non-copy methods and "Copy Signing Link" for copy', () => {
        const { unmount } = setup({ manualName: 'A', deliveryMethod: 'email' });
        expect(screen.getByRole('button', { name: /Send Document/ })).toBeInTheDocument();
        unmount();

        setup({ manualName: 'A', deliveryMethod: 'copy' });
        expect(screen.getByRole('button', { name: /Copy Signing Link/ })).toBeInTheDocument();
    });

    it('exposes a busy state while sending', () => {
        setup({ manualName: 'A', sending: true });
        expect(submit()).toHaveAttribute('aria-busy', 'true');
    });

    it('calls executeTemplateSend exactly once per admitted activation', () => {
        const { props } = setup({ manualName: 'Artificial One' });
        fireEvent.click(submit());
        expect(props.executeTemplateSend).toHaveBeenCalledTimes(1);
    });

    it('cannot be activated twice while sending', () => {
        const { props } = setup({ manualName: 'Artificial One', sending: true });
        fireEvent.click(submit());
        fireEvent.click(submit());
        expect(props.executeTemplateSend).not.toHaveBeenCalled();
    });
});

describe('SendTemplateModal — quick select', () => {
    it('renders the frozen heading and search field', () => {
        const { props } = setup({ searchQuery: 'art' });
        expect(screen.getByText('Or Quick-Select a Lead')).toBeInTheDocument();

        const search = screen.getByLabelText('Search leads');
        expect(search).toHaveValue('art');
        expect(search).toHaveAttribute('placeholder', 'Search leads...');

        fireEvent.change(search, { target: { value: 'new' } });
        expect(props.setSearchQuery).toHaveBeenCalledWith('new');
    });

    it('shows the exact empty message', () => {
        setup({ filteredDrivers: [] });
        expect(screen.getByText('No leads found.')).toBeInTheDocument();
    });

    it('renders only the first 20 drivers in the original order', () => {
        const drivers = Array.from({ length: 25 }, (_, i) => driver(`d${String(i).padStart(2, '0')}`));
        setup({ filteredDrivers: drivers });

        const rows = screen.getAllByRole('button', { name: /^Artificial D/ });
        expect(rows).toHaveLength(20);
        expect(rows[0]).toHaveAccessibleName(/Artificial D00/);
        expect(rows[19]).toHaveAccessibleName(/Artificial D19/);
    });

    it('passes the exact driver object to handleQuickSelect', () => {
        const target = driver('d1');
        const { props } = setup({ filteredDrivers: [target] });

        fireEvent.click(screen.getByRole('button', { name: /^Artificial D1/ }));
        expect(props.handleQuickSelect).toHaveBeenCalledWith(target);
    });

    it('applies the email and phone fallbacks with a visible separator', () => {
        setup({
            filteredDrivers: [
                driver('d1', { email: undefined, phone: undefined, phoneNumber: undefined }),
                driver('d2', { phone: undefined, phoneNumber: '555-0133' }),
            ],
        });
        expect(screen.getByText('No email | No phone')).toBeInTheDocument();
        expect(screen.getByText('d2@example.test | 555-0133')).toBeInTheDocument();
    });

    it('gives each row a unique accessible name starting with the driver name', () => {
        setup({ filteredDrivers: [driver('d1'), driver('d2')] });
        const rows = screen.getAllByRole('button', { name: /^Artificial D/ });
        const names = rows.map(r => r.textContent.trim());
        expect(new Set(names).size).toBe(2);
        names.forEach(n => expect(n.startsWith('Artificial D')).toBe(true));
    });

    it('activates a row from the keyboard as a native button', () => {
        const target = driver('d1');
        const { props } = setup({ filteredDrivers: [target] });
        const row = screen.getByRole('button', { name: /^Artificial D1/ });

        expect(row.tagName).toBe('BUTTON');
        row.focus();
        expect(row).toHaveFocus();
        fireEvent.click(row);
        expect(props.handleQuickSelect).toHaveBeenCalledWith(target);
    });
});

describe('SendTemplateModal — presentation guardrails', () => {
    const fullPartition = {
        groups: [
            { groupKey: 'g1', uiLabel: 'Alpha', appliesCount: 2, useDateTriplet: false, members: [{ id: 'm1', label: 'Member One' }] },
            { groupKey: 'dob', uiLabel: 'Date Of Birth', appliesCount: 1, useDateTriplet: true, members: [{ id: 'm2', label: 'DOB' }] },
        ],
        plainFields: [{ id: 'p1', label: 'Gamma' }],
    };

    it('uses no unsupported 9px or 10px interface text', () => {
        const { container } = setup({
            manualName: 'Artificial One',
            editablePrefillPartition: fullPartition,
            filteredDrivers: [driver('d1')],
        });
        expect(container.querySelector('[class*="text-[10px]"]')).toBeNull();
        expect(container.querySelector('[class*="text-[9px]"]')).toBeNull();
    });

    it('keeps the prefill and quick-select lists internally scrollable', () => {
        const { container } = setup({
            editablePrefillPartition: fullPartition,
            filteredDrivers: [driver('d1')],
        });
        expect(container.querySelector('.max-h-\\[220px\\].overflow-y-auto')).not.toBeNull();
        expect(container.querySelector('.max-h-\\[180px\\].overflow-y-auto')).not.toBeNull();
    });

    it('has no accessibility violations in a fully populated dialog', async () => {
        const { baseElement } = setup({
            manualName: 'Artificial One',
            manualEmail: 'one@example.test',
            manualPhone: '555-0101',
            editablePrefillPartition: fullPartition,
            filteredDrivers: [driver('d1'), driver('d2')],
        });
        expect((await axe(baseElement)).violations).toEqual([]);
    });

    it('has no accessibility violations while sending', async () => {
        const { baseElement } = setup({ manualName: 'Artificial One', sending: true });
        expect((await axe(baseElement)).violations).toEqual([]);
    });
});
