// src/features/super-admin/views/UnifiedDriverList.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { db } from '@lib/firebase';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import {
    Search, Trash2, Filter, X, Eye, MessageSquare, UserPlus,
    FileText, Zap, User, Briefcase, Share2, Loader2, Clock,
    CheckSquare, Square, ChevronUp, ChevronDown, MapPin
} from 'lucide-react';
import { getFieldValue, formatPhoneNumber } from '@shared/utils/helpers';
import { useToast } from '@shared/components/feedback';
import { StatusBadge } from '@shared/components/badges';
import { SkeletonTable } from '@shared/components/table';

// ========== FILTER CHIPS COMPONENT ==========
const FilterChip = ({ label, active, onClick, onClear }) => (
    <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border transition-all ${active
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
    >
        {label}
        {active && onClear && (
            <X
                size={14}
                className="ml-1 hover:text-blue-900 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
            />
        )}
    </button>
);

// ========== SOURCE BADGE COMPONENT ==========
const SourceBadge = ({ type }) => {
    const config = {
        'Company App': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', icon: FileText, label: 'Direct App' },
        'Global Pool': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', icon: Zap, label: 'Global Pool' },
        'Distributed Lead': { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', icon: Share2, label: 'Distributed' },
        'Company Import': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: Briefcase, label: 'Import' },
    };
    const c = config[type] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', icon: User, label: type };
    const Icon = c.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
            <Icon size={12} />
            {c.label}
        </span>
    );
};

// ========== BULK ACTION BAR ==========
const BulkActionBar = ({ selectedCount, onMessage, onAssign, onMoveStatus, onArchive, onClearSelection }) => (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl">
        <div className="flex items-center gap-3">
            <span className="font-semibold">{selectedCount} selected</span>
            <button onClick={onClearSelection} className="text-white/80 hover:text-white text-sm underline">
                Clear
            </button>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onMessage} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <MessageSquare size={14} /> Message
            </button>
            <button onClick={onAssign} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <UserPlus size={14} /> Assign
            </button>
            <button onClick={onMoveStatus} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <ChevronUp size={14} /> Move Status
            </button>
            <button onClick={onArchive} className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <Trash2 size={14} /> Archive
            </button>
        </div>
    </div>
);

// ========== MAIN COMPONENT ==========
export function UnifiedDriverList({
    allApplications,
    allCompaniesMap,
    onAppClick,
    onDataUpdate,
    loadMore,
    hasMore,
    isLoading = false
}) {
    const { showSuccess, showError } = useToast();

    // --- Search & Filters ---
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({
        source: 'All',
        status: 'All',
        driverType: 'All',
        docsStatus: 'All'
    });

    // --- Sorting ---
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // --- Selection & Bulk ---
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [deletingId, setDeletingId] = useState(null);

    // --- Pagination ---
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(50);

    // --- Helper: Relative Time ---
    const getRelativeTime = (timestamp) => {
        if (!timestamp?.seconds) return '--';
        const now = Date.now();
        const then = timestamp.seconds * 1000;
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return `${Math.floor(diffDays / 30)}mo ago`;
    };

    // --- Helper: Check if Stale (>14 days) ---
    const isStale = (timestamp) => {
        if (!timestamp?.seconds) return false;
        const diffMs = Date.now() - (timestamp.seconds * 1000);
        return diffMs > (14 * 24 * 60 * 60 * 1000);
    };

    // --- Helper: Calculate Docs Status ---
    const getDocsStatus = (item) => {
        const docs = item.uploadedDocuments || item.documents || {};
        const docsCount = Object.keys(docs).length;
        const requiredDocs = 4; // CDL front, back, medical, MVR
        if (docsCount >= requiredDocs) return 'Complete';
        if (docsCount === 0) return 'Missing';
        return `${docsCount}/${requiredDocs}`;
    };

    // --- Data Processing ---
    const filteredData = useMemo(() => {
        let data = [...allApplications];

        // 1. Search
        if (search) {
            const term = search.toLowerCase();
            data = data.filter(item => {
                const name = `${item.firstName || ''} ${item.lastName || ''}`.toLowerCase();
                const email = (item.email || '').toLowerCase();
                const phone = (item.phone || '').toLowerCase();
                const company = (allCompaniesMap.get(item.companyId) || '').toLowerCase();
                return name.includes(term) || email.includes(term) || phone.includes(term) || company.includes(term);
            });
        }

        // 2. Filters
        if (filters.source !== 'All') {
            data = data.filter(item => item.sourceType === filters.source);
        }
        if (filters.status !== 'All') {
            data = data.filter(item => (item.status || 'New') === filters.status);
        }
        if (filters.driverType !== 'All') {
            const types = Array.isArray(item => item.driverType) ? item.driverType : [item.driverType];
            data = data.filter(item => types?.includes(filters.driverType));
        }
        if (filters.docsStatus !== 'All') {
            data = data.filter(item => {
                const status = getDocsStatus(item);
                if (filters.docsStatus === 'Complete') return status === 'Complete';
                if (filters.docsStatus === 'Missing') return status === 'Missing';
                return status !== 'Complete' && status !== 'Missing';
            });
        }

        // 3. Sort
        data.sort((a, b) => {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;

            if (sortConfig.key === 'date') {
                return ((a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)) * dir;
            }
            if (sortConfig.key === 'name') {
                const aName = `${a.firstName} ${a.lastName}`;
                const bName = `${b.firstName} ${b.lastName}`;
                return aName.localeCompare(bName) * dir;
            }
            if (sortConfig.key === 'status') {
                return (a.status || 'New').localeCompare(b.status || 'New') * dir;
            }
            if (sortConfig.key === 'experience') {
                return ((a.yearsExperience || 0) - (b.yearsExperience || 0)) * dir;
            }
            return 0;
        });

        return data;
    }, [allApplications, search, filters, sortConfig, allCompaniesMap]);

    // --- Pagination ---
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(start, start + itemsPerPage);
    }, [filteredData, currentPage, itemsPerPage]);

    // --- Selection Handlers ---
    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === paginatedData.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(paginatedData.map(item => item.id)));
        }
    }, [selectedIds, paginatedData]);

    const toggleSelect = useCallback((id, e) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    // --- Sort Handler ---
    const handleSort = useCallback((key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    }, []);

    // --- Delete Handler ---
    const handleDelete = async (e, item) => {
        e.stopPropagation();
        if (!window.confirm(`SUPER ADMIN WARNING:\n\nAre you sure you want to PERMANENTLY DELETE this record for ${item.firstName} ${item.lastName}?\n\nThis cannot be undone.`)) {
            return;
        }

        setDeletingId(item.id);
        try {
            let docRef;
            if (item.sourceType === 'Global Pool' || item.sourceType === 'Bulk Lead') {
                docRef = doc(db, "leads", item.id);
            } else if (item.companyId && item.companyId !== 'general-leads') {
                const collectionName = item.sourceType === 'Company App' ? 'applications' : 'leads';
                docRef = doc(db, "companies", item.companyId, collectionName, item.id);
            } else {
                docRef = doc(db, "leads", item.id);
            }

            await deleteDoc(docRef);
            showSuccess("Record deleted successfully.");
            onDataUpdate();
        } catch (err) {
            console.error("Delete failed:", err);
            showError("Failed to delete. Check console.");
        } finally {
            setDeletingId(null);
        }
    };

    // --- Bulk Action Handlers (Placeholder) ---
    const handleBulkMessage = () => showSuccess(`Message action for ${selectedIds.size} items`);
    const handleBulkAssign = () => showSuccess(`Assign action for ${selectedIds.size} items`);
    const handleBulkMoveStatus = () => showSuccess(`Move status action for ${selectedIds.size} items`);
    const handleBulkArchive = () => {
        if (window.confirm(`Are you sure you want to archive ${selectedIds.size} records?`)) {
            showSuccess(`Archive action for ${selectedIds.size} items`);
            setSelectedIds(new Set());
        }
    };

    // --- Clear Filters ---
    const clearAllFilters = () => {
        setSearch('');
        setFilters({ source: 'All', status: 'All', driverType: 'All', docsStatus: 'All' });
    };

    const hasActiveFilters = search || Object.values(filters).some(v => v !== 'All');

    // --- Column Definitions ---
    const columns = [
        { key: 'name', label: 'Driver Name', sortable: true, width: 'min-w-[200px]' },
        { key: 'status', label: 'Status', sortable: true, width: 'w-[120px]' },
        { key: 'source', label: 'Source', sortable: false, width: 'w-[130px]' },
        { key: 'position', label: 'Position', sortable: false, width: 'w-[140px]' },
        { key: 'driverType', label: 'Driver Type', sortable: false, width: 'w-[140px]' },
        { key: 'location', label: 'Location', sortable: false, width: 'w-[140px]' },
        { key: 'experience', label: 'Exp', sortable: true, width: 'w-[80px]' },
        { key: 'docs', label: 'Docs', sortable: false, width: 'w-[100px]' },
        { key: 'lastActivity', label: 'Last Activity', sortable: false, width: 'w-[100px]' },
        { key: 'actions', label: '', sortable: false, width: 'w-[100px]' }
    ];

    return (
        <div className="space-y-4 h-full flex flex-col">

            {/* Header / Search / Filters */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm shrink-0 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Unified Driver Database</h2>
                        <p className="text-sm text-gray-500">{filteredData.length} records found across all systems</p>
                    </div>

                    {/* Search */}
                    <div className="relative w-full md:w-80">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or phone..."
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                        <Filter size={12} /> Filters:
                    </span>

                    {/* Status Filter */}
                    <select
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filters.status}
                        onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="All">All Status</option>
                        <option value="New">New</option>
                        <option value="In Review">In Review</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Hold">Hold</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                    </select>

                    {/* Source Filter */}
                    <select
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filters.source}
                        onChange={(e) => setFilters(f => ({ ...f, source: e.target.value }))}
                    >
                        <option value="All">All Sources</option>
                        <option value="Global Pool">Global Pool</option>
                        <option value="Company App">Direct Applications</option>
                        <option value="Distributed Lead">Distributed Leads</option>
                        <option value="Company Import">Company Imports</option>
                    </select>

                    {/* Driver Type Filter */}
                    <select
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filters.driverType}
                        onChange={(e) => setFilters(f => ({ ...f, driverType: e.target.value }))}
                    >
                        <option value="All">All Types</option>
                        <option value="OTR">OTR</option>
                        <option value="Regional">Regional</option>
                        <option value="Local">Local</option>
                        <option value="Team">Team</option>
                    </select>

                    {/* Docs Filter */}
                    <select
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filters.docsStatus}
                        onChange={(e) => setFilters(f => ({ ...f, docsStatus: e.target.value }))}
                    >
                        <option value="All">All Docs</option>
                        <option value="Complete">Complete</option>
                        <option value="Partial">Partial</option>
                        <option value="Missing">Missing</option>
                    </select>

                    {hasActiveFilters && (
                        <button
                            onClick={clearAllFilters}
                            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">

                {/* Bulk Action Bar */}
                {selectedIds.size > 0 && (
                    <BulkActionBar
                        selectedCount={selectedIds.size}
                        onMessage={handleBulkMessage}
                        onAssign={handleBulkAssign}
                        onMoveStatus={handleBulkMoveStatus}
                        onArchive={handleBulkArchive}
                        onClearSelection={() => setSelectedIds(new Set())}
                    />
                )}

                {/* Table */}
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                {/* Checkbox Column */}
                                <th className="w-12 px-4 py-3 border-b border-gray-200">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="p-1 text-gray-400 hover:text-blue-600 transition"
                                    >
                                        {selectedIds.size === paginatedData.length && paginatedData.length > 0
                                            ? <CheckSquare size={18} className="text-blue-600" />
                                            : <Square size={18} />
                                        }
                                    </button>
                                </th>

                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-3 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider ${col.width} ${col.sortable ? 'cursor-pointer hover:text-gray-700' : ''}`}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {col.sortable && sortConfig.key === col.key && (
                                                <span className="text-blue-600">
                                                    {sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <SkeletonTable rows={10} columns={11} />
                            ) : paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="p-12 text-center">
                                        <div className="text-gray-400">
                                            <Search size={32} className="mx-auto mb-3 opacity-50" />
                                            <p className="font-medium">No drivers match your filters.</p>
                                            {hasActiveFilters && (
                                                <button
                                                    onClick={clearAllFilters}
                                                    className="mt-2 text-blue-600 hover:underline text-sm"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map(item => {
                                    const stale = isStale(item.createdAt);
                                    const docsStatus = getDocsStatus(item);
                                    const isNew = (item.status || 'New') === 'New';

                                    return (
                                        <tr
                                            key={item.id}
                                            onClick={() => onAppClick(item)}
                                            className={`hover:bg-blue-50 cursor-pointer transition-colors group ${isNew ? 'border-l-4 border-l-blue-500' : ''}`}
                                        >
                                            {/* Checkbox */}
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => toggleSelect(item.id, e)}
                                                    className="p-1 text-gray-400 hover:text-blue-600 transition"
                                                >
                                                    {selectedIds.has(item.id)
                                                        ? <CheckSquare size={18} className="text-blue-600" />
                                                        : <Square size={18} />
                                                    }
                                                </button>
                                            </td>

                                            {/* Driver Name */}
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-900">
                                                    {item.firstName} {item.lastName}
                                                </div>
                                                <div className="text-xs text-gray-400 truncate max-w-[180px]">
                                                    {item.phone ? formatPhoneNumber(item.phone) : item.email}
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <StatusBadge status={item.status || 'New'} />
                                                    {stale && <StatusBadge status="Stale" size="sm" />}
                                                </div>
                                            </td>

                                            {/* Source */}
                                            <td className="px-4 py-3">
                                                <SourceBadge type={item.sourceType} />
                                            </td>

                                            {/* Position */}
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {item.positionApplyingTo || 'Driver'}
                                            </td>

                                            {/* Driver Type */}
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {Array.isArray(item.driverType)
                                                    ? item.driverType.join(', ')
                                                    : item.driverType || '--'}
                                            </td>

                                            {/* Location */}
                                            <td className="px-4 py-3">
                                                {(item.city || item.state) ? (
                                                    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                                                        <MapPin size={12} className="text-gray-400" />
                                                        {item.city}{item.city && item.state ? ', ' : ''}{item.state}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">--</span>
                                                )}
                                            </td>

                                            {/* Experience */}
                                            <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                                                {item.yearsExperience ? `${item.yearsExperience}y` : '--'}
                                            </td>

                                            {/* Docs */}
                                            <td className="px-4 py-3">
                                                <span className={`text-sm font-medium ${docsStatus === 'Complete' ? 'text-green-600' :
                                                        docsStatus === 'Missing' ? 'text-amber-600' :
                                                            'text-gray-600'
                                                    }`}>
                                                    {docsStatus}
                                                </span>
                                            </td>

                                            {/* Last Activity */}
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                                                    <Clock size={12} />
                                                    {getRelativeTime(item.updatedAt || item.createdAt)}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => onAppClick(item)}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                                        title="View"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button
                                                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                                                        title="Message"
                                                    >
                                                        <MessageSquare size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(e, item)}
                                                        disabled={deletingId === item.id}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                                        title="Delete"
                                                    >
                                                        {deletingId === item.id
                                                            ? <Loader2 size={16} className="animate-spin" />
                                                            : <Trash2 size={16} />
                                                        }
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Pagination */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center text-sm text-gray-600 shrink-0">
                    <div>
                        Showing <span className="font-semibold">{paginatedData.length}</span> of <span className="font-semibold">{filteredData.length}</span> records
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
                        >
                            Previous
                        </button>
                        <span className="px-3 text-gray-500">
                            Page {currentPage} of {totalPages || 1}
                        </span>
                        <button
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default UnifiedDriverList;