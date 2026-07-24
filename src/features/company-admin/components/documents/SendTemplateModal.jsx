import React, { useId, useRef } from 'react';
import DateTripletField from '@shared/components/form/DateTripletField';
import { X, User, Mail, Copy, MessageSquare, Send } from 'lucide-react';
import { Modal } from '@shared/components/modals/Modal';
import { Button, FormField, IconButton, Input, Label } from '@/design-system/components';

const slugPrefillGroupId = (groupKey) =>
    String(groupKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);

/**
 * Delivery options. The order, the `key` values sent to `setDeliveryMethod`, and
 * the labels are a frozen contract shared with DocumentsManager and the backend
 * send flow — presentation may change, these may not.
 */
const DELIVERY_METHODS = [
    { key: 'email', icon: Mail, label: 'Email' },
    { key: 'sms', icon: MessageSquare, label: 'SMS' },
    { key: 'both', icon: Send, label: 'Both' },
    { key: 'copy', icon: Copy, label: 'Copy Link' },
];

/**
 * FEAT-2/3/4: Send-template modal (recipient entry, delivery method, template
 * pre-fill, quick-select lead). Extracted verbatim from DocumentsManager.jsx.
 *
 * Presentation only. Every prop is pass-through: this component owns no state,
 * performs no I/O, and adds no validation — recipient-name and delivery-specific
 * validation stay in `executeTemplateSend` inside DocumentsManager, and the
 * quick-select search filtering stays in `filteredDrivers` there too.
 *
 * Documented behavioural hardening (the only one): the legacy overlay could not
 * be dismissed by backdrop click and had no Escape handler at all. Adopting the
 * shared accessible Modal adds a focus trap, focus restoration and Escape
 * dismissal, so dismissal is deliberately gated — `closeOnBackdrop={false}`
 * keeps the previous "backdrop never closes" behaviour, and `closeOnEscape` is
 * disabled while `sending` so an in-flight send cannot be hidden. The explicit
 * Close control is disabled for the same reason. No send operation, callback or
 * parent state is affected.
 */
export function SendTemplateModal({
    selectedTemplate,
    onClose,
    manualName,
    setManualName,
    manualEmail,
    setManualEmail,
    manualPhone,
    setManualPhone,
    deliveryMethod,
    setDeliveryMethod,
    editablePrefillPartition,
    prefillValues,
    setPrefillValues,
    prefillValuesByGroupKey,
    setPrefillValuesByGroupKey,
    sending,
    executeTemplateSend,
    filteredDrivers,
    searchQuery,
    setSearchQuery,
    handleQuickSelect,
}) {
    const nameInputRef = useRef(null);
    const rawId = useId().replace(/:/g, '');
    const titleId = `send-template-title-${rawId}`;
    const subtitleId = `send-template-subtitle-${rawId}`;
    const deliveryLabelId = `send-template-delivery-${rawId}`;
    const prefillLabelId = `send-template-prefill-${rawId}`;
    const quickSelectLabelId = `send-template-quick-${rawId}`;

    const hasPrefill =
        editablePrefillPartition.groups.length > 0 || editablePrefillPartition.plainFields.length > 0;

    return (
        <Modal
            onClose={onClose}
            labelledBy={titleId}
            describedBy={subtitleId}
            initialFocusRef={nameInputRef}
            closeOnBackdrop={false}
            closeOnEscape={!sending}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-ds-xl border border-ds-border bg-ds-surface shadow-ds-lg"
        >
            <header className="flex items-center justify-between gap-ds-4 border-b border-ds-border-subtle bg-ds-surface-subtle p-ds-6">
                <div className="min-w-0">
                    <h2 id={titleId} className="text-ds-heading-sm font-bold text-ds-content">Send Document</h2>
                    <p id={subtitleId} className="break-words text-ds-xs text-ds-content-secondary">
                        Sending: <b>{selectedTemplate?.title}</b>
                    </p>
                </div>
                <IconButton label="Close" variant="ghost" disabled={sending} onClick={onClose}>
                    <X size={20} aria-hidden="true" />
                </IconButton>
            </header>

            {/* Single internal scroll region: the panel is capped at 90vh, so the
                submit action stays reachable without document-level scrolling. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {/* FEAT-2: Manual Recipient Entry */}
                <div className="flex flex-col gap-ds-3 border-b border-ds-border-subtle p-ds-5">
                    <h3 className="text-ds-xs font-bold uppercase tracking-wide text-ds-content-secondary">Recipient Details</h3>
                    <div className="grid grid-cols-1 gap-ds-3">
                        <FormField label="Recipient name">
                            <Input
                                ref={nameInputRef}
                                type="text"
                                placeholder="Recipient name *"
                                value={manualName}
                                onChange={e => setManualName(e.target.value)}
                            />
                        </FormField>
                        <FormField label="Email address">
                            <Input
                                type="email"
                                placeholder="Email address"
                                value={manualEmail}
                                onChange={e => setManualEmail(e.target.value)}
                            />
                        </FormField>
                        <FormField label="Phone number">
                            <Input
                                type="tel"
                                placeholder="Phone number"
                                value={manualPhone}
                                onChange={e => setManualPhone(e.target.value)}
                            />
                        </FormField>
                    </div>

                    {/* FEAT-4: Delivery Method Selector */}
                    <h3 id={deliveryLabelId} className="pt-ds-2 text-ds-xs font-bold uppercase tracking-wide text-ds-content-secondary">Delivery Method</h3>
                    <div role="group" aria-labelledby={deliveryLabelId} className="grid grid-cols-2 gap-ds-2 sm:grid-cols-4">
                        {DELIVERY_METHODS.map(opt => {
                            const Icon = opt.icon;
                            const selected = deliveryMethod === opt.key;
                            return (
                                <Button
                                    key={opt.key}
                                    variant={selected ? 'primary' : 'secondary'}
                                    size="sm"
                                    aria-pressed={selected}
                                    onClick={() => setDeliveryMethod(opt.key)}
                                >
                                    <Icon size={14} aria-hidden="true" />
                                    {opt.label}
                                </Button>
                            );
                        })}
                    </div>

                    {/* Template Pre-fill Fields — grouped bindings/tokens; plain text stays per field */}
                    {hasPrefill && (
                        <div className="pt-ds-3">
                            <h3 id={prefillLabelId} className="mb-ds-2 text-ds-xs font-bold uppercase tracking-wide text-ds-content-secondary">Pre-fill Fields (Optional)</h3>
                            <div
                                role="group"
                                aria-labelledby={prefillLabelId}
                                tabIndex={0}
                                className="flex max-h-[220px] flex-col gap-ds-3 overflow-y-auto pr-1 focus-visible:outline-none focus-visible:shadow-ds-focus"
                            >
                                {editablePrefillPartition.groups.map((group) => {
                                    const groupId = `edoc-grp-${slugPrefillGroupId(group.groupKey)}`;
                                    const memberTitle = group.members.map((m) => m.label || m.id).join(', ');
                                    const appliesCount = group.appliesCount > 1 ? (
                                        <span className="font-normal normal-case text-ds-content-muted"> — applies to {group.appliesCount} places</span>
                                    ) : null;

                                    return (
                                        <div key={group.groupKey} className="flex flex-col gap-ds-1" role="group" aria-label={group.uiLabel}>
                                            {group.useDateTriplet ? (
                                                <div
                                                    className="block break-words text-ds-xs font-bold uppercase text-ds-content-secondary"
                                                    title={memberTitle}
                                                >
                                                    {group.uiLabel}
                                                    {appliesCount}
                                                </div>
                                            ) : (
                                                /* FormField takes a plain-string label, but this label carries a
                                                   member tooltip and the applies-count fragment, so the approved
                                                   Label + Input pair is composed directly instead. */
                                                <Label
                                                    className="break-words uppercase"
                                                    htmlFor={groupId}
                                                    title={memberTitle}
                                                >
                                                    {group.uiLabel}
                                                    {appliesCount}
                                                </Label>
                                            )}
                                            {group.useDateTriplet ? (
                                                <DateTripletField
                                                    label=""
                                                    idPrefix={groupId}
                                                    name={`prefill-${group.groupKey}`}
                                                    value={prefillValuesByGroupKey[group.groupKey] || ''}
                                                    onChange={(_n, v) =>
                                                        setPrefillValuesByGroupKey((prev) => ({
                                                            ...prev,
                                                            [group.groupKey]: v,
                                                        }))
                                                    }
                                                    required={false}
                                                    maxToday={true}
                                                    minYear={1920}
                                                />
                                            ) : (
                                                <Input
                                                    id={groupId}
                                                    type="text"
                                                    placeholder={`Enter ${group.uiLabel}...`}
                                                    value={prefillValuesByGroupKey[group.groupKey] || ''}
                                                    onChange={(e) =>
                                                        setPrefillValuesByGroupKey((prev) => ({
                                                            ...prev,
                                                            [group.groupKey]: e.target.value,
                                                        }))
                                                    }
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                                {editablePrefillPartition.plainFields.map((field) => (
                                    <FormField
                                        key={field.id}
                                        label={field.label || field.id}
                                        className="break-words"
                                    >
                                        <Input
                                            id={`edoc-plain-${field.id}`}
                                            type="text"
                                            placeholder={`Enter ${field.label || 'text'}...`}
                                            value={prefillValues[field.id] || ''}
                                            onChange={(e) =>
                                                setPrefillValues((prev) => ({
                                                    ...prev,
                                                    [field.id]: e.target.value,
                                                }))
                                            }
                                        />
                                    </FormField>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Send / Copy Button */}
                    <Button
                        variant="primary"
                        fullWidth
                        onClick={executeTemplateSend}
                        disabled={sending || !manualName.trim()}
                        loading={sending}
                    >
                        {deliveryMethod === 'copy' ? (
                            <><Copy size={16} aria-hidden="true" /> Copy Signing Link</>
                        ) : (
                            <><Send size={16} aria-hidden="true" /> Send Document</>
                        )}
                    </Button>
                    <p role="status" className="ds-visually-hidden">
                        {sending ? 'Sending document, please wait…' : ''}
                    </p>
                </div>

                {/* Quick Select from existing leads */}
                <div className="bg-ds-surface-subtle p-ds-4">
                    <h3 id={quickSelectLabelId} className="mb-ds-2 text-ds-xs font-bold uppercase tracking-wide text-ds-content-secondary">Or Quick-Select a Lead</h3>
                    <div className="mb-ds-2">
                        <FormField label="Search leads">
                            <Input
                                type="text"
                                placeholder="Search leads..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </FormField>
                    </div>
                    <div
                        role="group"
                        aria-labelledby={quickSelectLabelId}
                        tabIndex={0}
                        className="flex max-h-[180px] flex-col gap-ds-1 overflow-y-auto focus-visible:outline-none focus-visible:shadow-ds-focus"
                    >
                        {filteredDrivers.length === 0 ? (
                            <p className="py-ds-6 text-center text-ds-xs italic text-ds-content-muted">No leads found.</p>
                        ) : (
                            filteredDrivers.slice(0, 20).map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => handleQuickSelect(d)}
                                    className="group flex w-full items-center gap-ds-3 rounded-ds-md p-ds-2 text-left transition-colors hover:bg-ds-surface focus-visible:outline-none focus-visible:shadow-ds-focus"
                                >
                                    <span aria-hidden="true" className="rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-ds-content-secondary">
                                        <User size={14} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-ds-xs font-bold text-ds-content">{d.firstName} {d.lastName}</span>
                                        <span className="block truncate text-ds-xs text-ds-content-secondary">{d.email || 'No email'} | {d.phone || d.phoneNumber || 'No phone'}</span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export default SendTemplateModal;
