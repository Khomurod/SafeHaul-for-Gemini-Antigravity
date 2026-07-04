import React from 'react';
import { Lock, ToggleLeft, ToggleRight } from 'lucide-react';

/** Field properties panel (right sidebar) — extracted verbatim from EnvelopeCreator.jsx. */
export const FieldPropertiesPanel = React.memo(({ activeField, updateActiveField, getIcon }) => {
    if (!activeField) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-white rounded-lg border shadow-sm">
                        {getIcon(activeField.type)}
                    </div>
                    <div className="text-xs font-bold text-gray-500 uppercase">{activeField.type} Field</div>
                </div>
                <input
                    type="text"
                    value={activeField.label || ''}
                    onChange={(e) => updateActiveField('label', e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    placeholder="Field Label"
                />
            </div>

            {/* Toggles */}
            <div className="p-4 border-b space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Options</h4>
                <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-gray-700 font-medium">Required Field</span>
                    <button
                        type="button"
                        onClick={() => updateActiveField('required', !activeField.required)}
                        className="transition-colors"
                    >
                        {activeField.required ?
                            <ToggleRight size={28} className="text-blue-600" /> :
                            <ToggleLeft size={28} className="text-gray-300 group-hover:text-gray-400" />
                        }
                    </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                        <Lock size={12} className="text-gray-400" /> Read Only
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            const nextReadOnly = !activeField.readOnly;
                            updateActiveField('readOnly', nextReadOnly);
                            updateActiveField('prefillPolicy', nextReadOnly ? 'locked' : 'editable');
                        }}
                        className="transition-colors"
                    >
                        {activeField.readOnly ?
                            <ToggleRight size={28} className="text-blue-600" /> :
                            <ToggleLeft size={28} className="text-gray-300 group-hover:text-gray-400" />
                        }
                    </button>
                </label>

                {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                    <label className="block pt-1">
                        <span className="text-xs text-gray-600 font-medium">Prefill Behavior</span>
                        <select
                            value={activeField.prefillPolicy || (activeField.readOnly ? 'locked' : 'editable')}
                            onChange={(e) => {
                                const mode = e.target.value;
                                updateActiveField('prefillPolicy', mode);
                                updateActiveField('readOnly', mode === 'locked');
                            }}
                            className="w-full mt-1 px-2.5 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="editable">Editable when prefilled</option>
                            <option value="locked">Locked after prefill</option>
                        </select>
                    </label>
                )}
            </div>

            {/* Default Value */}
            {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                <div className="p-4 border-b space-y-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Default Value</h4>
                    <textarea
                        value={activeField.defaultValue || ''}
                        onChange={(e) => updateActiveField('defaultValue', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                        rows={3}
                        placeholder="Enter default value..."
                    />
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                        Use tokens like <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{full_name}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{email}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{phone}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{current_date}}"}</code>.
                    </p>
                </div>
            )}

            {/* Font Size */}
            {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                <div className="p-4 space-y-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Formatting</h4>
                    <label className="block">
                        <span className="text-xs text-gray-600 font-medium">Font Size</span>
                        <select
                            value={activeField.fontSize || 'Auto'}
                            onChange={(e) => updateActiveField('fontSize', e.target.value)}
                            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="Auto">Auto (fit to box)</option>
                            <option value="10">10pt</option>
                            <option value="12">12pt</option>
                            <option value="14">14pt</option>
                            <option value="18">18pt</option>
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
});

export default FieldPropertiesPanel;
