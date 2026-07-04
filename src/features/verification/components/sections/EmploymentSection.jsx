import React from 'react';
import { Briefcase } from 'lucide-react';
import { RadioGroup } from '../RadioGroup';

/** Section 1: Employment Confirmation — extracted verbatim from VerificationPortal.jsx. */
export function EmploymentSection({ formData, formErrors, updateField }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                Section 1: Employment Confirmation
            </h2>
            <p className="text-xs text-gray-500 mb-4">Confirm the applicant's employment details</p>

            <div className="space-y-5">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Was this individual employed by your company? <span className="text-red-500">*</span>
                    </label>
                    <RadioGroup
                        name="wasEmployed"
                        value={formData.wasEmployed}
                        onChange={(v) => updateField('wasEmployed', v)}
                        options={[
                            { value: true, label: 'Yes' },
                            { value: false, label: 'No / No Record Found' },
                        ]}
                        error={formErrors.wasEmployed}
                    />
                </div>

                {formData.wasEmployed && (
                    <div className="space-y-4 pl-2 border-l-2 border-blue-200 ml-2 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Confirmed Start Date <span className="text-red-500">*</span>
                                </label>
                                <input type="date" value={formData.confirmedStartDate}
                                       onChange={(e) => updateField('confirmedStartDate', e.target.value)}
                                       className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.confirmedStartDate ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                {formErrors.confirmedStartDate && <p className="text-red-500 text-xs mt-1">{formErrors.confirmedStartDate}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Confirmed End Date <span className="text-red-500">*</span>
                                </label>
                                <input type="date" value={formData.confirmedEndDate}
                                       onChange={(e) => updateField('confirmedEndDate', e.target.value)}
                                       className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.confirmedEndDate ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                {formErrors.confirmedEndDate && <p className="text-red-500 text-xs mt-1">{formErrors.confirmedEndDate}</p>}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Position / Title Held <span className="text-red-500">*</span>
                            </label>
                            <input type="text" value={formData.positionHeld}
                                   onChange={(e) => updateField('positionHeld', e.target.value)}
                                   placeholder="e.g., OTR Driver, Local Delivery Driver"
                                   className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.positionHeld ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                            {formErrors.positionHeld && <p className="text-red-500 text-xs mt-1">{formErrors.positionHeld}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Reason for Leaving <span className="text-red-500">*</span>
                            </label>
                            <select value={formData.reasonForLeaving}
                                    onChange={(e) => updateField('reasonForLeaving', e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formErrors.reasonForLeaving ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                                <option value="">Select...</option>
                                <option value="Voluntary Resignation">Voluntary Resignation</option>
                                <option value="Terminated">Terminated</option>
                                <option value="Laid Off">Laid Off</option>
                                <option value="Contract Ended">Contract Ended</option>
                                <option value="Mutual Agreement">Mutual Agreement</option>
                                <option value="Other">Other</option>
                            </select>
                            {formErrors.reasonForLeaving && <p className="text-red-500 text-xs mt-1">{formErrors.reasonForLeaving}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Eligible for Rehire?</label>
                            <RadioGroup
                                name="eligibleForRehire"
                                value={formData.eligibleForRehire}
                                onChange={(v) => updateField('eligibleForRehire', v)}
                                options={[
                                    { value: true, label: 'Yes' },
                                    { value: false, label: 'No' },
                                ]}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default EmploymentSection;
