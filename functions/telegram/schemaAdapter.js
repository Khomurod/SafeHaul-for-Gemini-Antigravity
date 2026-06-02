const { db } = require('../firebaseAdmin');
const { getFieldConfig } = require('../shared/buildApplicationDoc');

const YES_NO_OPTIONS = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
];

const LICENSE_CLASS_OPTIONS = [
    { label: 'Class A', value: 'Class A' },
    { label: 'Class B', value: 'Class B' },
    { label: 'Class C', value: 'Class C' },
    { label: 'Class D', value: 'Class D' },
    { label: 'Non-CDL', value: 'Non-CDL' },
];

const STATE_OPTIONS = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
].map((state) => ({ label: state, value: state }));

const MVP_FIELD_KEYS = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'street',
    'city',
    'state',
    'zip',
    'cdlState',
    'cdlClass',
    'cdlNumber',
    'cdlExpiration',
    'has-violations',
    'has-accidents',
    'military-service',
];

const FALLBACK_FIELDS = [
    { key: 'firstName', label: 'First name', type: 'text', required: true },
    { key: 'lastName', label: 'Last name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'tel', required: true },
    { key: 'street', label: 'Street address', type: 'text', required: true },
    { key: 'city', label: 'City', type: 'text', required: true },
    { key: 'state', label: 'State', type: 'select', required: true, options: STATE_OPTIONS },
    { key: 'zip', label: 'ZIP code', type: 'text', required: true },
    { key: 'cdlState', label: 'CDL state', type: 'select', required: true, options: STATE_OPTIONS },
    { key: 'cdlClass', label: 'CDL class', type: 'radio', required: true, options: LICENSE_CLASS_OPTIONS },
    { key: 'cdlNumber', label: 'CDL number', type: 'text', required: true },
    { key: 'cdlExpiration', label: 'CDL expiration date (YYYY-MM-DD)', type: 'date', required: true },
    { key: 'has-violations', label: 'Any moving violations in the past 3 years?', type: 'radio', required: true, options: YES_NO_OPTIONS },
    { key: 'has-accidents', label: 'Any accidents in the past 3 years?', type: 'radio', required: true, options: YES_NO_OPTIONS },
    { key: 'military-service', label: 'Have you served in the military?', type: 'radio', required: false, options: YES_NO_OPTIONS },
];

function getMergedSchema(globalSchema, companyOverrides = {}) {
    if (!globalSchema?.sections) {
        return { version: 'fallback', sections: [], fields: FALLBACK_FIELDS };
    }

    const hiddenFields = new Set(companyOverrides.hiddenFields || []);
    const fieldOverrides = companyOverrides.fieldOverrides || {};
    const additionalQuestions = companyOverrides.additionalQuestions || [];
    const mergedSections = globalSchema.sections.map((section) => {
        const visibleFields = (section.fields || []).filter((field) => {
            if (field.dotRequired) return true;
            if (field.canCompanyHide && hiddenFields.has(field.key)) return false;
            return true;
        });
        const modifiedFields = visibleFields.map((field) => {
            const override = fieldOverrides[field.key];
            if (!override || !field.canCompanyModify) return field;
            return {
                ...field,
                label: override.label || field.label,
                helpText: override.helpText || field.helpText,
                placeholder: override.placeholder || field.placeholder,
            };
        });
        return { ...section, fields: modifiedFields };
    });

    if (additionalQuestions.length > 0) {
        mergedSections.push({
            id: 'companyCustomQuestions',
            title: 'Additional Questions',
            stepNumber: 8,
            isCustom: true,
            fields: additionalQuestions.map((q, idx) => ({
                ...q,
                key: q.key || q.id || `custom-${idx}`,
                isCustom: true,
            })),
        });
    }

    return {
        version: globalSchema.version,
        sections: mergedSections,
        fields: mergedSections.flatMap((section) => (
            (section.fields || []).map((field) => ({
                ...field,
                sectionId: section.id,
                sectionTitle: section.title,
                stepNumber: section.stepNumber,
            }))
        )),
    };
}

function withDefaultOptions(field) {
    if (field.options?.length) return field;
    if (field.key === 'state' || field.key === 'cdlState') return { ...field, options: STATE_OPTIONS };
    if (field.key === 'cdlClass') return { ...field, options: LICENSE_CLASS_OPTIONS };
    if (field.type === 'radio' || field.key.startsWith('has-') || field.key === 'military-service') {
        return { ...field, options: YES_NO_OPTIONS };
    }
    return field;
}

function isConditionallyVisible(field, formData = {}) {
    if (!field.dependsOn) return true;
    return formData[field.dependsOn] === field.showWhen;
}

function buildUploadFields(applicationConfig = {}) {
    const fields = [];
    const cdlUploadConfig = getFieldConfig(applicationConfig, 'cdlUpload', true);
    const medCardConfig = getFieldConfig(applicationConfig, 'medCardUpload', true);
    if (!cdlUploadConfig.hidden && cdlUploadConfig.required) {
        fields.push({ key: 'cdl-front', label: 'CDL front photo or document', type: 'file', required: true });
        fields.push({ key: 'cdl-back', label: 'CDL back photo or document', type: 'file', required: true });
    }
    if (!medCardConfig.hidden && medCardConfig.required) {
        fields.push({ key: 'medical-card-upload', label: 'Medical card photo or document', type: 'file', required: true });
    }
    return fields;
}

function buildChatFields(mergedSchema, applicationConfig = {}) {
    const fieldsByKey = new Map();
    for (const field of mergedSchema.fields || []) {
        if (!field?.key || !MVP_FIELD_KEYS.includes(field.key)) continue;
        fieldsByKey.set(field.key, withDefaultOptions(field));
    }
    for (const fallback of FALLBACK_FIELDS) {
        if (!fieldsByKey.has(fallback.key)) fieldsByKey.set(fallback.key, fallback);
    }

    const ordered = MVP_FIELD_KEYS
        .map((key) => fieldsByKey.get(key))
        .filter((field) => field && isConditionallyVisible(field, {}))
        .map((field) => ({ ...field, required: field.required !== false }));

    return [...ordered, ...buildUploadFields(applicationConfig)];
}

function requiresEmployer(applicationConfig = {}) {
    const config = applicationConfig?.employmentHistory;
    if (config?.hidden) return false;
    return config === undefined ? true : config.required !== false;
}

async function loadSchemaForCompany(companyId, applicationConfig = {}) {
    let globalSchema = null;
    let companyOverrides = {};
    try {
        const globalSnap = await db.collection('system_settings').doc('application_schema').get();
        if (globalSnap.exists) globalSchema = globalSnap.data();
    } catch (err) {
        console.warn('[telegram:schemaAdapter] Global schema load failed:', err?.message || err);
    }
    try {
        const companySnap = await db.collection('companies').doc(companyId).collection('settings').doc('custom_questions').get();
        if (companySnap.exists) companyOverrides = companySnap.data() || {};
    } catch (err) {
        console.warn('[telegram:schemaAdapter] Company schema load failed:', err?.message || err);
    }

    const mergedSchema = getMergedSchema(globalSchema || { version: 'fallback', sections: [] }, companyOverrides);
    const chatFields = buildChatFields(mergedSchema, applicationConfig);
    return {
        mergedSchema,
        chatFields,
        requiresEmployer: requiresEmployer(applicationConfig),
    };
}

module.exports = {
    FALLBACK_FIELDS,
    LICENSE_CLASS_OPTIONS,
    STATE_OPTIONS,
    YES_NO_OPTIONS,
    buildChatFields,
    getMergedSchema,
    isConditionallyVisible,
    loadSchemaForCompany,
    requiresEmployer,
};
