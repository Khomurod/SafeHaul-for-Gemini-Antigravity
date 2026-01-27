import React from 'react';
import { Users, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { ERROR_MESSAGES } from '../constants/campaignConstants';

export function AudiencePreview({ previewLeads, isPreviewLoading, previewError, matchCount }) {
    const total = previewLeads.length;
    const withPhone = previewLeads.filter(l => l.phone || l.phoneNumber).length;
    const healthScore = total > 0 ? Math.round((withPhone / total) * 100) : 100;

    const isIndexError = previewError && previewError.includes('index');

    return (
        <div className="audience-intelligence">
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                    <Sparkles size={14} className="text-blue-500" /> Audience Intelligence
                </h4>
                {isPreviewLoading && <div className="flex items-center gap-2 text-[9px] font-black text-blue-500 uppercase tracking-widest"><Loader2 size={12} className="animate-spin" /> Scanning...</div>}
            </div>

            {!isPreviewLoading && matchCount > 0 && healthScore < 100 && (
                <div className="mb-8 p-6 bg-amber-50 rounded-[2rem] border border-amber-100 flex items-start gap-4 shadow-sm animate-in fade-in zoom-in-95">
                    <div className="h-10 w-10 bg-amber-100/50 rounded-2xl flex items-center justify-center shrink-0">
                        <AlertCircle size={20} className="text-amber-600" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">List Health Alert</div>
                        <p className="text-[11px] text-amber-600 font-medium leading-relaxed">
                            {100 - healthScore}% of your targets are missing valid phone numbers. We recommend adjusting filters to maximize reach.
                        </p>
                    </div>
                    <div className="ml-auto flex flex-col items-end">
                        <span className="text-2xl font-black text-amber-600 leading-none">{healthScore}%</span>
                        <span className="text-[8px] font-black text-amber-500 uppercase mt-1">Ready</span>
                    </div>
                </div>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                {previewError ? (
                    <div className={`p-8 rounded-[2.5rem] border text-center transition-all animate-in fade-in slide-in-from-top-4 ${isIndexError ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                        <div className={`h-16 w-16 rounded-[1.8rem] flex items-center justify-center mx-auto mb-6 shadow-sm ${isIndexError ? 'bg-indigo-100 text-indigo-600' : 'bg-red-100 text-red-500'}`}>
                            {isIndexError ? <Sparkles size={28} /> : <AlertCircle size={28} />}
                        </div>
                        <h5 className="text-base font-black uppercase tracking-tighter mb-3">
                            {isIndexError ? 'Optimizing Database Paths' : 'Information Required'}
                        </h5>
                        <p className="text-xs font-medium leading-relaxed mb-6 opacity-80">
                            {isIndexError
                                ? "We're currently building a new optimization path (Index) for this filter combination. This ensures your searches stay lightning fast."
                                : previewError}
                        </p>
                        {isIndexError && (
                            <div className="p-4 bg-white/50 rounded-2xl border border-indigo-200 text-left">
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Technical Status</span>
                                <div className="text-[9px] font-mono break-all opacity-70 leading-relaxed uppercase">{previewError}</div>
                            </div>
                        )}
                        {!isIndexError && previewError === ERROR_MESSAGES.ZERO_RESULTS && (
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-2.5 bg-white border border-red-200 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-colors"
                            >
                                Reset All Filters
                            </button>
                        )}
                    </div>
                ) : isPreviewLoading ? (
                    [...Array(5)].map((_, i) => (
                        <div key={i} className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between animate-pulse">
                            <div className="flex gap-4 items-center">
                                <div className="h-10 w-10 bg-slate-200 rounded-xl"></div>
                                <div className="space-y-2">
                                    <div className="h-3 w-32 bg-slate-200 rounded-full"></div>
                                    <div className="h-2 w-24 bg-slate-200 rounded-full"></div>
                                </div>
                            </div>
                            <div className="h-4 w-12 bg-slate-200 rounded-full"></div>
                        </div>
                    ))
                ) : (
                    previewLeads.map(l => (
                        <div key={l.id} className="p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50/50 transition-all group cursor-default">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-slate-50 rounded-[1.2rem] flex items-center justify-center text-slate-300 font-black text-lg group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors uppercase">
                                    {l.firstName?.[0] || 'U'}
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-0.5">{l.firstName || 'Unknown'} {l.lastName || ''}</div>
                                    <div className="text-[10px] font-bold text-slate-400 font-mono tracking-tight flex items-center gap-1.5 leading-none">
                                        <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                        {l.phone || l.phoneNumber || 'DECRYPTING...'}
                                    </div>
                                </div>
                            </div>
                            <div className="text-[10px] font-black px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-slate-500 uppercase tracking-[0.1em] group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                                {l.status || 'New'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
