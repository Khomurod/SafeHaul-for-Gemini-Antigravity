// src/features/driver-app/components/application/PublicApplyHandler.jsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from '@lib/firebase';
import Stepper from '@shared/components/layout/Stepper';
import { IntakeChooser } from './IntakeChooser';
import {
  getFieldConfig,
  hasUploadedFile,
  AUTO_FILL_IMAGE_TYPES,
  normalizePostApplicationTemplates,
  parseIsoFromLooseDate,
  fileToDataUrl,
  buildE2EPublicProfile,
  buildPostApplyDocErrorMessage,
} from './publicApplyHelpers';
import {
  DOC_STATUS,
  savePostApplySession,
  readPostApplySession,
  clearPostApplySession,
  markRequestSigned,
  isRequestSigned,
  setSigningReturnPath,
} from './postApplyDocsStorage';
import {
  ApplyLoadingScreen,
  ApplyLinkErrorScreen,
  ParsingCdlScreen,
  SubmissionSuccessScreen,
  SubmissionQueuedScreen,
} from './PublicApplyScreens';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { useData } from '@/context/DataContext';
import { isValidEmail, isValidPhone } from '@shared/utils/validation';
import * as Sentry from '@sentry/react';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';
import { resolveGuestUploadMimeType } from '@shared/utils/guestUploadMime';
import { parseAddressPartsFromCdl } from '@shared/utils/parseCdlAddress';

// Bulletproof submission imports
import {
  initQueue,
  enqueueSubmission,
  dequeueSubmission,
  isSupported as isQueueSupported
} from '@lib/submissionQueue';
import {
  generateApplicationId,
  generateConfirmationNumber
} from '@lib/applicationId';
import { getMagicFillPatchForStep } from '@features/sandbox/utils/dummyDataGenerator';
import { SandboxActionPanel } from '@features/sandbox/SandboxActionPanel';
import {
  SANDBOX_APP_SLUG,
  SANDBOX_COMPANY_ID,
  buildDefaultSandboxPublicProfile,
} from '@features/sandbox/sandboxConstants';

/**
 * Guest application (public link). Pass `sandbox` so `/sandbox/apply` reuses this file verbatim —
 * same Stepper, steps, submission queue, and employment/FMCSA behavior as production guest apply.
 */
export function PublicApplyHandler({ sandbox = false } = {}) {
  const params = useParams();
  const slug = sandbox ? SANDBOX_APP_SLUG : params.slug;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { setCurrentCompanyProfile } = useData();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [company, setCompany] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [intakeMode, setIntakeMode] = useState(null); // null | manual
  const [isParsingCdl, setIsParsingCdl] = useState(false);
  const [autoFillStoragePath, setAutoFillStoragePath] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [submittedApplicationId, setSubmittedApplicationId] = useState('');
  const [submittedConfirmationNumber, setSubmittedConfirmationNumber] = useState('');
  const [openingTemplateId, setOpeningTemplateId] = useState('');
  // Per-template progress for the post-submission Required Documents checklist:
  // { [templateId]: { status: DOC_STATUS.*, requestId?: string, error?: string } }
  const [postSubmitDocs, setPostSubmitDocs] = useState({});
  const [sandboxSubmission, setSandboxSubmission] = useState(null);
  const hasStarted = useRef(false);
  const isSubmittingRef = useRef(false);
  const cdlAutoFillInputRef = useRef(null);
  const e2eUploadMode = getE2EQueryParam('e2eUpload', 'allow');

  // #7 FIX: Derive custom questions from company profile for public applicants
  const customQuestions = company?.customQuestions || [];
  const postApplicationTemplates = normalizePostApplicationTemplates(company?.postApplicationTemplates);
  // #8 FIX: Dynamic consent step index based on whether custom questions exist
  const consentStepIndex = customQuestions.length > 0 ? 9 : 8;
  const cdlUploadConfig = getFieldConfig(company?.applicationConfig, 'cdlUpload', true);
  const medCardConfig = getFieldConfig(company?.applicationConfig, 'medCardUpload', true);

  /**
   * Restore a recent submission (and its document checklist) after the driver
   * navigated to the signing room and came back — the round trip unmounts this
   * component, so React state alone cannot carry the checklist across.
   * Completion markers written by SigningRoom are merged in here.
   */
  const restorePostApplySession = useCallback((companyData) => {
    if (!companyData?.id) return false;
    const session = readPostApplySession(companyData.id);
    if (!session) return false;
    if (session.slug && slug && session.slug !== slug) return false;

    const mergedDocs = {};
    for (const [templateId, docState] of Object.entries(session.docs || {})) {
      if (!docState) continue;
      if (docState.requestId && isRequestSigned(companyData.id, docState.requestId)) {
        mergedDocs[templateId] = { ...docState, status: DOC_STATUS.COMPLETED, error: null };
      } else if (docState.status === DOC_STATUS.OPENING) {
        // Navigation away was interrupted — allow re-opening.
        mergedDocs[templateId] = { ...docState, status: DOC_STATUS.NOT_STARTED };
      } else {
        mergedDocs[templateId] = docState;
      }
    }

    setPostSubmitDocs(mergedDocs);
    setSubmittedApplicationId(session.applicationId);
    setSubmittedConfirmationNumber(session.confirmationNumber || '');
    if (session.confirmationNumber) {
      sessionStorage.setItem('lastConfirmationNumber', session.confirmationNumber);
    }
    setSubmissionStatus('success');
    savePostApplySession(companyData.id, { ...session, docs: mergedDocs });
    return true;
  }, [slug]);

  // 1. Load Company Info from Slug (or fixed SANDBOX public profile when `sandbox`)
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function loadCompany() {
      if (!sandbox && !slug) {
        setError("Invalid link - no company specified.");
        setLoading(false);
        return;
      }

      try {
        if (sandbox) {
          const snap = await getDoc(doc(db, 'public_profiles', SANDBOX_COMPANY_ID));
          const companyData = snap.exists()
            ? { id: SANDBOX_COMPANY_ID, ...snap.data() }
            : buildDefaultSandboxPublicProfile();
          setCompany(companyData);
          if (setCurrentCompanyProfile) {
            setCurrentCompanyProfile(companyData);
          }
          try {
            const savedDraft = localStorage.getItem(`draft_${slug}`);
            if (savedDraft) {
              const parsed = JSON.parse(savedDraft);
              if (parsed && typeof parsed === 'object') {
                setFormData((prev) => ({ ...prev, ...parsed }));
              }
            }
          } catch (draftErr) {
            console.warn('[PublicApplyHandler] Failed to load sandbox draft:', draftErr);
          }
          const recruiter = searchParams.get('r') || searchParams.get('recruiter');
          if (recruiter) {
            sessionStorage.setItem('pending_application_recruiter', recruiter);
          }
          sessionStorage.setItem('pending_application_company', SANDBOX_COMPANY_ID);
          setIntakeMode('manual');
          setLoading(false);
          return;
        }

        if (isE2ETestMode) {
          const mockCompany = buildE2EPublicProfile(slug);
          setCompany(mockCompany);
          if (setCurrentCompanyProfile) {
            setCurrentCompanyProfile(mockCompany);
          }
          sessionStorage.setItem('pending_application_company', mockCompany.id);
          restorePostApplySession(mockCompany);
          if (getE2EQueryParam('e2eIntake', 'manual') !== 'choice') {
            setIntakeMode('manual');
          }
          try {
            const savedDraft = localStorage.getItem(`draft_${slug}`);
            if (savedDraft) {
              const parsed = JSON.parse(savedDraft);
              if (parsed && typeof parsed === 'object') {
                setFormData((prev) => ({ ...prev, ...parsed }));
                if (typeof parsed.lastStep === 'number') {
                  setCurrentStep(parsed.lastStep);
                }
              }
            }
          } catch (draftErr) {
            console.warn('[PublicApplyHandler] E2E draft restore failed:', draftErr);
          }
          setLoading(false);
          return;
        }

        let companyData = null;
        let companyId = null;

        const q = query(collection(db, "public_profiles"), where("appSlug", "==", slug), limit(1));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          companyId = snapshot.docs[0].id;
          companyData = { id: companyId, ...snapshot.docs[0].data() };
        } else {
          const docRef = doc(db, "public_profiles", slug);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            companyId = docSnap.id;
            companyData = { id: companyId, ...docSnap.data() };
          }
        }



        if (!companyData) {
          setError("Company not found.");
          setLoading(false);
          return;
        }

        setCompany(companyData);
        // Important: Global context setter preserved
        if (setCurrentCompanyProfile) {
          setCurrentCompanyProfile(companyData);
        }

        // Returning from the signing room (or a reload right after submitting):
        // bring back the success screen + required-documents checklist.
        restorePostApplySession(companyData);

        // P2-5 FIX: Recover saved draft from localStorage on page revisit
        try {
          const savedDraft = localStorage.getItem(`draft_${slug}`);
          if (savedDraft) {
            const parsed = JSON.parse(savedDraft);
            if (parsed && typeof parsed === 'object') {
              setFormData(prev => ({ ...prev, ...parsed }));
            }
          }
        } catch (draftErr) {
          console.warn('[PublicApplyHandler] Failed to load draft:', draftErr);
        }

        const recruiter = searchParams.get('r') || searchParams.get('recruiter');
        if (recruiter) {
          sessionStorage.setItem('pending_application_recruiter', recruiter);
        }

        sessionStorage.setItem('pending_application_company', companyId);
        setLoading(false);

      } catch (err) {
        console.error("Error loading company:", err);
        setError("Unable to load application.");
        setLoading(false);
      }
    }
    loadCompany();
  }, [slug, sandbox, searchParams, setCurrentCompanyProfile, restorePostApplySession]);

  // 2. Form Handlers
  const handleUpdateFormData = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: typeof value === 'function' ? value(prev[name]) : value,
    }));
  };

  const persistLocalDraft = (stepIndex) => {
    if (!slug || sandbox) return;
    const { ssn: _ssn, signature: _sig, ...draftPayload } = formData;
    try {
      localStorage.setItem(
        `draft_${slug}`,
        JSON.stringify({ ...draftPayload, lastStep: stepIndex }),
      );
    } catch (draftErr) {
      console.warn('[PublicApplyHandler] Local draft save failed:', draftErr);
    }
  };

  const handleNavigate = (direction) => {
    let nextStep = currentStep;
    if (direction === 'next') nextStep = currentStep + 1;
    else if (direction === 'back') nextStep = Math.max(0, currentStep - 1);
    else if (typeof direction === 'number') nextStep = direction;

    setCurrentStep(nextStep);
    if (isE2ETestMode) {
      persistLocalDraft(nextStep);
    }
    window.scrollTo(0, 0);
  };

  const handleMagicFillStep = useCallback(() => {
    const patch = getMagicFillPatchForStep(currentStep, {
      hasCustomQuestions: customQuestions.length > 0,
    });
    setFormData((prev) => ({ ...prev, ...patch }));
  }, [currentStep, customQuestions]);

  const handleChooseManual = () => {
    setIntakeMode('manual');
  };

  const handleChooseAutoFill = () => {
    // Keep the user on the choice screen until a file is actually selected.
    // This prevents an accidental fallback into the manual wizard when the
    // picker is dismissed or blocked by the browser.
    cdlAutoFillInputRef.current?.click();
  };

  const handleCdlAutoFillFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      // User closed chooser without selecting a file -> return to first choice screen.
      setIntakeMode(null);
      return;
    }

    if (!AUTO_FILL_IMAGE_TYPES.has(file.type)) {
      showError('Please upload a JPG, PNG, or WEBP image for CDL auto-fill.');
      setIntakeMode(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showError('CDL image is too large. Please use an image under 8MB.');
      setIntakeMode(null);
      return;
    }

    try {
      if (!company?.id) {
        throw new Error('Company is missing. Please refresh and try again.');
      }

      setIsParsingCdl(true);

      // 1) Upload to temporary guest autofill path (for reliability/audit/debug)
      const prepareUpload = httpsCallable(functions, 'getSignedUploadUrl');
      const { data: uploadData } = await prepareUpload({
        companyId: company.id,
        fileName: file.name,
        fileType: file.type,
        folder: 'autofill',
      });
      const storagePath = uploadData?.storagePath;
      if (!storagePath) {
        throw new Error('Could not reserve upload path.');
      }
      const uploadRef = ref(storage, storagePath);
      await uploadBytes(uploadRef, file, { contentType: file.type });
      setAutoFillStoragePath(storagePath);

      // 2) Send image to secure Groq parser callable (no API key in frontend)
      const imageDataUrl = await fileToDataUrl(file);
      const parseFn = httpsCallable(functions, 'parseCdlWithGroq', { timeout: 60000 });
      const { data } = await parseFn({
        companyId: company.id,
        imageDataUrl,
        storagePath,
      });
      const fields = data?.fields || {};
      const dobIso = parseIsoFromLooseDate(fields.dateOfBirth);
      const cdlExpIso = parseIsoFromLooseDate(fields.expirationDate);
      const addr = parseAddressPartsFromCdl(fields.fullAddress);

      setFormData((prev) => ({
        ...prev,
        firstName: fields.firstName || prev.firstName || '',
        lastName: fields.lastName || prev.lastName || '',
        dob: dobIso || prev.dob || '',
        street: addr.street || prev.street || '',
        city: addr.city || prev.city || '',
        state: addr.state || prev.state || '',
        zip: addr.zip || prev.zip || '',
        cdlNumber: fields.cdlNumber || prev.cdlNumber || '',
        cdlExpiration: cdlExpIso || prev.cdlExpiration || '',
        // Best-effort: when address parsing yields a valid state, mirror to CDL state too.
        cdlState: addr.state || prev.cdlState || '',
      }));

      showSuccess('CDL auto-fill complete. Please review your information.');
      setCurrentStep(0);
      setIntakeMode('manual');
    } catch (err) {
      console.error('[PublicApplyHandler] CDL auto-fill failed:', err);
      const msg = err?.message || 'Could not auto-fill from CDL. You can continue manually.';
      showError(msg);
      // Keep user on the choice screen when OCR fails so they don't feel
      // force-routed into the full manual wizard unexpectedly.
      setIntakeMode(null);
    } finally {
      setIsParsingCdl(false);
    }
  };

  const handleFileUpload = async (fieldName, file) => {
    if (!file) return null;
    setIsUploading(true);
    try {
      if (!company?.id) {
        throw new Error('Company context is missing.');
      }

      if (isE2ETestMode) {
        if (e2eUploadMode === 'deny') {
          const permissionError = new Error('E2E upload blocked by mock permission guard.');
          permissionError.code = 'permission-denied';
          throw permissionError;
        }

        await new Promise((resolve) => setTimeout(resolve, 120));
        const fileData = {
          name: file.name,
          url: typeof URL !== 'undefined' ? URL.createObjectURL(file) : '',
          storagePath: `companies/${company.id}/applications/e2e/${fieldName}/${Date.now()}-${file.name}`,
        };
        showSuccess("File uploaded successfully.");
        return fileData;
      }

      // Guest upload: server reserves path + validates tenant/rate limits; client uploads via Firebase SDK.
      // Avoids browser PUT to storage.googleapis.com (bucket CORS / signed URL extension headers).
      const fileType = resolveGuestUploadMimeType(file);
      if (!fileType) {
        throw new Error('Could not detect file type. Please use PDF, PNG, JPEG, WEBP, or HEIC.');
      }

      const prepareGuestUpload = httpsCallable(functions, 'getSignedUploadUrl');

      const { data: { storagePath } } = await prepareGuestUpload({
        companyId: company.id,
        fileName: file.name,
        fileType,
        folder: 'applications'
      });

      if (!storagePath) {
        throw new Error('Upload prepare failed: missing storage path.');
      }

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: fileType });

      const getGuestReadUrl = httpsCallable(functions, 'getSignedGuestUploadUrl');
      const { data: readData } = await getGuestReadUrl({ companyId: company.id, storagePath });
      if (!readData?.url) {
        throw new Error('Upload preview URL failed.');
      }

      const fileData = { name: file.name, url: readData.url, storagePath };
      showSuccess("File uploaded successfully.");
      return fileData;
    } catch (error) {
      console.error("Upload Error:", error);
      if (error?.code === 'functions/resource-exhausted') {
        showError("Too many upload attempts. Please wait a moment and try again.");
      } else if (error?.code === 'storage/unauthorized') {
        showError("Upload was denied by Firebase Storage. Please refresh and try again.");
      } else {
        showError("Upload failed. Please try again.");
      }
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const handlePartialSubmit = () => {
    // SEC-2: Never persist SSN or signature in localStorage — they are PII/biometric data
    // accessible to any JavaScript on the page (XSS vector) and persisted across sessions.
    // DL-1: Wrap in try/catch so a QuotaExceededError is surfaced rather than silently swallowed.
    const { ssn: _ssn, signature: _sig, ...draftPayload } = formData;
    try {
      localStorage.setItem(`draft_${slug}`, JSON.stringify(draftPayload));
      showSuccess("Progress saved.");
    } catch (err) {
      console.warn('[PublicApplyHandler] Draft save failed (quota or privacy policy):', err);
      showError("Could not save progress locally. Your data is still here — please continue filling the form.");
    }
  };

  const handleFinalSubmit = async () => {
    const requiredUploadErrors = [];
    if (!cdlUploadConfig.hidden && cdlUploadConfig.required) {
      if (!hasUploadedFile(formData['cdl-front'])) requiredUploadErrors.push('CDL Front');
      if (!hasUploadedFile(formData['cdl-back'])) requiredUploadErrors.push('CDL Back');
    }
    if (!medCardConfig.hidden && medCardConfig.required && !hasUploadedFile(formData['medical-card-upload'])) {
      requiredUploadErrors.push('Medical Card');
    }
    if (requiredUploadErrors.length > 0) {
      showError(`Please upload required documents before submitting: ${requiredUploadErrors.join(', ')}.`);
      setCurrentStep(2);
      return;
    }

    // Validate signature and certification
    if (!formData.signature || !formData['final-certification']) {
      showError("Please complete the electronic signature.");
      setCurrentStep(consentStepIndex);
      return;
    }

    // Validate email and phone
    if (!isValidEmail(formData.email)) {
      showError("Invalid Email Address.");
      return;
    }
    if (!isValidPhone(formData.phone)) {
      showError("Invalid Phone Number.");
      return;
    }

    if (isSubmittingRef.current || submissionStatus === 'submitting') return;
    isSubmittingRef.current = true;
    setSubmissionStatus('submitting');

    if (isE2ETestMode && !sandbox) {
      const confirmationNumber = generateConfirmationNumber();
      sessionStorage.setItem('lastConfirmationNumber', confirmationNumber);
      setSubmittedConfirmationNumber(confirmationNumber);
      setSubmittedApplicationId('e2e-application-id');
      setPostSubmitDocs({});
      savePostApplySession(company.id, {
        applicationId: 'e2e-application-id',
        confirmationNumber,
        slug,
        docs: {},
      });
      localStorage.removeItem(`draft_${slug}`);
      sessionStorage.removeItem('pending_application_recruiter');
      setSubmissionStatus('success');
      return;
    }

    const email = formData.email || '';
    const phone = formData.phone || '';

    // Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: 'submission',
      message: sandbox ? 'Sandbox guest application submission started' : 'Guest application submission started',
      data: { companyId: company.id, slug },
      level: 'info',
    });

    try {
      // 1. Generate deterministic application ID
      let applicationId;
      try {
        applicationId = await generateApplicationId(company.id, email, phone);
      } catch (idError) {
        // Fallback for ID generation failure
        const prefillLeadId = searchParams.get('prefill') || searchParams.get('leadId');
        applicationId = prefillLeadId || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // 2. Generate confirmation number
      const confirmationNumber = generateConfirmationNumber();


      const recruiterCode = sessionStorage.getItem('pending_application_recruiter');

      // Note: No client-side sanitizeData() needed here — httpsCallable handles JSON serialization,
      // and the Cloud Function (submitGuestApplication) does its own sanitization server-side.
      // AF6 FIX: Removed redundant `personalInfo` wrapper — all fields are spread from formData
      // at the top level, matching the authenticated submission structure exactly.
      const applicationData = {
        applicantId: applicationId,
        applicationId: applicationId,
        confirmationNumber: confirmationNumber,
        ...formData,
        // Ensure these top-level keys always exist (overrides from formData if present)
        firstName: formData.firstName || '',
        lastName: formData.lastName || '',
        email: email,
        phone: phone,
        signature: formData.signature,
        signatureType: formData.signatureType || 'drawn',
        companyId: company.id,
        companyName: company.companyName,
        recruiterCode: recruiterCode || null,
        sourceType: sandbox ? 'Sandbox Application' : 'Public Application',
        sourceSlug: sandbox ? SANDBOX_APP_SLUG : slug,
        status: 'New Application',
        // BUGFIX: Removed submittedAt/createdAt serverTimestamp() from here.
        // sanitizeData() destroys FieldValue sentinels by recursing into them.
        // The Cloud Function (submitGuestApplication) adds server timestamps after sanitization.
        employers: Array.isArray(formData.employers) ? formData.employers : [],
        violations: Array.isArray(formData.violations) ? formData.violations : [],
        accidents: Array.isArray(formData.accidents) ? formData.accidents : [],
        schools: Array.isArray(formData.schools) ? formData.schools : [],
        military: Array.isArray(formData.military) ? formData.military : [],
        // Bulletproof tracking
        lifecycle: {
          status: 'pending',
          submittedAt: new Date().toISOString(),
          clientVersion: sandbox ? 'sandbox' : '2.0-bulletproof',
          isGuest: true,
        },
      };

      // 3. Queue first for guaranteed delivery
      let queueId = null;
      if (isQueueSupported()) {
        try {
          await initQueue();
          queueId = await enqueueSubmission(applicationData, company.id, {
            type: 'guest',
            userId: null,
          });
          console.log(`[PublicApplyHandler] Queued submission ${queueId}`);
        } catch (queueError) {
          console.warn('[PublicApplyHandler] Queue failed:', queueError);
        }
      }

      // 4. Submit via Cloud Function (Admin SDK — bypasses all rules)
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const submitFn = httpsCallable(functions, 'submitGuestApplication');
          const result = await submitFn({
            companyId: company.id,
            email: email,
            phone: phone,
            signature: formData.signature,
            formData: applicationData,
          });

          // Use server-generated values if available
          const serverData = result.data || {};

          // Success - dequeue if queued
          if (queueId) {
            try {
              await dequeueSubmission(queueId);
            } catch (dequeueError) {
              console.warn('[PublicApplyHandler] Dequeue failed:', dequeueError);
            }
          }

          localStorage.removeItem(`draft_${slug}`);
          sessionStorage.removeItem('pending_application_recruiter');

          Sentry.addBreadcrumb({
            category: 'submission',
            message: sandbox
              ? 'Sandbox guest application submitted successfully via Cloud Function'
              : 'Guest application submitted successfully via Cloud Function',
            data: { applicationId: serverData.applicationId || applicationId, confirmationNumber: serverData.confirmationNumber || confirmationNumber },
            level: 'info',
          });

          const finalConfirm = serverData.confirmationNumber || confirmationNumber;
          const finalApplicationId = serverData.applicationId || applicationId;
          sessionStorage.setItem('lastConfirmationNumber', finalConfirm);
          setSubmittedApplicationId(finalApplicationId);
          setSubmittedConfirmationNumber(finalConfirm);

          if (!sandbox) {
            // Seed the required-documents session so the checklist survives
            // the navigation round trip through the signing room.
            setPostSubmitDocs({});
            savePostApplySession(company.id, {
              applicationId: finalApplicationId,
              confirmationNumber: finalConfirm,
              slug,
              docs: {},
            });
          }

          if (sandbox) {
            setSandboxSubmission({
              applicationId: serverData.applicationId || applicationId,
              confirmationNumber: finalConfirm,
            });
            setSubmissionStatus(null);
            showSuccess('Sandbox application saved.');
          } else {
            setSubmissionStatus('success');
          }
          return; // Exit on success

        } catch (error) {
          console.warn(`[PublicApplyHandler] Attempt ${attempt} failed:`, error);
          lastError = error;
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }

      // All attempts failed
      Sentry.captureException(lastError, {
        tags: { flow: 'guest_application', stage: 'submission_failed' },
        extra: { applicationId, companyId: company.id, queueId },
      });

      // If queued, show partial success
      if (queueId) {
        setSubmissionStatus('queued');
        showSuccess("Your application is saved and will be submitted automatically when connection is restored.");
      } else {
        throw lastError;
      }

    } catch (error) {
      console.error("Submission error:", error);
      setSubmissionStatus('error');
      showError("Failed to submit application. Please try again.");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  /** Update one template's checklist state and persist the session snapshot. */
  const updatePostSubmitDoc = useCallback((templateId, patch) => {
    setPostSubmitDocs((prev) => {
      const next = { ...prev, [templateId]: { ...(prev[templateId] || {}), ...patch } };
      if (company?.id && submittedApplicationId && !sandbox) {
        savePostApplySession(company.id, {
          applicationId: submittedApplicationId,
          confirmationNumber:
            submittedConfirmationNumber || sessionStorage.getItem('lastConfirmationNumber') || '',
          slug,
          docs: next,
        });
      }
      return next;
    });
  }, [company?.id, submittedApplicationId, submittedConfirmationNumber, slug, sandbox]);

  const handleStartNewApplication = useCallback(() => {
    if (company?.id) clearPostApplySession(company.id);
    sessionStorage.removeItem('lastConfirmationNumber');
    setSubmissionStatus(null);
    setSubmittedApplicationId('');
    setSubmittedConfirmationNumber('');
    setPostSubmitDocs({});
    setFormData({});
    setCurrentStep(0);
  }, [company?.id]);

  const handleOpenPostApplicationTemplate = async (template) => {
    if (!template?.templateId || !company?.id || !submittedApplicationId) {
      showError('Could not open this form yet. Please refresh and try again.');
      return;
    }

    const confirmationNumber = submittedConfirmationNumber || sessionStorage.getItem('lastConfirmationNumber') || '';
    if (!confirmationNumber) {
      showError('Missing confirmation number. Please refresh and try again.');
      return;
    }

    // One document at a time; also guards rapid double-clicks (the backend is
    // additionally idempotent per application+template, so even a race cannot
    // create duplicate signing requests).
    if (openingTemplateId) return;

    const returnPath = sandbox ? '/sandbox/apply' : `/apply/${slug}`;

    try {
      setOpeningTemplateId(template.templateId);
      updatePostSubmitDoc(template.templateId, { status: DOC_STATUS.OPENING, error: null });

      if (isE2ETestMode) {
        const requestId = `e2e-post-app-req-${template.templateId}`;
        setSigningReturnPath(company.id, requestId, returnPath);
        updatePostSubmitDoc(template.templateId, { status: DOC_STATUS.IN_PROGRESS, requestId });
        navigate(`/sign/${company.id}/${requestId}?token=e2e-token&e2eSign=mock`);
        return;
      }

      const createSigningRequest = httpsCallable(functions, 'createPostApplicationSigningRequest', { timeout: 60000 });
      const { data } = await createSigningRequest({
        companyId: company.id,
        applicationId: submittedApplicationId,
        confirmationNumber,
        templateId: template.templateId,
        appBaseUrl: window.location.origin,
      });

      // Idempotent backend: an already-signed document reports completion
      // instead of minting a duplicate request.
      if (data?.alreadyCompleted && data?.requestId) {
        markRequestSigned(company.id, data.requestId);
        updatePostSubmitDoc(template.templateId, {
          status: DOC_STATUS.COMPLETED,
          requestId: data.requestId,
          error: null,
        });
        showSuccess('This document is already completed.');
        return;
      }

      if (!data?.requestId || !data?.accessToken) {
        throw new Error('Could not generate signing link.');
      }

      setSigningReturnPath(company.id, data.requestId, returnPath);
      updatePostSubmitDoc(template.templateId, {
        status: DOC_STATUS.IN_PROGRESS,
        requestId: data.requestId,
      });
      navigate(`/sign/${company.id}/${data.requestId}?token=${data.accessToken}`);
    } catch (error) {
      // Structured diagnostics (ids + code only — never tokens, SSNs, or signatures).
      console.error('[PublicApplyHandler] Post-application e-doc launch failed:', {
        code: error?.code || 'unknown',
        templateId: template.templateId,
        companyId: company.id,
        message: error?.message,
      });
      const friendly = buildPostApplyDocErrorMessage(error);
      updatePostSubmitDoc(template.templateId, { status: DOC_STATUS.ERROR, error: friendly });
      showError(friendly);
    } finally {
      setOpeningTemplateId('');
    }
  };

  if (loading) return <ApplyLoadingScreen />;

  if (error) return <ApplyLinkErrorScreen error={error} />;

  if (isParsingCdl) {
    return <ParsingCdlScreen autoFillStoragePath={autoFillStoragePath} />;
  }

  if (sandbox && sandboxSubmission) {
    return (
      <SandboxActionPanel
        applicationId={sandboxSubmission.applicationId}
        confirmationNumber={sandboxSubmission.confirmationNumber}
        onDeletedRestart={() => {
          setSandboxSubmission(null);
          setCurrentStep(0);
          setFormData({});
          sessionStorage.removeItem('lastConfirmationNumber');
        }}
      />
    );
  }

  // The success screen (with the required-documents checklist) must render
  // before the intake chooser: a restored post-submission session has no
  // intakeMode, and the driver must land back on their checklist, not on a
  // fresh application chooser.
  if (submissionStatus === 'success') {
    return (
      <SubmissionSuccessScreen
        postApplicationTemplates={postApplicationTemplates}
        submittedApplicationId={submittedApplicationId}
        docStates={postSubmitDocs}
        openingTemplateId={openingTemplateId}
        handleOpenPostApplicationTemplate={handleOpenPostApplicationTemplate}
        onGoHome={() => navigate('/')}
        onStartNewApplication={handleStartNewApplication}
        confirmationNumber={submittedConfirmationNumber}
      />
    );
  }

  if (!intakeMode) {
    return (
      <IntakeChooser
        companyName={company.companyName}
        onChooseAutoFill={handleChooseAutoFill}
        onChooseManual={handleChooseManual}
        cdlInputRef={cdlAutoFillInputRef}
        onCdlFileChange={handleCdlAutoFillFileChange}
      />
    );
  }

  // P3-3 FIX: Queued status UI — shown when all direct submit attempts failed but data is queued
  if (submissionStatus === 'queued') return <SubmissionQueuedScreen onGoHome={() => navigate('/')} />;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between font-bold">{company.companyName}</div>
          {sandbox && (
            <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-center">
              Testing mode — applications are stored under tenant <strong>SANDBOX</strong>. Use Super Admin actions after submit to delete or transfer.
            </p>
          )}
        </div>
      </div>
      <div className="max-w-4xl mx-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <Stepper
          step={currentStep}
          formData={formData}
          updateFormData={handleUpdateFormData}
          onNavigate={handleNavigate}
          onPartialSubmit={handlePartialSubmit}
          onFinalSubmit={handleFinalSubmit}
          handleFileUpload={handleFileUpload}
          isUploading={isUploading}
          submissionStatus={submissionStatus}
          customQuestions={customQuestions}
          isSandboxMode={sandbox}
          onMagicFillStep={sandbox ? handleMagicFillStep : undefined}
        />
      </div>

    </div>
  );
}
// END OF FILE
