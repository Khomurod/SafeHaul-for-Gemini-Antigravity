// src/features/companies/hooks/useCompanyDashboard.js

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs,
    where,
    getCountFromServer
} from 'firebase/firestore';
import { db, auth } from '@lib/firebase';
import { normalizePhone } from '@shared/utils/helpers';

/** applications: all | hired | terminated | declined — leads: all | attempting | in_process | interested */
export function useCompanyDashboard(companyId) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [latestBatchTime, setLatestBatchTime] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [stats, setStats] = useState({
        applications: 0,
        platformLeads: 0,
        companyLeads: 0,
        myLeads: 0
    });

    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [listTotalCount, setListTotalCount] = useState(0);

    const lastVisibleDocsRef = useRef({});

    const [activeTab, setActiveTab] = useState('applications');
    const [pipelineSegment, setPipelineSegment] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filters, setFilters] = useState({
        state: '',
        driverType: '',
        dob: '',
        assignee: '',
        dateFilter: '',
        myAssignmentsOnly: false
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 800);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        setPipelineSegment('all');
    }, [activeTab]);

    const fetchStats = useCallback(async () => {
        if (!companyId) return;
        try {
            const appsRef = collection(db, "companies", companyId, "applications");
            const appsSnap = await getCountFromServer(appsRef);

            const leadsRef = collection(db, "companies", companyId, "leads");

            const qPlatform = query(leadsRef, where("isPlatformLead", "==", true));
            const platformSnap = await getCountFromServer(qPlatform);

            const qCompany = query(leadsRef, where("isPlatformLead", "==", false));
            const companySnap = await getCountFromServer(qCompany);

            let myCountVal = 0;
            if (auth.currentUser) {
                const qMy = query(leadsRef, where("assignedTo", "==", auth.currentUser.uid));
                const mySnap = await getCountFromServer(qMy);
                myCountVal = mySnap.data().count;
            }

            setStats({
                applications: appsSnap.data().count,
                platformLeads: platformSnap.data().count,
                companyLeads: companySnap.data().count,
                myLeads: myCountVal
            });
        } catch (e) {
            console.error("Error fetching stats:", e);
        }
    }, [companyId]);

    const pipelineConstraints = useCallback(() => {
        if (activeTab === 'applications') {
            if (pipelineSegment === 'hired') return [where('status', 'in', ['Hired', 'Approved'])];
            if (pipelineSegment === 'terminated') return [where('status', '==', 'Terminated')];
            if (pipelineSegment === 'declined') return [where('status', 'in', ['Declined', 'Rejected'])];
            return [];
        }
        if (activeTab === 'company_leads' || activeTab === 'my_leads') {
            if (pipelineSegment === 'attempting') {
                return [where('status', 'in', ['Contact Attempt 1', 'Contact Attempt 2', 'Contact Attempt 3'])];
            }
            if (pipelineSegment === 'in_process') return [where('status', '==', 'In Process')];
            if (pipelineSegment === 'interested') return [where('status', '==', 'Interested')];
        }
        return [];
    }, [activeTab, pipelineSegment]);

    const usesPipelineOrderBy = useCallback(() => {
        if (activeTab === 'applications' && pipelineSegment !== 'all') return true;
        if ((activeTab === 'company_leads' || activeTab === 'my_leads') && pipelineSegment !== 'all') return true;
        return false;
    }, [activeTab, pipelineSegment]);

    const buildConstraints = useCallback((baseRef, isSearchMode = false) => {
        let constraints = [];

        if (activeTab === 'applications') {
            if (!isSearchMode && !usesPipelineOrderBy()) {
                // legacy browse: no orderBy (document-id ordering)
            }
        } else {
            if (activeTab === 'find_driver') {
                constraints.push(where("isPlatformLead", "==", true));
                if (!isSearchMode) constraints.push(orderBy("distributedAt", "desc"));
            } else if (activeTab === 'company_leads') {
                constraints.push(where("isPlatformLead", "==", false));
                if (!isSearchMode && !usesPipelineOrderBy()) {
                    constraints.push(orderBy("createdAt", "desc"));
                }
            } else if (activeTab === 'my_leads' && auth.currentUser) {
                constraints.push(where("assignedTo", "==", auth.currentUser.uid));
                if (!isSearchMode && !usesPipelineOrderBy()) {
                    constraints.push(orderBy("createdAt", "desc"));
                }
            }
        }

        constraints.push(...pipelineConstraints());

        if (filters.myAssignmentsOnly && auth.currentUser &&
            (activeTab === 'applications' || activeTab === 'company_leads')) {
            constraints.push(where('assignedTo', '==', auth.currentUser.uid));
        }

        if (filters.state) {
            constraints.push(where("state", "==", filters.state.toUpperCase()));
        }
        if (filters.driverType) {
            constraints.push(where("driverType", "array-contains", filters.driverType));
        }
        if (filters.assignee) {
            if (filters.assignee === '__unassigned__') {
                constraints.push(where("assignedTo", "==", ""));
            } else {
                constraints.push(where("assignedTo", "==", filters.assignee));
            }
        }

        if (!isSearchMode && usesPipelineOrderBy()) {
            constraints.push(orderBy('createdAt', 'desc'));
        }

        return constraints;
    }, [activeTab, filters, pipelineConstraints, usesPipelineOrderBy]);

    const fetchListTotalCount = useCallback(async () => {
        if (!companyId || debouncedSearch) return;
        try {
            const collectionName = activeTab === 'applications' ? 'applications' : 'leads';
            const baseRef = collection(db, "companies", companyId, collectionName);
            const constraints = buildConstraints(baseRef, false);
            const snap = await getCountFromServer(query(baseRef, ...constraints));
            setListTotalCount(snap.data().count);
        } catch (e) {
            console.error('fetchListTotalCount', e);
            setListTotalCount(0);
        }
    }, [companyId, activeTab, debouncedSearch, buildConstraints]);

    useEffect(() => {
        fetchListTotalCount();
    }, [fetchListTotalCount]);

    const fetchData = useCallback(async () => {
        if (!companyId) return;

        setLoading(true);
        setError('');

        try {
            const collectionName = activeTab === 'applications' ? 'applications' : 'leads';
            const baseRef = collection(db, "companies", companyId, collectionName);

            let q;
            const isSearch = !!debouncedSearch;

            if (isSearch) {
                const term = debouncedSearch.trim();
                let searchConstraints = buildConstraints(baseRef, true);

                const isPhone = /^[0-9+() -]{7,}$/.test(term);
                const isEmail = term.includes('@');

                if (isEmail) {
                    searchConstraints.push(where("email", "==", term.toLowerCase()));
                } else if (isPhone) {
                    const normalized = normalizePhone(term);
                    if (normalized) {
                        searchConstraints.push(where("phoneNormalized", "==", normalized));
                    } else {
                        searchConstraints.push(where("phone", "==", term));
                    }
                } else {
                    const termFixed = term.charAt(0).toUpperCase() + term.slice(1);
                    searchConstraints.push(where("lastName", ">=", termFixed));
                    searchConstraints.push(where("lastName", "<=", termFixed + '\uf8ff'));
                }

                searchConstraints.push(limit(50));
                q = query(baseRef, ...searchConstraints);

            } else {
                let constraints = buildConstraints(baseRef, false);

                if (currentPage > 1) {
                    const prevPageLastDoc = lastVisibleDocsRef.current[currentPage - 1];
                    if (prevPageLastDoc) {
                        constraints.push(startAfter(prevPageLastDoc));
                    } else {
                        setCurrentPage(1);
                        return;
                    }
                }

                constraints.push(limit(itemsPerPage));
                q = query(baseRef, ...constraints);
            }

            const snapshot = await getDocs(q);
            let newData = snapshot.docs.map(docSnap => {
                const d = docSnap.data();
                return {
                    id: docSnap.id,
                    companyId,
                    ...d,
                    lastCall: d.lastContactedAt || d.lastCall,
                    lastCallOutcome: d.lastCallOutcome
                };
            });

            if (filters.dateFilter) {
                const filterDate = new Date(filters.dateFilter + 'T00:00:00');
                const filterYear = filterDate.getFullYear();
                const filterMonth = filterDate.getMonth();
                const filterDay = filterDate.getDate();

                newData = newData.filter(item => {
                    const ts = item.submittedAt || item.createdAt || item.distributedAt;
                    if (!ts) return false;
                    try {
                        const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
                        return d.getFullYear() === filterYear && d.getMonth() === filterMonth && d.getDate() === filterDay;
                    } catch {
                        return false;
                    }
                });
            }

            setData(newData);

            if (!isSearch && snapshot.docs.length > 0) {
                const lastDoc = snapshot.docs[snapshot.docs.length - 1];
                lastVisibleDocsRef.current[currentPage] = lastDoc;
            }

            if (isSearch) {
                setTotalPages(1);
            }

        } catch (err) {
            console.error("Dashboard fetch error:", err);

            if (err.message && err.message.includes('requires an index')) {
                setError("Missing Index: Please check the browser console for the creation link.");
                console.warn("CLICK THIS LINK TO CREATE INDEX:", err);
            } else {
                setError(err.message || "Failed to load data.");
            }
        } finally {
            setLoading(false);
        }
    }, [companyId, activeTab, currentPage, itemsPerPage, debouncedSearch, filters, buildConstraints]);

    useEffect(() => {
        if (debouncedSearch) {
            setTotalPages(1);
        } else {
            setTotalPages(Math.max(1, Math.ceil((listTotalCount || 0) / itemsPerPage)));
        }
    }, [listTotalCount, itemsPerPage, debouncedSearch]);

    useEffect(() => {
        const fetchBatchTime = async () => {
            if (!companyId || activeTab !== 'find_driver') {
                setLatestBatchTime(null);
                return;
            }
            try {
                const leadsRef = collection(db, "companies", companyId, "leads");
                const q = query(
                    leadsRef,
                    where("isPlatformLead", "==", true),
                    orderBy("distributedAt", "desc"),
                    limit(1)
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const d = snapshot.docs[0].data();
                    setLatestBatchTime(d.distributedAt || d.createdAt);
                } else {
                    setLatestBatchTime(null);
                }
            } catch (e) {
                setLatestBatchTime(null);
            }
        };
        fetchBatchTime();
    }, [companyId, activeTab]);

    useEffect(() => {
        fetchStats();
    }, [companyId, fetchStats]);

    useEffect(() => {
        const fetchTeamMembers = async () => {
            if (!companyId) return;
            try {
                const teamRef = collection(db, "companies", companyId, "team");
                const snapshot = await getDocs(teamRef);
                const members = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setTeamMembers(members);
            } catch (e) {
                console.error("Error fetching team members:", e);
            }
        };
        fetchTeamMembers();
    }, [companyId]);

    useEffect(() => {
        setData([]);
        lastVisibleDocsRef.current = {};
        setCurrentPage(1);
    }, [activeTab, companyId, debouncedSearch, filters, pipelineSegment]);

    useEffect(() => {
        fetchData();
    }, [companyId, activeTab, currentPage, itemsPerPage, debouncedSearch, filters, pipelineSegment, fetchData]);

    const handleSetItemsPerPage = (num) => {
        setItemsPerPage(num);
        setCurrentPage(1);
        lastVisibleDocsRef.current = {};
    };

    const handleSetFilters = (keyOrObjOrFn, value) => {
        if (typeof keyOrObjOrFn === 'function') {
            setFilters(keyOrObjOrFn);
        } else if (typeof keyOrObjOrFn === 'object' && keyOrObjOrFn !== null) {
            setFilters(keyOrObjOrFn);
        } else {
            setFilters(prev => ({ ...prev, [keyOrObjOrFn]: value }));
        }
    };

    const headerTotalCount = debouncedSearch
        ? data.length
        : listTotalCount;

    return {
        paginatedData: data,
        counts: stats,
        latestBatchTime,
        teamMembers,
        loading,
        error,

        refreshData: () => {
            fetchStats();
            fetchListTotalCount();
            fetchData();
        },

        currentPage,
        itemsPerPage,
        totalPages,
        totalCount: headerTotalCount,

        setItemsPerPage: handleSetItemsPerPage,
        nextPage: () => setCurrentPage(p => p + 1),
        prevPage: () => setCurrentPage(p => Math.max(1, p - 1)),

        activeTab,
        setActiveTab,
        pipelineSegment,
        setPipelineSegment,
        searchQuery,
        setSearchQuery,
        filters,
        setFilters: handleSetFilters
    };
}
