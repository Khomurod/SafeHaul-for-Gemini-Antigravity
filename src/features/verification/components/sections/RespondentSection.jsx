import React from 'react';
import { User } from 'lucide-react';
import { SignaturePad } from '@shared/components/signature/SignaturePad';

/** Section 4: Respondent Verification & Signature — extracted verbatim from VerificationPortal.jsx. */
export function RespondentSection({ formData, formErrors, updateField, isE2EVerifyMock }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Section 4: Respondent Verification & Signature
            </h2>
            <p className="text-xs text-gray-500 mb-4">Must be completed by an authorized representative of the previous employer</p>

            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Your Full Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={formData.respondentName}
                               onChange={(e) => updateField('respondentName', e.target.value)}
                               placeholder="e.g., John Smith"
                               className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.respondentName ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                        {formErrors.respondentName && <p className="text-red-500 text-xs mt-1">{formErrors.respondentName}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Your Title / Position <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={formData.respondentTitle}
                               onChange={(e) => updateField('respondentTitle', e.target.value)}
                               placeholder="e.g., Safety Director, HR Manager"
                               className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.respondentTitle ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                        {formErrors.respondentTitle && <p className="text-red-500 text-xs mt-1">{formErrors.respondentTitle}</p>}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input type="tel" value={formData.respondentPhone}
                               onChange={(e) => updateField('respondentPhone', e.target.value)}
                               placeholder="(555) 123-4567"
                               className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.respondentPhone ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                        {formErrors.respondentPhone && <p className="text-red-500 text-xs mt-1">{formErrors.respondentPhone}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Email Address
                        </label>
                        <input type="email" value={formData.respondentEmail}
                               onChange={(e) => updateField('respondentEmail', e.target.value)}
                               placeholder="you@company.com"
                               className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Electronic Signature <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">Draw your signature below. By signing, you certify that the information provided is true and accurate.</p>
                    {isE2EVerifyMock && (
                        <button
                            type="button"
                            onClick={() => updateField('signatureData', 'data:image/png;base64,e2e-signature')}
                            className="mb-2 px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                        >
                            Use Test Signature
                        </button>
                    )}
                    <SignaturePad onSignatureChange={(data) => updateField('signatureData', data)} />
                    {formErrors.signatureData && <p className="text-red-500 text-xs mt-1">{formErrors.signatureData}</p>}
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-600 leading-relaxed">
                        <strong>Certification:</strong> By submitting this form, I certify that I am authorized to provide this
                        employment verification on behalf of the above-referenced company, and that the information provided
                        herein is true, accurate, and complete to the best of my knowledge. I understand that providing false
                        information may result in penalties under federal and state law.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default RespondentSection;
