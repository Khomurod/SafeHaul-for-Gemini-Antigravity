import { useState, useEffect } from 'react';
import { db, auth } from '@lib/firebase';
import {
    collection, query, where, getDocs,
    limit, Timestamp, getCountFromServer
} from 'firebase/firestore';
import { useToast } from '@shared/components/feedback/ToastProvider';

export function useCampaignTargeting(companyId, currentUser, isAuthLoading) {
    const { showError } = useToast();
    const [filters, setFilters] = useState({
        recruiterId: 'my_leads',
        status: [],
        leadType: 'applications',
        limit: 50,
        createdAfter: '',
        notContactedSince: '',
        lastCallOutcome: 'all'
    });

    const [previewLeads, setPreviewLeads] = useState([]);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [matchCount, setMatchCount] = useState(0);
    const [previewError, setPreviewError] = useState(null);

    useEffect(() => {
        let isCancelled = false;

        const fetchTargetingData = async () => {
            console.log("[useCampaignTargeting] Attempting fetch with:", { isAuthLoading, companyId, hasUser: !!currentUser });
            if (!currentUser || !companyId || isAuthLoading) return;

            setIsPreviewLoading(true);
            setPreviewError(null);

            try {
                let baseRef;
                if (filters.leadType === 'global') {
                    baseRef = collection(db, 'leads');
                } else if (filters.leadType === 'leads') {
                    baseRef = query(collection(db, 'companies', companyId, 'leads'), where('isPlatformLead', '==', true));
                } else {
                    baseRef = collection(db, 'companies', companyId, 'applications');
                }

                let q = query(baseRef);

                // 1. Status Filter
                if (filters.status && filters.status.length > 0 && filters.status !== 'all') {
                    q = query(q, where('status', 'in', filters.status));
                }

                // 2. Recruiter Filter
                if (filters.recruiterId === 'my_leads') {
                    q = query(q, where('assignedTo', '==', currentUser.uid));
                } else if (filters.recruiterId && filters.recruiterId !== 'all') {
                    q = query(q, where('assignedTo', '==', filters.recruiterId));
                }

                // 3. Created After Filter
                if (filters.createdAfter) {
                    const date = new Date(filters.createdAfter);
                    q = query(q, where('createdAt', '>=', Timestamp.fromDate(date)));
                }

                // 4. Not Contacted Since Filter
                if (filters.notContactedSince) {
                    const days = parseInt(filters.notContactedSince);
                    const date = new Date();
                    date.setDate(date.getDate() - days);
                    q = query(q, where('lastContactedAt', '<=', Timestamp.fromDate(date)));
                }

                // 5. Last Call Outcome Filter
                if (filters.lastCallOutcome && filters.lastCallOutcome !== 'all') {
                    if (filters.leadType === 'global') {
                        const outcomeMap = {
                            "Connected / Interested": "interested",
                            "Connected / Scheduled Callback": "callback",
                            "Connected / Not Qualified": "not_qualified",
                            "Connected / Not Interested": "not_interested",
                            "Connected / Hired Elsewhere": "hired_elsewhere",
                            "Left Voicemail": "voicemail",
                            "No Answer": "no_answer",
                            "Wrong Number": "wrong_number"
                        };
                        const outcomeId = outcomeMap[filters.lastCallOutcome];
                        if (outcomeId) q = query(q, where('lastOutcome', '==', outcomeId));
                    } else {
                        q = query(q, where('lastCallOutcome', '==', filters.lastCallOutcome));
                    }
                }

                // Fetch Count
                const countSnap = await getCountFromServer(q);
                console.log("[useCampaignTargeting] Match Count Result:", countSnap.data().count);
                if (!isCancelled) setMatchCount(countSnap.data().count);

                // Fetch Preview
                const snap = await getDocs(query(q, limit(filters.limit)));
                console.log("[useCampaignTargeting] Preview Snapshot Size:", snap.size);
                if (!isCancelled) {
                    setPreviewLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                }

            } catch (err) {
                console.error("Targeting Error:", err);
                if (!isCancelled) {
                    setPreviewLeads([]);
                    setMatchCount(0);
                    if (err.message?.includes('index') || err.message?.includes('permission-denied')) {
                        setPreviewError(err.message);
                    }
                }
            } finally {
                if (!isCancelled) setIsPreviewLoading(false);
            }
        };

        const timer = setTimeout(fetchTargetingData, 500);
        return () => { isCancelled = true; clearTimeout(timer); };
    }, [filters, companyId, currentUser, isAuthLoading]);

    return {
        filters, setFilters,
        previewLeads, isPreviewLoading,
        matchCount, previewError
    };
}
