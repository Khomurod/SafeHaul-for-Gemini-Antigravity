import React from 'react';
import {
    Clock, CheckCircle, Play, Pause, XCircle, ChevronRight, Activity, AlertCircle, RefreshCw
} from 'lucide-react';

export function CampaignHistory({ sessions, selectedSessionId, setSelectedSessionId, setView, onPause, onResume, onCancel }) {
    const getStatusStyles = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-50 text-green-700 border-green-100';
            case 'active': return 'bg-blue-50 text-blue-700 border-blue-100 animate-pulse';
            case 'queued': return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'paused': return 'bg-slate-50 text-slate-700 border-slate-100';
            case 'cancelled': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-slate-50 text-slate-500 border-slate-100';
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm min-h-full">
            <div className="flex justify-between items-center mb-12">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <Clock className="text-blue-600" /> Command History
                    </h2>
                    <p className="text-slate-500 font-medium text-sm tracking-tight">Audit and monitor all historical sequence executions.</p>
                </div>
                <button
                    onClick={() => setView('draft')}
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                    <Play size={14} className="fill-current" /> New Campaign
                </button>
            </div>

            <div className="space-y-4">
                {sessions.length === 0 ? (
                    <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto">
                            <Clock size={32} />
                        </div>
                        <p className="text-slate-400 font-bold text-sm">No historical commands found.</p>
                    </div>
                ) : (
                    sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => { setSelectedSessionId(s.id); setView('report'); }}
                            className={`group p-8 bg-white border rounded-[2.5rem] transition-all cursor-pointer hover:shadow-xl hover:shadow-slate-100/50 hover:border-blue-100 ${selectedSessionId === s.id ? 'border-blue-400 ring-4 ring-blue-50/50' : 'border-slate-50 bg-slate-50/20'}`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${getStatusStyles(s.status)}`}>
                                            {s.status}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                            {s.createdAt?.toDate().toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-slate-900 tracking-tight uppercase line-clamp-1">{s.messageConfig?.message}</h4>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex items-center gap-2">
                                                <Activity size={12} className="text-blue-500" />
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Success: {s.progress?.successCount || 0}</span>
                                            </div>
                                            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                                                <AlertCircle size={12} className="text-red-500" />
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Error: {s.progress?.failedCount || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-3">
                                    <div className="flex gap-2">
                                        {s.status === 'active' && (
                                            <button onClick={(e) => { e.stopPropagation(); onPause(s.id); }} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-amber-600 hover:border-amber-100 shadow-sm transition-all"><Pause size={16} /></button>
                                        )}
                                        {s.status === 'paused' && (
                                            <button onClick={(e) => { e.stopPropagation(); onResume(s.id); }} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-100 shadow-sm transition-all"><Play size={16} /></button>
                                        )}
                                        {['active', 'queued', 'paused'].includes(s.status) && (
                                            <button onClick={(e) => { e.stopPropagation(); onCancel(s.id); }} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-red-600 hover:border-red-100 shadow-sm transition-all"><XCircle size={16} /></button>
                                        )}
                                    </div>
                                    <ChevronRight className="text-slate-200 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" size={24} />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export function CampaignReport({ session, attempts, setView }) {
    if (!session) return (
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm flex items-center justify-center min-h-[500px]">
            <div className="text-center space-y-4">
                <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading Mission Intel...</p>
            </div>
        </div>
    );

    const percent = Math.round((session.progress?.totalAttempted / session.progress?.totalTarget) * 100) || 0;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-4">
                        <button
                            onClick={() => setView('history')}
                            className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-all mb-4"
                        >
                            ← Back to Command Center
                        </button>
                        <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase max-w-2xl">Mission Execution Report</h2>
                        <div className="flex items-center gap-3 pt-2">
                            <span className="px-5 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                {session.status}
                            </span>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Session ID: {session.id}</span>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Execution Velocity</div>
                        <div className="text-6xl font-black text-blue-600 tracking-tighter">{percent}<span className="text-3xl">%</span></div>
                    </div>
                </div>

                {/* Progress Visualizer */}
                <div className="mt-12 h-6 bg-slate-50 border border-slate-100 rounded-full overflow-hidden shadow-inner flex relative">
                    <div className="h-full bg-blue-600 transition-all duration-1000 ease-out flex items-center justify-center font-black text-[9px] text-white shadow-lg" style={{ width: `${percent}%` }}>
                        {percent > 5 && `${percent}%`}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                    <div className="p-10 bg-slate-50/50 rounded-[3rem] border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Audience</div>
                        <div className="text-7xl font-black text-slate-900 tracking-tighter">{session.progress.totalTarget}</div>
                    </div>
                    <div className="p-10 bg-green-50/30 rounded-[3rem] border border-green-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Successful Dispatch</div>
                        <div className="text-7xl font-black text-green-600 tracking-tighter">{session.progress.successCount}</div>
                    </div>
                    <div className="p-10 bg-red-50/30 rounded-[3rem] border border-red-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blocked / Errored</div>
                        <div className="text-7xl font-black text-red-500 tracking-tighter">{session.progress.failedCount}</div>
                    </div>
                </div>
            </div>

            {/* Granular Audit Trail */}
            <div className="bg-white border border-slate-200 rounded-[3rem] overflow-hidden shadow-sm">
                <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={18} /> Lead Attribution Audit
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left font-sans">
                        <thead className="bg-white border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <tr>
                                <th className="p-10">Recipient</th>
                                <th className="p-10">Endpoint Intelligence</th>
                                <th className="p-10">Transmission Clock</th>
                                <th className="p-10">Session Response</th>
                                <th className="p-10">Technical Diagnosis</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {attempts.map((att, idx) => (
                                <tr key={att.id || idx} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-10">
                                        <div className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">{att.recipientName}</div>
                                        <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">ID: {att.leadId.substring(0, 8)}</div>
                                    </td>
                                    <td className="p-10 font-mono text-[10px] font-bold text-slate-500 uppercase">{att.recipientIdentity}</td>
                                    <td className="p-10 text-[11px] font-black text-slate-400 uppercase">
                                        {att.timestamp?.toDate().toLocaleTimeString()}
                                    </td>
                                    <td className="p-10">
                                        <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border shadow-sm ${att.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                            {att.status}
                                        </span>
                                    </td>
                                    <td className="p-10">
                                        <div className="text-[10px] font-bold text-slate-500 max-w-xs">{att.errorMessage || 'Successful attribution confirmed.'}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
