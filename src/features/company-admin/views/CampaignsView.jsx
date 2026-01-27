import React, { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { db, auth } from '@lib/firebase';
import {
    collection, query, where, getDocs,
    orderBy, limit, onSnapshot
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@shared/components/feedback/ToastProvider';

// Hooks
import { useCampaignTargeting } from './campaigns/hooks/useCampaignTargeting';
import { useCampaignExecution } from './campaigns/hooks/useCampaignExecution';

// Components
import { TargetingWizard } from './campaigns/components/TargetingWizard';
import { AudiencePreview } from './campaigns/components/AudiencePreview';
import { MessageComposer } from './campaigns/components/MessageComposer';
import { ExecutionModal } from './campaigns/components/ExecutionModal';
import { CampaignHistory, CampaignReport } from './campaigns/components/ReportingComponents';

export function CampaignsView() {
    const { currentCompanyProfile } = useData();
    const { showError } = useToast();
    const companyId = currentCompanyProfile?.id;
    console.log("[CampaignsView] Initial Data:", { companyId, currentCompanyProfile });

    const [view, setView] = useState('draft'); // 'draft', 'history', 'report'
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [teamMembers, setTeamMembers] = useState([]);

    // Global Session Monitoring
    const [pastSessions, setPastSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [selectedSessionAttempts, setSelectedSessionAttempts] = useState([]);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // Messaging Config
    const [messageConfig, setMessageConfig] = useState({
        method: 'sms',
        subject: '',
        message: "Hi [Driver Name], we haven't heard from you in a while! Are you still looking for a driving job? Reply YES to reactivate your application.",
        interval: 15
    });

    // Track Auth
    useEffect(() => {
        return onAuthStateChanged(auth, (user) => {
            console.log("[CampaignsView] Auth Changed:", !!user);
            setCurrentUser(user);
            setIsAuthLoading(false);
        });
    }, []);

    // Fetch Team for Recruiter Filter
    useEffect(() => {
        if (!companyId) return;
        const fetchTeam = async () => {
            try {
                // Using the membership pattern from LeadAssignmentModal
                const q = query(collection(db, "memberships"), where("companyId", "==", companyId));
                const snap = await getDocs(q);
                const members = [];

                for (const m of snap.docs) {
                    try {
                        const uSnap = await getDoc(doc(db, "users", m.data().userId));
                        if (uSnap.exists()) {
                            members.push({
                                id: uSnap.id,
                                name: uSnap.data().name || uSnap.data().email || "Unknown User"
                            });
                        }
                    } catch (e) {
                        console.error("Error fetching user doc:", e);
                    }
                }

                // Sort by name
                members.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                setTeamMembers(members);
            } catch (err) {
                console.error("Error fetching team memberships:", err);
            }
        };
        fetchTeam();
    }, [companyId]);

    // Custom Hooks
    const {
        filters, setFilters, previewLeads,
        isPreviewLoading, matchCount, previewError
    } = useCampaignTargeting(companyId, currentUser, isAuthLoading);

    const {
        isExecuting, handleLaunch, pauseSession,
        resumeSession, cancelSession
    } = useCampaignExecution(companyId);

    // Global Session Listener
    useEffect(() => {
        if (!companyId || !currentUser) return;
        const q = query(
            collection(db, 'companies', companyId, 'bulk_sessions'),
            orderBy('createdAt', 'desc'),
            limit(15)
        );
        return onSnapshot(q, (snapshot) => {
            setPastSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [companyId, currentUser]);

    // Report Detail Listener
    useEffect(() => {
        if (!selectedSessionId || view !== 'report' || !currentUser) return;
        const q = query(
            collection(db, 'companies', companyId, 'bulk_sessions', selectedSessionId, 'attempts'),
            orderBy('timestamp', 'desc')
        );
        return onSnapshot(q, (snapshot) => {
            setSelectedSessionAttempts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [selectedSessionId, view, companyId, currentUser]);

    // Handlers
    const onLaunchConfirm = async () => {
        const result = await handleLaunch(filters, messageConfig);
        if (result.success) {
            setIsConfirmOpen(false);
            if (!result.scheduled) {
                setSelectedSessionId(result.sessionId);
                setView('report');
            }
        }
    };

    const selectedSession = pastSessions.find(s => s.id === selectedSessionId);

    // --- RENDER VIEWS ---

    if (view === 'history') {
        return (
            <div className="p-8 max-w-[1600px] mx-auto w-full min-h-screen bg-slate-50/30">
                <CampaignHistory
                    sessions={pastSessions}
                    selectedSessionId={selectedSessionId}
                    setSelectedSessionId={setSelectedSessionId}
                    setView={setView}
                    onPause={pauseSession}
                    onResume={resumeSession}
                    onCancel={cancelSession}
                />
            </div>
        );
    }

    if (view === 'report') {
        return (
            <div className="p-8 max-w-[1600px] mx-auto w-full min-h-screen bg-slate-50/30">
                <CampaignReport
                    session={selectedSession}
                    attempts={selectedSessionAttempts}
                    setView={setView}
                />
            </div>
        );
    }

    // Default: Draft/Wizard View
    return (
        <div className="p-8 max-w-[1600px] mx-auto w-full min-h-screen bg-white">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                {/* Lateral: Controls */}
                <div className="space-y-8">
                    <TargetingWizard
                        filters={filters}
                        setFilters={setFilters}
                        teamMembers={teamMembers}
                        matchCount={matchCount}
                    />

                    <AudiencePreview
                        previewLeads={previewLeads}
                        isPreviewLoading={isPreviewLoading}
                        previewError={previewError}
                    />

                    <div className="pt-8 space-y-4">
                        <button
                            disabled={previewLeads.length === 0 || isExecuting}
                            onClick={() => setIsConfirmOpen(true)}
                            className="w-full py-6 bg-blue-600 text-white rounded-[2.5rem] text-sm font-black uppercase tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                        >
                            Establish Sequence Command
                        </button>
                        <button
                            onClick={() => setView('history')}
                            className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-all"
                        >
                            Browse Historical Audit Logs
                        </button>
                    </div>
                </div>

                {/* Central: Message Composer */}
                <MessageComposer
                    companyId={companyId}
                    messageConfig={messageConfig}
                    setMessageConfig={setMessageConfig}
                />

            </div>

            {isConfirmOpen && (
                <ExecutionModal
                    count={Math.min(matchCount, filters.limit)}
                    method={messageConfig.method}
                    scheduledFor={filters.scheduledFor}
                    isExecuting={isExecuting}
                    onConfirm={onLaunchConfirm}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
        </div>
    );
}
export default CampaignsView;
