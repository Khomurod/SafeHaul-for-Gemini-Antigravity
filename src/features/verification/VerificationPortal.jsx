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
import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Send } from 'lucide-react';
import { Button } from '@/design-system/components';
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

    // Move focus to the error summary on a fresh validation failure (the hook
    // also scrolls to top). Only fires on the 0 -> >0 transition so fixing a
    // field does not steal focus.
    const errorSummaryRef = useRef(null);
    const previousErrorCount = useRef(0);
    const errorCount = Object.keys(formErrors).length;
    useEffect(() => {
        if (errorCount > 0 && previousErrorCount.current === 0) {
            errorSummaryRef.current?.focus();
        }
        previousErrorCount.current = errorCount;
    }, [errorCount]);

    if (loading) return <LoadingScreen />;
    if (error) return <ErrorScreen error={error} />;
    if (expired) return <ExpiredScreen />;
    if (alreadyCompleted) return <AlreadyCompletedScreen />;
    if (completed) return <CompletedScreen verificationData={verificationData} token={token} />;

    // ============================================================
    // RENDER: Main Form
    // ============================================================
    return (
        <div className="min-h-screen bg-ds-canvas">
            {/* Header (branded compliance banner) */}
            <header className="bg-slate-900 px-4 py-6 text-center text-white">
                <div className="mb-1 flex items-center justify-center gap-2">
                    <ShieldCheck className="h-6 w-6 text-blue-400" aria-hidden="true" />
                    <h1 className="text-xl font-bold">Previous Employment Verification</h1>
                </div>
                <p className="text-sm text-blue-300">FMCSA 49 CFR Part 391.23 Compliance</p>
            </header>

            {/* Form errors summary */}
            {errorCount > 0 && (
                <div className="mx-auto mt-4 max-w-3xl px-4">
                    <div
                        ref={errorSummaryRef}
                        tabIndex={-1}
                        role="alert"
                        className="flex items-start gap-3 rounded-ds-lg border border-ds-status-danger-border bg-ds-status-danger-bg p-ds-4 focus-visible:outline-none focus-visible:shadow-ds-focus"
                    >
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-ds-status-danger-fg" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="text-ds-sm font-bold text-ds-status-danger-fg">Please fix the following errors:</p>
                            <ul className="mt-1 list-inside list-disc text-ds-xs text-ds-status-danger-fg">
                                {Object.entries(formErrors).map(([key, msg]) => (
                                    <li key={key}>{key.replace(/([A-Z])/g, ' $1').trim()}: {msg}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="mx-auto max-w-3xl px-4 py-6">
                <div className="mb-ds-6">
                    <ApplicantDetailsCard verificationData={verificationData} />
                </div>

                <form onSubmit={handleSubmit} className="space-y-ds-6">
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
                    <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
                        {submitting ? (
                            'Submitting...'
                        ) : (
                            <>
                                <Send className="h-5 w-5" aria-hidden="true" />
                                Submit Verification Response
                            </>
                        )}
                    </Button>
                </form>

                {/* Footer */}
                <div className="py-6 text-center">
                    <p className="text-ds-xs text-ds-content-muted">
                        This request was generated by <strong>SafeHaul Compliance Services</strong>
                    </p>
                    <p className="mt-1 text-ds-xs text-ds-content-muted">
                        Secure verification ID: {token}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default VerificationPortal;
