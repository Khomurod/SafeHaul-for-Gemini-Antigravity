import React, { useId, useRef } from 'react';
import { X, Mail, MessageSquare, Copy, Send, Check } from 'lucide-react';
import { Button, IconButton } from '@/design-system/components';
import { FormField, Input } from '@/design-system/components';
import { Stack } from '@/design-system/layouts';
import { FIELD_CATEGORIES } from './fieldDefinitions';

/**
 * Left sidebar of the envelope creator: recipient/delivery inputs, the field
 * palette, and the placed-fields list.
 *
 * Presentation only. Every prop, callback argument and conditional below is the
 * pre-migration contract: EnvelopeCreator still owns the recipient state, the
 * upload validation, field creation/removal and the selection.
 *
 * Two compositions stay feature-owned because the design system has no approved
 * primitive for them yet (both tracked in the roadmap): the delivery-method
 * toggle group (no segmented-control primitive) and the file input (no
 * file-input primitive — this follows the same visually-hidden-input + approved
 * Button pattern already used by the branding upload).
 */

/**
 * Delivery options in their original order. The `key` values are the exact
 * `deliveryMethod` values EnvelopeCreator sends to the backend, so they are
 * frozen; only the presentation around them changed.
 */
const DELIVERY_OPTIONS = [
    { key: 'email', icon: Mail, label: 'Email' },
    { key: 'sms', icon: MessageSquare, label: 'SMS' },
    { key: 'both', icon: Send, label: 'Both' },
    { key: 'copy', icon: Copy, label: 'Link' },
];

function Kbd({ children }) {
    return (
        <kbd className="rounded-ds-sm border border-ds-border bg-ds-surface-subtle px-ds-1 font-mono text-ds-xs text-ds-content">
            {children}
        </kbd>
    );
}

export function EnvelopeSidebar({
    creatorMode,
    isEditingTemplate,
    recipientName,
    setRecipientName,
    recipientEmail,
    setRecipientEmail,
    recipientPhone,
    setRecipientPhone,
    deliveryMethod,
    setDeliveryMethod,
    file,
    handleFileChange,
    addField,
    fields,
    selectedFieldId,
    setSelectedFieldId,
    removeField,
    getIcon,
}) {
    const rawId = useId().replace(/:/g, '');
    const recipientHeadingId = `envelope-recipient-heading-${rawId}`;
    const deliveryLabelId = `envelope-delivery-label-${rawId}`;
    const paletteHeadingId = `envelope-palette-heading-${rawId}`;
    const placedHeadingId = `envelope-placed-heading-${rawId}`;
    const uploadHelpId = `envelope-upload-help-${rawId}`;
    const fileInputRef = useRef(null);

    return (
        <aside
            aria-label="Envelope setup"
            className="z-10 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-ds-border bg-ds-surface shadow-ds-lg"
        >
            {/* Recipient Info (only in request mode) */}
            {creatorMode === 'request' && !isEditingTemplate && (
                <section aria-labelledby={recipientHeadingId} className="border-b border-ds-border p-ds-4">
                    <h3
                        id={recipientHeadingId}
                        className="mb-ds-2 text-ds-xs font-bold uppercase tracking-wider text-ds-content-secondary"
                    >
                        Recipient
                    </h3>
                    <Stack gap="sm">
                        <FormField label="Name" required>
                            <Input
                                type="text"
                                value={recipientName}
                                onChange={e => setRecipientName(e.target.value)}
                            />
                        </FormField>
                        <FormField label="Email">
                            <Input
                                type="email"
                                value={recipientEmail}
                                onChange={e => setRecipientEmail(e.target.value)}
                            />
                        </FormField>
                        <FormField label="Phone">
                            <Input
                                type="tel"
                                value={recipientPhone}
                                onChange={e => setRecipientPhone(e.target.value)}
                            />
                        </FormField>
                    </Stack>

                    {/* Delivery Method */}
                    <h3
                        id={deliveryLabelId}
                        className="mb-ds-1 mt-ds-4 text-ds-xs font-bold uppercase tracking-wider text-ds-content-secondary"
                    >
                        Delivery
                    </h3>
                    <div role="group" aria-labelledby={deliveryLabelId} className="grid grid-cols-2 gap-ds-1">
                        {DELIVERY_OPTIONS.map(opt => {
                            const OptionIcon = opt.icon;
                            const isSelected = deliveryMethod === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setDeliveryMethod(opt.key)}
                                    // Selection is carried by aria-pressed and the check icon,
                                    // never by the border/background colour alone.
                                    className={`flex min-h-11 items-center justify-center gap-ds-1 rounded-ds-lg border px-ds-2 text-ds-xs font-bold transition-colors focus-visible:outline-none focus-visible:shadow-ds-focus ${
                                        isSelected
                                            ? 'border-ds-action-primary bg-ds-status-info-bg text-ds-status-info-fg'
                                            : 'border-ds-border bg-ds-surface text-ds-content-secondary hover:bg-ds-surface-subtle'
                                    }`}
                                >
                                    {isSelected
                                        ? <Check size={12} aria-hidden="true" />
                                        : <OptionIcon size={12} aria-hidden="true" />}
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Semantic Field Palette */}
            <section aria-labelledby={paletteHeadingId} className="flex-1 p-ds-4">
                <h3
                    id={paletteHeadingId}
                    className="mb-ds-3 text-ds-xs font-bold uppercase tracking-wider text-ds-content-secondary"
                >
                    {creatorMode === 'request' ? 'Fields' : 'Setup Fields'}
                </h3>
                {file && (
                    <p className="mb-ds-3 text-ds-xs leading-snug text-ds-content-secondary">
                        Duplicate a placed field: select it on the PDF, then{' '}
                        <Kbd>Ctrl+C</Kbd>
                        {' / '}
                        <Kbd>⌘C</Kbd>
                        , then{' '}
                        <Kbd>Ctrl+V</Kbd>
                        {' / '}
                        <Kbd>⌘V</Kbd>
                        . Same size; repeats step to the right (wraps below).
                        {' '}
                        Over the PDF,{' '}
                        <Kbd>Ctrl</Kbd>
                        {' / '}
                        <Kbd>⌘</Kbd>
                        {' + '}scroll zooms the document only (not the whole page).
                    </p>
                )}

                {!file ? (
                    <div className="rounded-ds-xl border-2 border-dashed border-ds-border bg-ds-surface-subtle p-ds-4 text-center">
                        <p id={uploadHelpId} className="mb-ds-2 text-ds-sm font-medium text-ds-content-secondary">
                            Upload a PDF first
                        </p>
                        {/* Visually hidden rather than display:none so the control stays
                            reachable; the approved Button is the visible trigger. */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileChange}
                            className="ds-visually-hidden"
                            tabIndex={-1}
                            aria-label="Choose a PDF file"
                            aria-describedby={uploadHelpId}
                            id="pdf-upload"
                        />
                        <Button
                            type="button"
                            size="sm"
                            aria-describedby={uploadHelpId}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Choose File
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-ds-4">
                        {FIELD_CATEGORIES.map((category) => (
                            <div key={category.title}>
                                <h4 className="mb-ds-1 text-ds-xs font-bold uppercase tracking-wider text-ds-content-secondary">
                                    {category.title}
                                </h4>
                                <div className="flex flex-col gap-ds-1">
                                    {category.items.map((item) => {
                                        const IconComp = item.icon;
                                        return (
                                            <button
                                                key={item.templateId}
                                                type="button"
                                                onClick={() => addField(item.templateId)}
                                                aria-label={`Add ${item.label} field`}
                                                className={`flex min-h-11 w-full items-center gap-ds-2 rounded-ds-lg border px-ds-3 py-ds-2 text-left transition-colors focus-visible:outline-none focus-visible:shadow-ds-focus ${item.color}`}
                                            >
                                                <IconComp size={15} aria-hidden="true" />
                                                <span className="text-ds-xs font-semibold">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Placed Fields List */}
                {fields.length > 0 && (
                    <div className="mt-ds-4">
                        <h4
                            id={placedHeadingId}
                            className="mb-ds-1 text-ds-xs font-bold uppercase tracking-wider text-ds-content-secondary"
                        >
                            Placed ({fields.length})
                        </h4>
                        {/* Each row is a real button plus a sibling remove button, so the
                            list no longer nests an interactive control inside a clickable
                            div and both actions are keyboard reachable. */}
                        <ul aria-labelledby={placedHeadingId} className="flex max-h-48 flex-col gap-ds-1 overflow-y-auto pr-1">
                            {fields.map((f) => {
                                const isSelected = selectedFieldId === f.id;
                                return (
                                    <li
                                        key={f.id}
                                        className={`flex items-center justify-between gap-ds-1 rounded-ds-lg border transition-colors ${
                                            isSelected
                                                ? 'border-ds-action-primary bg-ds-status-info-bg'
                                                : 'border-ds-border bg-ds-surface-subtle'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => setSelectedFieldId(f.id)}
                                            className="flex min-h-11 min-w-0 flex-1 items-center gap-ds-2 rounded-ds-lg px-ds-2 text-left text-ds-xs focus-visible:outline-none focus-visible:shadow-ds-focus"
                                        >
                                            <span className="shrink-0 text-ds-content-secondary" aria-hidden="true">
                                                {getIcon(f.type)}
                                            </span>
                                            <span className="truncate font-bold text-ds-content">{f.label}</span>
                                            <span className="shrink-0 rounded-ds-sm bg-ds-status-neutral-bg px-ds-1 text-ds-xs text-ds-content-secondary">
                                                P{f.page}
                                            </span>
                                        </button>
                                        <IconButton
                                            label={`Remove ${f.label} on page ${f.page}`}
                                            variant="ghost"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                                        >
                                            <X size={12} aria-hidden="true" />
                                        </IconButton>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </section>
        </aside>
    );
}

export default EnvelopeSidebar;
