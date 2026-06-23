import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { db, storage, auth } from '@lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, Timestamp, writeBatch, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Document, Page, pdfjs } from 'react-pdf';
import Draggable from 'react-draggable';
import {
    Loader2, UploadCloud, Save, X, Plus, Type, CheckSquare, Calendar, PenTool,
    Scaling, FileText, Mail, MessageSquare, Copy, Send, Fingerprint,
    User, Building2, Lock, ToggleLeft, ToggleRight, ZoomIn, ZoomOut
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@shared/components/feedback';
import {
    buildPrefillContext,
    normalizePrefillPolicy,
    resolveFieldForSend,
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
    clampPdfViewportWidth,
    zoomPercentLabel,
} from '@features/signing/utils/envelopePdfZoom';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

// Upload ceiling. MUST stay <= the storage-rule limit (isValidFile in
// src/storage.rules), otherwise the client accepts files the server rejects.
const MAX_UPLOAD_MB = 20;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// --- FIELD TEMPLATES ---
const FIELD_TEMPLATES = {
    // Category 1: Standard Fields
    signature: { type: 'signature', required: true, label: 'Signature', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
    initial: { type: 'initial', required: true, label: 'Initial', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
    date_signed: { type: 'date', required: true, readOnly: true, prefillPolicy: 'locked', bindingKey: 'current_date', defaultValue: '{{current_date}}', label: 'Date Signed', fontSize: 'Auto' },
    // Category 2: Signer Info (Auto-mapped)
    name: { type: 'text', required: true, readOnly: false, prefillPolicy: 'editable', bindingKey: 'full_name', defaultValue: '{{full_name}}', label: 'Name', fontSize: 'Auto' },
    email_field: { type: 'text', required: true, readOnly: false, prefillPolicy: 'editable', bindingKey: 'email', defaultValue: '{{email}}', label: 'Email', fontSize: 'Auto' },
    company: { type: 'text', required: false, readOnly: false, prefillPolicy: 'editable', bindingKey: 'company_name', defaultValue: '{{company_name}}', label: 'Company', fontSize: 'Auto' },
    // Category 3: Data Fields
    text: { type: 'text', required: false, readOnly: false, prefillPolicy: 'editable', label: 'Text', defaultValue: '', fontSize: 'Auto' },
    checkbox: { type: 'checkbox', required: false, label: 'Checkbox', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
};

const FIELD_CATEGORIES = [
    {
        title: 'Standard Fields',
        items: [
            { templateId: 'signature', label: 'Signature', icon: PenTool, color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100' },
            { templateId: 'initial', label: 'Initial', icon: Fingerprint, color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
            { templateId: 'date_signed', label: 'Date Signed', icon: Calendar, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
        ]
    },
    {
        title: 'Signer Info',
        items: [
            { templateId: 'name', label: 'Name', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
            { templateId: 'email_field', label: 'Email', icon: Mail, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
            { templateId: 'company', label: 'Company', icon: Building2, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
        ]
    },
    {
        title: 'Data Fields',
        items: [
            { templateId: 'text', label: 'Text', icon: Type, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
            { templateId: 'checkbox', label: 'Checkbox', icon: CheckSquare, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
        ]
    }
];

// --- SUB-COMPONENT: Resizable & Draggable Field ---
const ResizableDraggableField = React.memo(({ field, pageNum, pageWidth, pageHeight, onStop, onResize, onRemove, getIcon, onLabelChange, isSelected, onSelect }) => {
    const nodeRef = useRef(null);
    const safePageHeight = pageHeight || 800;
    const wPx = (field.width / 100) * pageWidth;
    const hPx = (field.height / 100) * safePageHeight;
    const xPx = (field.x / 100) * pageWidth;
    const yPx = (field.y / 100) * safePageHeight;

    const [size, setSize] = useState({ width: wPx, height: hPx });
    const sizeRef = useRef({ width: wPx, height: hPx });

    useEffect(() => {
        const next = { width: wPx, height: hPx };
        setSize(next);
        sizeRef.current = next;
    }, [wPx, hPx]);

    const handleMouseDown = (e) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = sizeRef.current.width;
        const startHeight = sizeRef.current.height;

        const doDrag = (dragEvent) => {
            const next = {
                // PRECISION FIX: Minimum size reduced to 8px
                width: Math.max(8, startWidth + dragEvent.clientX - startX),
                height: Math.max(8, startHeight + dragEvent.clientY - startY),
            };
            sizeRef.current = next;
            setSize(next);
        };

        const stopDrag = () => {
            window.removeEventListener('mousemove', doDrag);
            window.removeEventListener('mouseup', stopDrag);
            const { width, height } = sizeRef.current;
            onResize(field.id, (width / pageWidth) * 100, (height / safePageHeight) * 100);
        };

        window.addEventListener('mousemove', doDrag);
        window.addEventListener('mouseup', stopDrag);
    };

    const handleDragStop = (e, data) => {
        onStop(field.id, pageNum, (data.x / pageWidth) * 100, (data.y / safePageHeight) * 100);
    };

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            position={{ x: xPx, y: yPx }}
            onStop={handleDragStop}
            cancel=".resize-handle, .label-input"
        >
            <div
                ref={nodeRef}
                onClick={(e) => { e.stopPropagation(); onSelect(field.id); }}
                className={`absolute cursor-move pointer-events-auto border-2 rounded flex flex-col shadow-lg transition z-50 group
                    ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                    ${field.type === 'signature' ? 'bg-yellow-400/80 border-yellow-600' :
                        field.type === 'initial' ? 'bg-orange-300/80 border-orange-600' :
                            field.type === 'text' ? 'bg-blue-100/90 border-blue-500' :
                                field.type === 'date' ? 'bg-green-100/90 border-green-500' :
                                    'bg-purple-100/90 border-purple-500'}`
                }
                style={{ width: size.width, height: size.height }}
            >
                <div className="flex items-center gap-1 p-1 overflow-hidden shrink-0">
                    {getIcon(field.type)}
                    {size.width > 40 && (
                        <input
                            className="label-input bg-transparent border-none text-[9px] font-bold uppercase w-full focus:ring-0 p-0 truncate cursor-text"
                            value={field.label}
                            onChange={(e) => onLabelChange(field.id, e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                <button
                    onMouseDown={(e) => { e.stopPropagation(); onRemove(field.id); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-700 z-50"
                >
                    <X size={10} />
                </button>

                <div
                    className="resize-handle absolute bottom-0 right-0 w-3 h-3 cursor-se-resize flex items-end justify-end p-0.5 opacity-0 group-hover:opacity-100 transition"
                    onMouseDown={handleMouseDown}
                >
                    <Scaling size={10} className="text-gray-600" />
                </div>
            </div>
        </Draggable>
    );
});

// --- SUB-COMPONENT: Field Properties Panel (Right Sidebar) ---
const FieldPropertiesPanel = React.memo(({ activeField, updateActiveField, getIcon }) => {
    if (!activeField) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-white rounded-lg border shadow-sm">
                        {getIcon(activeField.type)}
                    </div>
                    <div className="text-xs font-bold text-gray-500 uppercase">{activeField.type} Field</div>
                </div>
                <input
                    type="text"
                    value={activeField.label || ''}
                    onChange={(e) => updateActiveField('label', e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    placeholder="Field Label"
                />
            </div>

            {/* Toggles */}
            <div className="p-4 border-b space-y-3">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Options</h4>
                <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-gray-700 font-medium">Required Field</span>
                    <button
                        type="button"
                        onClick={() => updateActiveField('required', !activeField.required)}
                        className="transition-colors"
                    >
                        {activeField.required ?
                            <ToggleRight size={28} className="text-blue-600" /> :
                            <ToggleLeft size={28} className="text-gray-300 group-hover:text-gray-400" />
                        }
                    </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                        <Lock size={12} className="text-gray-400" /> Read Only
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            const nextReadOnly = !activeField.readOnly;
                            updateActiveField('readOnly', nextReadOnly);
                            updateActiveField('prefillPolicy', nextReadOnly ? 'locked' : 'editable');
                        }}
                        className="transition-colors"
                    >
                        {activeField.readOnly ?
                            <ToggleRight size={28} className="text-blue-600" /> :
                            <ToggleLeft size={28} className="text-gray-300 group-hover:text-gray-400" />
                        }
                    </button>
                </label>

                {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                    <label className="block pt-1">
                        <span className="text-xs text-gray-600 font-medium">Prefill Behavior</span>
                        <select
                            value={activeField.prefillPolicy || (activeField.readOnly ? 'locked' : 'editable')}
                            onChange={(e) => {
                                const mode = e.target.value;
                                updateActiveField('prefillPolicy', mode);
                                updateActiveField('readOnly', mode === 'locked');
                            }}
                            className="w-full mt-1 px-2.5 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="editable">Editable when prefilled</option>
                            <option value="locked">Locked after prefill</option>
                        </select>
                    </label>
                )}
            </div>

            {/* Default Value */}
            {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                <div className="p-4 border-b space-y-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Default Value</h4>
                    <textarea
                        value={activeField.defaultValue || ''}
                        onChange={(e) => updateActiveField('defaultValue', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                        rows={3}
                        placeholder="Enter default value..."
                    />
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                        Use tokens like <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{full_name}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{email}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{phone}}"}</code>,{' '}
                        <code className="bg-gray-100 px-1 rounded text-gray-600">{"{{current_date}}"}</code>.
                    </p>
                </div>
            )}

            {/* Font Size */}
            {activeField.type !== 'signature' && activeField.type !== 'initial' && activeField.type !== 'checkbox' && (
                <div className="p-4 space-y-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Formatting</h4>
                    <label className="block">
                        <span className="text-xs text-gray-600 font-medium">Font Size</span>
                        <select
                            value={activeField.fontSize || 'Auto'}
                            onChange={(e) => updateActiveField('fontSize', e.target.value)}
                            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="Auto">Auto (fit to box)</option>
                            <option value="10">10pt</option>
                            <option value="12">12pt</option>
                            <option value="14">14pt</option>
                            <option value="18">18pt</option>
                        </select>
                    </label>
                </div>
            )}
        </div>
    );
});

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
            const missingLockedRequired = [];
            processedFields = fields.map((field) => {
                const resolved = resolveFieldForSend(field, prefillContext);
                if (resolved.meta.shouldBlockMissingLockedRequired) {
                    missingLockedRequired.push(field.label || field.id || 'Unnamed field');
                }

                return {
                    ...resolved.field,
                    bindingKey: field.bindingKey || '',
                };
            });

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

    const getIcon = useCallback((type) => {
        switch (type) {
            case 'signature': return <PenTool size={14} />;
            case 'initial': return <Fingerprint size={14} />;
            case 'text': return <Type size={14} />;
            case 'checkbox': return <CheckSquare size={14} />;
            case 'date': return <Calendar size={14} />;
            default: return <Plus size={14} />;
        }
    }, []);

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
                <div className="w-64 bg-white border-r flex flex-col z-10 shadow-lg shrink-0 overflow-y-auto">
                    {/* Recipient Info (only in request mode) */}
                    {creatorMode === 'request' && !isEditingTemplate && (
                        <div className="p-4 border-b">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Recipient</label>
                            <input
                                type="text" placeholder="Name *"
                                className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                value={recipientName} onChange={e => setRecipientName(e.target.value)}
                            />
                            <input
                                type="email" placeholder="Email"
                                className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                            />
                            <input
                                type="tel" placeholder="Phone"
                                className="w-full mb-2 p-2 text-sm border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)}
                            />
                            {/* Delivery Method */}
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Delivery</label>
                            <div className="grid grid-cols-4 gap-1">
                                {[
                                    { key: 'email', icon: <Mail size={11} />, label: 'Email' },
                                    { key: 'sms', icon: <MessageSquare size={11} />, label: 'SMS' },
                                    { key: 'both', icon: <Send size={11} />, label: 'Both' },
                                    { key: 'copy', icon: <Copy size={11} />, label: 'Link' },
                                ].map(opt => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setDeliveryMethod(opt.key)}
                                        className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                                            deliveryMethod === opt.key
                                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                                        }`}
                                    >
                                        {opt.icon}
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Semantic Field Palette */}
                    <div className="p-4 flex-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider">
                            {creatorMode === 'request' ? 'Fields' : 'Setup Fields'}
                        </label>
                        {file && (
                            <p className="text-[10px] text-gray-400 mb-3 leading-snug">
                                Duplicate a placed field: select it on the PDF, then{' '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl+C</kbd>
                                {' / '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘C</kbd>
                                , then{' '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl+V</kbd>
                                {' / '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘V</kbd>
                                . Same size; repeats step to the right (wraps below).
                                {' '}
                                Over the PDF,{' '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">Ctrl</kbd>
                                {' / '}
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono text-[9px]">⌘</kbd>
                                {' + '}scroll zooms the document only (not the whole page).
                            </p>
                        )}

                        {!file ? (
                            <div className="text-center p-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:border-blue-400 transition-colors">
                                <p className="text-xs text-gray-400 mb-2 font-medium">Upload a PDF first</p>
                                <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
                                <label htmlFor="pdf-upload" className="px-3 py-1.5 bg-white border border-gray-300 rounded shadow-sm text-xs font-bold cursor-pointer hover:bg-gray-50 active:scale-95 transition-transform inline-block">Choose File</label>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {FIELD_CATEGORIES.map((category) => (
                                    <div key={category.title}>
                                        <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{category.title}</h4>
                                        <div className="space-y-1">
                                            {category.items.map((item) => {
                                                const IconComp = item.icon;
                                                return (
                                                    <button
                                                        key={item.templateId}
                                                        onClick={() => addField(item.templateId)}
                                                        className={`w-full flex items-center gap-2.5 px-3 py-2 border rounded-lg transition-all text-left active:scale-[0.98] ${item.color}`}
                                                    >
                                                        <IconComp size={15} />
                                                        <span className="text-xs font-semibold">{item.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Placed Fields List */}
                        {fields.length > 0 && (
                            <div className="mt-4">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Placed ({fields.length})</label>
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {fields.map((f) => (
                                        <div
                                            key={f.id}
                                            onClick={() => setSelectedFieldId(f.id)}
                                            className={`flex justify-between items-center p-2 border rounded-lg text-xs cursor-pointer transition-all ${
                                                selectedFieldId === f.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <div className="text-gray-400 shrink-0">{getIcon(f.type)}</div>
                                                <span className="font-bold truncate">{f.label}</span>
                                                <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">P{f.page}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"><X size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* CENTER: PDF Viewer & Draggable Fields */}
                <div
                    ref={pdfWorkbenchRef}
                    className="flex-1 overflow-y-auto bg-gray-200 p-8 flex justify-center relative scroll-smooth"
                    onClick={() => setSelectedFieldId(null)}
                >
                    {file && (
                        <div
                            className="absolute top-3 right-6 z-30 flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-300 bg-white/95 px-2 py-1.5 text-[11px] shadow-md backdrop-blur-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <span className="font-bold text-gray-500 pr-0.5">PDF zoom</span>
                            <button
                                type="button"
                                title="Zoom out"
                                className="p-1 rounded-md hover:bg-gray-100 text-gray-700"
                                onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w - 48))}
                            >
                                <ZoomOut size={14} />
                            </button>
                            <button
                                type="button"
                                title="Reset zoom"
                                className="min-w-[3rem] px-1.5 py-0.5 rounded-md bg-gray-100 font-mono font-bold text-gray-800 hover:bg-gray-200"
                                onClick={() => setPdfViewportWidth(PDF_VIEWPORT_WIDTH_DEFAULT)}
                            >
                                {zoomPercentLabel(pdfViewportWidth)}%
                            </button>
                            <button
                                type="button"
                                title="Zoom in"
                                className="p-1 rounded-md hover:bg-gray-100 text-gray-700"
                                onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w + 48))}
                            >
                                <ZoomIn size={14} />
                            </button>
                            <span className="hidden md:inline text-gray-400 border-l border-gray-200 pl-2 ml-0.5">
                                Ctrl/⌘ + scroll
                            </span>
                        </div>
                    )}
                    {file && (
                        <Document
                            file={file}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            className="flex flex-col gap-8 pb-16"
                        >
                            {numPages > 0 && Array.from(new Array(numPages), (el, index) => {
                                const pageNum = index + 1;
                                const dims = pageDimensions[pageNum];

                                return (
                                    <div key={pageNum} ref={(el) => (pageRefs.current[pageNum] = el)} data-page-num={pageNum} className={`relative shadow-2xl border-2 bg-white inline-block ring-1 ring-black/5 ${activePage === pageNum ? 'border-blue-400' : 'border-gray-400'}`}>
                                        {/* FEAT-1: Page label badge */}
                                        <div className={`absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-[10px] font-bold ${activePage === pageNum ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                            Page {pageNum} / {numPages}
                                        </div>
                                        <Page
                                            pageNumber={pageNum}
                                            width={pdfViewportWidth}
                                            onLoadSuccess={onPageLoadSuccess}
                                            renderAnnotationLayer={false}
                                            renderTextLayer={false}
                                        />
                                        <div className="absolute inset-0 z-10 pointer-events-none">
                                            {fields.filter(f => f.page === pageNum).map((field) => (
                                                <ResizableDraggableField
                                                    key={field.id}
                                                    field={field}
                                                    pageNum={pageNum}
                                                    pageWidth={pdfViewportWidth}
                                                    pageHeight={dims ? dims.height : 900}
                                                    onStop={updateFieldPosition}
                                                    onResize={updateFieldSize}
                                                    onRemove={removeField}
                                                    getIcon={getIcon}
                                                    onLabelChange={updateFieldLabel}
                                                    isSelected={selectedFieldId === field.id}
                                                    onSelect={setSelectedFieldId}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </Document>
                    )}
                </div>

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

