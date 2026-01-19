// src/features/super-admin/components/LeadDistributionView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Shuffle, Play, RefreshCw, Settings, AlertTriangle, CheckCircle,
    XCircle, Clock, TrendingUp, TrendingDown, Database, Users,
    Building, Save, Loader2, ChevronDown, ChevronUp, Search,
    Download, Mail, RotateCcw, Info
} from 'lucide-react';
import { doc, onSnapshot, setDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../lib/firebase';

// --- Supply/Demand Analytics Card ---
function AnalyticsCard({ title, value, subtitle, icon, trend, loading, tooltip }) {
    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
            </div>
        );
    }

    const trendColor = trend === 'surplus' ? 'text-green-600' : trend === 'deficit' ? 'text-red-600' : 'text-gray-600';

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                    {title}
                    {tooltip && (
                        <div className="group relative">
                            <Info size={14} className="text-gray-400 cursor-help" />
                            <div className="absolute left-0 top-6 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                {tooltip}
                            </div>
                        </div>
                    )}
                </h3>
                <div className={`p-3 rounded-lg ${trend === 'surplus' ? 'bg-green-100' : trend === 'deficit' ? 'bg-red-100' : 'bg-slate-100'}`}>
                    {icon}
                </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{value?.toLocaleString() || 0}</p>
            {subtitle && <p className={`text-sm ${trend === 'surplus' ? 'text-green-600' : trend === 'deficit' ? 'text-red-600' : 'text-gray-600'} font-medium`}>{subtitle}</p>}
        </div>
    );
}

// --- Company Row Component ---
function CompanyRow({ company, isExpanded, onToggle }) {
    const statusConfig = {
        verified: { color: 'bg-green-100 text-green-700 border-green-300', icon: <CheckCircle size={14} /> },
        partial: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: <Clock size={14} /> },
        failed: { color: 'bg-red-100 text-red-700 border-red-300', icon: <XCircle size={14} /> },
        pending: { color: 'bg-gray-100 text-gray-600 border-gray-300', icon: <Clock size={14} /> }
    };

    const config = statusConfig[company.status] || statusConfig.pending;
    const fulfillmentPercent = company.quota > 0 ? Math.round((company.received / company.quota) * 100) : 0;

    return (
        <>
            <tr
                className={`hover:bg-gray-50 cursor-pointer transition-colors ${company.status === 'failed' ? 'bg-red-50/30' : company.status === 'partial' ? 'bg-yellow-50/30' : ''}`}
                onClick={onToggle}
            >
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        {(company.status === 'failed' || company.status === 'partial') && (
                            isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                        )}
                        <span className="font-medium text-gray-900">{company.name}</span>
                    </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{company.plan || 'Free'}</td>
                <td className="px-4 py-3 text-gray-600">{company.quota}</td>
                <td className="px-4 py-3">
                    <span className={`font-semibold ${company.received < company.quota ? 'text-orange-600' : 'text-green-600'}`}>
                        {company.received}
                    </span>
                </td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all ${fulfillmentPercent === 100 ? 'bg-green-500' : fulfillmentPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${fulfillmentPercent}%` }}
                            ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-700 min-w-[3rem]">{fulfillmentPercent}%</span>
                    </div>
                </td>
                <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
                        {config.icon}
                        {company.status?.charAt(0).toUpperCase() + company.status?.slice(1)}
                    </span>
                </td>
            </tr>
            {isExpanded && company.error && (
                <tr className="bg-red-50">
                    <td colSpan={6} className="px-6 py-3 text-sm text-red-700">
                        <strong>Error:</strong> {company.error}
                    </td>
                </tr>
            )}
        </>
    );
}

// --- Main Component ---
export function LeadDistributionView() {
    // State
    const [settings, setSettings] = useState({ quota_paid: 200, quota_free: 50, maintenance_mode: false });
    const [analytics, setAnalytics] = useState(null);
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedRow, setExpandedRow] = useState(null);

    // Loading states
    const [loadingAnalytics, setLoadingAnalytics] = useState(true);
    const [loadingReports, setLoadingReports] = useState(true);
    const [distributing, setDistributing] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [verifying, setVerifying] = useState(false);

    // Messages
    const [message, setMessage] = useState(null);

    // Fetch analytics
    const fetchAnalytics = useCallback(async () => {
        setLoadingAnalytics(true);
        try {
            const getAnalytics = httpsCallable(functions, 'getLeadSupplyAnalytics');
            const result = await getAnalytics();
            setAnalytics(result.data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
            setMessage({ type: 'error', text: 'Failed to load analytics: ' + error.message });
        }
        setLoadingAnalytics(false);
    }, []);

    // Fetch distribution reports
    const fetchReports = useCallback(async () => {
        setLoadingReports(true);
        try {
            const reportsRef = collection(db, 'distribution_reports');
            const q = query(reportsRef, orderBy('date', 'desc'), limit(10));
            const snapshot = await getDocs(q);
            const reportsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReports(reportsData);
            if (reportsData.length > 0) {
                setSelectedReport(reportsData[0]);
            }
        } catch (error) {
            console.error('Failed to fetch reports:', error);
        }
        setLoadingReports(false);
    }, []);

    // Listen to settings
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_settings', 'distribution'), (doc) => {
            if (doc.exists()) {
                setSettings(doc.data());
            }
        });
        return () => unsub();
    }, []);

    // Initial load
    useEffect(() => {
        fetchAnalytics();
        fetchReports();
    }, [fetchAnalytics, fetchReports]);

    // Save settings
    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await setDoc(doc(db, 'system_settings', 'distribution'), {
                quota_paid: Number(settings.quota_paid),
                quota_free: Number(settings.quota_free),
                maintenance_mode: settings.maintenance_mode
            }, { merge: true });
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        }
        setSavingSettings(false);
        setTimeout(() => setMessage(null), 3000);
    };

    // Run distribution
    const handleDistribute = async (forceRotate = false) => {
        setDistributing(true);
        setMessage({ type: 'info', text: forceRotate ? 'Force rotating leads...' : 'Distributing leads to companies...' });

        try {
            const distributeFn = httpsCallable(functions, 'distributeDailyLeads');
            const result = await distributeFn({ forceRotate });

            if (result.data.success) {
                setMessage({ type: 'success', text: result.data.message });
                // Refresh data
                await fetchAnalytics();
                await fetchReports();
            } else {
                setMessage({ type: 'error', text: result.data.message || 'Distribution failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Distribution error: ' + error.message });
        }

        setDistributing(false);
        setTimeout(() => setMessage(null), 5000);
    };

    // Verify distribution delivery
    const handleVerify = async () => {
        setVerifying(true);
        setMessage({ type: 'info', text: 'Verifying lead delivery to all companies...' });

        try {
            const verifyFn = httpsCallable(functions, 'verifyDistributionDelivery');
            const result = await verifyFn();

            if (result.data.success) {
                setMessage({ type: 'success', text: result.data.message });
                setSelectedReport(result.data.report);
                await fetchReports();
            } else {
                setMessage({ type: 'error', text: 'Verification failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Verification error: ' + error.message });
        }

        setVerifying(false);
        setTimeout(() => setMessage(null), 5000);
    };

    // Filter companies in report
    const filteredCompanies = selectedReport?.companies?.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <Shuffle className="text-blue-600" size={28} />
                        Lead Distribution Command Center
                    </h1>
                    <p className="text-gray-500 mt-1">Manage and monitor automated lead distribution</p>
                </div>
                {settings.maintenance_mode && (
                    <span className="px-4 py-2 bg-red-100 text-red-700 font-bold rounded-full flex items-center gap-2 animate-pulse">
                        <AlertTriangle size={18} />
                        MAINTENANCE MODE
                    </span>
                )}
            </div>

            {/* Message Toast */}
            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                    message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                        'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                    {message.type === 'success' && <CheckCircle size={20} />}
                    {message.type === 'error' && <XCircle size={20} />}
                    {message.type === 'info' && <Loader2 size={20} className="animate-spin" />}
                    {message.text}
                </div>
            )}

            {/* Phase 3: Supply/Demand Warnings */}
            {analytics?.health?.status === 'deficit' && (
                <div className="p-4 rounded-lg bg-red-50 border-2 border-red-200 flex items-start gap-3">
                    <AlertTriangle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="font-bold text-red-800 mb-1">⚠️ Not Enough Drivers!</h3>
                        <p className="text-sm text-red-700">
                            You need <strong>{Math.abs(analytics?.health?.gap || 0)} more drivers</strong> to meet the daily quota for all companies.
                            Companies may not receive their full promised amount until more drivers are added.
                        </p>
                    </div>
                </div>
            )}

            {/* Phase 2: Check for companies that got shortchanged in latest report */}
            {selectedReport?.summary && (
                selectedReport.summary.partial > 0 || selectedReport.summary.failed > 0
            ) && (
                    <div className="p-4 rounded-lg bg-yellow-50 border-2 border-yellow-200 flex items-start gap-3">
                        <AlertTriangle size={24} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-bold text-yellow-800 mb-1">⚠️ Some Companies Didn't Receive Full Quota</h3>
                            <p className="text-sm text-yellow-700">
                                {selectedReport.summary.partial > 0 && <span><strong>{selectedReport.summary.partial} companies</strong> received partial leads. </span>}
                                {selectedReport.summary.failed > 0 && <span><strong>{selectedReport.summary.failed} companies</strong> received no leads. </span>}
                                Check the delivery report below for details.
                            </p>
                        </div>
                    </div>
                )}

            {/* Phase 2: Inactive companies warning */}
            {analytics?.demand && (
                <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
                    <Info size={16} className="text-gray-400" />
                    <span>
                        Showing {analytics.demand.companiesCount} active companies.
                        {analytics.demand.companiesCount < 12 && " Some companies may be inactive and are excluded from distribution."}
                    </span>
                </div>
            )}

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <AnalyticsCard
                    title="Total Drivers in Pool"
                    value={analytics?.supply?.totalInPool}
                    subtitle={`${analytics?.supply?.availableNow || 0} available to distribute now`}
                    icon={<Database size={24} className="text-slate-600" />}
                    loading={loadingAnalytics}
                    tooltip="All driver leads in the system that can be shared with companies"
                />
                <AnalyticsCard
                    title="Daily Quota (All Companies)"
                    value={analytics?.demand?.totalDailyQuota}
                    subtitle={`${analytics?.demand?.companiesCount || 0} companies want leads daily`}
                    icon={<Building size={24} className="text-slate-600" />}
                    loading={loadingAnalytics}
                    tooltip="Total number of leads all companies want to receive each day"
                />
                <AnalyticsCard
                    title={analytics?.health?.status === 'surplus' ? 'Extra Drivers Available' : 'Drivers Needed'}
                    value={Math.abs(analytics?.health?.gap || 0)}
                    subtitle={analytics?.health?.status === 'surplus' ? 'More than enough' : 'Not enough to meet demand'}
                    icon={analytics?.health?.status === 'surplus' ?
                        <TrendingUp size={24} className="text-green-600" /> :
                        <TrendingDown size={24} className="text-red-600" />}
                    trend={analytics?.health?.status}
                    loading={loadingAnalytics}
                    tooltip={analytics?.health?.status === 'surplus' ? 'We have extra drivers beyond what companies need' : 'We need more drivers to satisfy all companies'}
                />
                <AnalyticsCard
                    title="Already Given Out"
                    value={analytics?.distribution?.totalDistributedInCirculation}
                    subtitle={`${analytics?.distribution?.totalPrivateUploads || 0} uploaded directly by companies`}
                    icon={<Users size={24} className="text-slate-600" />}
                    loading={loadingAnalytics}
                    tooltip="Drivers currently assigned to companies (both shared and private uploads)"
                />
            </div>

            {/* Distribution Controls */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Play size={20} />
                    Distribution Controls
                </h2>
                <div className="flex flex-wrap gap-4">
                    <button
                        onClick={() => handleDistribute(false)}
                        disabled={distributing || settings.maintenance_mode}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {distributing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                        Distribute Now
                    </button>
                    <button
                        onClick={() => handleDistribute(true)}
                        disabled={distributing || settings.maintenance_mode}
                        className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {distributing ? <Loader2 size={20} className="animate-spin" /> : <RotateCcw size={20} />}
                        Force Rotate
                    </button>
                    <button
                        onClick={() => { fetchAnalytics(); fetchReports(); }}
                        disabled={loadingAnalytics}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all"
                    >
                        <RefreshCw size={20} className={loadingAnalytics ? 'animate-spin' : ''} />
                        Refresh Data
                    </button>
                    <button
                        onClick={handleVerify}
                        disabled={verifying || settings.maintenance_mode}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {verifying ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                        Verify Delivery
                    </button>
                </div>
            </div>

            {/* Configuration Panel */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Settings size={20} />
                    System Configuration
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Paid Plan Quota</label>
                        <input
                            type="number"
                            value={settings.quota_paid}
                            onChange={(e) => setSettings({ ...settings, quota_paid: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leads per day for paid companies</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Free Plan Quota</label>
                        <input
                            type="number"
                            value={settings.quota_free}
                            onChange={(e) => setSettings({ ...settings, quota_free: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leads per day for free companies</p>
                    </div>
                    <div className="flex flex-col justify-between">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-medium text-gray-900">Maintenance Mode</span>
                                <p className="text-xs text-gray-500">Pause all distribution</p>
                            </div>
                            <button
                                onClick={() => setSettings({ ...settings, maintenance_mode: !settings.maintenance_mode })}
                                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${settings.maintenance_mode ? 'bg-red-600' : 'bg-gray-300'
                                    }`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${settings.maintenance_mode ? 'translate-x-8' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>
                        <button
                            onClick={handleSaveSettings}
                            disabled={savingSettings}
                            className="flex items-center justify-center gap-2 mt-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-all"
                        >
                            {savingSettings ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            Save Configuration
                        </button>
                    </div>
                </div>
            </div>

            {/* Delivery Report */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <CheckCircle size={20} />
                        Daily Delivery Report
                    </h2>
                    <div className="flex items-center gap-3">
                        {/* Report selector */}
                        <select
                            value={selectedReport?.id || ''}
                            onChange={(e) => setSelectedReport(reports.find(r => r.id === e.target.value))}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                            {reports.map(r => (
                                <option key={r.id} value={r.id}>{r.date}</option>
                            ))}
                            {reports.length === 0 && <option value="">No reports yet</option>}
                        </select>
                        <button className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                            <Download size={16} /> Export
                        </button>
                    </div>
                </div>

                {/* Summary */}
                {selectedReport?.summary && (
                    <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="p-3 bg-gray-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-gray-900">{selectedReport.summary.totalCompanies}</p>
                            <p className="text-xs text-gray-500">Total Companies</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-green-600">{selectedReport.summary.successful}</p>
                            <p className="text-xs text-gray-500">Successful</p>
                        </div>
                        <div className="p-3 bg-yellow-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-yellow-600">{selectedReport.summary.partial}</p>
                            <p className="text-xs text-gray-500">Partial</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-red-600">{selectedReport.summary.failed}</p>
                            <p className="text-xs text-gray-500">Failed</p>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative mb-4">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search companies..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Companies Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Quota</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Received</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fulfillment</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loadingReports ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                                        Loading reports...
                                    </td>
                                </tr>
                            ) : filteredCompanies.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        {reports.length === 0 ? 'No distribution reports yet. Run a distribution to generate a report.' : 'No companies match your search.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredCompanies.map(company => (
                                    <CompanyRow
                                        key={company.id}
                                        company={company}
                                        isExpanded={expandedRow === company.id}
                                        onToggle={() => setExpandedRow(expandedRow === company.id ? null : company.id)}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
