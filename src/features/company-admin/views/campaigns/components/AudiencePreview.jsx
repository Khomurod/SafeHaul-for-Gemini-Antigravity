import React from 'react';
import { Users, Loader2, AlertCircle } from 'lucide-react';

export function AudiencePreview({ previewLeads, isPreviewLoading, previewError }) {
    return (
        <div className="mt-10 pt-8 border-t border-slate-50">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Users size={14} /> Live Audience Preview
                </h4>
                {isPreviewLoading && <Loader2 size={12} className="animate-spin text-blue-500" />}
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {previewError ? (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-[10px] font-medium text-red-600 leading-relaxed italic">
                        <AlertCircle size={14} className="mb-2" />
                        A new database index is required for this combination. Please contact support or use a simpler filter.
                        <div className="mt-2 text-[8px] font-mono break-all opacity-70">{previewError}</div>
                    </div>
                ) : !isPreviewLoading && previewLeads.length === 0 ? (
                    <div className="text-center py-8 text-slate-300 italic text-[10px]">No matches found for currently active filters.</div>
                ) : (
                    previewLeads.map(l => (
                        <div key={l.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-[11px] font-black text-slate-700 uppercase tracking-tighter">{l.firstName || 'Unknown'} {l.lastName || ''}</div>
                                <div className="text-[9px] font-bold text-slate-400 font-mono tracking-tight">{l.phone || l.phoneNumber || 'NO_PHONE'}</div>
                            </div>
                            <div className="text-[8px] font-black px-2 py-0.5 bg-white border border-slate-100 rounded-full text-blue-500 uppercase tracking-tighter">
                                {l.status || 'New'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
