import React, { useState, useMemo } from 'react';
import { db } from '@lib/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Search, Zap, Lock, Unlock, Layers, Loader2, CheckCircle, Calendar, X, Clock, BarChart2 } from 'lucide-react';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { collection, getDocs, query } from 'firebase/firestore';

function Card({ title, icon, children, className = '' }) {
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col ${className}`}>
            <div className="p-5 border-b border-gray-200 shrink-0">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    {icon}
                    {title}
                </h2>
            </div>
            {children}
        </div>
    );
}

export function FeaturesView({ companyList, onDataUpdate }) {
    const { showSuccess, showError, showInfo } = useToast();
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    const filteredList = useMemo(() => {
        if (!search) return companyList;
        const term = search.toLowerCase();
        return companyList.filter(c => c.companyName?.toLowerCase().includes(term));
    }, [companyList, search]);

    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [selectedScheduleInfo, setSelectedScheduleInfo] = useState(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const [statsModalOpen, setStatsModalOpen] = useState(false);
    const [selectedStatsInfo, setSelectedStatsInfo] = useState(null);
    const [alertStats, setAlertStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);

    const toggleFeature = async (company, featureKey, currentValue) => {
        try {
            const docRef = doc(db, "companies", company.id);
            await updateDoc(docRef, {
                [`features.${featureKey}`]: !currentValue,
                [`featureSchedules.${featureKey}`]: null // clear schedule if manually toggled
            });
            showSuccess(`Updated ${company.companyName}`);
            onDataUpdate();
        } catch (e) {
            console.error("Update failed:", e);
            showError("Failed to toggle feature.");
        }
    };

    const openScheduleModal = (company, featureKey) => {
        setSelectedScheduleInfo({ company, featureKey });
        setScheduleDate('');
        setScheduleTime('');
        setScheduleModalOpen(true);
    };

    const handleScheduleDeactivation = async () => {
        if (!scheduleDate || !scheduleTime) {
            showError("Please select both date and time.");
            return;
        }

        const { company, featureKey } = selectedScheduleInfo;
        const dtStr = `${scheduleDate}T${scheduleTime}:00`;
        const dt = new Date(dtStr);
        if (isNaN(dt.getTime())) {
            showError("Invalid date/time.");
            return;
        }

        if (dt.getTime() < Date.now()) {
            showError("Cannot schedule in the past.");
            return;
        }

        setLoading(true);
        try {
            const docRef = doc(db, "companies", company.id);
            await updateDoc(docRef, {
                [`featureSchedules.${featureKey}`]: dt.toISOString()
            });
            showSuccess(`Scheduled deactivation for ${company.companyName}`);
            setScheduleModalOpen(false);
            onDataUpdate();
        } catch (e) {
            console.error("Schedule failed:", e);
            showError("Failed to schedule deactivation.");
        } finally {
            setLoading(false);
        }
    };

    const cancelSchedule = async (company, featureKey) => {
        try {
            const docRef = doc(db, "companies", company.id);
            await updateDoc(docRef, {
                [`featureSchedules.${featureKey}`]: null
            });
            showSuccess(`Cancelled schedule for ${company.companyName}`);
            onDataUpdate();
        } catch (e) {
            console.error("Cancel schedule failed:", e);
            showError("Failed to cancel schedule.");
        }
    };

    const openStatsModal = async (company, featureKey) => {
        setSelectedStatsInfo({ company, featureKey });
        setAlertStats([]);
        setStatsModalOpen(true);
        setStatsLoading(true);

        try {
            const alertsRef = collection(db, "companies", company.id, "feature_alerts");
            const snapshot = await getDocs(alertsRef);

            const statsMap = new Map();

            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (data.featureKey === featureKey) {
                    const email = data.userEmail || data.userId || 'Unknown';
                    if (!statsMap.has(email)) {
                        statsMap.set(email, { email, views: 0, dismisses: 0, salesClicks: 0 });
                    }
                    const userStats = statsMap.get(email);
                    userStats.views += data.views || 0;
                    userStats.dismisses += data.dismisses || 0;
                    userStats.salesClicks += data.salesClicks || 0;
                }
            });

            setAlertStats(Array.from(statsMap.values()));
        } catch (error) {
            console.error("Error loading stats:", error);
            showError("Failed to load alert stats.");
        } finally {
            setStatsLoading(false);
        }
    };

    const handleBulkAction = async (featureKey, targetState) => {
        if (!window.confirm(`Are you sure you want to ${targetState ? 'ENABLE' : 'DISABLE'} ${featureKey} for ALL ${companyList.length} companies?`)) return;

        setBulkLoading(true);
        showInfo("Processing bulk update...");

        try {
            const BATCH_SIZE = 400;
            const chunks = [];
            for (let i = 0; i < companyList.length; i += BATCH_SIZE) {
                chunks.push(companyList.slice(i, i + BATCH_SIZE));
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(company => {
                    const ref = doc(db, "companies", company.id);
                    batch.update(ref, { [`features.${featureKey}`]: targetState });
                });
                await batch.commit();
            }

            showSuccess(`Successfully ${targetState ? 'Enabled' : 'Disabled'} feature for all companies.`);
            onDataUpdate();
        } catch (e) {
            console.error("Bulk update failed:", e);
            showError("Bulk update failed.");
        } finally {
            setBulkLoading(false);
        }
    };

    const ALL_FEATURES = [
        { key: 'pev', label: 'PEV' },
        { key: 'campaignsEnabled', label: 'Campaigns' },
        { key: 'eDocs', label: 'E-Docs' },
        { key: 'importLeads', label: 'Import Leads' },
        { key: 'callTracking', label: 'Call Tracking' }
    ];

    return (
        <>
        <div className="space-y-6 h-full flex flex-col">

            <Card title="Company Feature Overrides" icon={<Zap size={20} className="text-purple-600" />} className="flex-1 min-h-0">
                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="relative max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search companies..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-gray-50">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">Company Name</th>
                                {ALL_FEATURES.map(f => (
                                    <th key={f.key} className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 text-center whitespace-nowrap">
                                        {f.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredList.map(company => {
                                return (
                                    <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 sticky left-0 bg-white border-r border-gray-100 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                            <div>{company.companyName}</div>
                                        </td>
                                        {ALL_FEATURES.map(f => {
                                            const isEnabled = company.features?.[f.key] === true;
                                            const schedule = company.featureSchedules?.[f.key];

                                            return (
                                                <td key={f.key} className="px-6 py-4 text-center space-y-2 min-w-[140px]">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => toggleFeature(company, f.key, isEnabled)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                                                        >
                                                            <span
                                                                className={`${isEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                                            />
                                                        </button>
                                                        {isEnabled && (
                                                            <button
                                                                onClick={() => openScheduleModal(company, f.key)}
                                                                className="text-gray-400 hover:text-blue-600 transition"
                                                                title="Schedule Deactivation"
                                                            >
                                                                <Calendar size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {schedule && (
                                                        <div className="text-[10px] text-orange-600 bg-orange-50 rounded px-1.5 py-1 flex flex-col items-center justify-center gap-1 leading-tight">
                                                            <div className="flex items-center gap-1">
                                                                <Clock size={10} />
                                                                {new Date(schedule).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                                <button onClick={() => cancelSchedule(company, f.key)} className="ml-0.5 hover:text-red-600"><X size={10}/></button>
                                                            </div>
                                                            <button onClick={() => openStatsModal(company, f.key)} className="flex items-center gap-1 text-blue-600 hover:underline">
                                                                <BarChart2 size={10} /> Alerts
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
            {scheduleModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setScheduleModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-gray-200 flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-orange-600 rounded-t-xl text-white">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Clock size={24} /> Schedule Deactivation
                            </h2>
                            <button onClick={() => setScheduleModalOpen(false)} className="p-1 hover:bg-orange-700 rounded-full transition"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Select when you want the feature <strong>{selectedScheduleInfo?.featureKey}</strong> to be deactivated automatically for <strong>{selectedScheduleInfo?.company?.companyName}</strong>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">Date</label>
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    className="p-2 border rounded"
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">Time</label>
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    className="p-2 border rounded"
                                />
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button
                                    onClick={() => setScheduleModalOpen(false)}
                                    className="px-4 py-2 border rounded hover:bg-gray-50 text-black"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleScheduleDeactivation}
                                    disabled={loading || !scheduleDate || !scheduleTime}
                                    className="px-4 py-2 bg-orange-600 text-white font-bold rounded hover:bg-orange-700 disabled:opacity-50"
                                >
                                    {loading ? "Scheduling..." : "Schedule"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {statsModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setStatsModalOpen(false)}>
                    <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-blue-600 rounded-t-xl text-white shrink-0">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <BarChart2 size={24} /> Alert Interactions
                            </h2>
                            <button onClick={() => setStatsModalOpen(false)} className="p-1 hover:bg-blue-700 rounded-full transition"><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-auto">
                            <p className="text-sm text-gray-600 mb-4">
                                Stats for <strong>{selectedStatsInfo?.featureKey}</strong> at <strong>{selectedStatsInfo?.company?.companyName}</strong>.
                            </p>

                            {statsLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                            ) : alertStats.length === 0 ? (
                                <p className="text-gray-500 text-center p-8 bg-gray-50 rounded-lg">No alert interactions recorded yet.</p>
                            ) : (
                                <table className="w-full text-left border-collapse bg-white border border-gray-200 rounded-lg overflow-hidden">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border-b text-sm font-bold text-gray-700">User Email</th>
                                            <th className="px-4 py-2 border-b text-sm font-bold text-gray-700 text-center">Views</th>
                                            <th className="px-4 py-2 border-b text-sm font-bold text-gray-700 text-center">Dismisses (X)</th>
                                            <th className="px-4 py-2 border-b text-sm font-bold text-gray-700 text-center">Contact Sales Clicks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {alertStats.map((stat, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-sm">{stat.email}</td>
                                                <td className="px-4 py-2 text-sm text-center">{stat.views}</td>
                                                <td className="px-4 py-2 text-sm text-center">{stat.dismisses}</td>
                                                <td className="px-4 py-2 text-sm text-center text-blue-600 font-bold">{stat.salesClicks}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end shrink-0 rounded-b-xl">
                            <button onClick={() => setStatsModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
