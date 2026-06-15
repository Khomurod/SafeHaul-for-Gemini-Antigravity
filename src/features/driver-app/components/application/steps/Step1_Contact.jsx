import React, { useEffect, useMemo, useCallback } from 'react';
import InputField from '@shared/components/form/InputField';
import { useFieldValidation } from '@shared/hooks/useFieldValidation';
import { required, email as emailRule, phone as phoneRule } from '@shared/utils/fieldValidators';
import DateTripletField from '@shared/components/form/DateTripletField';
import MonthYearField from '@shared/components/form/MonthYearField';
import { ageFromIsoDate } from '@shared/utils/dateFormHelpers';
import RadioGroup from '@shared/components/form/RadioGroup';
import DynamicRow from '@shared/components/form/DynamicRow';
import { useUtils } from '@shared/hooks/useUtils';
import { useData } from '@/context/DataContext';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@shared/components/feedback';

// Map validator field names to their input element ids (for focus-on-error).
const FIELD_ID_BY_NAME = {
    firstName: 'first-name',
    lastName: 'last-name',
    phone: 'phone',
    email: 'email',
    street: 'street',
    city: 'city',
    zip: 'zip',
};

const Step1_Contact = ({ formData, updateFormData, onNavigate, onPartialSubmit }) => {
    const ty = new Date().getFullYear();
    const { states } = useUtils();
    const { currentCompanyProfile } = useData();
    const { showError } = useToast();
    const currentCompany = currentCompanyProfile;

    // --- Configuration Helper ---
    const getConfig = (fieldId, defaultReq = true) => {
        const config = currentCompany?.applicationConfig?.[fieldId];
        return {
            hidden: config?.hidden || false,
            required: config !== undefined ? config.required : defaultReq
        };
    };

    const ssnConfig = getConfig('ssn', true);
    const dobConfig = getConfig('dob', true);
    const historyConfig = getConfig('addressHistory', true);
    const referralConfig = getConfig('referralSource', false);

    // --- Logic ---
    const residenceThreeYears = formData['residence-3-years'];
    // Only show previous address if user said "No" AND history is not hidden globally
    const knownByOtherName = formData['known-by-other-name'] === 'yes';

    useEffect(() => {
        if (formData['known-by-other-name'] === undefined) {
            updateFormData('known-by-other-name', 'no');
        }
    }, [formData, updateFormData]);

    const yesNoOptions = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }];

    // C5: per-field on-blur validation. Rules reuse the canonical validation.js
    // predicates via the shared factories, so inline and submit-time validation
    // stay in lockstep.
    const fieldValidators = useMemo(() => ({
        firstName: required('First Name'),
        lastName: required('Last Name'),
        phone: phoneRule('Phone'),
        email: emailRule('Email'),
        street: required('Address 1'),
        city: required('City'),
        zip: required('ZIP Code'),
    }), []);
    const { errors, handleBlur, revalidate, validateAll } = useFieldValidation(fieldValidators);

    // Update value, then re-validate the field if it has already been touched
    // (revalidate-on-change-once-touched). Untouched fields stay quiet.
    const handleChange = useCallback((name, value) => {
        updateFormData(name, value);
        revalidate(name, value, { ...formData, [name]: value });
    }, [updateFormData, revalidate, formData]);

    const handleFieldBlur = useCallback((name, value) => {
        handleBlur(name, value, formData);
    }, [handleBlur, formData]);

    const handleOtherNameToggle = (e) => {
        updateFormData('known-by-other-name', e.target.checked ? 'yes' : 'no');
    };

    const handleStateChange = (name, value) => {
        updateFormData(name, value);
    };

    const validateStep = () => {
        const requiredFields = {
            firstName: 'First Name',
            lastName: 'Last Name',
            phone: 'Phone',
            email: 'Email',
            street: 'Address 1',
            city: 'City',
            state: 'State',
            zip: 'ZIP Code'
        };

        // 1. Check Not Empty
        for (const [field, label] of Object.entries(requiredFields)) {
            if (!formData[field] || formData[field].trim() === '') {
                showError(`${label} is required.`);
                return false;
            }
        }

        // 2. Strict Email Regex
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(formData.email)) {
            showError("Please enter a valid email address.");
            return false;
        }

        // 3. Phone (at least 10 digits)
        const digitsOnly = formData.phone.replace(/\D/g, '');
        if (digitsOnly.length < 10) {
            showError("Phone number must have at least 10 digits.");
            return false;
        }

        if (!dobConfig.hidden && dobConfig.required) {
            if (!formData.dob || String(formData.dob).trim() === '') {
                showError('Date of birth is required.');
                return false;
            }
            const age = ageFromIsoDate(formData.dob);
            if (age === null) {
                showError('Please enter a valid date of birth.');
                return false;
            }
            if (age < 21) {
                showError('You must be at least 21 years old for interstate CMV positions.');
                return false;
            }
        } else if (!dobConfig.hidden && formData.dob) {
            const age = ageFromIsoDate(formData.dob);
            if (age !== null && age < 21) {
                showError('Date of birth indicates under 21 — interstate CMV roles typically require age 21+. Please verify.');
                return false;
            }
        }

        return true;
    };

    const handleContinue = () => {
        // C5: surface per-field inline errors for the basic fields, then fall
        // through to the authoritative validateStep() gate (which also enforces
        // DOB/age rules and shows the summary toast).
        const { firstErrorField } = validateAll(formData);
        if (firstErrorField) {
            document.getElementById(FIELD_ID_BY_NAME[firstErrorField] || firstErrorField)?.focus?.();
        }
        if (!validateStep()) return;

        const form = document.getElementById('driver-form');
        if (form) {
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
        }
        onNavigate('next');
    };

    // --- Soft Validation Helpers ---
    const hasPhoneWarning = (val) => val && val.length > 5 && !/^\D?(\d{3})\D?\D?(\d{3})\D?(\d{4})$/.test(val);
    const hasEmailWarning = (val) => val && val.length > 5 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    const hasSSNWarning = (val) => val && val.length > 7 && !/^\d{3}-?\d{2}-?\d{4}$/.test(val);
    const hasZipWarning = (val) => val && val.length > 0 && !/^\d{5}(-\d{4})?$/.test(val);

    const ValidationWarning = ({ message }) => (
        <div className="flex items-center gap-1.5 mt-1 text-amber-600 text-xs font-medium animate-in fade-in slide-in-from-top-1">
            <AlertCircle size={12} />
            <span>{message}</span>
        </div>
    );

    return (
        <div id="page-1" className="form-step space-y-6">

            {/* --- Personal Details --- */}
            <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4">
                <legend className="text-lg font-semibold text-gray-800 px-2">Step 1 of 9: Personal Information</legend>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <InputField label="First Name" id="first-name" name="firstName" required={true} value={formData.firstName} onChange={handleChange} onBlur={handleFieldBlur} error={errors.firstName} placeholder="John" />
                    <InputField label="Middle Name" id="middle-name" name="middleName" value={formData.middleName} onChange={updateFormData} placeholder="M" />
                    <InputField label="Last Name" id="last-name" name="lastName" required={true} value={formData.lastName} onChange={handleChange} onBlur={handleFieldBlur} error={errors.lastName} placeholder="Doe" />
                    <InputField label="Suffix" id="suffix" name="suffix" value={formData.suffix} onChange={updateFormData} placeholder="Jr." />
                </div>

                <div className="flex items-center pt-2 border-t border-gray-200">
                    <input
                        id="known-by-other-name"
                        name="known-by-other-name"
                        type="checkbox"
                        checked={knownByOtherName}
                        onChange={handleOtherNameToggle}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="known-by-other-name" className="ml-2 block text-sm font-medium text-gray-800">Known by other name(s)?</label>
                </div>

                {knownByOtherName && (
                    <div id="other-name-field" className="pt-2">
                        <InputField label="Other Name(s)" id="other-name" name="otherName" value={formData.otherName} onChange={updateFormData} placeholder="e.g., Johnny" />
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* SSN Field - Configurable */}
                    {!ssnConfig.hidden && (
                        <div>
                            <InputField
                                label="Social Security Number (SSN)"
                                id="ssn"
                                name="ssn"
                                type="password"
                                required={ssnConfig.required}
                                value={formData.ssn}
                                onChange={updateFormData}
                                placeholder="XXX-XX-XXXX"
                                autoComplete="off"
                            />
                            {hasSSNWarning(formData.ssn) && <ValidationWarning message="Format usually matches XXX-XX-XXXX" />}
                        </div>
                    )}

                    {/* DOB Field - Configurable */}
                    {!dobConfig.hidden && (
                        <DateTripletField
                            label="Date of Birth"
                            idPrefix="dob"
                            name="dob"
                            required={dobConfig.required}
                            value={formData.dob}
                            onChange={updateFormData}
                            maxToday={true}
                            minYear={1920}
                            helpText="Select month, day, and year — easier than scrolling a calendar."
                        />
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                    <div>
                        <InputField label="Phone" id="phone" name="phone" type="tel" required={true} value={formData.phone} onChange={handleChange} onBlur={handleFieldBlur} error={errors.phone} placeholder="(555) 555-5555" />
                        {!errors.phone && hasPhoneWarning(formData.phone) && <ValidationWarning message="Please double-check phone format." />}
                    </div>
                    <div>
                        <InputField label="Email" id="email" name="email" type="email" required={true} value={formData.email} onChange={handleChange} onBlur={handleFieldBlur} error={errors.email} placeholder="you@example.com" />
                        {!errors.email && hasEmailWarning(formData.email) && <ValidationWarning message="Email address looks incomplete." />}
                    </div>
                </div>

                <RadioGroup
                    label="Can we send you SMS messages?"
                    name="sms-consent"
                    options={yesNoOptions}
                    value={formData['sms-consent']}
                    onChange={updateFormData}
                    horizontal={true}
                />

                {/* Referral Source - Configurable */}
                {!referralConfig.hidden && (
                    <div className="pt-4 border-t border-gray-200">
                        <InputField
                            label="How did you hear about us?"
                            id="referral-source"
                            name="referralSource"
                            required={referralConfig.required}
                            value={formData.referralSource}
                            onChange={updateFormData}
                            placeholder="e.g. Facebook, Indeed, Friend..."
                        />
                    </div>
                )}
            </fieldset>

            {/* --- Current Address --- */}
            <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4 mt-6">
                <legend className="text-lg font-semibold text-gray-800 px-2">Current Address</legend>
                <div>
                    <InputField label="Address 1" id="street" name="street" required={true} value={formData.street} onChange={handleChange} onBlur={handleFieldBlur} error={errors.street} placeholder="123 Main St" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <InputField label="City" id="city" name="city" required={true} value={formData.city} onChange={handleChange} onBlur={handleFieldBlur} error={errors.city} placeholder="Anytown" />
                    <div>
                        <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                        <select
                            id="state"
                            name="state"
                            required
                            value={formData.state || ""}
                            onChange={(e) => handleStateChange(e.target.name, e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
                        >
                            <option value="" disabled>Select State</option>
                            {states.map(state => <option key={state} value={state}>{state}</option>)}
                        </select>
                    </div>
                    <div>
                        <InputField label="ZIP Code" id="zip" name="zip" required={true} value={formData.zip} onChange={handleChange} onBlur={handleFieldBlur} error={errors.zip} placeholder="12345" />
                        {!errors.zip && hasZipWarning(formData.zip) && <ValidationWarning message="Standard ZIP is 5 digits." />}
                    </div>
                </div>

                {/* Only show "3 Years" question if history is not hidden */}
                {!historyConfig.hidden && (
                    <RadioGroup
                        label="Lived at this residence for 3 years or more?"
                        name="residence-3-years"
                        options={yesNoOptions}
                        value={residenceThreeYears}
                        onChange={updateFormData}
                        horizontal={true}
                        required={historyConfig.required}
                    />
                )}
            </fieldset>

            {/* --- Previous Address History (Past 3 Years) --- */}
            <div className="mt-6 animate-in fade-in">
                <DynamicRow
                    listKey="previousAddresses"
                    title="Previous Addresses (Past 3 Years)"
                    formData={formData}
                    updateFormData={updateFormData}
                    initialItemState={{ street: '', city: '', state: '', zip: '', startDate: '', endDate: '' }}
                    addButtonLabel="Add Previous Address"
                    renderRow={(index, item, handleChange) => (
                        <div className="space-y-4">
                            <InputField
                                label="Address"
                                id={`prev-street-${index}`}
                                name="street"
                                value={item.street}
                                onChange={(n, v) => handleChange('street', v)}
                                placeholder="123 Old St"
                                required={true}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <InputField
                                    label="City"
                                    id={`prev-city-${index}`}
                                    name="city"
                                    value={item.city}
                                    onChange={(n, v) => handleChange('city', v)}
                                    placeholder="City"
                                    required={true}
                                />
                                <div>
                                    <label htmlFor={`prev-state-${index}`} className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                                    <select
                                        id={`prev-state-${index}`}
                                        name="state"
                                        value={item.state || ""}
                                        onChange={(e) => handleChange('state', e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
                                        required
                                    >
                                        <option value="" disabled>Select State</option>
                                        {states.map(state => <option key={state} value={state}>{state}</option>)}
                                    </select>
                                </div>
                                <InputField
                                    label="ZIP Code"
                                    id={`prev-zip-${index}`}
                                    name="zip"
                                    value={item.zip}
                                    onChange={(n, v) => handleChange('zip', v)}
                                    placeholder="Zip"
                                    required={true}
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <MonthYearField
                                    label="From (month / year)"
                                    idPrefix={`prev-start-${index}`}
                                    name="startDate"
                                    value={item.startDate}
                                    onChange={(n, v) => handleChange('startDate', v)}
                                    required={true}
                                    maxToday={true}
                                    minYear={ty - 80}
                                    helpText="Same easy dropdowns as employment gaps — no calendar picker."
                                />
                                <MonthYearField
                                    label="To (month / year)"
                                    idPrefix={`prev-end-${index}`}
                                    name="endDate"
                                    value={item.endDate}
                                    onChange={(n, v) => handleChange('endDate', v)}
                                    required={true}
                                    maxToday={true}
                                    minYear={ty - 80}
                                />
                            </div>
                        </div>
                    )}
                />
            </div>

            {/* --- Buttons --- */}
            <div className="flex flex-col sm:flex-row sm:justify-end pt-6 space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                    type="button"
                    name="submit-partial"
                    onClick={onPartialSubmit}
                    className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition duration-200"
                >
                    Save as Draft
                </button>
                <button
                    type="button"
                    onClick={handleContinue}
                    className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default Step1_Contact;