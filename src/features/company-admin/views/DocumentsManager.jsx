import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '@lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, serverTimestamp, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import { useData } from '@/context/DataContext';
import EnvelopeCreator from '@features/signing/EnvelopeCreator';
import EnvelopeHistory from '@features/signing/components/EnvelopeHistory';
import { GlobalLoadingState } from '@shared/components/feedback';
import { FileSignature, History, ArrowLeft, Plus, FileText, Send, Trash2, X, Search, User, Loader2, Mail, Phone, Copy, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@shared/components/feedback';

export default function DocumentsManager() {
    const { currentCompanyProfile, loading } = useData();
    const navigate = useNavigate();
    const { showSuccess, showError } = useToast();

    const [activeTab, setActiveTab] = useState('list');
    const [viewMode, setViewMode] = useState('view');
    const [creatorInitialMode, setCreatorInitialMode] = useState('request');
    const [editRequestId, setEditRequestId] = useState(null);

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
    // Template pre-fill: user can edit field values before sending
    const [prefillValues, setPrefillValues] = useState({});

    // Fetch Templates
    useEffect(() => {
        if (!currentCompanyProfile?.id) return;
        const q = query(collection(db, 'companies', currentCompanyProfile.id, 'templates'), orderBy('updatedAt', 'desc'));
        return onSnapshot(q, (snap) => {
            setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTemplatesLoading(false);
        });
    }, [currentCompanyProfile?.id]);

    // Fetch Drivers for Picker
    useEffect(() => {
        if (showDriverPicker && currentCompanyProfile?.id) {
            const fetchDrivers = async () => {
                const q = query(collection(db, 'companies', currentCompanyProfile.id, 'leads'));
                const snap = await getDocs(q);
                setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            };
            fetchDrivers();
        }
    }, [showDriverPicker, currentCompanyProfile?.id]);

    const handleUseTemplate = (template) => {
        setSelectedTemplate(template);
        setManualName('');
        setManualEmail('');
        setManualPhone('');
        setDeliveryMethod('email');
        // Initialize prefill values from template field defaults
        const initialPrefill = {};
        (template.fields || []).forEach(f => {
            if (f.type === 'text' || f.type === 'date') {
                initialPrefill[f.id] = f.defaultValue || '';
            }
        });
        setPrefillValues(initialPrefill);
        setShowDriverPicker(true);
    };

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
            const accessToken = uuidv4();

            // AUTO-FILL LOGIC: Map profile data to placeholders, then apply user prefill overrides
            const autoFilledFields = selectedTemplate.fields.map(f => {
                // First check if user manually pre-filled this field
                if (prefillValues[f.id] !== undefined && prefillValues[f.id] !== '') {
                    return { ...f, defaultValue: prefillValues[f.id] };
                }

                // Otherwise try auto-fill from recipient data
                let value = null;
                const label = (f.label || '').toLowerCase();

                if (label.includes('{{full_name}}')) value = manualName;
                else if (label.includes('{{first_name}}')) value = manualName.split(' ')[0];
                else if (label.includes('{{last_name}}')) value = manualName.split(' ').slice(1).join(' ');
                else if (label.includes('{{email}}')) value = manualEmail;
                else if (label.includes('{{phone}}')) value = manualPhone;
                else if (label.includes('{{date}}')) value = new Date().toLocaleDateString();

                return { ...f, defaultValue: value };
            });

            const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const senderName = auth.currentUser?.displayName || auth.currentUser?.email || 'Your Employer';

            // FEAT-3/4: Set delivery flags based on method
            const sendEmail = deliveryMethod === 'email' || deliveryMethod === 'both';
            const sendSms = deliveryMethod === 'sms' || deliveryMethod === 'both';

            const docData = {
                companyId: currentCompanyProfile.id,
                recipientEmail: manualEmail.trim() || null,
                recipientName: manualName.trim(),
                recipientPhone: manualPhone.trim() || null,
                title: selectedTemplate.title,
                status: 'sent',
                createdAt: serverTimestamp(),
                expiresAt,
                storagePath: selectedTemplate.storagePath,
                senderId: auth.currentUser.uid,
                senderName,
                sendEmail,
                sendSms: false, // SMS is sent directly by frontend callable — do NOT trigger async function
                deliveryMethod, // Record what user chose for audit trail
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

            // FEAT-4: Copy Link mode — copy URL to clipboard instead of sending
            if (deliveryMethod === 'copy') {
                const baseUrl = window.location.origin;
                const link = `${baseUrl}/sign/${currentCompanyProfile.id}/${signingRef.id}?token=${accessToken}`;
                await navigator.clipboard.writeText(link);
                showSuccess('Signing link copied to clipboard!');
            } else {
                // Send SMS directly via callable (not relying on async trigger)
                if (sendSms && manualPhone.trim()) {
                    try {
                        const baseUrl = window.location.origin;
                        const signingLink = `${baseUrl}/sign/${currentCompanyProfile.id}/${signingRef.id}?token=${accessToken}`;
                        const senderName = auth.currentUser?.displayName || auth.currentUser?.email || 'Your Employer';
                        const smsMessage = `${senderName} sent you "${selectedTemplate.title}" to sign: ${signingLink}`;

                        const functions = getFunctions();
                        const sendSMSCallable = httpsCallable(functions, 'sendSMS');
                        await sendSMSCallable({
                            companyId: currentCompanyProfile.id,
                            recipientPhone: manualPhone.trim(),
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

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm("Delete template?")) return;
        await deleteDoc(doc(db, 'companies', currentCompanyProfile.id, 'templates', id));
    };

    if (loading) return <GlobalLoadingState />;
    if (!currentCompanyProfile) { navigate('/company/dashboard'); return null; }

    // PHASE 4: Handle "Correct" action from EnvelopeHistory
    const handleCorrect = (docItem) => {
        setEditRequestId(docItem.id);
        setCreatorInitialMode('request');
        setViewMode('create');
    };

    if (viewMode === 'create') {
        return <EnvelopeCreator companyId={currentCompanyProfile.id} initialMode={creatorInitialMode} editRequestId={editRequestId} onClose={() => { setViewMode('view'); setEditRequestId(null); }} />;
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
                        <button onClick={() => { setCreatorInitialMode('template'); setViewMode('create'); }} className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-all">
                            <FileText size={18} className="text-purple-600" /> Create Template
                        </button>
                        <button onClick={() => { setCreatorInitialMode('request'); setViewMode('create'); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-blue-200 transition-all transform hover:-translate-y-0.5">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {templatesLoading ? <div className="col-span-full flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div> :
                                templates.length === 0 ? <div className="col-span-full bg-white border-2 border-dashed rounded-2xl p-12 text-center text-gray-400">No templates saved yet.</div> :
                                    templates.map(tmp => (
                                        <div key={tmp.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="bg-purple-50 p-3 rounded-xl"><FileText size={24} className="text-purple-600" /></div>
                                                <button onClick={() => handleDeleteTemplate(tmp.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-opacity"><Trash2 size={16} /></button>
                                            </div>
                                            <h3 className="font-bold text-gray-900 mb-1 truncate">{tmp.title}</h3>
                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-6">{tmp.fields?.length || 0} Fields</p>
                                            <button onClick={() => handleUseTemplate(tmp)} className="w-full py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 flex items-center justify-center gap-2 transition-all shadow-sm">
                                                <Send size={14} /> Use Template
                                            </button>
                                        </div>
                                    ))
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* FEAT-2/3/4: REDESIGNED DRIVER PICKER MODAL */}
            {showDriverPicker && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Send Document</h2>
                                <p className="text-xs text-gray-500">Sending: <b>{selectedTemplate?.title}</b></p>
                            </div>
                            <button onClick={() => setShowDriverPicker(false)} className="p-2 hover:bg-white rounded-full transition-colors"><X size={20} /></button>
                        </div>

                        {/* FEAT-2: Manual Recipient Entry */}
                        <div className="p-5 space-y-3 border-b">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recipient Details</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text" placeholder="Recipient name *"
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                        value={manualName} onChange={e => setManualName(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="email" placeholder="Email address"
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                        value={manualEmail} onChange={e => setManualEmail(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="tel" placeholder="Phone number"
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                        value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* FEAT-4: Delivery Method Selector */}
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider pt-2">Delivery Method</h3>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { key: 'email', icon: <Mail size={14} />, label: 'Email' },
                                    { key: 'sms', icon: <MessageSquare size={14} />, label: 'SMS' },
                                    { key: 'both', icon: <Send size={14} />, label: 'Both' },
                                    { key: 'copy', icon: <Copy size={14} />, label: 'Copy Link' },
                                ].map(opt => (
                                    <button
                                        key={opt.key}
                                        onClick={() => setDeliveryMethod(opt.key)}
                                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                                            deliveryMethod === opt.key
                                                ? 'border-purple-600 bg-purple-50 text-purple-700'
                                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        {opt.icon}
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {/* Template Pre-fill Fields */}
                            {selectedTemplate?.fields?.filter(f => f.type === 'text' || f.type === 'date').length > 0 && (
                                <div className="pt-3">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pre-fill Fields (Optional)</h3>
                                    <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
                                        {selectedTemplate.fields.filter(f => f.type === 'text' || f.type === 'date').map(field => (
                                            <div key={field.id} className="flex items-center gap-2">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase w-24 truncate shrink-0" title={field.label}>
                                                    {field.label}
                                                </label>
                                                <input
                                                    type={field.type === 'date' ? 'date' : 'text'}
                                                    placeholder={`Enter ${field.label}...`}
                                                    className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                                    value={prefillValues[field.id] || ''}
                                                    onChange={e => setPrefillValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Send / Copy Button */}
                            <button
                                onClick={executeTemplateSend}
                                disabled={sending || !manualName.trim()}
                                className="w-full py-3 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md"
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> :
                                    deliveryMethod === 'copy' ? <><Copy size={16} /> Copy Signing Link</> :
                                    <><Send size={16} /> Send Document</>
                                }
                            </button>
                        </div>

                        {/* Quick Select from existing leads */}
                        <div className="p-4 bg-gray-50">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Or Quick-Select a Lead</h3>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text" placeholder="Search leads..."
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 transition-all"
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="max-h-[180px] overflow-y-auto space-y-1">
                                {filteredDrivers.length === 0 ? (
                                    <div className="py-6 text-center text-gray-400 text-xs italic">No leads found.</div>
                                ) : (
                                    filteredDrivers.slice(0, 20).map(d => (
                                        <button
                                            key={d.id}
                                            onClick={() => handleQuickSelect(d)}
                                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-purple-50 group transition-all text-left"
                                        >
                                            <div className="bg-white p-1.5 rounded-lg group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors border">
                                                <User size={14} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-gray-900 truncate">{d.firstName} {d.lastName}</p>
                                                <p className="text-[10px] text-gray-400 truncate">{d.email || 'No email'} · {d.phone || d.phoneNumber || 'No phone'}</p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}