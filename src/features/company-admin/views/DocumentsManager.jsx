import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '@lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, updateDoc, getDocs, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useData } from '@/context/DataContext';
import EnvelopeCreator from '@features/signing/EnvelopeCreator';
import EnvelopeHistory from '@features/signing/components/EnvelopeHistory';
import {
    buildPrefillContext,
    buildEditablePrefillGroups,
    buildPrefillOverridesForSend,
    initialGroupedPrefillState,
    initialPlainPrefillState,
    resolveFieldForSend,
} from '@features/signing/utils/prefillEngine';
import { GlobalLoadingState } from '@shared/components/feedback';
import { FileSignature, History, ArrowLeft, Plus, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@shared/components/feedback';
import { SendTemplateModal } from '../components/documents/SendTemplateModal';
import { TemplatesPanel } from '../components/documents/TemplatesPanel';

import { FeatureLockedModal } from '@shared/components/modals/FeatureLockedModal';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';

export default function DocumentsManager() {
    const { currentCompanyProfile, loading } = useData();
    const navigate = useNavigate();
    const { showSuccess, showError } = useToast();

    const [activeTab, setActiveTab] = useState('list');
    const [viewMode, setViewMode] = useState('view');
    const [creatorInitialMode, setCreatorInitialMode] = useState('request');
    const [editRequestId, setEditRequestId] = useState(null);
    const [editTemplateId, setEditTemplateId] = useState(null);

    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);

    // Send Flow State
    const [showDriverPicker, setShowDriverPicker] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [drivers, setDrivers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sending, setSending] = useState(false);

    // FEAT-2/3/4: Manual entry + delivery method state
    const [manualName, setManualName] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('email'); // 'email' | 'sms' | 'both' | 'copy'
    // Template pre-fill: grouped keys share one control; plain text fields stay per-slot
    const [prefillValues, setPrefillValues] = useState({});
    const [prefillValuesByGroupKey, setPrefillValuesByGroupKey] = useState({});
    const [postSubmitTemplateIds, setPostSubmitTemplateIds] = useState([]);
    // templateId -> boolean. Missing key = required (backward-compatible default:
    // post-application forms are required unless explicitly marked optional).
    const [postSubmitRequiredById, setPostSubmitRequiredById] = useState({});
    const [savingPostSubmitTemplates, setSavingPostSubmitTemplates] = useState(false);
    const isE2EEdocMock = isE2ETestMode && getE2EQueryParam('e2eEdoc', '') === 'mock';

    if (currentCompanyProfile?.features?.eDocs === false) {
        return <FeatureLockedModal featureName="E-Docs" onClose={() => navigate('/company/dashboard')} />;
    }

    // Fetch Templates
    useEffect(() => {
        if (!currentCompanyProfile?.id) return;
        if (isE2EEdocMock) {
            setTemplates([
                {
                    id: 'tpl_e2e_mock',
                    title: 'E2E Test Document',
                    storagePath: 'secure_documents/e2e/mock.pdf',
                    fields: [
                        { id: 'full_name', label: 'Full Name', type: 'text', required: true, defaultValue: '' },
                        { id: 'sig1', label: 'Signature', type: 'signature', required: true, defaultValue: '' },
                    ],
                },
            ]);
            setTemplatesLoading(false);
            return () => {};
        }
        const q = query(collection(db, 'companies', currentCompanyProfile.id, 'templates'), orderBy('updatedAt', 'desc'));
        return onSnapshot(q, (snap) => {
            setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTemplatesLoading(false);
        }, (err) => {
            console.error('[DocumentsManager] templates snapshot', err);
            setTemplatesLoading(false);
        });
    }, [currentCompanyProfile?.id, isE2EEdocMock]);

    useEffect(() => {
        const raw = Array.isArray(currentCompanyProfile?.postApplicationTemplates)
            ? currentCompanyProfile.postApplicationTemplates
            : [];
        const ids = [];
        const requiredById = {};
        for (const item of raw) {
            let templateId = '';
            let required = true;
            if (typeof item === 'string') {
                templateId = item.trim();
            } else if (item && typeof item === 'object') {
                templateId = String(item.templateId || item.id || '').trim();
                required = item.required !== false;
            }
            if (!templateId) continue;
            ids.push(templateId);
            requiredById[templateId] = required;
        }
        setPostSubmitTemplateIds(ids);
        setPostSubmitRequiredById(requiredById);
    }, [currentCompanyProfile?.postApplicationTemplates]);

    useEffect(() => {
        if (!templates.length) return;
        setPostSubmitTemplateIds((prev) => prev.filter((id) => templates.some((t) => t.id === id)));
    }, [templates]);

    // Fetch Drivers for Picker
    useEffect(() => {
        if (showDriverPicker && currentCompanyProfile?.id) {
            if (isE2EEdocMock) {
                setDrivers([
                    {
                        id: 'lead_e2e_1',
                        firstName: 'E2E',
                        lastName: 'Driver',
                        email: 'driver@safehaul.local',
                        phone: '5551112222',
                    },
                ]);
                return;
            }
            const fetchDrivers = async () => {
                const q = query(collection(db, 'companies', currentCompanyProfile.id, 'leads'));
                const snap = await getDocs(q);
                setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            };
            fetchDrivers();
        }
    }, [showDriverPicker, currentCompanyProfile?.id, isE2EEdocMock]);

    const handleUseTemplate = (template) => {
        setSelectedTemplate(template);
        setManualName('');
        setManualEmail('');
        setManualPhone('');
        setDeliveryMethod('email');
        const { groups, plainFields } = buildEditablePrefillGroups(template.fields || []);
        setPrefillValuesByGroupKey(initialGroupedPrefillState(groups));
        setPrefillValues(initialPlainPrefillState(plainFields));
        setShowDriverPicker(true);
    };

    const editablePrefillPartition = useMemo(() => {
        if (!selectedTemplate?.fields) return { groups: [], plainFields: [] };
        return buildEditablePrefillGroups(selectedTemplate.fields);
    }, [selectedTemplate]);

    // FEAT-2: Quick-select a driver to auto-fill manual entry fields
    const handleQuickSelect = (driver) => {
        setManualName(`${driver.firstName || ''} ${driver.lastName || ''}`.trim());
        setManualEmail(driver.email || '');
        setManualPhone(driver.phone || driver.phoneNumber || '');
    };

    const executeTemplateSend = async () => {
        // FEAT-2: Validate based on delivery method
        if (!manualName.trim()) {
            showError('Please enter a recipient name.');
            return;
        }
        if ((deliveryMethod === 'email' || deliveryMethod === 'both') && !manualEmail.trim()) {
            showError('Email address is required for email delivery.');
            return;
        }
        if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && !manualPhone.trim()) {
            showError('Phone number is required for SMS delivery.');
            return;
        }

        setSending(true);
        try {
            if (isE2EEdocMock) {
                setShowDriverPicker(false);
                showSuccess('Document created! Email delivery in progress...');
                navigate(`/sign/${currentCompanyProfile.id}/e2e-edoc-send-req?token=e2e-token&e2eSign=mock`);
                return;
            }

            const accessToken = uuidv4();

            const resolvedRecipientName = manualName.trim();
            const resolvedRecipientEmail = manualEmail.trim();
            const resolvedRecipientPhone = manualPhone.trim();

            const prefillContext = buildPrefillContext({
                recipientName: resolvedRecipientName,
                recipientEmail: resolvedRecipientEmail,
                recipientPhone: resolvedRecipientPhone,
                companyName: currentCompanyProfile?.companyName || currentCompanyProfile?.name || '',
            });

            const overridesByFieldId = buildPrefillOverridesForSend(selectedTemplate.fields || [], {
                prefillValues,
                prefillValuesByGroupKey,
            });

            const missingLockedRequired = [];
            const autoFilledFields = (selectedTemplate.fields || []).map((field) => {
                const resolved = resolveFieldForSend(field, prefillContext, { overridesByFieldId });
                if (resolved.meta.shouldBlockMissingLockedRequired) {
                    missingLockedRequired.push(field.label || field.id || 'Unnamed field');
                }
                return resolved.field;
            });

            if (missingLockedRequired.length > 0) {
                showError(`Cannot send this template yet. Missing locked prefill data: ${missingLockedRequired.join(', ')}.`);
                return;
            }

            const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const senderName = auth.currentUser?.displayName || auth.currentUser?.email || 'Your Employer';

            // FEAT-3/4: Set delivery flags based on method
            const sendEmail = deliveryMethod === 'email' || deliveryMethod === 'both';
            const sendSms = deliveryMethod === 'sms' || deliveryMethod === 'both';

            const docData = {
                companyId: currentCompanyProfile.id,
                recipientEmail: resolvedRecipientEmail || null,
                recipientName: resolvedRecipientName,
                recipientPhone: resolvedRecipientPhone || null,
                title: selectedTemplate.title,
                status: 'sent',
                createdAt: serverTimestamp(),
                expiresAt,
                storagePath: selectedTemplate.storagePath,
                senderId: auth.currentUser.uid,
                senderName,
                sendEmail,
                sendSms: false, // SMS is sent directly by frontend callable; do not trigger async function.
                deliveryMethod, // Record what user chose for audit trail
                appBaseUrl: window.location.origin, // DOMAIN FIX: Store sender's domain for backend link generation
                fields: autoFilledFields,
                templateId: selectedTemplate.id,
                fieldValues: autoFilledFields.reduce((acc, f) => {
                    if (f.defaultValue) acc[f.id] = f.defaultValue;
                    return acc;
                }, {})
            };

            // BUG-2 FIX: Use batch write to store accessToken in secrets subcollection
            const signingRef = doc(collection(db, 'companies', currentCompanyProfile.id, 'signing_requests'));
            const batch = writeBatch(db);
            batch.set(signingRef, docData);
            batch.set(doc(signingRef, 'secrets', 'token'), { accessToken });
            await batch.commit();

            // FEAT-4: Copy Link mode - copy URL to clipboard instead of sending
            if (deliveryMethod === 'copy') {
                const baseUrl = window.location.origin;
                const link = `${baseUrl}/sign/${currentCompanyProfile.id}/${signingRef.id}?token=${accessToken}`;
                await navigator.clipboard.writeText(link);
                showSuccess('Signing link copied to clipboard!');
            } else {
                // Send SMS directly via callable (not relying on async trigger)
                if (sendSms && resolvedRecipientPhone) {
                    try {
                        const baseUrl = window.location.origin;
                        const signingLink = `${baseUrl}/sign/${currentCompanyProfile.id}/${signingRef.id}?token=${accessToken}`;
                        const senderName = auth.currentUser?.displayName || auth.currentUser?.email || 'Your Employer';
                        const smsMessage = `${senderName} sent you "${selectedTemplate.title}" to sign: ${signingLink}`;

                        const functions = getFunctions();
                        const sendSMSCallable = httpsCallable(functions, 'sendSMS');
                        await sendSMSCallable({
                            companyId: currentCompanyProfile.id,
                            recipientPhone: resolvedRecipientPhone,
                            messageBody: smsMessage
                        });
                        showSuccess('Document created & SMS sent!');
                    } catch (smsErr) {
                        console.error('SMS send failed:', smsErr);
                        showError(`Document created but SMS failed: ${smsErr.message}`);
                    }
                } else {
                    const methodLabel = deliveryMethod === 'both' ? 'Email + SMS' : 'Email';
                    showSuccess(`Document created! ${methodLabel} delivery in progress...`);
                }
            }

            setShowDriverPicker(false);
            setActiveTab('list');
        } catch (err) {
            console.error(err);
            showError("Failed to send template.");
        } finally {
            setSending(false);
        }
    };

    const buildPostSubmitConfig = (ids, requiredById) => ids
        .map((templateId) => {
            const template = templates.find((item) => item.id === templateId);
            if (!template) return null;
            return {
                templateId,
                title: String(template.title || 'Complete Form').trim(),
                enabled: true,
                required: requiredById[templateId] !== false,
            };
        })
        .filter(Boolean);

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm("Delete template?")) return;
        await deleteDoc(doc(db, 'companies', currentCompanyProfile.id, 'templates', id));
        const nextIds = postSubmitTemplateIds.filter((templateId) => templateId !== id);
        setPostSubmitTemplateIds(nextIds);
        // Persist immediately when a configured post-submit form is deleted —
        // a stale companies/{id}.postApplicationTemplates entry would otherwise
        // keep offering applicants a document whose template no longer exists.
        if (nextIds.length !== postSubmitTemplateIds.length) {
            try {
                await updateDoc(doc(db, 'companies', currentCompanyProfile.id), {
                    postApplicationTemplates: buildPostSubmitConfig(nextIds, postSubmitRequiredById),
                });
            } catch (error) {
                console.error('[DocumentsManager] Failed pruning deleted template from post-submit forms:', error);
                showError('Template deleted, but the post-submission forms list could not be updated. Please press "Save Forms".');
            }
        }
    };

    const handleEditTemplate = (template) => {
        setEditRequestId(null);
        setEditTemplateId(template.id);
        setCreatorInitialMode('template');
        setViewMode('create');
    };

    const isTemplateEnabledPostSubmit = (templateId) => postSubmitTemplateIds.includes(templateId);

    const togglePostSubmitTemplate = (templateId) => {
        setPostSubmitTemplateIds((prev) => {
            if (prev.includes(templateId)) return prev.filter((id) => id !== templateId);
            return [...prev, templateId];
        });
    };

    const movePostSubmitTemplate = (templateId, direction) => {
        setPostSubmitTemplateIds((prev) => {
            const index = prev.indexOf(templateId);
            if (index < 0) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const togglePostSubmitRequired = (templateId) => {
        setPostSubmitRequiredById((prev) => ({
            ...prev,
            [templateId]: prev[templateId] === false,
        }));
    };

    const handleSavePostSubmitTemplates = async () => {
        try {
            setSavingPostSubmitTemplates(true);
            const mapped = buildPostSubmitConfig(postSubmitTemplateIds, postSubmitRequiredById);

            await updateDoc(doc(db, 'companies', currentCompanyProfile.id), {
                postApplicationTemplates: mapped,
            });
            showSuccess('Post-submission forms updated.');
        } catch (error) {
            console.error('[DocumentsManager] Failed saving post-submission forms:', error);
            showError('Could not save post-submission forms. Please try again.');
        } finally {
            setSavingPostSubmitTemplates(false);
        }
    };

    if (loading) return <GlobalLoadingState />;
    if (!currentCompanyProfile) { navigate('/company/dashboard'); return null; }

    // PHASE 4: Handle "Correct" action from EnvelopeHistory
    const handleCorrect = (docItem) => {
        setEditRequestId(docItem.id);
        setEditTemplateId(null);
        setCreatorInitialMode('request');
        setViewMode('create');
    };

    if (viewMode === 'create') {
        return (
            <EnvelopeCreator
                companyId={currentCompanyProfile.id}
                companyName={currentCompanyProfile.companyName || currentCompanyProfile.name || ''}
                initialMode={creatorInitialMode}
                editRequestId={editRequestId}
                editTemplateId={editTemplateId}
                onClose={() => {
                    setViewMode('view');
                    setEditRequestId(null);
                    setEditTemplateId(null);
                }}
            />
        );
    }

    const filteredDrivers = drivers.filter(d =>
        `${d.firstName} ${d.lastName} ${d.email}`.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <button onClick={() => navigate('/company/dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-2 transition-colors">
                            <ArrowLeft size={16} /> Back to Dashboard
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <FileSignature className="text-blue-600" /> Documents Center
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => { setEditRequestId(null); setEditTemplateId(null); setCreatorInitialMode('template'); setViewMode('create'); }} className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all">
                            <FileText size={18} className="text-purple-600" /> Create Template
                        </button>
                        <button onClick={() => { setEditRequestId(null); setEditTemplateId(null); setCreatorInitialMode('request'); setViewMode('create'); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-blue-200 transition-all transform hover:-translate-y-0.5">
                            <Plus size={20} /> Send One-off
                        </button>
                    </div>
                </div>

                <div className="flex border-b border-gray-200 bg-white px-4 rounded-t-xl">
                    <button onClick={() => setActiveTab('list')} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${activeTab === 'list' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        <History size={16} /> History
                    </button>
                    <button onClick={() => setActiveTab('templates')} className={`px-6 py-4 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${activeTab === 'templates' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        <FileText size={16} /> Templates
                    </button>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {activeTab === 'list' ? (
                        <EnvelopeHistory companyId={currentCompanyProfile.id} onCorrect={handleCorrect} />
                    ) : (
                        <TemplatesPanel
                            templates={templates}
                            templatesLoading={templatesLoading}
                            postSubmitTemplateIds={postSubmitTemplateIds}
                            postSubmitRequiredById={postSubmitRequiredById}
                            togglePostSubmitRequired={togglePostSubmitRequired}
                            savingPostSubmitTemplates={savingPostSubmitTemplates}
                            handleSavePostSubmitTemplates={handleSavePostSubmitTemplates}
                            movePostSubmitTemplate={movePostSubmitTemplate}
                            isTemplateEnabledPostSubmit={isTemplateEnabledPostSubmit}
                            togglePostSubmitTemplate={togglePostSubmitTemplate}
                            handleUseTemplate={handleUseTemplate}
                            handleEditTemplate={handleEditTemplate}
                            handleDeleteTemplate={handleDeleteTemplate}
                        />
                    )}
                </div>
            </div>

            {/* FEAT-2/3/4: REDESIGNED DRIVER PICKER MODAL */}
            {showDriverPicker && (
                <SendTemplateModal
                    selectedTemplate={selectedTemplate}
                    onClose={() => setShowDriverPicker(false)}
                    manualName={manualName}
                    setManualName={setManualName}
                    manualEmail={manualEmail}
                    setManualEmail={setManualEmail}
                    manualPhone={manualPhone}
                    setManualPhone={setManualPhone}
                    deliveryMethod={deliveryMethod}
                    setDeliveryMethod={setDeliveryMethod}
                    editablePrefillPartition={editablePrefillPartition}
                    prefillValues={prefillValues}
                    setPrefillValues={setPrefillValues}
                    prefillValuesByGroupKey={prefillValuesByGroupKey}
                    setPrefillValuesByGroupKey={setPrefillValuesByGroupKey}
                    sending={sending}
                    executeTemplateSend={executeTemplateSend}
                    filteredDrivers={filteredDrivers}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    handleQuickSelect={handleQuickSelect}
                />
            )}
        </div>
    );
}


