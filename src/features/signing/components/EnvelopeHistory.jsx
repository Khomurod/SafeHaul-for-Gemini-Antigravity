import React, { useState, useEffect } from 'react';
import { db } from '@lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FileText, CheckCircle, Clock, Download, Loader2, AlertCircle, Copy, MessageSquare, Mail, Ban, Edit3 } from 'lucide-react';
import { useToast } from '@shared/components/feedback';
import { Badge, Button, DataTable, defineTableColumns } from '@/design-system/components';

/**
 * Feature-owned domain → visual mapping for a signing-request status.
 *
 * The design system only knows generic Badge tones; this feature owns which
 * status maps to which tone, icon and label. Tones preserve the previous
 * appearance: signed=success (green), sent=info (blue), voided/seal-failed=
 * danger (red), sealing/processing=warning (yellow/amber), unknown=neutral.
 * Every badge pairs its tone with an icon and text, so status is never
 * communicated by colour alone.
 */
const STATUS_PRESENTATION = {
    signed: { tone: 'success', label: 'Signed', icon: CheckCircle },
    sent: { tone: 'info', label: 'Sent', icon: Clock },
    voided: { tone: 'danger', label: 'Voided', icon: Ban },
    pending_seal: { tone: 'warning', label: 'Sealing...', icon: Loader2, spin: true },
    error_sealing: { tone: 'danger', label: 'Seal Failed', icon: AlertCircle },
    processing: { tone: 'warning', label: 'Processing', icon: Loader2, spin: true },
};

export default function EnvelopeHistory({ companyId, onCorrect }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [copyingId, setCopyingId] = useState(null);
    const [voidingId, setVoidingId] = useState(null);
    const { showSuccess, showError } = useToast();

    // PHASE 4: Void a signing request
    const handleVoid = async (docItem) => {
        if (!window.confirm(`Are you sure you want to void "${docItem.title || 'this document'}"? This cannot be undone.`)) return;
        setVoidingId(docItem.id);
        try {
            await updateDoc(doc(db, 'companies', companyId, 'signing_requests', docItem.id), {
                status: 'voided',
                voidedAt: serverTimestamp()
            });
            showSuccess('Document voided successfully.');
        } catch (err) {
            console.error('Void error:', err);
            showError('Failed to void document.');
        } finally {
            setVoidingId(null);
        }
    };

    // ADV-1 FIX: Use callable Cloud Function to securely retrieve full signing link
    const handleCopyLink = async (docItem) => {
        setCopyingId(docItem.id);
        try {
            const functions = getFunctions();
            const getSigningLink = httpsCallable(functions, 'getSigningLink');
            const result = await getSigningLink({ companyId, requestId: docItem.id });
            await navigator.clipboard.writeText(result.data.signingLink);
            showSuccess('Full signing link copied to clipboard!');
        } catch (err) {
            console.error('Copy link error:', err);
            showError(err.message || 'Could not retrieve signing link.');
        } finally {
            setCopyingId(null);
        }
    };

    useEffect(() => {
        if (!companyId) return;
        setLoading(true);
        // MED-1 FIX: Use onSnapshot for real-time status updates
        const q = query(
            collection(db, 'companies', companyId, 'signing_requests'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDocs(data);
            setLoadError(null);
            setLoading(false);
        }, (error) => {
            console.error("Error loading history:", error);
            // Surface the failure visibly instead of showing an empty history.
            // The subscription itself is unchanged; only the rendered state is.
            setLoadError('Could not load document history. Please try again.');
            setLoading(false);
        });
        return () => unsub();
    }, [companyId]);

    // Secure download via Cloud Function signed URL (bypasses Storage rules)
    const handleDownload = async (storagePath) => {
        try {
            // Clean gs:// prefix if present
            let path = storagePath;
            if (storagePath.startsWith('gs://')) {
                const bucketEnd = storagePath.indexOf('/', 5);
                if (bucketEnd !== -1) path = storagePath.substring(bucketEnd + 1);
            }

            const functions = getFunctions();
            const getSignedDocumentUrl = httpsCallable(functions, 'getSignedDocumentUrl');
            const result = await getSignedDocumentUrl({ storagePath: path });
            window.open(result.data.url, '_blank');
        } catch (err) {
            console.error("Download Error:", err);
            if (err?.code === 'functions/not-found') {
                showError("File not found. It may have been deleted or moved.");
            } else {
                showError("Could not download file. Please try again.");
            }
        }
    };

    const renderStatus = (docItem) => {
        if (docItem.emailStatus === 'failed') {
            // Truncate error for operator debugging without exposing sensitive internals
            const errorDetail = docItem.emailError
                ? (docItem.emailError.length > 80 ? docItem.emailError.substring(0, 80) + '…' : docItem.emailError)
                : 'Email delivery failed';
            return (
                <div className="flex flex-col items-start gap-ds-1">
                    <span title={docItem.emailError || "Email Delivery Failed"}>
                        <Badge tone="danger" icon={AlertCircle}>Delivery Failed</Badge>
                    </span>
                    <span
                        className="max-w-[220px] text-ds-xs text-ds-status-danger-fg [overflow-wrap:anywhere]"
                        title={docItem.emailError || ''}
                    >
                        {errorDetail}
                    </span>
                </div>
            );
        }

        const s = (docItem.status || '').toLowerCase();
        const preset = STATUS_PRESENTATION[s];
        if (preset) {
            const Icon = preset.icon;
            const badge = (
                <Badge tone={preset.tone}>
                    <Icon size={12} aria-hidden="true" className={preset.spin ? 'animate-spin' : undefined} />
                    {preset.label}
                </Badge>
            );
            // Preserve the sealing-failure tooltip.
            return s === 'error_sealing'
                ? <span title={docItem.errorLog || 'Sealing failed'}>{badge}</span>
                : badge;
        }
        return <Badge tone="neutral">{docItem.status}</Badge>;
    };

    const renderDeliveryMethods = (docItem) => (
        <div className="mt-ds-1 flex flex-wrap gap-ds-1">
            {docItem.sendEmail && <Badge tone="info" icon={Mail}>Email</Badge>}
            {docItem.sendSms && <Badge tone="success" icon={MessageSquare}>SMS</Badge>}
            {docItem.sendEmail === false && docItem.sendSms !== true && (
                <Badge tone="neutral">Manual</Badge>
            )}
        </div>
    );

    const renderActions = (docItem) => {
        const title = docItem.title || 'Untitled';

        if (docItem.status === 'signed') {
            return (
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Download ${title}`}
                    onClick={() => handleDownload(docItem.signedPdfUrl || docItem.storagePath)}
                >
                    <Download size={14} aria-hidden="true" /> Download
                </Button>
            );
        }

        if (docItem.status === 'voided') {
            return <span className="text-ds-xs italic text-ds-content-muted">No actions</span>;
        }

        return (
            <div className="flex flex-wrap items-center justify-end gap-ds-2">
                <Button
                    variant="secondary"
                    size="sm"
                    loading={copyingId === docItem.id}
                    aria-label={`Link for ${title}`}
                    title="Copy full signing link"
                    onClick={() => handleCopyLink(docItem)}
                >
                    {copyingId !== docItem.id && <Copy size={12} aria-hidden="true" />} Link
                </Button>
                {docItem.status === 'sent' && (
                    <>
                        {onCorrect && (
                            <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Correct ${title}`}
                                title="Correct this document"
                                onClick={() => onCorrect(docItem)}
                            >
                                <Edit3 size={12} aria-hidden="true" /> Correct
                            </Button>
                        )}
                        <Button
                            variant="danger"
                            size="sm"
                            loading={voidingId === docItem.id}
                            aria-label={`Void ${title}`}
                            title="Void this document"
                            onClick={() => handleVoid(docItem)}
                        >
                            {voidingId !== docItem.id && <Ban size={12} aria-hidden="true" />} Void
                        </Button>
                    </>
                )}
            </div>
        );
    };

    const columns = defineTableColumns([
        {
            key: 'title',
            header: 'Document Title',
            rowHeader: true,
            width: 'lg',
            render: (docItem) => (
                <span className="flex items-center gap-ds-2 font-medium text-ds-content [overflow-wrap:anywhere]">
                    <FileText size={16} className="shrink-0 text-ds-action-primary" aria-hidden="true" />
                    {docItem.title || 'Untitled'}
                </span>
            ),
        },
        {
            key: 'recipient',
            header: 'Recipient',
            width: 'lg',
            render: (docItem) => (
                <div className="min-w-0">
                    <div className="font-medium text-ds-content [overflow-wrap:anywhere]">{docItem.recipientName}</div>
                    <div className="text-ds-xs text-ds-content-muted [overflow-wrap:anywhere]">
                        {docItem.recipientEmail || docItem.recipientPhone || '—'}
                    </div>
                    {/* FEAT-4: Delivery method badge */}
                    {renderDeliveryMethods(docItem)}
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            width: 'md',
            render: renderStatus,
        },
        {
            key: 'createdAt',
            header: 'Sent Date',
            align: 'end',
            width: 'sm',
            render: (docItem) => (
                <span className="font-mono text-ds-sm text-ds-content-secondary">
                    {docItem.createdAt?.seconds ? new Date(docItem.createdAt.seconds * 1000).toLocaleDateString() : '--'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'end',
            width: 'actions',
            priority: 'actions',
            render: renderActions,
        },
    ]);

    return (
        <DataTable
            ariaLabel="Document history"
            data={docs}
            columns={columns}
            isLoading={loading}
            loadingLabel="Loading document history"
            error={loadError ? { message: loadError } : undefined}
            empty={{ title: 'No documents sent yet.' }}
            getRowLabel={(docItem) => docItem.title || 'Untitled'}
        />
    );
}
