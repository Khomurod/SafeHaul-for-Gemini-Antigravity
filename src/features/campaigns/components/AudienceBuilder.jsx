import React from 'react';
import { useCampaignTargeting } from '../hooks/useCampaignTargeting';
import { useData } from '@/context/DataContext';
import { APPLICATION_STATUSES, LAST_CALL_RESULTS } from '../constants/campaignConstants';
import { Filter, Users, RefreshCw } from 'lucide-react';

export function AudienceBuilder({ companyId, filters, onChange }) {
    const { currentUser } = useData();

    // We lift the state up, but the hook manages logic
    const {
        previewLeads, isPreviewLoading, matchCount, previewError,
        setFilters
    } = useCampaignTargeting(companyId, currentUser, false);

    // Sync external filters prop to internal hook state
    React.useEffect(() => {
        if (filters) setFilters(prev => ({ ...prev, ...filters }));
    }, [filters]);

    // Handle filter changes
    const handleChange = (key, value) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        // Bubble up change to parent (CampaignEditor)
        // Note: We bubble up immediately, but the hook inside here also updates targeting
        onChange(newFilters, matchCount);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-black text-slate-900 mb-2">Target Audience</h2>
                <p className="text-slate-500">Define who receives this message. Results are calculated in real-time.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Filters */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100">
                            <Filter size={18} className="text-slate-400" /> Filter Criteria
                        </h3>

                        <div className="space-y-6">
                            {/* Lead Source */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Lead Source</label>
                                <select
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-100"
                                    value={filters.leadType || 'applications'}
                                    onChange={(e) => handleChange('leadType', e.target.value)}
                                >
                                    <option value="applications">Direct Applications</option>
                                    <option value="leads">Assigned Leads (SafeHaul)</option>
                                    <option value="global">Global Pool (Cold)</option>
                                </select>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Application Status</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(APPLICATION_STATUSES).map(([key, label]) => {
                                        const isSelected = filters.status?.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => {
                                                    const current = filters.status || [];
                                                    const newVal = isSelected
                                                        ? current.filter(s => s !== key)
                                                        : [...current, key];
                                                    handleChange('status', newVal);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Last Call Outcome */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Last Call Outcome</label>
                                <select
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-100"
                                    value={filters.lastCallOutcome || 'all'}
                                    onChange={(e) => handleChange('lastCallOutcome', e.target.value)}
                                >
                                    <option value="all">Any Outcome</option>
                                    {Object.entries(LAST_CALL_RESULTS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Results Preview */}
                <div className="lg:col-span-1">
                    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl sticky top-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold flex items-center gap-2">
                                <Users size={18} className="text-slate-400" /> Matched Leads
                            </h3>
                            {isPreviewLoading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
                        </div>

                        <div className="text-center py-8 border-b border-slate-800 mb-6">
                            <div className="text-5xl font-black tracking-tighter mb-1">
                                {matchCount}
                            </div>
                            <div className="text-sm text-slate-400 font-medium">Recipients Found</div>
                        </div>

                        {previewError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg mb-4">
                                {previewError}
                            </div>
                        )}

                        <div className="space-y-3">
                            <p className="text-xs font-bold text-slate-500 uppercase">Preview Samples</p>
                            {previewLeads.slice(0, 5).map(lead => (
                                <div key={lead.id} className="bg-slate-800 p-3 rounded-xl flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">
                                        {(lead.firstName?.[0] || 'D')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{lead.firstName || 'Driver'} {lead.lastName}</div>
                                        <div className="text-xs text-slate-500 truncate">{lead.phone || lead.email}</div>
                                    </div>
                                </div>
                            ))}
                            {previewLeads.length === 0 && !isPreviewLoading && (
                                <div className="text-xs text-slate-500 italic text-center py-4">
                                    Adjust filters to see matches
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
