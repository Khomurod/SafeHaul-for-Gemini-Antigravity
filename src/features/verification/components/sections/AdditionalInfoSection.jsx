import React from 'react';
import { FileText } from 'lucide-react';

/** Section 3: Additional Information — extracted verbatim from VerificationPortal.jsx. */
export function AdditionalInfoSection({ formData, updateField }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Section 3: Additional Information
            </h2>
            <div className="mt-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Comments (Optional)</label>
                <textarea value={formData.additionalComments}
                          onChange={(e) => updateField('additionalComments', e.target.value)}
                          placeholder="Any additional information relevant to this driver's employment or performance..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y" />
            </div>
        </div>
    );
}

export default AdditionalInfoSection;
