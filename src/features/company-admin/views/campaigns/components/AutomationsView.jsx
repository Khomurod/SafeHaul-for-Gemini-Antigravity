import React from 'react';

export function AutomationsView() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Automations Builder</h1>
                <p className="text-slate-500 text-sm">"If this, then that" workflows for autonomous engagement.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
                <div className="p-12 border-2 border-dashed border-slate-200 rounded-[3rem] text-center bg-slate-50/50">
                    <div className="flex justify-center mb-6">
                        <div className="h-20 w-20 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center text-3xl">⚡</div>
                    </div>
                    <h2 className="text-lg font-black text-slate-800 uppercase mb-4">Visual Builder Coming Soon</h2>
                    <p className="text-slate-400 text-sm max-w-sm mx-auto">
                        Automated follow-ups based on driver behavior (application submitted, ghosted for 3 days, etc.) are currently being finalized.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 opacity-50 grayscale">
                        <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
                        <div>
                            <div className="font-bold text-slate-800">Application Drip</div>
                            <div className="text-xs text-slate-400">Send SMS 2 days after application</div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 opacity-50 grayscale">
                        <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
                        <div>
                            <div className="font-bold text-slate-800">Reactivation Loop</div>
                            <div className="text-xs text-slate-400">Notify inactive drivers weekly</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
