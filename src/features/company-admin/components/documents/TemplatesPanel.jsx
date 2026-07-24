import React, { useId } from 'react';
import { FileText, Send, Trash2, Loader2, Edit3, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { Badge, Button, Card, IconButton } from '@/design-system/components';
import { ResponsiveGrid, Stack } from '@/design-system/layouts';

/**
 * Templates tab of the Documents Center: post-application success-page forms
 * card + the template grid.
 *
 * Presentation only. Every prop, callback argument shape, ordering rule,
 * required default and message below is the pre-migration contract: the panel
 * decides how things look, while DocumentsManager still owns the Firestore
 * reads/writes, the send flow and the post-application persistence.
 *
 * The design system has no approved Checkbox primitive yet (tracked in the
 * roadmap), so the two native checkboxes stay feature-owned. They keep a
 * programmatic label, a visible focus ring, a 44 px-tall activation row and a
 * checked state that is never conveyed by colour alone.
 */
export function TemplatesPanel({
    templates,
    templatesLoading,
    postSubmitTemplateIds,
    postSubmitRequiredById = {},
    togglePostSubmitRequired,
    savingPostSubmitTemplates,
    handleSavePostSubmitTemplates,
    movePostSubmitTemplate,
    isTemplateEnabledPostSubmit,
    togglePostSubmitTemplate,
    handleUseTemplate,
    handleEditTemplate,
    handleDeleteTemplate,
}) {
    const rawId = useId().replace(/:/g, '');
    const postSubmitHeadingId = `post-submit-forms-heading-${rawId}`;

    return (
        <Stack gap="md">
            <Card aria-labelledby={postSubmitHeadingId}>
                <Stack gap="sm">
                    <div className="flex flex-col gap-ds-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <h3 id={postSubmitHeadingId} className="text-ds-body font-bold text-ds-content">
                                Post-Application Success Page Forms
                            </h3>
                            <p className="mt-ds-1 text-ds-sm text-ds-content-secondary">
                                Choose which templates appear right after a driver submits the application.
                                Forms are <strong>required</strong> by default — drivers see them as a must-complete
                                checklist. Untick "Required" to make a form optional.
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            className="shrink-0"
                            loading={savingPostSubmitTemplates}
                            onClick={handleSavePostSubmitTemplates}
                        >
                            {!savingPostSubmitTemplates && <Save size={14} aria-hidden="true" />}
                            Save Forms
                        </Button>
                    </div>

                    {/* Announce the in-flight save; the Button also reports aria-busy. */}
                    <p role="status" className="ds-visually-hidden">
                        {savingPostSubmitTemplates ? 'Saving post-application forms…' : ''}
                    </p>

                    {postSubmitTemplateIds.length === 0 ? (
                        <p className="text-ds-sm text-ds-content-secondary">No follow-up forms enabled yet.</p>
                    ) : (
                        <ul className="flex flex-col gap-ds-2">
                            {postSubmitTemplateIds.map((templateId, idx) => {
                                const template = templates.find((item) => item.id === templateId);
                                if (!template) return null;
                                const isRequired = postSubmitRequiredById[templateId] !== false;
                                const title = template.title || 'Complete Form';
                                const isFirst = idx === 0;
                                const isLast = idx === postSubmitTemplateIds.length - 1;
                                return (
                                    <li
                                        key={templateId}
                                        className="flex flex-wrap items-center justify-between gap-ds-2 rounded-ds-lg border border-ds-status-info-border bg-ds-status-info-bg px-ds-3 py-ds-2"
                                    >
                                        <span className="min-w-0 flex-1 text-ds-sm font-medium text-ds-content [overflow-wrap:anywhere]">
                                            {title}
                                        </span>
                                        <div className="flex shrink-0 flex-wrap items-center gap-ds-2">
                                            <label
                                                className="inline-flex min-h-11 cursor-pointer select-none items-center gap-ds-2 text-ds-sm text-ds-content"
                                                title="Required documents must be completed by the driver right after submitting the application."
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 shrink-0 accent-ds-action-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
                                                    checked={isRequired}
                                                    onChange={() => togglePostSubmitRequired?.(templateId)}
                                                />
                                                <span>Required</span>
                                                <span className="ds-visually-hidden">for {title}</span>
                                            </label>
                                            <IconButton
                                                label={`Move ${title} up`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={isFirst}
                                                // The tooltip explains why a disabled control cannot move,
                                                // since a disabled button is skipped by keyboard focus.
                                                title={isFirst ? `${title} is already first` : `Move ${title} up`}
                                                onClick={() => movePostSubmitTemplate(templateId, 'up')}
                                            >
                                                <ArrowUp size={14} aria-hidden="true" />
                                            </IconButton>
                                            <IconButton
                                                label={`Move ${title} down`}
                                                variant="ghost"
                                                size="sm"
                                                disabled={isLast}
                                                title={isLast ? `${title} is already last` : `Move ${title} down`}
                                                onClick={() => movePostSubmitTemplate(templateId, 'down')}
                                            >
                                                <ArrowDown size={14} aria-hidden="true" />
                                            </IconButton>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Stack>
            </Card>

            {templatesLoading ? (
                <div
                    role="status"
                    className="flex items-center justify-center gap-ds-2 py-ds-12 text-ds-sm text-ds-content-secondary"
                >
                    <Loader2 size={20} aria-hidden="true" className="animate-spin" />
                    Loading templates
                </div>
            ) : templates.length === 0 ? (
                <p className="rounded-ds-xl border-2 border-dashed border-ds-border bg-ds-surface p-ds-12 text-center text-ds-body text-ds-content-secondary">
                    No templates saved yet.
                </p>
            ) : (
                <ResponsiveGrid minItemWidth="320px">
                    {templates.map(tmp => {
                        // Visible titles render the stored value unchanged; only the
                        // accessible action names fall back, so an untitled template
                        // still exposes distinguishable controls.
                        const actionTitle = tmp.title || 'Untitled';
                        return (
                            <Card key={tmp.id} className="flex h-full flex-col gap-ds-3">
                                <div className="flex items-start justify-between gap-ds-2">
                                    <span
                                        aria-hidden="true"
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ds-lg bg-ds-status-accent-bg text-ds-status-accent-fg"
                                    >
                                        <FileText size={24} />
                                    </span>
                                    {/* Always rendered, never hover-revealed, and left at the
                                        default size so the touch target matches the card's
                                        other actions. */}
                                    <IconButton
                                        label={`Delete ${actionTitle}`}
                                        variant="ghost"
                                        onClick={() => handleDeleteTemplate(tmp.id)}
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                    </IconButton>
                                </div>

                                <div className="min-w-0">
                                    <h3 className="text-ds-body font-bold text-ds-content [overflow-wrap:anywhere]">
                                        {tmp.title}
                                    </h3>
                                    <p className="mt-ds-2">
                                        <Badge tone="neutral">{tmp.fields?.length || 0} Fields</Badge>
                                    </p>
                                </div>

                                <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-ds-2 text-ds-sm text-ds-content-secondary">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 shrink-0 accent-ds-action-primary focus-visible:outline-none focus-visible:shadow-ds-focus"
                                        checked={isTemplateEnabledPostSubmit(tmp.id)}
                                        onChange={() => togglePostSubmitTemplate(tmp.id)}
                                    />
                                    {/* The label stays exactly the original sentence: the card's
                                        own heading supplies which template it belongs to, and
                                        repeating the title here would put a second copy of it in
                                        the card's text. */}
                                    <span>Show on post-submit success page</span>
                                </label>

                                <div className="mt-auto grid grid-cols-2 gap-ds-2">
                                    <Button
                                        variant="primary"
                                        aria-label={`Use ${actionTitle}`}
                                        onClick={() => handleUseTemplate(tmp)}
                                    >
                                        <Send size={14} aria-hidden="true" /> Use
                                    </Button>
                                    <Button
                                        aria-label={`Edit ${actionTitle}`}
                                        onClick={() => handleEditTemplate(tmp)}
                                    >
                                        <Edit3 size={14} aria-hidden="true" /> Edit
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </ResponsiveGrid>
            )}
        </Stack>
    );
}

export default TemplatesPanel;
