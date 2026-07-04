/**
 * VerificationPortal.jsx
 * ======================
 * Public-facing page where previous employers respond to employment verification requests.
 * Accessed via /verify/:token — no login required (token-based access).
 *
 * FMCSA 49 CFR §391.23 compliant — collects all required data points.
 *
 * Split for readability (behavior unchanged):
 *  - hooks/useVerificationPortal.js       — load/validate/submit state
 *  - components/PortalStatusScreens.jsx   — loading/error/expired/completed screens
 *  - components/ApplicantDetailsCard.jsx  — FMCSA banner + applicant details
 *  - components/sections/*.jsx            — the four response form sections
 *  - @shared/components/signature/SignaturePad — shared draw-to-sign canvas
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, ShieldCheck, Send } from 'lucide-react';
import { useVerificationPortal } from './hooks/useVerificationPortal';
import {
    LoadingScreen,
    ErrorScreen,
    ExpiredScreen,
    AlreadyCompletedScreen,
    CompletedScreen,
} from './components/PortalStatusScreens';
import { ApplicantDetailsCard } from './components/ApplicantDetailsCard';
import { EmploymentSection } from './components/sections/EmploymentSection';
import { SafetySection } from './components/sections/SafetySection';
import { AdditionalInfoSection } from './components/sections/AdditionalInfoSection';
import { RespondentSection } from './components/sections/RespondentSection';

// ============================================================
// MAIN VERIFICATION PORTAL COMPONENT
// ============================================================
export function VerificationPortal() {
    const { token } = useParams();
    const {
        isE2EVerifyMock,
        loading,
        submitting,
        error,
        completed,
        alreadyCompleted,
        expired,
        verificationData,
        formData,
        formErrors,
        updateField,
        handleSubmit,
    } = useVerificationPortal(token);

    if (loading) return <LoadingScreen />;
    if (error) return <ErrorScreen error={error} />;
    if (expired) return <ExpiredScreen />;
    if (alreadyCompleted) return <AlreadyCompletedScreen />;
    if (completed) return <CompletedScreen verificationData={verificationData} token={token} />;

    // ============================================================
    // RENDER: Main Form
    // ============================================================
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-slate-900 text-white py-6 px-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                    <h1 className="text-xl font-bold">Previous Employment Verification</h1>
                </div>
                <p className="text-blue-300 text-sm">FMCSA 49 CFR Part 391.23 Compliance</p>
            </div>

            {/* Form errors banner */}
            {Object.keys(formErrors).length > 0 && (
                <div className="max-w-3xl mx-auto mt-4 px-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-red-800 font-bold text-sm">Please fix the following errors:</p>
                            <ul className="text-red-700 text-xs mt-1 list-disc list-inside">
                                {Object.entries(formErrors).map(([key, msg]) => (
                                    <li key={key}>{key.replace(/([A-Z])/g, ' $1').trim()}: {msg}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-3xl mx-auto py-6 px-4">
                {/* Info Banner */}
                <ApplicantDetailsCard verificationData={verificationData} />

                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Section 1: Employment Confirmation */}
                    <EmploymentSection formData={formData} formErrors={formErrors} updateField={updateField} />

                    {/* Section 2: Safety & Compliance (only shown if employed) */}
                    {formData.wasEmployed && (
                        <SafetySection formData={formData} formErrors={formErrors} updateField={updateField} />
                    )}

                    {/* Section 3: Additional Comments */}
                    <AdditionalInfoSection formData={formData} updateField={updateField} />

                    {/* Section 4: Respondent Verification & Signature */}
                    <RespondentSection
                        formData={formData}
                        formErrors={formErrors}
                        updateField={updateField}
                        isE2EVerifyMock={isE2EVerifyMock}
                    />

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-4 bg-slate-900 text-white font-bold text-lg rounded-xl hover:bg-slate-800 transition-all shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                Submit Verification Response
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="text-center py-6">
                    <p className="text-xs text-gray-400">
                        This request was generated by <strong>SafeHaul Compliance Services</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Secure verification ID: {token}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default VerificationPortal;
