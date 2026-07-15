import React from 'react';
import { Loader2, AlertCircle, Building2 } from 'lucide-react';
import { RequiredDocumentsChecklist } from './RequiredDocumentsChecklist';
import { DOC_STATUS } from './postApplyDocsStorage';

/**
 * Full-page status screens for the public (guest) application flow.
 * Extracted verbatim from PublicApplyHandler.jsx — markup and behavior unchanged.
 */

export function ApplyLoadingScreen() {
  return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center"><Loader2 className="animate-spin text-blue-600 mb-4" size={48} /><h2 className="text-lg font-semibold text-gray-700">Loading Application...</h2></div>;
}

export function ApplyLinkErrorScreen({ error }) {
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center max-w-md"><AlertCircle size={32} className="text-red-600 mx-auto mb-4" /><h3 className="text-xl font-bold text-gray-900 mb-2">Link Error</h3><p className="text-gray-600">{error}</p></div></div>;
}

export function ParsingCdlScreen({ autoFillStoragePath }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-blue-100 mx-auto flex items-center justify-center mb-4">
          <Loader2 className="animate-spin text-blue-600" size={30} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Reading your CDL...</h2>
        <p className="text-gray-600 mb-3">
          Our AI is extracting your basic details so you can skip typing.
        </p>
        {autoFillStoragePath && (
          <p className="text-xs text-gray-400 break-all">{autoFillStoragePath}</p>
        )}
      </div>
    </div>
  );
}

export function SubmissionSuccessScreen({
  postApplicationTemplates,
  submittedApplicationId,
  docStates,
  openingTemplateId,
  handleOpenPostApplicationTemplate,
  onGoHome,
  onStartNewApplication,
  confirmationNumber,
}) {
  // DL-3: Display the confirmation number so applicants have a reference for follow-up.
  const confirmNum = confirmationNumber || sessionStorage.getItem('lastConfirmationNumber');
  const showChecklist = postApplicationTemplates.length > 0 && submittedApplicationId;
  const requiredTemplates = postApplicationTemplates.filter((t) => t.required !== false);
  const pendingRequired = requiredTemplates.filter(
    (t) => docStates?.[t.templateId]?.status !== DOC_STATUS.COMPLETED
  );
  const hasPendingRequired = showChecklist && pendingRequired.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full border border-green-100">
        <Building2 size={40} className={`${hasPendingRequired ? 'text-blue-600' : 'text-green-600'} mx-auto mb-6`} />
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Application Submitted!</h2>
        <p className="text-gray-600 mb-4">
          {hasPendingRequired
            ? 'Your application has been received. To finish, please complete the required documents below.'
            : 'Your application has been received and a recruiter will contact you soon.'}
        </p>
        {confirmNum && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confirmation Number</p>
            <p className="text-lg font-bold font-mono text-gray-800">{confirmNum}</p>
            <p className="text-xs text-gray-400 mt-1">Save this number for your records.</p>
          </div>
        )}
        {showChecklist && (
          <div className="mb-4">
            <RequiredDocumentsChecklist
              templates={postApplicationTemplates}
              docStates={docStates}
              openingTemplateId={openingTemplateId}
              onOpenTemplate={handleOpenPostApplicationTemplate}
            />
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          <button onClick={onGoHome} className="text-blue-600 hover:underline text-sm font-medium">Go to home</button>
          {onStartNewApplication && (
            <button
              onClick={onStartNewApplication}
              className="text-gray-500 hover:underline text-sm font-medium"
            >
              Start a new application
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// P3-3 FIX: Queued status UI — shown when all direct submit attempts failed but data is queued
export function SubmissionQueuedScreen({ onGoHome }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md border border-amber-100">
        <Building2 size={40} className="text-amber-500 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Application Saved</h2>
        <p className="text-gray-600 mb-4">Your application has been securely saved and will be automatically submitted when your connection is restored.</p>
        <p className="text-sm text-gray-500 mb-6">You can safely close this page. No data will be lost.</p>
        <button onClick={onGoHome} className="text-blue-600 hover:underline text-sm font-medium">Go to home</button>
      </div>
    </div>
  );
}
