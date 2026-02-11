import React from 'react';
import {
    LayoutDashboard,
    FileText,
    ShieldCheck,
    Activity,
    StickyNote,
    Phone,
    User,
    CheckCircle2,
    AlertCircle,
    Clock
} from 'lucide-react';
import { StatusBadge } from '@shared/components/badges/StatusBadge';
import { formatPhoneNumber } from '@shared/utils/helpers';

export function DossierSidebar({
    appData,
    currentStatus,
    activeTab,
    setActiveTab,
    loading,
    dqStatus
}) {
    // Navigation Items
    const navItems = [
        { id: 'application', label: 'Application', icon: LayoutDashboard },
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'dq', label: 'DQ File', icon: ShieldCheck },
        { id: 'activity', label: 'Activity', icon: Activity },
        { id: 'notes', label: 'Notes', icon: StickyNote },
    ];

    const getInitials = (first, last) => {
        return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
    };

    const fullName = appData ? `${appData.firstName || ''} ${appData.lastName || ''}`.trim() : 'Loading...';
    const phone = appData?.phone || '';

    // Calculate DQ Color
    const getDQColor = () => {
        if (!dqStatus) return 'text-gray-400';
        if (dqStatus.complete === dqStatus.total) return 'text-green-600';
        return 'text-amber-500';
    };

    return (
        <div className="flex flex-col h-full">
            {/* 1. Identity Header */}
            <div className="p-6 border-b border-gray-200/60 bg-white">
                <div className="flex flex-col items-center text-center">
                    {/* Avatar */}
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-4 ring-4 ring-blue-50">
                        {loading ? (
                            <div className="w-full h-full rounded-full bg-gray-100 animate-pulse" />
                        ) : (
                            <span className="text-2xl font-bold text-white tracking-wider">
                                {getInitials(appData?.firstName, appData?.lastName)}
                            </span>
                        )}
                    </div>

                    {/* Name & Status */}
                    <h3 className="text-lg font-bold text-gray-900 mb-2 truncate max-w-full">
                        {loading ? '...' : fullName}
                    </h3>
                    <div className="mb-1">
                        {!loading && <StatusBadge status={currentStatus} />}
                    </div>
                    <div className="text-xs text-gray-400 mt-2 font-medium bg-gray-100 px-2 py-1 rounded-full">
                        Driver ID: {appData?.driverId || '---'}
                    </div>
                </div>
            </div>

            {/* 2. Navigation */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group
                            ${activeTab === item.id
                                ? 'bg-white text-blue-700 shadow-[0_2px_8px_-2px_rgba(59,130,246,0.15)] ring-1 ring-blue-100'
                                : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm'
                            }`}
                    >
                        <item.icon
                            size={18}
                            className={`transition-colors ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`}
                        />
                        <span>{item.label}</span>

                        {/* Badges/Indicators */}
                        {item.id === 'dq' && dqStatus && (
                            <div className="ml-auto">
                                {dqStatus.complete === dqStatus.total ? (
                                    <CheckCircle2 size={14} className="text-green-500" />
                                ) : (
                                    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-amber-500 rounded-full">
                                        !
                                    </span>
                                )}
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* 3. Contact Footer (Sticky) */}
            <div className="p-4 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)]">
                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-1 ml-1">Contact</p>
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-700 text-sm">
                            {formatPhoneNumber(phone) || 'No Phone'}
                        </span>
                        {phone && (
                            <a
                                href={`tel:${phone}`}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                title="Call Driver"
                            >
                                <Phone size={16} />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
