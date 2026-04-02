import React, { useState, useEffect } from 'react';
import { db, storage } from '@lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FileText, CheckCircle, Clock, Download, ExternalLink, Loader2, AlertCircle, Copy, MessageSquare, Mail, Ban, Edit3 } from 'lucide-react';
import { useToast } from '@shared/components/feedback';

export default function EnvelopeHistory({ companyId, onCorrect }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
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
            setLoading(false);
        }, (error) => {
            console.error("Error loading history:", error);
            setLoading(false);
        });
        return () => unsub();
    }, [companyId]);

    // NEW: Function to handle secure downloads
    const handleDownload = async (storagePath) => {
        try {
            // If path is gs://, clean it; otherwise use as is
            // Ideally, save the clean 'storagePath' in your doc, but we can handle gs:// too
            let path = storagePath;
            if (storagePath.startsWith('gs://')) {
                // Extract relative path from gs://bucket/path
                const parts = storagePath.split(storage.app.options.storageBucket);
                if (parts[1]) path = parts[1].substring(1); // Remove leading slash
            }

            const fileRef = ref(storage, path);
            const url = await getDownloadURL(fileRef);
            window.open(url, '_blank');
        } catch (err) {
            console.error("Download Error:", err);
            showError("Could not download file. It may have been deleted or moved.");
        }
    };

    const getStatusBadge = (doc) => {
        if (doc.emailStatus === 'failed') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center w-fit gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200" title={doc.emailError || "Email Delivery Failed"}>
                        <AlertCircle size={12} /> Delivery Failed
                    </span>
                    <span className="text-[10px] text-red-500">Check Email Settings</span>
                </div>
            );
        }

        const s = (doc.status || '').toLowerCase();
        if (s === 'signed') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={12} /> Signed</span>;
        if (s === 'sent') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200"><Clock size={12} /> Sent</span>;
        if (s === 'voided') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><Ban size={12} /> Voided</span>;
        if (s === 'pending_seal') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200"><Loader2 size={12} className="animate-spin" /> Sealing...</span>;
        // MED-2 FIX: Handle error_sealing and processing statuses
        if (s === 'error_sealing') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200" title={doc.errorLog || 'Sealing failed'}><AlertCircle size={12} /> Seal Failed</span>;
        if (s === 'processing') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><Loader2 size={12} className="animate-spin" /> Processing</span>;
        return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{doc.status}</span>;
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3">Document Title</th>
                            <th className="px-6 py-3">Recipient</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Sent Date</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {docs.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-400">No documents sent yet.</td>
                            </tr>
                        ) : (
                            docs.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                                        <FileText size={16} className="text-blue-500" /> {doc.title || 'Untitled'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="font-medium text-gray-900">{doc.recipientName}</div>
                                        <div className="text-xs text-gray-400">{doc.recipientEmail || doc.recipientPhone || '—'}</div>
                                        {/* FEAT-4: Delivery method badge */}
                                        <div className="flex gap-1 mt-1">
                                            {doc.sendEmail && <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full"><Mail size={8} /> Email</span>}
                                            {doc.sendSms && <span className="inline-flex items-center gap-0.5 text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full"><MessageSquare size={8} /> SMS</span>}
                                            {doc.sendEmail === false && doc.sendSms !== true && <span className="text-[9px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">Manual</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {getStatusBadge(doc)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-gray-500 font-mono">
                                        {doc.createdAt?.seconds ? new Date(doc.createdAt.seconds * 1000).toLocaleDateString() : '--'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {doc.status === 'signed' ? (
                                                <button
                                                    onClick={() => handleDownload(doc.signedPdfUrl || doc.storagePath)}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    <Download size={14} /> Download
                                                </button>
                                            ) : doc.status === 'voided' ? (
                                                <span className="text-xs text-gray-400 italic">No actions</span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleCopyLink(doc)}
                                                        disabled={copyingId === doc.id}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors"
                                                        title="Copy full signing link"
                                                    >
                                                        {copyingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Link
                                                    </button>
                                                    {doc.status === 'sent' && (
                                                        <>
                                                            {onCorrect && (
                                                                <button
                                                                    onClick={() => onCorrect(doc)}
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors"
                                                                    title="Correct this document"
                                                                >
                                                                    <Edit3 size={12} /> Correct
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleVoid(doc)}
                                                                disabled={voidingId === doc.id}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors"
                                                                title="Void this document"
                                                            >
                                                                {voidingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} Void
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}