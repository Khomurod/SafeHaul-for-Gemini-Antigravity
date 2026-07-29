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
import { Button } from '@/design-system/components';
import { FIELD_TEMPLATES, getFieldIcon } from './components/envelope-creator/fieldDefinitions';
import { FieldPropertiesPanel } from './components/envelope-creator/FieldPropertiesPanel';
import { EnvelopeSidebar } from './components/envelope-creator/EnvelopeSidebar';
import { PdfFieldWorkbench } from './components/envelope-creator/PdfFieldWorkbench';
import { AiScanOptionsDialog } from './components/envelope-creator/AiScanOptionsDialog';
import { AiSuggestionReviewPanel } from './components/envelope-creator/AiSuggestionReviewPanel';
import { useAiFieldAssistant } from './hooks/useAiFieldAssistant';
import {
    applySuggestionsToFields,
    selectHighConfidence,
} from '@features/signing/utils/aiFieldSuggestions';

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

    // --- AI Field Assistant -------------------------------------------------
    // Suggestions live entirely inside the assistant until the reviewer applies
    // them; nothing here can save a template or send a document.
    const [aiScanDialogOpen, setAiScanDialogOpen] = useState(false);
    const [aiPanelOpen, setAiPanelOpen] = useState(false);
    const [selectedSuggestionId, setSelectedSuggestionId] = useState(null);
    // One-level undo for the last "apply". Holds the ids of the fields that
    // apply appended — not a whole snapshot — so undoing removes exactly those
    // and leaves any work done since the apply untouched.
    const [aiUndoFieldIds, setAiUndoFieldIds] = useState([]);

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

    const aiAssistant = useAiFieldAssistant({
        companyId,
        file,
        numPages,
        activePage,
        fields,
    });

    const {
        startScan: startAiScan,
        suggestions: aiSuggestions,
        updateSuggestion: updateAiSuggestion,
        setSuggestionStatus: setAiSuggestionStatus,
        removeSuggestions: removeAiSuggestions,
        discardAll: discardAiSuggestions,
    } = aiAssistant;

    const openAiAssistant = useCallback(() => {
        setAiPanelOpen(true);
        setAiScanDialogOpen(true);
    }, []);

    const handleAiScanStart = useCallback(
        ({ scope, selectedPages }) => {
            setAiScanDialogOpen(false);
            setAiPanelOpen(true);
            setSelectedSuggestionId(null);
            startAiScan({ scope, selectedPages });
        },
        [startAiScan],
    );

    const toggleSuggestionAccepted = useCallback(
        (suggestionId) => {
            const current = aiSuggestions.find((item) => item.suggestionId === suggestionId);
            if (!current) return;
            setAiSuggestionStatus(suggestionId, current.status === 'accepted' ? 'pending' : 'accepted');
        },
        [aiSuggestions, setAiSuggestionStatus],
    );

    const rejectSuggestion = useCallback(
        (suggestionId) => {
            removeAiSuggestions([suggestionId]);
            setSelectedSuggestionId((prev) => (prev === suggestionId ? null : prev));
        },
        [removeAiSuggestions],
    );

    /**
     * The ONLY path from suggestion to real field. Appends; never deletes,
     * replaces or reorders an existing field, and never saves or sends.
     */
    const applySuggestions = useCallback(
        (toApply) => {
            if (!toApply.length) return;
            setFields((prev) => {
                const { fields: nextFields, appended } = applySuggestionsToFields({
                    fields: prev,
                    suggestions: toApply,
                    idFactory: () => uuidv4(),
                });
                // Remember WHICH fields this apply added, not a whole snapshot:
                // undoing must not throw away work done after the apply.
                setAiUndoFieldIds(appended.map((field) => field.id));
                return nextFields;
            });
            removeAiSuggestions(toApply.map((item) => item.suggestionId));
            setSelectedSuggestionId(null);
            showSuccess(`${toApply.length} field${toApply.length === 1 ? '' : 's'} placed. Review before saving.`);
        },
        [removeAiSuggestions, showSuccess],
    );

    const handleApplySelected = useCallback(() => {
        applySuggestions(aiSuggestions.filter((item) => item.status === 'accepted'));
    }, [aiSuggestions, applySuggestions]);

    const handleApplyHighConfidence = useCallback(() => {
        applySuggestions(selectHighConfidence(aiSuggestions));
    }, [aiSuggestions, applySuggestions]);

    /**
     * Undo the last apply by removing exactly the fields it added.
     *
     * Restoring a pre-apply snapshot instead would silently discard every field
     * the operator added, moved, renamed or deleted since — an undo that
     * destroys unrelated work is worse than no undo.
     */
    const handleAiUndo = useCallback(() => {
        if (aiUndoFieldIds.length === 0) return;
        const undoIds = new Set(aiUndoFieldIds);
        setFields((prev) => prev.filter((field) => !undoIds.has(field.id)));
        setAiUndoFieldIds([]);
        setSelectedFieldId((prev) => (prev && undoIds.has(prev) ? null : prev));
        showSuccess('Last AI placement undone.');
    }, [aiUndoFieldIds, showSuccess]);

    const handleAiDiscardAll = useCallback(() => {
        discardAiSuggestions();
        setSelectedSuggestionId(null);
    }, [discardAiSuggestions]);

    const closeAiPanel = useCallback(() => {
        setAiPanelOpen(false);
        setSelectedSuggestionId(null);
    }, []);

    const moveSuggestion = useCallback(
        (suggestionId, x, y) => updateAiSuggestion(suggestionId, { x, y }),
        [updateAiSuggestion],
    );

    const resizeSuggestion = useCallback(
        (suggestionId, width, height) => updateAiSuggestion(suggestionId, { width, height }),
        [updateAiSuggestion],
    );

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

    /**
     * The right rail holds one panel at a time. The assistant wins while it is
     * open, because a reviewer working through suggestions should not lose the
     * list by touching a placed field.
     */
    const rightRailContent = aiPanelOpen ? 'ai' : selectedFieldId ? 'field' : null;

    // Show loading state while hydrating for Correct flow
    if (hydrating) {
        return (
            <div role="status" className="flex h-screen flex-col items-center justify-center gap-ds-3 bg-ds-canvas">
                <Loader2 className="animate-spin text-ds-action-primary" size={36} aria-hidden="true" />
                <p className="text-ds-sm font-medium text-ds-content-secondary">Loading document for editing...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-ds-canvas">
            {/* TOP BAR */}
            <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-ds-3 border-b border-ds-border-subtle bg-ds-surface px-ds-6 py-ds-4 shadow-ds-xs">
                <div className="flex flex-wrap items-center gap-ds-4">
                    <h2 className="flex items-center gap-ds-2 text-ds-heading-sm font-bold text-ds-content">
                        {creatorMode === 'template'
                            ? <FileText className="text-ds-status-accent-fg" aria-hidden="true" />
                            : <UploadCloud className="text-ds-action-primary" aria-hidden="true" />}
                        {isEditingTemplate ? 'Edit Template' : isEditingRequest ? 'Correct Document' : creatorMode === 'template' ? 'Create Template' : 'New Envelope'}
                    </h2>
                    {/* The mode is chosen up front in the New Document dialog and is
                        FIXED here: the old One-off Send / Save Template toggle let the
                        outcome change silently after fields were placed, so the same
                        screen could either send a document or save a template depending
                        on a control most people never noticed. The mode is now stated,
                        not switchable. Template editing and request correction are
                        unaffected — both already arrive with their mode pinned. */}
                    {!isEditingRequest && !isEditingTemplate && (
                        <p className="rounded-ds-md bg-ds-surface-subtle px-ds-3 py-ds-1 text-ds-xs font-bold uppercase tracking-wide text-ds-content-secondary">
                            {creatorMode === 'template' ? 'Reusable template' : 'One-off send'}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-ds-3">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={loading}
                        loading={loading}
                    >
                        {!loading && <Save size={18} aria-hidden="true" />}
                        {isEditingTemplate ? 'Save Template Changes' : isEditingRequest ? 'Save Correction' : creatorMode === 'template' ? 'Save Template' : 'Send Document'}
                    </Button>
                </div>
                {/* Announce the in-flight save to assistive technology. */}
                <p role="status" className="ds-visually-hidden">
                    {loading ? 'Saving document, please wait…' : ''}
                </p>
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
                    onOpenAiAssistant={openAiAssistant}
                    aiAssistantBusy={aiAssistant.isScanning}
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
                    aiSuggestions={aiSuggestions}
                    selectedSuggestionId={selectedSuggestionId}
                    onSelectSuggestion={setSelectedSuggestionId}
                    onMoveSuggestion={moveSuggestion}
                    onResizeSuggestion={resizeSuggestion}
                    onAcceptSuggestion={toggleSuggestionAccepted}
                    onRejectSuggestion={rejectSuggestion}
                />

                {/* RIGHT SIDEBAR: Field Properties Editor.

                    Desktop is unchanged: a shrink-0 column that animates between
                    w-80 and w-0. Below `md` the fixed three-column row had no room
                    left for a 320px rail, so it was clipped off-screen and its
                    controls were unreachable. There it now presents as a full-width
                    sheet with its own close control, because the usual way to
                    dismiss it — clicking the canvas — sits underneath the sheet. */}
                <div
                    role={rightRailContent ? 'group' : undefined}
                    aria-label={rightRailContent === 'ai' ? 'AI field suggestions' : rightRailContent ? 'Field properties' : undefined}
                    className={`overflow-y-auto bg-ds-surface shadow-ds-lg transition-all duration-200 motion-reduce:transition-none ${
                        rightRailContent
                            ? 'fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-ds-border-subtle md:static md:z-auto md:w-80 md:max-w-none md:shrink-0'
                            : 'hidden md:block md:w-0 md:shrink-0'
                    }`}
                >
                    {rightRailContent === 'ai' && (
                        <AiSuggestionReviewPanel
                            status={aiAssistant.status}
                            progress={aiAssistant.progress}
                            suggestions={aiSuggestions}
                            manualReview={aiAssistant.manualReview}
                            stats={aiAssistant.stats}
                            error={aiAssistant.error}
                            partial={aiAssistant.partial}
                            truncatedPages={aiAssistant.truncatedPages}
                            selectedSuggestionId={selectedSuggestionId}
                            onSelectSuggestion={setSelectedSuggestionId}
                            onUpdateSuggestion={updateAiSuggestion}
                            onToggleAccepted={toggleSuggestionAccepted}
                            onApplySelected={handleApplySelected}
                            onApplyHighConfidence={handleApplyHighConfidence}
                            onDiscardAll={handleAiDiscardAll}
                            onRescan={() => setAiScanDialogOpen(true)}
                            onUndo={handleAiUndo}
                            canUndo={aiUndoFieldIds.length > 0}
                            onCancel={aiAssistant.cancelScan}
                            onClose={closeAiPanel}
                        />
                    )}
                    {rightRailContent === 'field' && (
                        <>
                            <div className="flex justify-end p-ds-2 md:hidden">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedFieldId(null)}
                                >
                                    Close field properties
                                </Button>
                            </div>
                            <FieldPropertiesPanel
                                activeField={activeField}
                                updateActiveField={updateActiveField}
                                getIcon={getIcon}
                            />
                        </>
                    )}
                </div>
            </div>

            {aiScanDialogOpen && (
                <AiScanOptionsDialog
                    activePage={activePage}
                    numPages={numPages || 1}
                    onClose={() => setAiScanDialogOpen(false)}
                    onStart={handleAiScanStart}
                />
            )}
        </div>
    );
}
