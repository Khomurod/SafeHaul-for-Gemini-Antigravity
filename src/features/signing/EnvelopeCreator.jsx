import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { db, storage, auth } from '@lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, Timestamp, writeBatch, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Loader2, UploadCloud, Save, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@shared/components/feedback';
import {
    buildPrefillContext,
    normalizePrefillPolicy,
    resolveFieldsForSend,
} from '@features/signing/utils/prefillEngine';
import {
    cloneFieldWithoutId,
    computeNextPasteRect,
    isEditableKeyboardTarget,
} from '@features/signing/utils/envelopeFieldClipboard';
import { serializeTemplateFields } from '@features/signing/utils/templateFieldSerializer';
import {
    PDF_VIEWPORT_WIDTH_DEFAULT,
    adjustPdfViewportWidth,
} from '@features/signing/utils/envelopePdfZoom';
import { FIELD_TEMPLATES, getFieldIcon } from './components/envelope-creator/fieldDefinitions';
import { FieldPropertiesPanel } from './components/envelope-creator/FieldPropertiesPanel';
import { EnvelopeSidebar } from './components/envelope-creator/EnvelopeSidebar';
import { PdfFieldWorkbench } from './components/envelope-creator/PdfFieldWorkbench';

/**
 * EnvelopeCreator — one-off signing request + template editor.
 *
 * Split for readability (behavior unchanged):
 *  - ./components/envelope-creator/fieldDefinitions.jsx       — field palette definitions + icons
 *  - ./components/envelope-creator/ResizableDraggableField.jsx — field overlay editor
 *  - ./components/envelope-creator/FieldPropertiesPanel.jsx    — right sidebar
 *  - ./components/envelope-creator/EnvelopeSidebar.jsx         — recipient/delivery + field palette
 *  - ./components/envelope-creator/PdfFieldWorkbench.jsx       — PDF canvas/viewer with overlays
 * State, hydration, and the save/send action stay here.
 */

// Upload ceiling. MUST stay <= the storage-rule limit (isValidFile in
// src/storage.rules), otherwise the client accepts files the server rejects.
const MAX_UPLOAD_MB = 20;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export default function EnvelopeCreator({
    companyId,
    onClose,
    initialMode = 'request',
    editRequestId = null,
    editTemplateId = null,
    companyName = '',
}) {
    const { showSuccess, showError } = useToast();
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hydrating, setHydrating] = useState(Boolean(editRequestId || editTemplateId));
    const [creatorMode, setCreatorMode] = useState(editTemplateId ? 'template' : initialMode); // 'request' or 'template'
    const [existingStoragePath, setExistingStoragePath] = useState('');

    // PHASE 1: Selected field state
    const [selectedFieldId, setSelectedFieldId] = useState(null);

    // FEAT-1: Track the currently visible page for multi-page field placement
    const [activePage, setActivePage] = useState(1);
    const pageRefs = useRef({});

    // Recipient details only needed for 'request' mode
    const [recipientEmail, setRecipientEmail] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    // ADV-2 FIX: Delivery method selector for one-off sends
    const [deliveryMethod, setDeliveryMethod] = useState('email'); // 'email' | 'sms' | 'both' | 'copy'
    const [title, setTitle] = useState('');

    const [fields, setFields] = useState([]);
    const [pageDimensions, setPageDimensions] = useState({});
    const [pdfViewportWidth, setPdfViewportWidth] = useState(PDF_VIEWPORT_WIDTH_DEFAULT);

    const pdfWorkbenchRef = useRef(null);
    const fieldsRef = useRef([]);
    const selectedFieldIdRef = useRef(null);
    const fileRef = useRef(null);
    const envelopeClipboardRef = useRef(null);

    useEffect(() => {
        fieldsRef.current = fields;
    }, [fields]);

    useEffect(() => {
        selectedFieldIdRef.current = selectedFieldId;
    }, [selectedFieldId]);

    useEffect(() => {
        fileRef.current = file;
    }, [file]);

    useEffect(() => {
        if (!file) {
            setPdfViewportWidth(PDF_VIEWPORT_WIDTH_DEFAULT);
        }
    }, [file]);

    useEffect(() => {
        if (hydrating) return undefined;
        const el = pdfWorkbenchRef.current;
        if (!el) return undefined;

        const onWheel = (e) => {
            if (!fileRef.current) return;
            if (!(e.ctrlKey || e.metaKey)) return;
            if (!el.contains(e.target)) return;
            e.preventDefault();
            setPdfViewportWidth((w) => adjustPdfViewportWidth(w, e.deltaY, e.deltaMode));
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [hydrating]);

    useEffect(() => {
        const onKeyDown = (e) => {
            const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
            if (!(e.ctrlKey || e.metaKey) || !key) return;

            if (key === 'c') {
                if (isEditableKeyboardTarget(e.target)) return;
                const fid = selectedFieldIdRef.current;
                if (!fid || !fileRef.current) return;
                const field = fieldsRef.current.find((f) => f.id === fid);
                if (!field) return;
                e.preventDefault();
                const template = cloneFieldWithoutId(field);
                const anchorRect = {
                    x: field.x,
                    y: field.y,
                    width: field.width,
                    height: field.height,
                    page: field.page,
                };
                envelopeClipboardRef.current = {
                    template,
                    anchor: anchorRect,
                    lastPlaced: { ...anchorRect },
                };
                return;
            }

            if (key === 'v') {
                if (isEditableKeyboardTarget(e.target)) return;
                const clip = envelopeClipboardRef.current;
                if (!clip?.template || !fileRef.current) return;
                e.preventDefault();
                const { template, anchor, lastPlaced } = clip;
                const rect = computeNextPasteRect(lastPlaced, anchor, template.width, template.height);
                const newField = {
                    ...template,
                    id: uuidv4(),
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    page: rect.page,
                };
                setFields((prev) => [...prev, newField]);
                setSelectedFieldId(newField.id);
                envelopeClipboardRef.current = {
                    ...clip,
                    lastPlaced: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        page: rect.page,
                    },
                };
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Derive active field from selection
    const activeField = useMemo(() => {
        if (!selectedFieldId) return null;
        return fields.find(f => f.id === selectedFieldId) || null;
    }, [selectedFieldId, fields]);

    const isEditingRequest = Boolean(editRequestId);
    const isEditingTemplate = Boolean(editTemplateId);
    const editingEntityId = editRequestId || editTemplateId;
    const editingCollection = isEditingTemplate ? 'templates' : 'signing_requests';

    // PHASE 4: Hydrate from existing document for "Correct" / "Edit Template" flows
    useEffect(() => {
        if (!editingEntityId || !companyId) return;
        (async () => {
            setHydrating(true);
            try {
                const docRef = doc(db, 'companies', companyId, editingCollection, editingEntityId);
                const snap = await getDoc(docRef);
                if (!snap.exists()) {
                    showError('Document not found.');
                    setHydrating(false);
                    return;
                }
                const data = snap.data();
                setRecipientName(data.recipientName || '');
                setRecipientEmail(data.recipientEmail || '');
                setRecipientPhone(data.recipientPhone || '');
                setTitle(data.title || '');
                setDeliveryMethod(data.deliveryMethod || 'email');
                setCreatorMode(isEditingTemplate ? 'template' : 'request');
                setExistingStoragePath(data.storagePath || '');

                // Hydrate fields (convert stored format back to editor format)
                if (data.fields) {
                    // SAFETY: Filter out null/undefined elements from Firestore before hydrating
                    const hydratedFields = (data.fields || []).filter(f => f != null).map(f => ({
                        id: f.id,
                        type: f.type,
                        label: f.label || f.type,
                        page: f?.pageNumber || f?.page || 1,
                        x: f.xPosition ?? f.x ?? 10,
                        y: f.yPosition ?? f.y ?? 10,
                        width: f.width || 25,
                        height: f.height || 5,
                        required: f.required ?? true,
                        readOnly: f.readOnly ?? false,
                        prefillPolicy: f.prefillPolicy || (f.readOnly ? 'locked' : 'editable'),
                        bindingKey: f.bindingKey || '',
                        prefillGroupKey: f.prefillGroupKey || '',
                        defaultValue: f.defaultValue || '',
                        fontSize: f.fontSize || 'Auto',
                    }));
                    setFields(hydratedFields);
                }

                // Hydrate PDF file from storage
                if (data.storagePath) {
                    setNumPages(null); // RACE FIX: Reset before fetching new blob
                    const fileRef = ref(storage, data.storagePath);
                    const url = await getDownloadURL(fileRef);
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const pdfFile = new File([blob], `${data.title || 'document'}.pdf`, { type: 'application/pdf' });
                    setFile(pdfFile);
                }
            } catch (err) {
                console.error('Hydration error:', err);
                showError('Failed to load document for editing.');
            } finally {
                setHydrating(false);
            }
        })();
    }, [editingEntityId, companyId, editingCollection, isEditingTemplate, showError]);

    // FEAT-1: IntersectionObserver to track which page is visible
    useEffect(() => {
        if (!numPages) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const pageNum = parseInt(entry.target.dataset.pageNum);
                        if (pageNum) setActivePage(pageNum);
                    }
                });
            },
            { threshold: 0.5 }
        );
        Object.values(pageRefs.current).forEach((el) => {
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [numPages, file]);

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected && selected.type === 'application/pdf') {
            // Keep this limit in lock-step with the storage rule (isValidFile in
            // storage.rules, currently < 20MB). If the client accepts a file the
            // rule rejects, the upload fails server-side and surfaces as an opaque
            // error — so the two limits MUST match.
            if (selected.size >= MAX_UPLOAD_BYTES) {
                showError(`File too large. Maximum size is ${MAX_UPLOAD_MB}MB.`);
                return;
            }
            setFile(selected);
            setNumPages(null); // RACE FIX: Wipe stale page count before new document loads
            setTitle(selected.name.replace('.pdf', ''));
        } else {
            showError('Please upload a valid PDF file.');
        }
    };

    // PHASE 2: Updated addField using templates
    const addField = useCallback((templateId) => {
        if (!file) return;
        const template = FIELD_TEMPLATES[templateId];
        if (!template) return;

        let w = 25, h = 5;
        if (template.type === 'checkbox') { w = 4; h = 3; }
        if (template.type === 'text') { w = 30; h = 5; }
        if (template.type === 'date') { w = 20; h = 5; }
        if (template.type === 'initial') { w = 15; h = 4; }

        // FEAT-1: Place field on the currently visible page instead of always page 1
        const newField = {
            id: uuidv4(),
            ...template,
            page: activePage,
            x: 10, y: 10,
            width: w, height: h,
        };
        setFields(prev => [...prev, newField]);
    }, [file, activePage]);

    const removeField = useCallback((id) => {
        setFields(prev => prev.filter(f => f.id !== id));
        if (selectedFieldId === id) setSelectedFieldId(null);
    }, [selectedFieldId]);

    const updateFieldPosition = useCallback((id, pageNum, xPercent, yPercent) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, x: xPercent, y: yPercent, page: pageNum } : f));
    }, []);

    const updateFieldSize = useCallback((id, widthPercent, heightPercent) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, width: widthPercent, height: heightPercent } : f));
    }, []);

    const updateFieldLabel = useCallback((id, newLabel) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, label: newLabel } : f));
    }, []);

    // PHASE 3: Update any property on the active field
    const updateActiveField = useCallback((key, value) => {
        if (!selectedFieldId) return;
        setFields(prev => prev.map(f => f.id === selectedFieldId ? { ...f, [key]: value } : f));
    }, [selectedFieldId]);

    const onPageLoadSuccess = (page) => {
        setPageDimensions(prev => ({ ...prev, [page.pageNumber]: { width: page.width, height: page.height } }));
    };

    const handleSave = async () => {
        if (!file || fields.length === 0) {
            showError('Please upload a file and place at least one field.');
            return;
        }

        if (creatorMode === 'request' && !isEditingTemplate) {
            if (!recipientName) {
                showError('Please provide a recipient name.');
                return;
            }
            if ((deliveryMethod === 'email' || deliveryMethod === 'both') && !recipientEmail) {
                showError('Email is required for email delivery.');
                return;
            }
            if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && !recipientPhone) {
                showError('Phone number is required for SMS delivery.');
                return;
            }
        }

        const shouldResolveForDelivery = creatorMode === 'request' || isEditingRequest;
        const prefillContext = buildPrefillContext({
            recipientName,
            recipientEmail,
            recipientPhone,
            companyName,
        });

        let processedFields = [];
        if (shouldResolveForDelivery) {
            const { fields: resolvedFields, missingLockedRequired } = resolveFieldsForSend(fields, prefillContext);
            processedFields = resolvedFields.map((resolvedField, index) => ({
                ...resolvedField,
                bindingKey: fields[index].bindingKey || '',
            }));

            if (missingLockedRequired.length > 0) {
                showError(
                    `Cannot send yet. These locked required fields are missing prefill data: ${missingLockedRequired.join(', ')}.`
                );
                return;
            }
        } else {
            // Template save/edit keeps raw placeholder tokens instead of pre-resolving values.
            processedFields = fields.map((field) => {
                const policy = normalizePrefillPolicy(field);
                return {
                    ...field,
                    prefillPolicy: policy,
                    readOnly: policy === 'locked',
                    bindingKey: field.bindingKey || '',
                };
            });
        }

        setLoading(true);

        try {
            const commonData = {
                companyId,
                title: title || 'Untitled Document',
                // Funnel every field through the pure serializer so the payload can
                // never contain `undefined` (which Firestore rejects outright).
                fields: serializeTemplateFields(processedFields),
                updatedAt: serverTimestamp()
            };

            if (isEditingRequest) {
                const docRef = doc(db, 'companies', companyId, 'signing_requests', editRequestId);
                await updateDoc(docRef, {
                    ...commonData,
                    recipientEmail: recipientEmail || null,
                    recipientName,
                    recipientPhone: recipientPhone || null,
                });
                showSuccess('Document updated successfully!');
                if (onClose) onClose();
                return;
            }

            if (isEditingTemplate) {
                if (!existingStoragePath) {
                    showError('Template file reference is missing. Please re-upload the PDF as a new template.');
                    return;
                }
                const docRef = doc(db, 'companies', companyId, 'templates', editTemplateId);
                await updateDoc(docRef, {
                    ...commonData,
                    storagePath: existingStoragePath,
                });
                showSuccess('Template updated successfully!');
                if (onClose) onClose();
                return;
            }

            const folder = creatorMode === 'template' ? 'templates' : 'originals';
            const storagePath = `secure_documents/${companyId}/${folder}/${Date.now()}_${file.name}`;
            const fileRef = ref(storage, storagePath);
            await uploadBytes(fileRef, file);

            commonData.storagePath = storagePath;

            if (creatorMode === 'template') {
                await addDoc(collection(db, 'companies', companyId, 'templates'), {
                    ...commonData,
                    createdAt: serverTimestamp(),
                    createdBy: auth.currentUser.uid
                });
                showSuccess('Template saved successfully!');
            } else {
                const accessToken = uuidv4();
                const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
                const senderName = auth.currentUser?.displayName || auth.currentUser?.email || 'Your Employer';

                const sendEmail = deliveryMethod === 'email' || deliveryMethod === 'both';
                const sendSms = deliveryMethod === 'sms' || deliveryMethod === 'both';

                const signingRef = doc(collection(db, 'companies', companyId, 'signing_requests'));
                const batch = writeBatch(db);
                batch.set(signingRef, {
                    ...commonData,
                    recipientEmail: recipientEmail || null,
                    recipientName,
                    recipientPhone: recipientPhone || null,
                    status: 'sent',
                    createdAt: serverTimestamp(),
                    expiresAt,
                    senderId: auth.currentUser.uid,
                    senderName,
                    sendEmail,
                    sendSms,
                    deliveryMethod,
                    appBaseUrl: window.location.origin
                });
                batch.set(doc(signingRef, 'secrets', 'token'), { accessToken });
                await batch.commit();

                if (deliveryMethod === 'copy') {
                    const baseUrl = window.location.origin;
                    const link = `${baseUrl}/sign/${companyId}/${signingRef.id}?token=${accessToken}`;
                    await navigator.clipboard.writeText(link);
                    showSuccess('Signing link copied to clipboard!');
                } else if (sendSms && recipientPhone) {
                    try {
                        const baseUrl = window.location.origin;
                        const signingLink = `${baseUrl}/sign/${companyId}/${signingRef.id}?token=${accessToken}`;
                        const smsMessage = `${senderName} sent you "${title || 'Document'}" to sign: ${signingLink}`;

                        const functions = getFunctions();
                        const sendSMSCallable = httpsCallable(functions, 'sendSMS');
                        await sendSMSCallable({
                            companyId,
                            recipientPhone,
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

            if (onClose) onClose();
        } catch (err) {
            console.error('Error saving:', err);
            // Surface the real reason (e.g. permission-denied, storage/unauthorized,
            // invalid-argument) instead of a generic message. An opaque "Action failed"
            // is undebuggable; a precise code/message means this is never a mystery again.
            const reason = err?.code || err?.message || 'unknown error';
            showError(`Save failed (${reason}). Please try again or contact support.`);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = getFieldIcon;

    // Show loading state while hydrating for Correct flow
    if (hydrating) {
        return (
            <div className="flex flex-col h-screen bg-gray-100 items-center justify-center gap-3">
                <Loader2 className="animate-spin text-blue-600" size={36} />
                <p className="text-gray-500 font-medium text-sm">Loading document for editing...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100 font-sans">
            {/* TOP BAR */}
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        {creatorMode === 'template' ? <FileText className="text-purple-600" /> : <UploadCloud className="text-blue-600" />}
                        {isEditingTemplate ? 'Edit Template' : isEditingRequest ? 'Correct Document' : creatorMode === 'template' ? 'Create Template' : 'New Envelope'}
                    </h2>
                    {!isEditingRequest && !isEditingTemplate && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setCreatorMode('request')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition ${creatorMode === 'request' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                One-off Send
                            </button>
                            <button
                                onClick={() => setCreatorMode('template')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition ${creatorMode === 'template' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Save Template
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className={`px-6 py-2 text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all shadow-md
                    ${creatorMode === 'template' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                        {isEditingTemplate ? 'Save Template Changes' : isEditingRequest ? 'Save Correction' : creatorMode === 'template' ? 'Save Template' : 'Send Document'}
                    </button>
                </div>
            </div>

            {/* 3-COLUMN LAYOUT */}
            <div className="flex flex-1 overflow-hidden">

                {/* LEFT SIDEBAR: Recipient + Semantic Field Palette */}
                <EnvelopeSidebar
                    creatorMode={creatorMode}
                    isEditingTemplate={isEditingTemplate}
                    recipientName={recipientName}
                    setRecipientName={setRecipientName}
                    recipientEmail={recipientEmail}
                    setRecipientEmail={setRecipientEmail}
                    recipientPhone={recipientPhone}
                    setRecipientPhone={setRecipientPhone}
                    deliveryMethod={deliveryMethod}
                    setDeliveryMethod={setDeliveryMethod}
                    file={file}
                    handleFileChange={handleFileChange}
                    addField={addField}
                    fields={fields}
                    selectedFieldId={selectedFieldId}
                    setSelectedFieldId={setSelectedFieldId}
                    removeField={removeField}
                    getIcon={getIcon}
                />

                {/* CENTER: PDF Viewer & Draggable Fields */}
                <PdfFieldWorkbench
                    workbenchRef={pdfWorkbenchRef}
                    file={file}
                    numPages={numPages}
                    setNumPages={setNumPages}
                    activePage={activePage}
                    pageRefs={pageRefs}
                    pageDimensions={pageDimensions}
                    onPageLoadSuccess={onPageLoadSuccess}
                    pdfViewportWidth={pdfViewportWidth}
                    setPdfViewportWidth={setPdfViewportWidth}
                    fields={fields}
                    selectedFieldId={selectedFieldId}
                    setSelectedFieldId={setSelectedFieldId}
                    updateFieldPosition={updateFieldPosition}
                    updateFieldSize={updateFieldSize}
                    removeField={removeField}
                    updateFieldLabel={updateFieldLabel}
                    getIcon={getIcon}
                />

                {/* RIGHT SIDEBAR: Field Properties Editor */}
                <div className={`bg-white border-l shadow-lg shrink-0 overflow-y-auto transition-all duration-200 ${selectedFieldId ? 'w-80' : 'w-0 border-l-0'}`}>
                    {selectedFieldId && (
                        <FieldPropertiesPanel
                            activeField={activeField}
                            updateActiveField={updateActiveField}
                            getIcon={getIcon}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
