import React from 'react';
import { Loader2, CheckCircle, AlertTriangle, Clock, ShieldCheck } from 'lucide-react';

/**
 * Full-page status screens for the public PEV portal.
 * Extracted verbatim from VerificationPortal.jsx.
 */

export function LoadingScreen() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Loading verification request...</p>
            </div>
        </div>
    );
}

export function ErrorScreen({ error }) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Error</h1>
                <p className="text-gray-600">{error}</p>
            </div>
        </div>
    );
}

export function ExpiredScreen() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
                <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                <h1 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h1>
                <p className="text-gray-600">This verification request has expired. Please contact the requesting company for a new link.</p>
            </div>
        </div>
    );
}

export function AlreadyCompletedScreen() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                <h1 className="text-xl font-bold text-gray-900 mb-2">Already Completed</h1>
                <p className="text-gray-600">This verification has already been submitted. Thank you for your cooperation.</p>
            </div>
        </div>
    );
}

export function CompletedScreen({ verificationData, token }) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8 text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-12 h-12 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Submitted Successfully</h1>
                <p className="text-gray-600 mb-6">
                    Thank you for completing the employment verification for <strong>{verificationData?.applicantName}</strong>.
                    Your response has been securely recorded and the requesting company has been notified.
                </p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-left">
                    <p className="text-sm text-emerald-800 font-medium">
                        <ShieldCheck className="inline w-4 h-4 mr-1" />
                        A PDF record has been generated and added to the applicant's Qualification file.
                    </p>
                </div>
                <p className="text-xs text-gray-400 mt-6">Verification ID: {token}</p>
            </div>
        </div>
    );
}
