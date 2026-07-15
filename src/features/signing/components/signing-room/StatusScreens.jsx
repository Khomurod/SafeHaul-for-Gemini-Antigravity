import React from 'react';
import {
    Loader2, CheckCircle, AlertTriangle, ShieldCheck, FileText, Ban,
} from 'lucide-react';

/**
 * Full-page status screens for the public signing room.
 * Extracted verbatim from SigningRoom.jsx.
 */

export function SigningLoadingScreen() {
    return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="animate-spin text-blue-600 mb-2" size={40} />
            <p className="text-gray-500 font-medium ml-3">Loading secure document...</p>
        </div>
    );
}

export function SigningErrorScreen({ error }) {
    return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h3>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );
}

// PHASE 4: Voided document hard-stop
export function SigningVoidedScreen() {
    return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-10 rounded-2xl shadow-xl border border-red-100 text-center max-w-md">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Ban size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Voided</h2>
                <p className="text-gray-600 mb-6">
                    This document has been voided by the sender and is no longer accessible.
                </p>
                <button onClick={() => window.close()} className="text-gray-500 font-semibold hover:underline">
                    Close Window
                </button>
            </div>
        </div>
    );
}

export function SigningSuccessScreen({ recipientName, onReturnToDocuments }) {
    return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-10 rounded-2xl shadow-xl border border-green-100 text-center max-w-md animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Signed!</h2>
                <p className="text-gray-600 mb-6">
                    Thank you, <strong>{recipientName}</strong>. The document has been securely sealed and sent to the sender.
                </p>
                {onReturnToDocuments ? (
                    <div className="space-y-3">
                        <button
                            onClick={onReturnToDocuments}
                            className="w-full px-5 py-3 bg-blue-600 text-white font-bold rounded-xl shadow hover:bg-blue-700 transition"
                        >
                            Return to Required Documents
                        </button>
                        <button onClick={() => window.close()} className="text-gray-500 text-sm font-semibold hover:underline">
                            Close Window
                        </button>
                    </div>
                ) : (
                    <button onClick={() => window.close()} className="text-blue-600 font-semibold hover:underline">
                        Close Window
                    </button>
                )}
            </div>
        </div>
    );
}

// ESIGN-8 FIX: Electronic consent screen required before document access.
// UETA Sec. 5(b) and ESIGN Act Sec. 101(c) mandate that signers affirmatively agree to
// conduct business electronically before they can be bound by electronic signatures.
// The consent must be presented BEFORE the document is displayed (not inline).
export function EsignConsentScreen({ title, onAgree }) {
    return (
        <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 max-w-lg w-full">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ShieldCheck size={28} className="text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Electronic Signature Consent</h2>
                        <p className="text-sm text-gray-500">Required before signing</p>
                    </div>
                </div>

                <div className="space-y-4 text-sm text-gray-700 mb-6">
                    <p>
                        You are about to electronically sign: <strong className="text-gray-900">{title || 'a document'}</strong>.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-blue-900 flex items-center gap-2">
                            <FileText size={16} /> Electronic Records & Signature Disclosure
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-blue-800 text-xs">
                            <li>Your electronic signature is legally binding under the ESIGN Act (15 U.S.C. Sec. 7001) and UETA.</li>
                            <li>You agree to receive and sign this document electronically instead of on paper.</li>
                            <li>You may withdraw consent and request a paper copy by contacting the sender.</li>
                            <li>To sign electronically, you need a compatible web browser with JavaScript enabled.</li>
                            <li>Your IP address and browser information are recorded in the audit trail for this document.</li>
                        </ul>
                    </div>
                    <p className="text-gray-600">
                        By clicking <strong>"I Agree - Proceed to Sign"</strong>, you confirm that you have read and agree to use electronic records and signatures.
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => window.close()}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                    >
                        Decline
                    </button>
                    <button
                        onClick={onAgree}
                        className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                    >
                        <ShieldCheck size={18} />
                        I Agree - Proceed to Sign
                    </button>
                </div>
            </div>
        </div>
    );
}
