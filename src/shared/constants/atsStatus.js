/** Canonical ATS funnel statuses (recruiter-editable). */
export const ATS_PIPELINE_STATUSES = [
    'New',
    'Contact Attempt 1',
    'Contact Attempt 2',
    'Contact Attempt 3',
    'In Process',
    'Hired',
    'Terminated',
    'Declined',
];

/** Optional CRM bucket for lead tabs (stored as status). */
export const ATS_INTERESTED_STATUS = 'Interested';

/** Legacy / workflow values kept selectable so older records stay editable. */
export const ATS_LEGACY_STATUS_ALIASES = [
    'New Application',
    'Approved',
    'Rejected',
    'Background Check',
    'In Review',
    'Qualified',
    'Hold',
    'Stale',
    'Offer Accepted',
    'Offer Declined',
];

/** Full dropdown list (deduped). */
export const ATS_STATUS_DROPDOWN_OPTIONS = [
    ...ATS_PIPELINE_STATUSES,
    ATS_INTERESTED_STATUS,
    ...ATS_LEGACY_STATUS_ALIASES,
];

export const CONTACT_ATTEMPT_STATUSES = [
    'Contact Attempt 1',
    'Contact Attempt 2',
    'Contact Attempt 3',
];
