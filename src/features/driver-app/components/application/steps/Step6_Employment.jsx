import React from 'react';
import InputField from '@shared/components/form/InputField';
import RadioGroup from '@shared/components/form/RadioGroup';
import DynamicRow from '@shared/components/form/DynamicRow';
import DateTripletField from '@shared/components/form/DateTripletField';
import MonthYearField from '@shared/components/form/MonthYearField';
import { useUtils } from '@shared/hooks/useUtils';
import { useData } from '@/context/DataContext';
import { YES_NO_OPTIONS, MILITARY_BRANCH_OPTIONS } from '@/config/form-options';
import { useToast } from '@shared/components/feedback';
import { employerRowHasVerifierContact } from '@shared/utils/employmentApplicationHelpers';
import EmployerNameAutocomplete from './components/EmployerNameAutocomplete';

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Step6_Employment = ({ formData, updateFormData, onNavigate }) => {
    const { showError } = useToast();
    const ty = new Date().getFullYear();
    const { states } = useUtils();
    const { currentCompanyProfile } = useData();
    const currentCompany = currentCompanyProfile;
    const yesNoOptions = YES_NO_OPTIONS;

    // --- Configuration ---
    const getConfig = (fieldId, defaultReq = true) => {
        const config = currentCompany?.applicationConfig?.[fieldId];
        return {
            hidden: config?.hidden || false,
            required: config !== undefined ? config.required : defaultReq
        };
    };

    const empHistoryConfig = getConfig('employmentHistory', true);

    const initialEmployer = {
        companyName: '',
        dotNumber: '',
        address: '',
        city: '',
        state: '',
        phone: '',
        companyEmail: '',
        position: '',
        startDate: '',
        endDate: '',
        reasonForLeaving: '',
        supervisorName: '',
        supervisorPhone: '',
        supervisorEmail: '',
        mayContact: '',
    };
    const initialSchool = { name: '', startDate: '', endDate: '', location: '' };
    const initialUnemployment = { startDate: '', endDate: '', details: '' };
    const initialMilitary = { branch: '', start: '', end: '', rank: '', heavyEq: 'no', honorable: 'yes', explanation: '' };

    const handleContinue = () => {
        const employers = Array.isArray(formData.employers) ? formData.employers : [];
        if (!empHistoryConfig.hidden && employers.length > 0) {
            for (let i = 0; i < employers.length; i++) {
                const row = employers[i];
                const ce = String(row.companyEmail || '').trim();
                const se = String(row.supervisorEmail || '').trim();
                if (ce && !EMAIL_OK.test(ce)) {
                    showError(`Employer ${i + 1}: please enter a valid company email, or leave it blank.`);
                    return;
                }
                if (se && !EMAIL_OK.test(se)) {
                    showError(`Employer ${i + 1}: please enter a valid supervisor email, or leave it blank.`);
                    return;
                }
                if (empHistoryConfig.required && !employerRowHasVerifierContact(row)) {
                    showError(
                        `Employer ${i + 1}: add at least one contact method — company phone (10 digits), company email, supervisor phone, or supervisor email — so your carrier can verify employment.`
                    );
                    return;
                }
            }
        }

        const form = document.getElementById('driver-form');
        if (form) {
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
        }
        onNavigate('next');
    };

    const renderEmployerRow = (index, item, handleChange) => (
        <div key={index} className="space-y-3">
            <EmployerNameAutocomplete
                id={'emp-name-' + index}
                label="Company Name"
                value={item.companyName}
                onChange={handleChange}
                required={empHistoryConfig.required}
                statesAllowlist={states}
            />
            <InputField
                label="USDOT Number"
                id={'emp-dot-' + index}
                name="dotNumber"
                value={item.dotNumber}
                onChange={handleChange}
                placeholder="Optional — filled when you pick a carrier from search"
            />
            <InputField label="Street Address" id={'emp-street-' + index} name="address" value={item.address} onChange={handleChange} required={empHistoryConfig.required} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputField label="City" id={'emp-city-' + index} name="city" value={item.city} onChange={handleChange} required={empHistoryConfig.required} />
                <div>
                    <label htmlFor={'emp-state-' + index} className="block text-sm font-medium text-gray-700 mb-1">State {empHistoryConfig.required && <span className="text-red-500">*</span>}</label>
                    <select id={'emp-state-' + index} name="state" required={empHistoryConfig.required} value={item.state || ""} onChange={(e) => handleChange(e.target.name, e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                        <option value="" disabled>Select State</option>
                        {states.map(state => <option key={state} value={state}>{state}</option>)}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Company Phone" id={'emp-phone-' + index} name="phone" type="tel" value={item.phone} onChange={handleChange} placeholder="(555) 555-5555" />
                <InputField label="Company Email" id={'emp-co-email-' + index} name="companyEmail" type="email" value={item.companyEmail} onChange={handleChange} placeholder="hr@company.com" />
            </div>
            <p className="text-xs text-gray-500">
                Provide at least one way to reach someone who can verify this job: company phone (10 digits), company email, or supervisor phone/email below.
                {empHistoryConfig.required && <span className="text-amber-700 font-medium"> Required when employment history is on.</span>}
            </p>
            <InputField label="Position Held" id={'emp-position-' + index} name="position" value={item.position} onChange={handleChange} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DateTripletField
                    label="Start Date"
                    idPrefix={'emp-start-' + index}
                    name="startDate"
                    value={item.startDate}
                    onChange={handleChange}
                    required={empHistoryConfig.required}
                    maxToday={true}
                    minYear={ty - 40}
                    helpText="Month / Day / Year."
                />
                <DateTripletField
                    label="End Date"
                    idPrefix={'emp-end-' + index}
                    name="endDate"
                    value={item.endDate}
                    onChange={handleChange}
                    required={empHistoryConfig.required}
                    maxToday={true}
                    minYear={ty - 40}
                    helpText="Month / Day / Year."
                />
            </div>
            <InputField label="Reason for Leaving" id={'emp-reason-' + index} name="reasonForLeaving" value={item.reasonForLeaving} onChange={handleChange} />
            <InputField label="Supervisor Name" id={'emp-supervisor-' + index} name="supervisorName" value={item.supervisorName} onChange={handleChange} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Supervisor Phone" id={'emp-sup-phone-' + index} name="supervisorPhone" type="tel" value={item.supervisorPhone} onChange={handleChange} placeholder="Direct line or mobile" />
                <InputField label="Supervisor Email" id={'emp-sup-email-' + index} name="supervisorEmail" type="email" value={item.supervisorEmail} onChange={handleChange} placeholder="supervisor@company.com" />
            </div>
            <RadioGroup
                label="May we contact this employer?"
                name="mayContact"
                options={yesNoOptions}
                value={item.mayContact}
                onChange={(name, value) => handleChange(name, value)}
            />
        </div>
    );

    const renderSchoolRow = (index, item, handleChange) => (
        <div key={index} className="space-y-3">
            <InputField label="School Name" id={'school-name-' + index} name="name" value={item.name} onChange={handleChange} required={true} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DateTripletField
                    label="Start Date"
                    idPrefix={'school-start-' + index}
                    name="startDate"
                    value={item.startDate}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 40}
                    helpText="Month / Day / Year."
                />
                <DateTripletField
                    label="End Date"
                    idPrefix={'school-end-' + index}
                    name="endDate"
                    value={item.endDate}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 40}
                    helpText="Month / Day / Year."
                />
            </div>
            <InputField label="Location (City, State)" id={'school-location-' + index} name="location" value={item.location} onChange={handleChange} />
        </div>
    );

    const renderUnemploymentRow = (index, item, handleChange) => (
        <div key={index} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MonthYearField
                    label="Gap Start (month / year)"
                    idPrefix={'unemp-start-' + index}
                    name="startDate"
                    value={item.startDate}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 40}
                    helpText="Easier than typing — stored securely like other dates."
                />
                <MonthYearField
                    label="Gap End (month / year)"
                    idPrefix={'unemp-end-' + index}
                    name="endDate"
                    value={item.endDate}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 40}
                />
            </div>
            <div className="space-y-2">
                <label htmlFor={'unemp-details-' + index} className="block text-sm font-medium text-gray-700 mb-1">Details related to unemployment period</label>
                <textarea id={'unemp-details-' + index} name="details" rows="3" value={item.details || ""} onChange={(e) => handleChange(e.target.name, e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
            </div>
        </div>
    );

    const renderMilitaryRow = (index, item, handleChange) => (
        <div key={index} className="space-y-3">
            <RadioGroup
                label="Branch of Service"
                name="branch"
                options={MILITARY_BRANCH_OPTIONS}
                value={item.branch}
                onChange={(name, value) => handleChange(name, value)}
                required={true}
                horizontal={false}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MonthYearField
                    label="Service Start (month / year)"
                    idPrefix={'mil-start-' + index}
                    name="start"
                    value={item.start}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 50}
                />
                <MonthYearField
                    label="Service End (month / year)"
                    idPrefix={'mil-end-' + index}
                    name="end"
                    value={item.end}
                    onChange={handleChange}
                    required={true}
                    maxToday={true}
                    minYear={ty - 50}
                />
            </div>
            <InputField label="Rank of Discharge" id={'mil-rank-' + index} name="rank" value={item.rank} onChange={handleChange} required={true} />
            <RadioGroup
                label="Did you operate heavy equipment/machinery?"
                name="heavyEq"
                options={yesNoOptions}
                value={item.heavyEq}
                onChange={(name, value) => handleChange(name, value)}
            />
            <RadioGroup
                label="Did you receive an honorable discharge?"
                name="honorable"
                options={yesNoOptions}
                value={item.honorable}
                onChange={(name, value) => handleChange(name, value)}
            />
            <div className="space-y-2">
                <label htmlFor={'mil-explain-' + index} className="block text-sm font-medium text-gray-700 mb-1">Please explain</label>
                <textarea id={'mil-explain-' + index} name="explanation" rows="3" value={item.explanation || ""} onChange={(e) => handleChange(e.target.name, e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
            </div>
        </div>
    );

    return (
        <div id="page-6" className="form-step space-y-6">
            <h3 className="text-xl font-semibold text-gray-800">Step 6 of 9: Employment History</h3>
            <div className="text-sm text-gray-600 space-y-2">
                <p>
                    <strong>Application (49 CFR 391.21):</strong> provide a complete employment history for the <strong>past 10 years</strong> — all employers (driving and non-driving),
                    unemployment gaps of 30+ days, military service, and driving schools. Incomplete history may delay hiring.
                </p>
                <p>
                    <strong>Verification (49 CFR 391.23):</strong> carriers typically contact prior employers for the <strong>previous 3 years</strong> for safety verification.
                    That is separate from this longer application timeline — list the full 10 years here either way.
                </p>
            </div>

            {/* Previous Employers - Configurable */}
            {!empHistoryConfig.hidden && (
                <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4 mt-6">
                    <legend className="text-lg font-semibold text-gray-800 px-2">Previous Employers</legend>
                    <DynamicRow
                        listKey="employers"
                        formData={formData}
                        updateFormData={updateFormData}
                        renderRow={renderEmployerRow}
                        initialItemState={initialEmployer}
                        addButtonLabel="+ Add Employer"
                    />
                </fieldset>
            )}

            <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4 mt-6">
                <legend className="text-lg font-semibold text-gray-800 px-2">Employment Gaps</legend>
                <p className="text-sm text-gray-600">Please explain any gaps in employment of 30 days or more.</p>
                <DynamicRow
                    listKey="unemployment"
                    formData={formData}
                    updateFormData={updateFormData}
                    renderRow={renderUnemploymentRow}
                    initialItemState={initialUnemployment}
                    addButtonLabel="+ Add Employment Gap"
                />
            </fieldset>

            <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4 mt-6">
                <legend className="text-lg font-semibold text-gray-800 px-2">Driving Schools</legend>
                <DynamicRow
                    listKey="schools"
                    formData={formData}
                    updateFormData={updateFormData}
                    renderRow={renderSchoolRow}
                    initialItemState={initialSchool}
                    addButtonLabel="+ Add Driving School"
                />
            </fieldset>

            <fieldset className="border border-gray-300 rounded-lg p-4 space-y-4 mt-6">
                <legend className="text-lg font-semibold text-gray-800 px-2">Military Service</legend>
                <DynamicRow
                    listKey="military"
                    formData={formData}
                    updateFormData={updateFormData}
                    renderRow={renderMilitaryRow}
                    initialItemState={initialMilitary}
                    addButtonLabel="+ Add Military Service"
                />
            </fieldset>

            <div className="flex justify-between pt-6">
                <button
                    type="button"
                    onClick={() => onNavigate('back')}
                    className="w-auto px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition duration-200"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={handleContinue}
                    className="w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default Step6_Employment;