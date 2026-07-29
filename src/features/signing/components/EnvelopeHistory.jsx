import React, { useState } from 'react';
import { db } from '@lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FileText, CheckCircle, Clock, Download, Loader2, AlertCircle, Copy, MessageSquare, Mail, Ban, Edit3, Info } from 'lucide-react';
import { useToast } from '@shared/components/feedback';
import { ConfirmDialog } from '@shared/components/modals/ConfirmDialog';
import { Badge, Button, DataTable, defineTableColumns } from '@/design-system/components';
import { useSigningRequests } from '@features/signing/hooks/useSigningRequests';
import { SentDocumentDetailsDialog } from '@features/company-admin/components/documents/SentDocumentDetailsDialog';

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

/**
 * Company-side sent-documents table.
 *
 * The live subscription is unchanged — it now lives in `useSigningRequests`,
 * which this component uses when no `documents` prop is supplied. The Documents
 * workspace passes its already-filtered documents in instead, so the workspace
 * and this table never open two listeners on the same collection.
 */
export default function EnvelopeHistory({
    companyId,
    onCorrect,
    documents,
    isLoading,
    loadError: loadErrorProp,
    onRetry,
    emptyState,
}) {
    const [copyingId, setCopyingId] = useState(null);
    const [voidingId, setVoidingId] = useState(null);
    // Replaces the blocking `window.confirm` on the destructive void.
    const [pendingVoid, setPendingVoid] = useState(null);
    const [detailsDocument, setDetailsDocument] = useState(null);
    const { showSuccess, showError } = useToast();

    // Only subscribes when the parent is not already supplying the data.
    const ownSubscription = useSigningRequests(documents ? null : companyId);

    const docs = documents ?? ownSubscription.documents;
    const loading = documents ? Boolean(isLoading) : ownSubscription.isLoading;
    const loadError = documents ? loadErrorProp : ownSubscription.loadError;
    const retry = documents ? onRetry : ownSubscription.retry;

    // PHASE 4: Void a signing request
    /**
     * The blocking `window.confirm` that guarded this is now the shared accessible
     * `ConfirmDialog`.
     *
     * `pendingVoid` holds the envelope captured when the dialog opened. This list
     * is driven by a live `onSnapshot`, so re-reading the row at confirm time could
     * void a *different* envelope if the ordering shifted underneath an open
     * dialog. The envelope title is interpolated into React text, never markup, so
     * an untrusted document title cannot inject anything.
     */
    const requestVoid = (docItem) => {
        if (!docItem?.id) return;
        setPendingVoid({ id: docItem.id, title: docItem.title || 'this document' });
    };

    const confirmVoid = async () => {
        if (!pendingVoid) return;
        setVoidingId(pendingVoid.id);
        try {
            await updateDoc(doc(db, 'companies', companyId, 'signing_requests', pendingVoid.id), {
                status: 'voided',
                voidedAt: serverTimestamp()
            });
            showSuccess('Document voided successfully.');
            setPendingVoid(null);
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

    const detailsButton = (docItem) => (
        <Button
            variant="secondary"
            size="sm"
            aria-label={`Details for ${docItem.title || 'Untitled'}`}
            title="Open document details"
            onClick={() => setDetailsDocument(docItem)}
        >
            <Info size={12} aria-hidden="true" /> Details
        </Button>
    );

    const renderActions = (docItem) => {
        const title = docItem.title || 'Untitled';

        if (docItem.status === 'signed') {
            return (
                <div className="flex flex-wrap items-center justify-end gap-ds-2">
                    {detailsButton(docItem)}
                    <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Download ${title}`}
                        onClick={() => handleDownload(docItem.signedPdfUrl || docItem.storagePath)}
                    >
                        <Download size={14} aria-hidden="true" /> Download
                    </Button>
                </div>
            );
        }

        if (docItem.status === 'voided') {
            return (
                <div className="flex flex-wrap items-center justify-end gap-ds-2">
                    {detailsButton(docItem)}
                </div>
            );
        }

        return (
            <div className="flex flex-wrap items-center justify-end gap-ds-2">
                {detailsButton(docItem)}
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
                            onClick={() => requestVoid(docItem)}
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
        <>
            <DataTable
                ariaLabel="Document history"
                data={docs}
                columns={columns}
                isLoading={loading}
                loadingLabel="Loading document history"
                error={loadError ? { message: loadError, onRetry: retry } : undefined}
                empty={emptyState || { title: 'No documents sent yet.' }}
                getRowLabel={(docItem) => docItem.title || 'Untitled'}
            />

            {/*
              Row-level details. Read-only summary plus the same actions the row
              offers — the signing token is never rendered, only copied to the
              clipboard through the authenticated callable.
            */}
            <SentDocumentDetailsDialog
                document={detailsDocument}
                copying={Boolean(detailsDocument) && copyingId === detailsDocument.id}
                onClose={() => setDetailsDocument(null)}
                onCopyLink={handleCopyLink}
                onCorrect={onCorrect ? (docItem) => { setDetailsDocument(null); onCorrect(docItem); } : undefined}
                onVoid={(docItem) => { setDetailsDocument(null); requestVoid(docItem); }}
                onDownload={(path) => { setDetailsDocument(null); handleDownload(path); }}
            />

            {/*
              Replaces `window.confirm('Are you sure you want to void "{title}"?
              This cannot be undone.')`. The title is rendered as React text, so an
              untrusted document title cannot inject markup.
            */}
            <ConfirmDialog
                isOpen={!!pendingVoid}
                tone="danger"
                title={`Void "${pendingVoid?.title ?? ''}"?`}
                description="This cannot be undone. The signer will no longer be able to open or complete this document."
                confirmLabel="Void document"
                cancelLabel="Keep document"
                loading={!!pendingVoid && voidingId === pendingVoid.id}
                onConfirm={confirmVoid}
                onCancel={() => setPendingVoid(null)}
            />
        </>
    );
}
