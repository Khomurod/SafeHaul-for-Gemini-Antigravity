import React from 'react';
import {
    Loader2, FileSignature, ArrowRight, CheckCircle2, Circle, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { DOC_STATUS } from './postApplyDocsStorage';

/**
 * Post-submission document checklist. Required templates are presented as a
 * blocking "Required Documents" list with a visible per-document status;
 * optional templates render in a separate low-emphasis section.
 */

const STATUS_META = {
    [DOC_STATUS.NOT_STARTED]: { label: 'Not started', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    [DOC_STATUS.OPENING]: { label: 'Opening…', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    [DOC_STATUS.IN_PROGRESS]: { label: 'In progress', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    [DOC_STATUS.COMPLETED]: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
    [DOC_STATUS.ERROR]: { label: 'Error', className: 'bg-red-100 text-red-700 border-red-200' },
};

function DocumentRow({ template, docState, openingTemplateId, onOpen }) {
    const status = docState?.status || DOC_STATUS.NOT_STARTED;
    const meta = STATUS_META[status] || STATUS_META[DOC_STATUS.NOT_STARTED];
    const isCompleted = status === DOC_STATUS.COMPLETED;
    const isOpening = openingTemplateId === template.templateId || status === DOC_STATUS.OPENING;
    const isError = status === DOC_STATUS.ERROR;

    return (
        <div
            className={`w-full rounded-lg border px-3 py-2 ${isCompleted ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-white'}`}
            data-testid={`post-apply-doc-${template.templateId}`}
        >
            <button
                type="button"
                onClick={() => onOpen(template)}
                disabled={isOpening || isCompleted}
                className="w-full flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed"
            >
                <span className="flex items-center gap-2 min-w-0">
                    {isCompleted ? (
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    ) : isError ? (
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    ) : (
                        <Circle size={16} className="text-blue-300 shrink-0" />
                    )}
                    <span className={`text-sm font-medium truncate ${isCompleted ? 'text-green-900' : 'text-blue-900'}`}>
                        {template.title || 'Complete Form'}
                    </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${meta.className}`}>
                        {meta.label}
                    </span>
                    {isOpening ? (
                        <Loader2 className="animate-spin text-blue-700" size={16} />
                    ) : !isCompleted ? (
                        <ArrowRight className="text-blue-700" size={16} />
                    ) : null}
                </span>
            </button>
            {isError && (
                <div className="mt-2 flex items-start justify-between gap-2 text-xs text-red-700">
                    <span className="min-w-0">
                        {docState?.error || 'Could not open this document.'}
                    </span>
                    <button
                        type="button"
                        onClick={() => onOpen(template)}
                        className="shrink-0 inline-flex items-center gap-1 font-semibold text-red-800 hover:underline"
                    >
                        <RotateCcw size={12} /> Retry
                    </button>
                </div>
            )}
        </div>
    );
}

export function RequiredDocumentsChecklist({
    templates,
    docStates,
    openingTemplateId,
    onOpenTemplate,
}) {
    const requiredTemplates = templates.filter((t) => t.required !== false);
    const optionalTemplates = templates.filter((t) => t.required === false);

    const completedRequired = requiredTemplates.filter(
        (t) => docStates?.[t.templateId]?.status === DOC_STATUS.COMPLETED
    ).length;
    const allRequiredComplete =
        requiredTemplates.length > 0 && completedRequired === requiredTemplates.length;

    return (
        <div className="text-left space-y-4">
            {requiredTemplates.length > 0 && (
                <div
                    className={`border rounded-xl p-4 ${allRequiredComplete ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}
                    data-testid="required-documents-section"
                >
                    <div className="flex items-start gap-2 mb-1">
                        <FileSignature size={18} className={`${allRequiredComplete ? 'text-green-700' : 'text-blue-700'} mt-0.5`} />
                        <div>
                            <h3 className={`text-sm font-bold ${allRequiredComplete ? 'text-green-900' : 'text-blue-900'}`}>
                                Required Documents
                            </h3>
                            <p className={`text-xs ${allRequiredComplete ? 'text-green-700' : 'text-blue-700'}`}>
                                {allRequiredComplete
                                    ? 'All required documents are completed. You are all set!'
                                    : 'Your application was submitted successfully, but these documents still need to be completed before your file is finished.'}
                            </p>
                        </div>
                    </div>
                    <p className="text-[11px] font-semibold text-blue-800 mb-2 mt-2" data-testid="required-documents-progress">
                        {completedRequired} of {requiredTemplates.length} completed
                    </p>
                    <div className="space-y-2">
                        {requiredTemplates.map((template) => (
                            <DocumentRow
                                key={template.templateId}
                                template={template}
                                docState={docStates?.[template.templateId]}
                                openingTemplateId={openingTemplateId}
                                onOpen={onOpenTemplate}
                            />
                        ))}
                    </div>
                </div>
            )}

            {optionalTemplates.length > 0 && (
                <div className="border border-gray-200 bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-1">Optional forms</h3>
                    <p className="text-xs text-gray-500 mb-2">
                        You can complete these now, or skip and do them later.
                    </p>
                    <div className="space-y-2">
                        {optionalTemplates.map((template) => (
                            <DocumentRow
                                key={template.templateId}
                                template={template}
                                docState={docStates?.[template.templateId]}
                                openingTemplateId={openingTemplateId}
                                onOpen={onOpenTemplate}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
