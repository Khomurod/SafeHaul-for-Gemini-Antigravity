import React from 'react';
import { Calendar, Users, MessageSquare, ChevronRight, MoreVertical } from 'lucide-react';

export function CampaignCard({ campaign, onClick }) {
    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'draft': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'scheduled': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    return (
        <div
            onClick={onClick}
            className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer"
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                </div>
                <button className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                    <MoreVertical size={18} />
                </button>
            </div>

            <h3 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate mb-1">
                {campaign.name || 'Untitled Campaign'}
            </h3>
            <p className="text-slate-500 text-sm font-medium mb-6 line-clamp-2">
                {campaign.messageConfig?.message || 'No content defined...'}
            </p>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-2 text-slate-400">
                    <Users size={16} />
                    <span className="text-xs font-bold text-slate-600">{campaign.matchCount || 0} leads</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    <MessageSquare size={16} />
                    <span className="text-xs font-bold text-slate-600 uppercase">{campaign.messageConfig?.method || 'SMS'}</span>
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-500 transition-all">
                <span className="flex items-center gap-1.5">
                    <Calendar size={12} />
                    {campaign.updatedAt?.toDate() ? new Date(campaign.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                </span>
                <span className="flex items-center gap-0.5">
                    View Details <ChevronRight size={12} />
                </span>
            </div>
        </div>
    );
}
