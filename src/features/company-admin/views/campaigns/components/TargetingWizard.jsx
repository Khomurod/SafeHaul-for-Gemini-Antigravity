import React from 'react';
import {
    Filter, UserCheck, Users, Megaphone
} from 'lucide-react';

const APP_STATUSES = [
    "New Application", "Contacted", "Interview Scheduled", "Offer Sent",
    "Offer Accepted", "Approved", "Hired", "Rejected", "Disqualified", "Stale"
];

const LEAD_STATUSES = [
    "New Lead", "Contacted", "Follow Up Needed", "Not Interested", "Rejected"
];

const CALL_OUTCOMES = [
    "Connected / Interested",
    "Connected / Scheduled Callback",
    "Connected / Not Qualified",
    "Connected / Not Interested",
    "Connected / Hired Elsewhere",
    "Left Voicemail",
    "No Answer",
    "Wrong Number"
];

export function TargetingWizard({ filters, setFilters, teamMembers, matchCount }) {
    console.log("[TargetingWizard] Render - Match Count:", matchCount);
    return (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm scale-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                <Filter size={14} /> Targeting Wizard
            </h3>

            <div className="space-y-8">
                {/* 1. Source */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-3 ml-1 flex items-center gap-1.5">
                        Target Group
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                        {[
                            { id: 'applications', label: 'Company Apps', icon: UserCheck, color: 'blue' },
                            { id: 'leads', label: 'Assigned SafeHaul', icon: Users, color: 'indigo' },
                            { id: 'global', label: 'Global Network', icon: Megaphone, color: 'purple' }
                        ].map(s => (
                            <button
                                key={s.id}
                                onClick={() => setFilters(prev => ({ ...prev, leadType: s.id, status: [] }))}
                                className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${filters.leadType === s.id ? `border-${s.color}-500 bg-${s.color}-50/30 text-${s.color}-700` : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                            >
                                <s.icon size={18} />
                                <span className="text-xs font-black uppercase tracking-tight">{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Recruiter */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-3 ml-1">Assigned Recruiter</label>
                    <div className="relative">
                        <select
                            value={filters.recruiterId}
                            onChange={e => setFilters(prev => ({ ...prev, recruiterId: e.target.value }))}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-50/50 appearance-none transition-all cursor-pointer"
                        >
                            <option value="my_leads">Filter: My Leads Only</option>
                            <option value="all">Filter: All Team Leads</option>
                            {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>Colleague: {m.name}</option>
                            ))}
                        </select>
                        {teamMembers.length === 0 && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-[8px] font-black text-blue-600 uppercase">Syncing Team...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Status (Multi-Select) */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-3 ml-1">Driver Status (Multi-Select)</label>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 pr-2 custom-scrollbar">
                        {(filters.leadType === 'applications' ? APP_STATUSES : LEAD_STATUSES).map(st => (
                            <button
                                key={st}
                                onClick={() => {
                                    setFilters(prev => {
                                        const has = prev.status.includes(st);
                                        return { ...prev, status: has ? prev.status.filter(s => s !== st) : [...prev.status, st] };
                                    })
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${filters.status.includes(st) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4. Advanced Filters */}
                <div className="pt-4 border-t border-slate-50">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Advanced Filters</label>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Created After</label>
                            <input
                                type="date"
                                value={filters.createdAfter || ''}
                                onChange={e => setFilters(prev => ({ ...prev, createdAfter: e.target.value }))}
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Not Contacted (Days)</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="e.g 7 Days"
                                value={filters.notContactedSince || ''}
                                onChange={e => setFilters(prev => ({ ...prev, notContactedSince: e.target.value }))}
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Last Call Result</label>
                            <select
                                value={filters.lastCallOutcome || 'all'}
                                onChange={e => setFilters(prev => ({ ...prev, lastCallOutcome: e.target.value }))}
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none"
                            >
                                <option value="all">Any Outcome</option>
                                {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 5. Volume Control */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-tighter ml-1">Target Volume</label>
                        <span className="text-xs font-black text-blue-600 tracking-widest">{filters.limit} Drivers</span>
                    </div>
                    <input
                        type="range" min="1" max="100" step="5"
                        value={filters.limit}
                        onChange={e => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
                        className="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight flex justify-between items-center px-1">
                        <span>Actual Matches:</span>
                        <span className={matchCount > 0 ? "text-green-600" : "text-slate-400"}>{matchCount} Drivers</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
