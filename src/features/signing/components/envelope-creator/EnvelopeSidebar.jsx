import React from 'react';
import { X, Mail, MessageSquare, Copy, Send } from 'lucide-react';
import { FIELD_CATEGORIES } from './fieldDefinitions';

/**
 * Left sidebar of the envelope creator: recipient/delivery inputs, the field
 * palette, and the placed-fields list. Extracted verbatim from EnvelopeCreator.jsx.
 */
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
    return (
        <div className="w-64 bg-white border-r flex flex-col z-10 shadow-lg shrink-0 overflow-y-auto">
            {/* Recipient Info (only in request mode) */}
            {creatorMode === 'request' && !isEditingTemplate && (
                <div className="p-4 border-b">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Recipient</label>
                    <input
                        type="text" placeholder="Name *"
                        className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                        value={recipientName} onChange={e => setRecipientName(e.target.value)}
                    />
                    <input
                        type="email" placeholder="Email"
                        className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                        value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                    />
                    <input
                        type="tel" placeholder="Phone"
                        className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                        value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)}
                    />
                    {/* Delivery Method */}
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Delivery</label>
                    <div className="grid grid-cols-4 gap-1">
                        {[
                            { key: 'email', icon: <Mail size={11} />, label: 'Email' },
                            { key: 'sms', icon: <MessageSquare size={11} />, label: 'SMS' },
                            { key: 'both', icon: <Send size={11} />, label: 'Both' },
                            { key: 'copy', icon: <Copy size={11} />, label: 'Link' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => setDeliveryMethod(opt.key)}
                                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                                    deliveryMethod === opt.key
                                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                                }`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Semantic Field Palette */}
            <div className="p-4 flex-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider">
                    {creatorMode === 'request' ? 'Fields' : 'Setup Fields'}
                </label>
                {file && (
                    <p className="text-[10px] text-gray-400 mb-3 leading-snug">
                        Duplicate a placed field: select it on the PDF, then{' '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl+C</kbd>
                        {' / '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘C</kbd>
                        , then{' '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl+V</kbd>
                        {' / '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘V</kbd>
                        . Same size; repeats step to the right (wraps below).
                        {' '}
                        Over the PDF,{' '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl</kbd>
                        {' / '}
                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘</kbd>
                        {' + '}scroll zooms the document only (not the whole page).
                    </p>
                )}

                {!file ? (
                    <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:border-blue-400 transition-colors">
                        <p className="text-xs text-gray-400 mb-2 font-medium">Upload a PDF first</p>
                        <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
                        <label htmlFor="pdf-upload" className="px-3 py-1.5 bg-white border border-gray-300 rounded shadow-sm text-xs font-bold cursor-pointer hover:bg-gray-50 active:scale-95 transition-transform inline-block">Choose File</label>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {FIELD_CATEGORIES.map((category) => (
                            <div key={category.title}>
                                <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{category.title}</h4>
                                <div className="space-y-1">
                                    {category.items.map((item) => {
                                        const IconComp = item.icon;
                                        return (
                                            <button
                                                key={item.templateId}
                                                onClick={() => addField(item.templateId)}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 border rounded-lg transition-all text-left active:scale-[0.98] ${item.color}`}
                                            >
                                                <IconComp size={15} />
                                                <span className="text-xs font-semibold">{item.label}</span>
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
                    <div className="mt-4">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Placed ({fields.length})</label>
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                            {fields.map((f) => (
                                <div
                                    key={f.id}
                                    onClick={() => setSelectedFieldId(f.id)}
                                    className={`flex justify-between items-center p-2 border rounded-lg text-xs cursor-pointer transition-all ${
                                        selectedFieldId === f.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <div className="text-gray-400 shrink-0">{getIcon(f.type)}</div>
                                        <span className="font-bold truncate">{f.label}</span>
                                        <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">P{f.page}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"><X size={12} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default EnvelopeSidebar;
