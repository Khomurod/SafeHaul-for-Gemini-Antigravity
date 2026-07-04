/**
 * useVerificationPortal
 * =====================
 * Load / validate / submit state for the public PEV portal.
 * Extracted verbatim from VerificationPortal.jsx — token behavior,
 * validation rules, and submission payload are unchanged.
 */
import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';

export function useVerificationPortal(token) {
    const isE2EVerifyMock = isE2ETestMode && getE2EQueryParam('e2eVerify', '') === 'mock';

    // Page state
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [completed, setCompleted] = useState(false);
    const [alreadyCompleted, setAlreadyCompleted] = useState(false);
    const [expired, setExpired] = useState(false);

    // Verification data from backend
    const [verificationData, setVerificationData] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        // Section 1: Employment
        wasEmployed: null,
        confirmedStartDate: '',
        confirmedEndDate: '',
        positionHeld: '',
        reasonForLeaving: '',
        eligibleForRehire: null,
        // Section 2: Safety
        subjectToFmcsrs: null,
        subjectToDotTesting: null,
        hadDrugAlcoholViolations: null,
        violationDetails: '',
        completedReturnToDuty: '',
        hadAccidents: null,
        accidentDetails: '',
        // Section 3: Additional
        additionalComments: '',
        // Section 4: Respondent
        respondentName: '',
        respondentTitle: '',
        respondentPhone: '',
        respondentEmail: '',
        signatureData: null,
    });

    const [formErrors, setFormErrors] = useState({});

    // Load verification data on mount
    useEffect(() => {
        async function loadVerification() {
            try {
                if (isE2EVerifyMock) {
                    setVerificationData({
                        status: 'pending',
                        applicantName: 'E2E Driver',
                        employerName: 'E2E Previous Employer',
                        companyName: 'SafeHaul E2E Carrier',
                        employmentStartDate: '2021-01-01',
                        employmentEndDate: '2024-01-01',
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    });
                    return;
                }
                const getVerification = httpsCallable(functions, 'getVerificationRequest');
                const result = await getVerification({ token });
                const data = result.data;

                if (data.status === 'completed') {
                    setAlreadyCompleted(true);
                } else {
                    setVerificationData(data);
                }
            } catch (err) {
                console.error('Load verification error:', err);
                if (err.code === 'functions/deadline-exceeded') {
                    setExpired(true);
                } else if (err.code === 'functions/not-found') {
                    setError('This verification link is invalid or has been removed.');
                } else {
                    setError(err.message || 'Failed to load verification request.');
                }
            } finally {
                setLoading(false);
            }
        }
        if (token) loadVerification();
        else { setError('No verification token provided.'); setLoading(false); }
    }, [token, isE2EVerifyMock]);

    // Form field updater
    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
        }
    };

    // Validation
    const validate = () => {
        const errors = {};
        if (formData.wasEmployed === null) errors.wasEmployed = 'Required';
        if (formData.wasEmployed) {
            if (!formData.confirmedStartDate) errors.confirmedStartDate = 'Required';
            if (!formData.confirmedEndDate) errors.confirmedEndDate = 'Required';
            if (!formData.positionHeld) errors.positionHeld = 'Required';
            if (!formData.reasonForLeaving) errors.reasonForLeaving = 'Required';
            if (formData.subjectToFmcsrs === null) errors.subjectToFmcsrs = 'Required';
            if (formData.subjectToDotTesting === null) errors.subjectToDotTesting = 'Required';
            if (formData.subjectToDotTesting && formData.hadDrugAlcoholViolations === null) errors.hadDrugAlcoholViolations = 'Required';
            if (formData.hadAccidents === null) errors.hadAccidents = 'Required';
        }
        if (!formData.respondentName) errors.respondentName = 'Required';
        if (!formData.respondentTitle) errors.respondentTitle = 'Required';
        if (!formData.respondentPhone) errors.respondentPhone = 'Required';
        if (!formData.signatureData) errors.signatureData = 'Please provide your electronic signature';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        setSubmitting(true);
        try {
            if (isE2EVerifyMock) {
                setCompleted(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            const submitFn = httpsCallable(functions, 'submitVerificationResponse');
            await submitFn({ token, response: formData });
            setCompleted(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Submit error:', err);
            setError(err.message || 'Failed to submit response. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return {
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
    };
}
