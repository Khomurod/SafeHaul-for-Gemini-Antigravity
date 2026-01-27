import React, { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { db, auth } from '@lib/firebase';
import {
    collection, query, where, getDocs,
    orderBy, limit, onSnapshot, doc, getDoc
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
import { AudienceCommand } from './campaigns/components/AudienceCommand';
import { AutomationsView } from './campaigns/components/AutomationsView';

export function CampaignsView() {
    const { currentCompanyProfile } = useData();
    const { showError } = useToast();
    const companyId = currentCompanyProfile?.id;

    const [activeTab, setActiveTab] = useState('audience'); // 'audience', 'campaigns', 'automations'
    const [view, setView] = useState('history'); // 'history', 'wizard', 'report'
    const [wizardStep, setWizardStep] = useState(1); // 1: Targeting, 2: Message, 3: Review
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
        interval: 45 // Increased default for Carrier Compliance
    });

    // Track Auth
    useEffect(() => {
        return onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setIsAuthLoading(false);
        });
    }, []);

    // Fetch Team for Recruiter Filter
    useEffect(() => {
        if (!companyId) return;
        const fetchTeam = async () => {
            try {
                const q = query(collection(db, "memberships"), where("companyId", "==", companyId));
                const snap = await getDocs(q);
                const members = [];
                for (const m of snap.docs) {
                    try {
                        const uSnap = await getDoc(doc(db, "users", m.data().userId));
                        if (uSnap.exists()) {
                            members.push({ id: uSnap.id, name: uSnap.data().name || uSnap.data().email || "Unknown User" });
                        }
                    } catch (e) { console.error("Error fetching user doc:", e); }
                }
                members.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                setTeamMembers(members);
            } catch (err) { console.error("Error fetching team memberships:", err); }
        };
        fetchTeam();
    }, [companyId]);

    // Custom Hooks
    const { filters, setFilters, previewLeads, isPreviewLoading, matchCount, previewError } = useCampaignTargeting(companyId, currentUser, isAuthLoading);
    const { isExecuting, handleLaunch, pauseSession, resumeSession, cancelSession, retryFailed } = useCampaignExecution(companyId);

    // Global Session Listener
    useEffect(() => {
        if (!companyId || !currentUser) return;
        const q = query(collection(db, 'companies', companyId, 'bulk_sessions'), orderBy('createdAt', 'desc'), limit(15));
        return onSnapshot(q, (snapshot) => {
            setPastSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [companyId, currentUser]);

    // Report Detail Listener
    useEffect(() => {
        if (!selectedSessionId || view !== 'report' || !currentUser) return;
        const q = query(collection(db, 'companies', companyId, 'bulk_sessions', selectedSessionId, 'attempts'), orderBy('timestamp', 'desc'));
        return onSnapshot(q, (snapshot) => {
            setSelectedSessionAttempts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [selectedSessionId, view, companyId, currentUser]);

    // Handlers
    const onLaunchConfirm = async () => {
        const result = await handleLaunch(filters, messageConfig);
        if (result.success) {
            setIsConfirmOpen(false);
            setWizardStep(1); // Reset wizard
            if (!result.scheduled) {
                setSelectedSessionId(result.sessionId);
                setActiveTab('campaigns');
                setView('report');
            } else {
                setView('history');
            }
        }
    };

    const handleRetryFailed = async (sid) => {
        const result = await retryFailed(sid);
        if (result.success) {
            setSelectedSessionId(result.sessionId);
            setView('report');
        }
    };

    const handleSelectSegment = (segment) => {
        // Use the pre-calculated segment directly for "Zero loading time"
        const newFilters = {
            ...filters,
            segmentId: segment.id,
            status: [], // Clear other filters to prioritize segment
            leadType: 'applications'
        };
        setFilters(newFilters);
        setView('wizard');
        setWizardStep(1);
        setActiveTab('campaigns');
    };

    const selectedSession = pastSessions.find(s => s.id === selectedSessionId);

    // --- SUB-VIEWS ---

    // --- RENDER MODES ---

    const renderWizard = () => {
        return (
            <div className="max-w-6xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* Wizard Progress Header */}
                <div className="flex items-center justify-between mb-16 relative">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -z-10"></div>
                    {[
                        { step: 1, label: 'Targeting', icon: '🎯' },
                        { step: 2, label: 'Message', icon: '✍️' },
                        { step: 3, label: 'Review', icon: '👀' }
                    ].map(s => (
                        <div key={s.step} className="flex flex-col items-center bg-transparent group">
                            <div className={`h-16 w-16 rounded-[2.2rem] flex items-center justify-center text-xl shadow-xl transition-all duration-500 ${wizardStep >= s.step ? 'bg-blue-600 text-white scale-110 rotate-[-5deg]' : 'bg-white text-slate-300'}`}>
                                {s.icon}
                            </div>
                            <span className={`mt-4 text-[10px] font-black uppercase tracking-[0.2em] ${wizardStep >= s.step ? 'text-blue-600' : 'text-slate-400'}`}>
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-100/50 overflow-hidden min-h-[600px] flex flex-col">
                    <div className="p-12 flex-grow">
                        {wizardStep === 1 && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 animate-in fade-in zoom-in-95 duration-500">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-8">Define Your Audience</h2>
                                    <TargetingWizard filters={filters} setFilters={setFilters} teamMembers={teamMembers} matchCount={matchCount} />
                                </div>
                                <div className="bg-slate-50/50 rounded-[3rem] p-10 border border-slate-100 border-dashed">
                                    <AudiencePreview
                                        previewLeads={previewLeads}
                                        isPreviewLoading={isPreviewLoading}
                                        previewError={previewError}
                                        matchCount={matchCount}
                                    />
                                </div>
                            </div>
                        )}

                        {wizardStep === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-8 text-center">Compose Your Message</h2>
                                <div className="max-w-4xl mx-auto">
                                    <MessageComposer companyId={companyId} messageConfig={messageConfig} setMessageConfig={setMessageConfig} />
                                </div>
                            </div>
                        )}

                        {wizardStep === 3 && (
                            <div className="text-center py-12 animate-in fade-in zoom-in-95 duration-500">
                                <div className="h-28 w-28 bg-emerald-50 text-emerald-500 rounded-[2.5rem] flex items-center justify-center text-5xl mx-auto mb-10 shadow-inner">🚀</div>
                                <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter mb-6">You're Ready to Launch!</h2>
                                <p className="text-slate-500 font-medium text-lg mb-12 max-w-lg mx-auto leading-relaxed">
                                    You are about to establish a sequence command to <span className="text-blue-600 font-black">{matchCount} drivers</span> via <span className="text-blue-600 font-black uppercase">{messageConfig.method}</span>.
                                </p>

                                <div className="max-w-md mx-auto bg-slate-50 rounded-[3rem] p-10 border border-slate-100 text-left mb-12 shadow-sm">
                                    <div className="flex justify-between mb-6 pb-6 border-b border-slate-200">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Target Audience</span>
                                        <span className="text-lg font-black text-slate-900">{matchCount} Matches</span>
                                    </div>
                                    <div className="flex justify-between mb-6 pb-6 border-b border-slate-200">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deployment Method</span>
                                        <span className="text-lg font-black text-slate-900 capitalize">{messageConfig.method}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sequence Preview</span>
                                        <p className="text-sm text-slate-600 leading-relaxed font-medium bg-white p-6 rounded-2xl border border-slate-100 italic">"{messageConfig.message}"</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Controls */}
                    <div className="p-10 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between backdrop-blur-sm">
                        <button
                            onClick={() => wizardStep === 1 ? setView('history') : setWizardStep(wizardStep - 1)}
                            className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2 group"
                        >
                            <span className="group-hover:-translate-x-1 transition-transform">←</span>
                            {wizardStep === 1 ? 'Cancel Campaign' : 'Prior Step'}
                        </button>

                        <div className="flex items-center gap-6">
                            {wizardStep < 3 ? (
                                <button
                                    onClick={() => setWizardStep(wizardStep + 1)}
                                    disabled={wizardStep === 1 && matchCount === 0}
                                    className="px-14 py-5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-blue-600 hover:scale-105 transition-all disabled:opacity-30 disabled:grayscale"
                                >
                                    Proceed to Step {wizardStep + 1}
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsConfirmOpen(true)}
                                    disabled={isExecuting}
                                    className="px-16 py-6 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-[0.25em] shadow-2xl shadow-blue-200 hover:bg-emerald-500 hover:scale-105 transition-all active:scale-95"
                                >
                                    Launch Engagement Sequence
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderCampaignsWorkpace = () => {
        if (view === 'report') {
            return (
                <CampaignReport
                    session={selectedSession}
                    attempts={selectedSessionAttempts}
                    setView={setView}
                    onRetryFailed={handleRetryFailed}
                />
            );
        }

        if (view === 'wizard') {
            return renderWizard();
        }

        return (
            <div className="animate-in fade-in duration-1000">
                <header className="mb-14 flex items-end justify-between">
                    <div>
                        <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter mb-2">Campaign Dashboard</h2>
                        <p className="text-slate-500 font-medium text-lg">History and active intelligence for all sequences.</p>
                    </div>
                    <div className="flex bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="px-6 py-3 border-r border-slate-100 text-center">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sent</div>
                            <div className="text-2xl font-black text-slate-900">
                                {(() => {
                                    const total = pastSessions.reduce((sum, s) => sum + (s.progress?.successCount || 0), 0);
                                    return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total;
                                })()}
                            </div>
                        </div>
                        <div className="px-6 py-3 text-center">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Now</div>
                            <div className="text-2xl font-black text-emerald-500">
                                {pastSessions.filter(s => s.status === 'active').length}
                            </div>
                        </div>
                    </div>
                </header>
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
    };

    return (
        <div className="p-10 max-w-[1750px] mx-auto w-full min-h-screen bg-transparent relative">
            {/* Background Decorative Element */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50/30 rounded-full blur-3xl -z-10 -mr-64 -mt-64"></div>

            {/* Header / Nav */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-8 bg-white/80 backdrop-blur-xl p-5 rounded-[4rem] shadow-2xl shadow-slate-200/50 border border-white">
                <div className="flex items-center gap-5 px-10">
                    <div className="h-16 w-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.8rem] flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-blue-200 rotate-[-8deg] hover:rotate-0 transition-transform duration-500 cursor-default">EE</div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] leading-none mb-1.5 opacity-60">SafeHaul Core</div>
                        <div className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Engagement Engine</div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100/60 p-2 rounded-full ring-1 ring-slate-200/50">
                    {[
                        { id: 'audience', label: 'Audience Command', icon: '🎯' },
                        { id: 'campaigns', label: 'Campaigns', icon: '🚀' },
                        { id: 'automations', label: 'Automations', icon: '⚡' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); if (tab.id === 'campaigns') setView('history'); }}
                            className={`px-12 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center gap-3 ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-xl ring-1 ring-slate-100' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
                        >
                            <span className="text-base">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="px-10 flex items-center gap-4">
                    {activeTab === 'campaigns' && view !== 'wizard' && (
                        <button
                            onClick={() => { setView('wizard'); setWizardStep(1); }}
                            className="px-12 py-5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-[0.25em] hover:bg-blue-600 shadow-2xl shadow-slate-300 hover:shadow-blue-200 transition-all active:scale-95 group"
                        >
                            <span className="mr-2 group-hover:rotate-90 transition-transform inline-block">+</span> New Campaign
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="active-view-container relative z-10 w-full">
                {activeTab === 'audience' && <AudienceCommand companyId={companyId} onSelectSegment={handleSelectSegment} />}
                {activeTab === 'campaigns' && renderCampaignsWorkpace()}
                {activeTab === 'automations' && <AutomationsView />}
            </div>

            {isConfirmOpen && (
                <ExecutionModal
                    count={matchCount}
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
