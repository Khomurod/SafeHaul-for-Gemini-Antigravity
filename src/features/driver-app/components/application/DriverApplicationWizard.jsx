import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { db, storage } from '@lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { uploadApplicationFile, submitDriverApplication } from '../../services/driverService';
import Stepper from '@shared/components/layout/Stepper';
import { Loader2, X, Save } from 'lucide-react';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { DraftRecoveryModal } from '../DraftRecoveryModal';
import { useApplicationSchema } from '@/hooks/useApplicationSchema';

export function DriverApplicationWizard({ isOpen, onClose, onSuccess, job, companyId }) {
  const { currentUser } = useData();
  const navigate = useNavigate();
  const { companyId: paramCompanyId } = useParams();
  const { showSuccess, showError } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [targetCompanyId, setTargetCompanyId] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);

  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftData, setDraftData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef(null);
  const lastFormDataRef = useRef({});
  const formDataRef = useRef(formData);
  const currentStepRef = useRef(currentStep);

  const isSubmitting = useRef(false);

  formDataRef.current = formData;
  currentStepRef.current = currentStep;

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
    } else {
      const pending = sessionStorage.getItem('pending_application_company');
      if (pending) setTargetCompanyId(pending);
    }
  }, [paramCompanyId, companyId]);

  useEffect(() => {
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
  }, [currentUser, targetCompanyId]);

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
      if (!currentUser || !targetCompanyId) return;

      if (isSubmitting.current) {
        return;
      }

      setIsSaving(true);
      try {
        const mergedData = {
          ...formDataRef.current,
          ...newData,
          lastStep: currentStepRef.current,
          updatedAt: serverTimestamp(),
          lastSavedAt: new Date().toISOString(),
          companyId: targetCompanyId,
        };
        setFormData(mergedData);
        lastFormDataRef.current = mergedData;
        formDataRef.current = mergedData;

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
    [currentUser, targetCompanyId],
  );

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (currentUser && Object.keys(formData).length > 0 && !loading) {
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
  }, [formData, currentUser, loading, saveDraft]);

  useEffect(() => {
    const flushDraftOnHide = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!currentUser || !targetCompanyId || isSubmitting.current) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const fd = formDataRef.current;
      if (Object.keys(fd).length === 0) return;
      if (JSON.stringify(fd) === JSON.stringify(lastFormDataRef.current)) return;
      void saveDraft();
    };

    document.addEventListener('visibilitychange', flushDraftOnHide);
    return () => document.removeEventListener('visibilitychange', flushDraftOnHide);
  }, [currentUser, targetCompanyId, saveDraft]);

  const handleUpdateFormData = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: typeof value === 'function' ? value(prev[name]) : value,
    }));
  };

  const handleNavigate = (direction) => {
    saveDraft();
    if (direction === 'next') {
      setCurrentStep((prev) => prev + 1);
    } else if (direction === 'back') {
      setCurrentStep((prev) => Math.max(0, prev - 1));
    } else if (typeof direction === 'number') {
      setCurrentStep(direction);
    }
  };

  const handleFileUpload = async (fieldName, file) => {
    if (!file) return null;
    setIsUploading(true);
    try {
      const fileData = await uploadApplicationFile(targetCompanyId, currentUser.uid, fieldName, file);

      await saveDraft({ [fieldName]: fileData });
      showSuccess('File uploaded successfully.');

      return fileData;
    } catch (error) {
      console.error('Upload failed:', error);
      let msg = 'Upload failed. Please try again.';
      if (error.message.includes('exceeds 20MB')) msg = 'File is too large (Max 20MB).';
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
        const fieldKey = field.key ?? field.id;
        if (!fieldKey) return;
        if (field.required && !formData[fieldKey]) {
          if (formData[fieldKey] !== 0 && formData[fieldKey] !== false) {
            missing.push(field.label);
          }
        }
      });
    });

    customQuestions.forEach((q) => {
      const qKey = q.key ?? q.id;
      if (!qKey) return;
      if (q.required && !formData[qKey]) {
        missing.push(q.label || q.question);
      }
    });

    return missing;
  };

  const consentStepIndex = customQuestions && customQuestions.length > 0 ? 9 : 8;

  const handleFinalSubmit = async () => {
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

  if (!targetCompanyId) {
    if (isOpen) {
      return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 text-center border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Company not selected</h2>
            <p className="text-sm text-gray-600 mb-6">
              This application must be tied to a carrier. Open apply from a job post or link that includes the company, then try again.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof onClose === 'function') onClose();
                else navigate('/driver/dashboard');
              }}
              className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">No company for this application</h1>
          <p className="text-gray-600 text-sm mb-6">
            Use <span className="font-mono text-xs bg-gray-100 px-1 rounded">/driver/apply/&lt;companyId&gt;</span>, apply from the job board, or start from a recruiter link so a carrier is selected.
          </p>
          <button
            type="button"
            onClick={() => navigate('/driver/dashboard')}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

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
                onPartialSubmit={() => {
                  saveDraft();
                  showSuccess('Draft saved.');
                }}
                onFinalSubmit={handleFinalSubmit}
                handleFileUpload={handleFileUpload}
                isUploading={isUploading}
                submissionStatus={submissionStatus}
                customQuestions={customQuestions}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <DraftRecoveryModal
        isOpen={showDraftModal}
        draftData={draftData}
        onResume={handleResumeDraft}
        onStartFresh={handleStartFresh}
        onClose={() => setShowDraftModal(false)}
      />

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-gray-900">Driver Application</h1>
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Save size={12} className="animate-pulse" />
              Saving...
            </span>
          )}
        </div>
        <button
          onClick={async () => {
            await saveDraft();
            navigate('/driver/dashboard');
          }}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium"
        >
          Save & Exit
        </button>
      </div>

      <div className="max-w-4xl mx-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Stepper
          step={currentStep}
          formData={formData}
          updateFormData={handleUpdateFormData}
          onNavigate={handleNavigate}
          onPartialSubmit={() => {
            saveDraft();
            showSuccess('Draft saved.');
          }}
          onFinalSubmit={handleFinalSubmit}
          handleFileUpload={handleFileUpload}
          isUploading={isUploading}
          submissionStatus={submissionStatus}
          customQuestions={customQuestions}
        />
      </div>
    </div>
  );
}
