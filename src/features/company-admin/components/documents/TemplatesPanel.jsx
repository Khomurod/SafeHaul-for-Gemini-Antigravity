import React from 'react';
import { FileText, Send, Trash2, Loader2, Edit3, ArrowUp, ArrowDown, Save } from 'lucide-react';

/**
 * Templates tab of the Documents Center: post-application success-page forms
 * card + the template grid. Extracted verbatim from DocumentsManager.jsx.
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
    return (
        <div className="space-y-5">
            <div className="bg-white border border-blue-100 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                        <h3 className="text-sm font-bold text-blue-900">Post-Application Success Page Forms</h3>
                        <p className="text-xs text-blue-700">
                            Choose which templates appear right after a driver submits the application.
                            Forms are <strong>required</strong> by default — drivers see them as a must-complete
                            checklist. Untick "Required" to make a form optional.
                        </p>
                    </div>
                    <button
                        onClick={handleSavePostSubmitTemplates}
                        disabled={savingPostSubmitTemplates}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                    >
                        {savingPostSubmitTemplates ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Forms
                    </button>
                </div>
                {postSubmitTemplateIds.length === 0 ? (
                    <p className="text-xs text-gray-500">No follow-up forms enabled yet.</p>
                ) : (
                    <div className="space-y-2">
                        {postSubmitTemplateIds.map((templateId, idx) => {
                            const template = templates.find((item) => item.id === templateId);
                            if (!template) return null;
                            const isRequired = postSubmitRequiredById[templateId] !== false;
                            return (
                                <div key={templateId} className="flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                    <span className="text-sm text-blue-900 font-medium truncate">{template.title || 'Complete Form'}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <label
                                            className="flex items-center gap-1.5 text-xs text-blue-900 cursor-pointer select-none"
                                            title="Required documents must be completed by the driver right after submitting the application."
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isRequired}
                                                onChange={() => togglePostSubmitRequired?.(templateId)}
                                            />
                                            Required
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => movePostSubmitTemplate(templateId, 'up')}
                                            disabled={idx === 0}
                                            className="p-1 rounded hover:bg-white disabled:opacity-40"
                                            aria-label="Move up"
                                        >
                                            <ArrowUp size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => movePostSubmitTemplate(templateId, 'down')}
                                            disabled={idx === postSubmitTemplateIds.length - 1}
                                            className="p-1 rounded hover:bg-white disabled:opacity-40"
                                            aria-label="Move down"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templatesLoading ? <div className="col-span-full flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div> :
                templates.length === 0 ? <div className="col-span-full bg-white border-2 border-dashed rounded-2xl p-12 text-center text-gray-400">No templates saved yet.</div> :
                    templates.map(tmp => (
                        <div key={tmp.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-purple-50 p-3 rounded-xl"><FileText size={24} className="text-purple-600" /></div>
                                <button onClick={() => handleDeleteTemplate(tmp.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-opacity"><Trash2 size={16} /></button>
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1 truncate">{tmp.title}</h3>
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-4">{tmp.fields?.length || 0} Fields</p>
                            <label className="flex items-center gap-2 text-xs text-gray-600 mb-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isTemplateEnabledPostSubmit(tmp.id)}
                                    onChange={() => togglePostSubmitTemplate(tmp.id)}
                                />
                                Show on post-submit success page
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleUseTemplate(tmp)} className="w-full py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 flex items-center justify-center gap-2 transition-all shadow-sm">
                                    <Send size={14} /> Use
                                </button>
                                <button onClick={() => handleEditTemplate(tmp)} className="w-full py-2.5 bg-white text-purple-700 border border-purple-200 text-xs font-bold rounded-xl hover:bg-purple-50 flex items-center justify-center gap-2 transition-all shadow-sm">
                                    <Edit3 size={14} /> Edit
                                </button>
                            </div>
                        </div>
                    ))
            }
        </div>
        </div>
    );
}

export default TemplatesPanel;
