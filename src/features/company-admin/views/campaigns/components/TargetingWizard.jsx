import React from 'react';
import {
    Filter, UserCheck, Users, Megaphone, Calendar
} from 'lucide-react';
import {
    APPLICATION_STATUSES,
    LAST_CALL_RESULTS
} from '../constants/campaignConstants';

export function TargetingWizard({ filters, setFilters, teamMembers, matchCount }) {
    console.log("[TargetingWizard] Render - Match Count:", matchCount);

    // Statuses vary by target group, but we use consistent IDs
    const currentStatuses = filters.leadType === 'global'
        ? [{ id: 'new', label: 'New Lead' }, { id: 'contacted', label: 'Contacted' }]
        : APPLICATION_STATUSES;

    return (
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-sm transition-all border-dashed">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-10 flex items-center gap-2">
                <Filter size={14} className="text-blue-500" /> Targeting Configuration
            </h3>

            <div className="space-y-10">
                {/* 1. Source */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 ml-1 flex items-center gap-1.5 leading-none">
                        Primary Target Group
                    </label>
                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { id: 'applications', label: 'Company Applicants', icon: UserCheck, color: 'blue' },
                            { id: 'leads', label: 'SafeHaul Marketplace', icon: Users, color: 'indigo' },
                            { id: 'global', label: 'Global Driver Network', icon: Megaphone, color: 'purple' }
                        ].map(s => (
                            <button
                                key={s.id}
                                onClick={() => setFilters(prev => ({ ...prev, leadType: s.id, status: [] }))}
                                className={`flex items-center gap-4 p-5 rounded-[1.8rem] border-2 transition-all duration-300 ${filters.leadType === s.id ? `border-blue-500 bg-blue-50/50 text-blue-700 shadow-lg shadow-blue-100/50` : 'border-slate-50 bg-slate-50/50 text-slate-400 hover:border-slate-200'}`}
                            >
                                <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${filters.leadType === s.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-300'}`}>
                                    <s.icon size={18} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-tight">{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Recruiter */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 ml-1 leading-none">Assigned Recruiter</label>
                    <div className="relative">
                        <select
                            value={filters.recruiterId}
                            onChange={e => setFilters(prev => ({ ...prev, recruiterId: e.target.value }))}
                            className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-xs font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-100/50 appearance-none transition-all cursor-pointer shadow-sm"
                        >
                            <option value="my_leads">Show: Only My Assigned Leads</option>
                            <option value="all">Show: Entire Team Database</option>
                            {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>Colleague: {m.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">▼</div>
                    </div>
                </div>

                {/* 3. Status (Multi-Select) */}
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 ml-1 leading-none">Filter by Status</label>
                    <div className="flex flex-wrap gap-2.5 max-h-52 overflow-y-auto p-2 pr-4 custom-scrollbar bg-slate-50/50 rounded-2xl border border-slate-100">
                        {currentStatuses.map(st => (
                            <button
                                key={st.id}
                                onClick={() => {
                                    setFilters(prev => {
                                        const has = prev.status.includes(st.id);
                                        return { ...prev, status: has ? prev.status.filter(s => s !== st.id) : [...prev.status, st.id] };
                                    })
                                }}
                                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border shadow-sm ${filters.status.includes(st.id) ? 'bg-slate-900 text-white border-slate-900 scale-95' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-900 hover:text-slate-900'}`}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4. Advanced Filters */}
                <div className="pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 block">Created After</label>
                            <input
                                type="date"
                                value={filters.createdAfter || ''}
                                onChange={e => setFilters(prev => ({ ...prev, createdAfter: e.target.value }))}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[1.2rem] text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 block">Inactive Since</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="e.g 7 Days"
                                value={filters.notContactedSince || ''}
                                onChange={e => setFilters(prev => ({ ...prev, notContactedSince: e.target.value }))}
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[1.2rem] text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 block">Last Interaction Result</label>
                        <select
                            value={filters.lastCallOutcome || 'all'}
                            onChange={e => setFilters(prev => ({ ...prev, lastCallOutcome: e.target.value }))}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[1.2rem] text-xs font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                        >
                            <option value="all">Any Outcome</option>
                            {LAST_CALL_RESULTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    </div>

                    <div className="pt-4 bg-blue-50/50 p-6 rounded-[1.8rem] border border-blue-100 border-dashed">
                        <label className="text-[9px] font-black text-blue-600 uppercase mb-3 ml-1 block flex items-center gap-2">
                            <Calendar size={12} /> Schedule Sequence Command
                        </label>
                        <input
                            type="datetime-local"
                            value={filters.scheduledFor || ''}
                            onChange={e => setFilters(prev => ({ ...prev, scheduledFor: e.target.value }))}
                            className="w-full p-4 bg-white border border-blue-200 rounded-2xl text-xs font-black text-blue-800 outline-none focus:ring-4 focus:ring-blue-100"
                        />
                        {filters.scheduledFor && (
                            <button
                                onClick={() => setFilters(prev => ({ ...prev, scheduledFor: null }))}
                                className="mt-3 text-[9px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-700 flex items-center gap-1 mx-auto"
                            >
                                ✕ Cancel Schedule (Send Immediately)
                            </button>
                        )}
                    </div>
                </div>

                {/* 5. Volume Control */}
                <div className="pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-5">
                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">Daily Blast Limit</label>
                        <span className="px-3 py-1 bg-slate-100 text-[10px] font-black text-slate-900 rounded-lg">{filters.limit} Drivers</span>
                    </div>
                    <input
                        type="range" min="1" max="100" step="5"
                        value={filters.limit}
                        onChange={e => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 mb-2"
                    />
                </div>
            </div>
        </div>
    );
}
