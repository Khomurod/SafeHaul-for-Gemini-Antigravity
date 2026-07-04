import React from 'react';
import DateTripletField from '@shared/components/form/DateTripletField';
import { X, Search, User, Loader2, Mail, Phone, Copy, MessageSquare, Send } from 'lucide-react';

const slugPrefillGroupId = (groupKey) =>
    String(groupKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);

/**
 * FEAT-2/3/4: Send-template modal (recipient entry, delivery method, template
 * pre-fill, quick-select lead). Extracted verbatim from DocumentsManager.jsx.
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
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Send Document</h2>
                        <p className="text-xs text-gray-500">Sending: <b>{selectedTemplate?.title}</b></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* FEAT-2: Manual Recipient Entry */}
                <div className="p-5 space-y-3 border-b">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recipient Details</h3>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text" placeholder="Recipient name *"
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                value={manualName} onChange={e => setManualName(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="email" placeholder="Email address"
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                value={manualEmail} onChange={e => setManualEmail(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="tel" placeholder="Phone number"
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* FEAT-4: Delivery Method Selector */}
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider pt-2">Delivery Method</h3>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { key: 'email', icon: <Mail size={14} />, label: 'Email' },
                            { key: 'sms', icon: <MessageSquare size={14} />, label: 'SMS' },
                            { key: 'both', icon: <Send size={14} />, label: 'Both' },
                            { key: 'copy', icon: <Copy size={14} />, label: 'Copy Link' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setDeliveryMethod(opt.key)}
                                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                                    deliveryMethod === opt.key
                                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Template Pre-fill Fields — grouped bindings/tokens; plain text stays per field */}
                    {(editablePrefillPartition.groups.length > 0 || editablePrefillPartition.plainFields.length > 0) && (
                        <div className="pt-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pre-fill Fields (Optional)</h3>
                            <div className="max-h-[220px] overflow-y-auto space-y-3 pr-1">
                                {editablePrefillPartition.groups.map((group) => (
                                    <div key={group.groupKey} className="space-y-1" role="group" aria-label={group.uiLabel}>
                                        {group.useDateTriplet ? (
                                            <div
                                                className="block text-[10px] font-bold text-gray-500 uppercase"
                                                title={group.members.map((m) => m.label || m.id).join(', ')}
                                            >
                                                {group.uiLabel}
                                                {group.appliesCount > 1 ? (
                                                    <span className="font-normal normal-case text-gray-400"> — applies to {group.appliesCount} places</span>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <label
                                                className="block text-[10px] font-bold text-gray-500 uppercase"
                                                htmlFor={`edoc-grp-${slugPrefillGroupId(group.groupKey)}`}
                                                title={group.members.map((m) => m.label || m.id).join(', ')}
                                            >
                                                {group.uiLabel}
                                                {group.appliesCount > 1 ? (
                                                    <span className="font-normal normal-case text-gray-400"> — applies to {group.appliesCount} places</span>
                                                ) : null}
                                            </label>
                                        )}
                                        {group.useDateTriplet ? (
                                            <DateTripletField
                                                label=""
                                                idPrefix={`edoc-grp-${slugPrefillGroupId(group.groupKey)}`}
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
                                            <input
                                                id={`edoc-grp-${slugPrefillGroupId(group.groupKey)}`}
                                                type="text"
                                                placeholder={`Enter ${group.uiLabel}...`}
                                                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
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
                                ))}
                                {editablePrefillPartition.plainFields.map((field) => (
                                    <div key={field.id} className="space-y-1">
                                        <label
                                            className="block text-[10px] font-bold text-gray-500 uppercase"
                                            htmlFor={`edoc-plain-${field.id}`}
                                        >
                                            {field.label || field.id}
                                        </label>
                                        <input
                                            id={`edoc-plain-${field.id}`}
                                            type="text"
                                            placeholder={`Enter ${field.label || 'text'}...`}
                                            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                            value={prefillValues[field.id] || ''}
                                            onChange={(e) =>
                                                setPrefillValues((prev) => ({
                                                    ...prev,
                                                    [field.id]: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Send / Copy Button */}
                    <button
                        onClick={executeTemplateSend}
                        disabled={sending || !manualName.trim()}
                        className="w-full py-3 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                        {sending ? <Loader2 size={16} className="animate-spin" /> :
                            deliveryMethod === 'copy' ? <><Copy size={16} /> Copy Signing Link</> :
                            <><Send size={16} /> Send Document</>
                        }
                    </button>
                </div>

                {/* Quick Select from existing leads */}
                <div className="p-4 bg-gray-50">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Or Quick-Select a Lead</h3>
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text" placeholder="Search leads..."
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 transition-all"
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="max-h-[180px] overflow-y-auto space-y-1">
                        {filteredDrivers.length === 0 ? (
                            <div className="py-6 text-center text-gray-400 text-xs italic">No leads found.</div>
                        ) : (
                            filteredDrivers.slice(0, 20).map(d => (
                                <button
                                    key={d.id}
                                    onClick={() => handleQuickSelect(d)}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-purple-50 group transition-all text-left"
                                >
                                    <div className="bg-white p-1.5 rounded-lg group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors border">
                                        <User size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-gray-900 truncate">{d.firstName} {d.lastName}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{d.email || 'No email'} | {d.phone || d.phoneNumber || 'No phone'}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SendTemplateModal;
