import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { RadioGroup } from '../RadioGroup';

/** Section 2: Safety & Compliance (FMCSA required) — extracted verbatim from VerificationPortal.jsx.
 *  Only rendered when formData.wasEmployed is truthy (the parent controls that). */
export function SafetySection({ formData, formErrors, updateField }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-in slide-in-from-top-2">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Section 2: Safety & Compliance
                <span className="text-xs font-normal text-gray-500 ml-1">(FMCSA Required)</span>
            </h2>
            <p className="text-xs text-gray-500 mb-4">This information is required by federal regulation</p>

            <div className="space-y-5">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Was this driver subject to the Federal Motor Carrier Safety Regulations (FMCSRs)? <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">i.e., Did they operate a commercial motor vehicle (CMV) for your company?</p>
                    <RadioGroup
                        name="subjectToFmcsrs"
                        value={formData.subjectToFmcsrs}
                        onChange={(v) => updateField('subjectToFmcsrs', v)}
                        options={[
                            { value: true, label: 'Yes' },
                            { value: false, label: 'No' },
                        ]}
                        error={formErrors.subjectToFmcsrs}
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Was this driver subject to DOT drug & alcohol testing requirements? <span className="text-red-500">*</span>
                    </label>
                    <RadioGroup
                        name="subjectToDotTesting"
                        value={formData.subjectToDotTesting}
                        onChange={(v) => updateField('subjectToDotTesting', v)}
                        options={[
                            { value: true, label: 'Yes' },
                            { value: false, label: 'No' },
                        ]}
                        error={formErrors.subjectToDotTesting}
                    />
                </div>

                {/* Drug/Alcohol Violations (conditional) */}
                {formData.subjectToDotTesting && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4 animate-in slide-in-from-top-2">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Did this driver have any DOT drug or alcohol violations? <span className="text-red-500">*</span>
                            </label>
                            <p className="text-xs text-gray-500 mb-2">Including positive tests, refusals, or other violations per 49 CFR Part 40</p>
                            <RadioGroup
                                name="hadDrugAlcoholViolations"
                                value={formData.hadDrugAlcoholViolations}
                                onChange={(v) => updateField('hadDrugAlcoholViolations', v)}
                                options={[
                                    { value: true, label: 'Yes' },
                                    { value: false, label: 'No' },
                                ]}
                                error={formErrors.hadDrugAlcoholViolations}
                            />
                        </div>

                        {formData.hadDrugAlcoholViolations && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Violation Details <span className="text-red-500">*</span>
                                    </label>
                                    <textarea value={formData.violationDetails}
                                              onChange={(e) => updateField('violationDetails', e.target.value)}
                                              placeholder="Describe the nature of the violation(s), date(s), substance(s) involved..."
                                              rows={3}
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Did the driver complete the return-to-duty process per 49 CFR Part 40, Subpart O?
                                    </label>
                                    <RadioGroup
                                        name="completedReturnToDuty"
                                        value={formData.completedReturnToDuty}
                                        onChange={(v) => updateField('completedReturnToDuty', v)}
                                        options={[
                                            { value: 'yes', label: 'Yes' },
                                            { value: 'no', label: 'No' },
                                            { value: 'in_progress', label: 'In Progress' },
                                        ]}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Accident History */}
                <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Accident History</h3>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Were there any DOT-recordable accidents involving this driver in the last 3 years? <span className="text-red-500">*</span>
                        </label>
                        <p className="text-xs text-gray-500 mb-2">Per 49 CFR §390.5: accidents involving fatality, bodily injury requiring medical treatment away from the scene, or disabling damage to any vehicle requiring tow-away</p>
                        <RadioGroup
                            name="hadAccidents"
                            value={formData.hadAccidents}
                            onChange={(v) => updateField('hadAccidents', v)}
                            options={[
                                { value: true, label: 'Yes' },
                                { value: false, label: 'No' },
                            ]}
                            error={formErrors.hadAccidents}
                        />
                    </div>

                    {formData.hadAccidents && (
                        <div className="mt-4 animate-in slide-in-from-top-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Accident Details</label>
                            <textarea value={formData.accidentDetails}
                                      onChange={(e) => updateField('accidentDetails', e.target.value)}
                                      placeholder="For each accident, provide: Date, Location, Nature of accident, Fatalities (Y/N), Injuries (Y/N), Hazmat spill (Y/N)"
                                      rows={3}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SafetySection;
