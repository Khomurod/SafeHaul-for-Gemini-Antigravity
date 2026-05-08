import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { db, storage, functions } from '@lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { uploadApplicationFile, submitDriverApplication } from '../../services/driverService';
import Stepper from '@shared/components/layout/Stepper';
import { Loader2, X, Save } from 'lucide-react';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { DraftRecoveryModal } from '../DraftRecoveryModal';
import { useApplicationSchema } from '@/hooks/useApplicationSchema';
import { generateApplicationId, generateConfirmationNumber } from '@lib/applicationId';
import { isValidEmail, isValidPhone } from '@shared/utils/validation';
import * as Sentry from '@sentry/react';
import { getMagicFillPatchForStep } from '@features/sandbox/utils/dummyDataGenerator';
import { SANDBOX_COMPANY_ID } from '@features/sandbox/sandboxConstants';
import { SandboxActionPanel } from '@features/sandbox/SandboxActionPanel';

const guestFieldConfig = (applicationConfig, fieldId, defaultRequired = true) => {
  const config = applicationConfig?.[fieldId];
  return {
    hidden: Boolean(config?.hidden),
    required: config !== undefined ? Boolean(config.required) : defaultRequired,
  };
};

const guestHasUploadedFile = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    return Boolean(value.url || value.storagePath || value.name);
  }
  return false;
};

function buildDefaultSandboxPublicProfile() {
  return {
    id: SANDBOX_COMPANY_ID,
    companyName: 'SafeHaul Sandbox (Testing)',
    appSlug: 'sandbox',
    customQuestions: [],
    applicationConfig: {
      cdlUpload: { hidden: false, required: true },
      medCardUpload: { hidden: false, required: true },
      showEmergencyContacts: false,
    },
  };
}

export function DriverApplicationWizard({ isOpen, onClose, onSuccess, job, companyId, isSandboxMode = false }) {
  const { currentUser, setCurrentCompanyProfile, currentCompanyProfile } = useData();
  const navigate = useNavigate();
  const { companyId: paramCompanyId } = useParams();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [targetCompanyId, setTargetCompanyId] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [sandboxSubmission, setSandboxSubmission] = useState(null);

  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftData, setDraftData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef(null);
  const lastFormDataRef = useRef({});

  const isSubmitting = useRef(false);

  const { schema } = useApplicationSchema(targetCompanyId);
  const customQuestions =
    schema?.sections?.find((s) => s.isCustom)?.fields ||
    schema?.fields?.filter((f) => f.isCustom) ||
    [];

  useEffect(() => {
    if (paramCompanyId) {
      setTargetCompanyId(paramCompanyId);
    } else if (companyId) {
      setTargetCompanyId(companyId);
    } else if (!isSandboxMode) {
      const pending = sessionStorage.getItem('pending_application_company');
      if (pending) setTargetCompanyId(pending);
    }
  }, [paramCompanyId, companyId, isSandboxMode]);

  useEffect(() => {
    if (!isSandboxMode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'public_profiles', SANDBOX_COMPANY_ID));
        const profile = snap.exists()
          ? { id: SANDBOX_COMPANY_ID, ...snap.data() }
          : buildDefaultSandboxPublicProfile();
        if (cancelled) return;
        setCurrentCompanyProfile(profile);
        try {
          const savedDraft = localStorage.getItem('draft_sandbox');
          if (savedDraft) {
            const parsed = JSON.parse(savedDraft);
            if (parsed && typeof parsed === 'object') {
              setFormData(parsed);
            }
          }
        } catch (e) {
          console.warn('[DriverApplicationWizard] sandbox draft load:', e);
        }
        setCurrentStep(0);
      } catch (err) {
        console.error('[DriverApplicationWizard] sandbox profile:', err);
        showError('Could not load sandbox profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSandboxMode, setCurrentCompanyProfile, showError]);

  useEffect(() => {
    if (isSandboxMode) return;
    const loadDraft = async () => {
      if (!currentUser || !targetCompanyId) {
        setLoading(false);
        return;
      }

      try {
        const draftId = `app_${targetCompanyId}`;
        const draftRef = doc(db, 'drivers', currentUser.uid, 'drafts', draftId);
        const snap = await getDoc(draftRef);

        if (snap.exists()) {
          const data = snap.data();
          setDraftData(data);

          if (data.lastStep > 0 || data.firstName || data.email) {
            setShowDraftModal(true);
          } else {
            setFormData(data);
            if (data.lastStep) setCurrentStep(data.lastStep);
          }
        } else {
          setFormData({
            email: currentUser.email,
            phone: currentUser.phoneNumber || '',
            firstName: currentUser.displayName?.split(' ')[0] || '',
            lastName: currentUser.displayName?.split(' ').slice(1).join(' ') || '',
          });
        }
      } catch (err) {
        console.error('Error loading draft:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDraft();
  }, [currentUser, targetCompanyId, isSandboxMode]);

  const handleResumeDraft = () => {
    if (draftData) {
      setFormData(draftData);
      if (draftData.lastStep) setCurrentStep(draftData.lastStep);
    }
    setShowDraftModal(false);
  };

  const handleStartFresh = async () => {
    if (currentUser && targetCompanyId) {
      try {
        const draftId = `app_${targetCompanyId}`;
        const draftRef = doc(db, 'drivers', currentUser.uid, 'drafts', draftId);
        await deleteDoc(draftRef);
      } catch (err) {
        console.error('Failed to clear draft:', err);
      }
    }
    setFormData({
      email: currentUser?.email || '',
      phone: currentUser?.phoneNumber || '',
      firstName: currentUser?.displayName?.split(' ')[0] || '',
      lastName: currentUser?.displayName?.split(' ').slice(1).join(' ') || '',
    });
    setCurrentStep(0);
    setShowDraftModal(false);
  };

  const saveDraft = useCallback(
    async (newData = {}) => {
      if (isSandboxMode || !currentUser || !targetCompanyId) return;

      if (isSubmitting.current) {
        return;
      }

      setIsSaving(true);
      try {
        const mergedData = {
          ...formData,
          ...newData,
          lastStep: currentStep,
          updatedAt: serverTimestamp(),
          lastSavedAt: new Date().toISOString(),
          companyId: targetCompanyId,
        };
        setFormData(mergedData);
        lastFormDataRef.current = mergedData;

        const { ssn: _ssn, signature: _sig, ...draftPayload } = mergedData;

        const draftId = `app_${targetCompanyId}`;
        const draftRef = doc(db, 'drivers', currentUser.uid, 'drafts', draftId);
        await setDoc(draftRef, draftPayload, { merge: true });
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [isSandboxMode, currentUser, formData, currentStep, targetCompanyId],
  );

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (!isSandboxMode && currentUser && Object.keys(formData).length > 0 && !loading) {
      saveTimeoutRef.current = setTimeout(() => {
        if (JSON.stringify(formData) !== JSON.stringify(lastFormDataRef.current)) {
          saveDraft();
        }
      }, 5000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formData, currentUser, loading, saveDraft, isSandboxMode]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser && Object.keys(formData).length > 0 && targetCompanyId && !isSubmitting.current) {
        console.log('[DriverApplicationWizard] Page unload - draft check');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser, formData, currentStep, targetCompanyId]);

  const handleSandboxPartialSave = () => {
    const { ssn: _ssn, signature: _sig, ...draftPayload } = formData;
    try {
      localStorage.setItem('draft_sandbox', JSON.stringify(draftPayload));
      showSuccess('Progress saved.');
    } catch (err) {
      console.warn('[DriverApplicationWizard] sandbox draft save:', err);
      showError('Could not save progress locally.');
    }
  };

  const handleUpdateFormData = (name, value) => {
    const newData = { ...formData, [name]: value };
    setFormData(newData);
  };

  const handleNavigate = (direction) => {
    if (!isSandboxMode) {
      saveDraft();
    }
    if (direction === 'next') {
      setCurrentStep((prev) => prev + 1);
    } else if (direction === 'back') {
      setCurrentStep((prev) => Math.max(0, prev - 1));
    } else if (typeof direction === 'number') {
      setCurrentStep(direction);
    }
  };

  const handleMagicFillStep = useCallback(() => {
    const patch = getMagicFillPatchForStep(currentStep, {
      hasCustomQuestions: Boolean(customQuestions?.length > 0),
    });
    setFormData((prev) => ({ ...prev, ...patch }));
  }, [currentStep, customQuestions]);

  const handleFileUpload = async (fieldName, file) => {
    if (!file) return null;
    setIsUploading(true);
    try {
      if (isSandboxMode) {
        if (!targetCompanyId) {
          throw new Error('Company context is missing.');
        }
        const prepareGuestUpload = httpsCallable(functions, 'getSignedUploadUrl');
        const {
          data: { storagePath },
        } = await prepareGuestUpload({
          companyId: targetCompanyId,
          fileName: file.name,
          fileType: file.type,
          folder: 'applications',
        });
        if (!storagePath) {
          throw new Error('Upload prepare failed: missing storage path.');
        }
        const fileRef = ref(storage, storagePath);
        const snapshot = await uploadBytes(fileRef, file, { contentType: file.type });
        const publicUrl = await getDownloadURL(snapshot.ref);
        const fileData = { name: file.name, url: publicUrl, storagePath };
        showSuccess('File uploaded successfully.');
        return fileData;
      }

      const fileData = await uploadApplicationFile(targetCompanyId, currentUser.uid, fieldName, file);
      await saveDraft({ [fieldName]: fileData });
      showSuccess('File uploaded successfully.');
      return fileData;
    } catch (error) {
      console.error('Upload failed:', error);
      let msg = 'Upload failed. Please try again.';
      if (error.message && error.message.includes('exceeds 20MB')) msg = 'File is too large (Max 20MB).';
      showError(msg);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const validateForm = () => {
    if (!schema?.sections) return [];
    const missing = [];

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.required && !formData[field.id]) {
          if (formData[field.id] !== 0 && formData[field.id] !== false) {
            missing.push(field.label);
          }
        }
      });
    });

    customQuestions.forEach((q) => {
      if (q.required && !formData[q.id]) {
        missing.push(q.label || q.question);
      }
    });

    return missing;
  };

  const consentStepIndex = customQuestions && customQuestions.length > 0 ? 9 : 8;

  const handleFinalSubmit = async () => {
    if (isSandboxMode) {
      const appCfg = currentCompanyProfile?.applicationConfig;
      const cdlUploadConfig = guestFieldConfig(appCfg, 'cdlUpload', true);
      const medCardConfig = guestFieldConfig(appCfg, 'medCardUpload', true);
      const requiredUploadErrors = [];
      if (!cdlUploadConfig.hidden && cdlUploadConfig.required) {
        if (!guestHasUploadedFile(formData['cdl-front'])) requiredUploadErrors.push('CDL Front');
        if (!guestHasUploadedFile(formData['cdl-back'])) requiredUploadErrors.push('CDL Back');
      }
      if (!medCardConfig.hidden && medCardConfig.required && !guestHasUploadedFile(formData['medical-card-upload'])) {
        requiredUploadErrors.push('Medical Card');
      }
      if (requiredUploadErrors.length > 0) {
        showError(`Please upload required documents before submitting: ${requiredUploadErrors.join(', ')}.`);
        setCurrentStep(2);
        return;
      }
      if (!formData.signature || !formData['final-certification']) {
        showError('Please complete the electronic signature.');
        setCurrentStep(consentStepIndex);
        return;
      }
      if (!isValidEmail(formData.email)) {
        showError('Invalid Email Address.');
        return;
      }
      if (!isValidPhone(formData.phone)) {
        showError('Invalid Phone Number.');
        return;
      }
      if (formData['agree-electronic'] !== 'agreed' || formData['agree-background-check'] !== 'agreed') {
        showError('Please complete all required agreements.');
        setCurrentStep(consentStepIndex);
        return;
      }

      if (submissionStatus === 'submitting') return;
      isSubmitting.current = true;
      setSubmissionStatus('submitting');

      const email = formData.email || '';
      const phone = formData.phone || '';

      try {
        let applicationId;
        try {
          applicationId = await generateApplicationId(targetCompanyId, email, phone);
        } catch (idError) {
          const prefillLeadId = searchParams.get('prefill') || searchParams.get('leadId');
          applicationId = prefillLeadId || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        const confirmationNumber = generateConfirmationNumber();

        const applicationData = {
          applicantId: applicationId,
          applicationId,
          confirmationNumber,
          ...formData,
          firstName: formData.firstName || '',
          lastName: formData.lastName || '',
          email,
          phone,
          signature: formData.signature,
          signatureType: formData.signatureType || 'drawn',
          companyId: targetCompanyId,
          companyName: currentCompanyProfile?.companyName || 'SafeHaul Sandbox (Testing)',
          recruiterCode: null,
          sourceType: 'Sandbox Application',
          sourceSlug: 'sandbox',
          status: 'New Application',
          employers: Array.isArray(formData.employers) ? formData.employers : [],
          violations: Array.isArray(formData.violations) ? formData.violations : [],
          accidents: Array.isArray(formData.accidents) ? formData.accidents : [],
          schools: Array.isArray(formData.schools) ? formData.schools : [],
          military: Array.isArray(formData.military) ? formData.military : [],
          lifecycle: {
            status: 'pending',
            submittedAt: new Date().toISOString(),
            clientVersion: 'sandbox',
            isGuest: true,
          },
        };

        Sentry.addBreadcrumb({
          category: 'submission',
          message: 'Sandbox guest application submission started',
          data: { companyId: targetCompanyId },
          level: 'info',
        });

        const submitFn = httpsCallable(functions, 'submitGuestApplication');
        const result = await submitFn({
          companyId: targetCompanyId,
          email,
          phone,
          signature: formData.signature,
          formData: applicationData,
        });

        const serverData = result.data || {};
        const finalAppId = serverData.applicationId || applicationId;
        const finalConfirm = serverData.confirmationNumber || confirmationNumber;
        sessionStorage.setItem('lastConfirmationNumber', finalConfirm);
        setSandboxSubmission({ applicationId: finalAppId, confirmationNumber: finalConfirm });
        setSubmissionStatus('sandbox-complete');
        try {
          localStorage.removeItem('draft_sandbox');
        } catch (_) {
          /* ignore */
        }
        showSuccess('Sandbox application saved.');
      } catch (error) {
        console.error('Sandbox submission error:', error);
        setSubmissionStatus('error');
        showError(error?.message || 'Failed to submit sandbox application.');
      } finally {
        isSubmitting.current = false;
      }
      return;
    }

    const missingFields = validateForm();
    if (missingFields.length > 0) {
      showError(
        `Missing required fields: ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? '...' : ''}`,
      );
      return;
    }

    if (!formData.signature || !formData['final-certification']) {
      showError('Please provide your signature and certify the application.');
      setCurrentStep(consentStepIndex);
      return;
    }

    if (formData['agree-electronic'] !== 'agreed') {
      showError('You must consent to use electronic records and signatures before submitting.');
      setCurrentStep(consentStepIndex);
      return;
    }
    if (formData['agree-background-check'] !== 'agreed') {
      showError('You must authorize the background check before submitting.');
      setCurrentStep(consentStepIndex);
      return;
    }

    isSubmitting.current = true;
    setSubmissionStatus('submitting');

    try {
      const activeCompanyId = targetCompanyId;
      const result = await submitDriverApplication(currentUser, formData, activeCompanyId, job);

      const draftId = `app_${activeCompanyId}`;
      const draftRef = doc(db, 'drivers', currentUser.uid, 'drafts', draftId);
      await deleteDoc(draftRef);

      sessionStorage.removeItem('pending_application_company');

      if (result?.queued && !result?.success) {
        setSubmissionStatus('queued');
        showSuccess('Application saved! It will be submitted automatically when connection is restored.');
      } else {
        setSubmissionStatus('success');
        showSuccess('Application Submitted!');
      }

      if (onSuccess && job?.id) {
        onSuccess(job.id);
      }

      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          navigate('/driver/dashboard');
        }
      }, 1500);
    } catch (error) {
      console.error('Submission Error:', error);
      setSubmissionStatus('error');
      showError('Failed to submit application.');
    } finally {
      isSubmitting.current = false;
    }
  };

  if (isSandboxMode && submissionStatus === 'sandbox-complete' && sandboxSubmission) {
    return (
      <SandboxActionPanel
        applicationId={sandboxSubmission.applicationId}
        confirmationNumber={sandboxSubmission.confirmationNumber}
        onDeletedRestart={() => {
          setSubmissionStatus(null);
          setSandboxSubmission(null);
          setCurrentStep(0);
          setFormData({});
          sessionStorage.removeItem('lastConfirmationNumber');
        }}
      />
    );
  }

  if (loading) {
    if (isOpen) {
      return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl flex items-center justify-center min-h-[300px]">
            <Loader2 className="animate-spin text-blue-600" size={40} />
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  const stepperExtra = {
    isSandboxMode,
    onMagicFillStep: isSandboxMode ? handleMagicFillStep : undefined,
  };

  const partialSubmit = isSandboxMode
    ? handleSandboxPartialSave
    : () => {
        saveDraft();
        showSuccess('Draft saved.');
      };

  if (isOpen) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div
          className="bg-gray-50 w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Complete DOT Application</h2>
              {job && <p className="text-sm text-gray-500 font-medium italic">Position: {job.title}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="max-w-4xl mx-auto border border-gray-100 rounded-xl shadow-sm">
              <Stepper
                step={currentStep}
                formData={formData}
                updateFormData={handleUpdateFormData}
                onNavigate={handleNavigate}
                onPartialSubmit={partialSubmit}
                onFinalSubmit={handleFinalSubmit}
                handleFileUpload={handleFileUpload}
                isUploading={isUploading}
                submissionStatus={submissionStatus}
                customQuestions={customQuestions}
                {...stepperExtra}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {!isSandboxMode && (
        <DraftRecoveryModal
          isOpen={showDraftModal}
          draftData={draftData}
          onResume={handleResumeDraft}
          onStartFresh={handleStartFresh}
          onClose={() => setShowDraftModal(false)}
        />
      )}

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-gray-900">
            {isSandboxMode ? 'Sandbox — Driver Application' : 'Driver Application'}
          </h1>
          {!isSandboxMode && isSaving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Save size={12} className="animate-pulse" />
              Saving...
            </span>
          )}
        </div>
        {!isSandboxMode && (
          <button
            onClick={async () => {
              await saveDraft();
              navigate('/driver/dashboard');
            }}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium"
          >
            Save & Exit
          </button>
        )}
      </div>

      {isSandboxMode && (
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-2 text-center text-sm text-amber-900">
          Testing mode — applications are stored under tenant <strong>SANDBOX</strong>. Not visible to real carriers until
          transferred.
        </div>
      )}

      <div className="max-w-4xl mx-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Stepper
          step={currentStep}
          formData={formData}
          updateFormData={handleUpdateFormData}
          onNavigate={handleNavigate}
          onPartialSubmit={partialSubmit}
          onFinalSubmit={handleFinalSubmit}
          handleFileUpload={handleFileUpload}
          isUploading={isUploading}
          submissionStatus={submissionStatus}
          customQuestions={customQuestions}
          {...stepperExtra}
        />
      </div>
    </div>
  );
}
