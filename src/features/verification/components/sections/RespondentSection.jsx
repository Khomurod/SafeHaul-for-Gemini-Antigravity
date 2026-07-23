import React from 'react';
import { SignaturePad } from '@shared/components/signature/SignaturePad';
import { Button, FieldMessage, FormField, FormSection, Input } from '@/design-system/components';

/** Section 4: Respondent Verification & Signature. Presentation migrated; field
 *  names, placeholders, the SignaturePad wiring, and the E2E test-signature
 *  affordance are unchanged. */
export function RespondentSection({ formData, formErrors, updateField, isE2EVerifyMock }) {
    return (
        <FormSection
            title="Section 4: Respondent Verification & Signature"
            description="Must be completed by an authorized representative of the previous employer"
        >
            <div className="grid grid-cols-1 gap-ds-4 sm:grid-cols-2">
                <FormField
                    id="verify-respondent-name"
                    label="Your Full Name"
                    required
                    error={formErrors.respondentName}
                >
                    <Input
                        type="text"
                        required={false}
                        aria-required="true"
                        value={formData.respondentName}
                        onChange={(e) => updateField('respondentName', e.target.value)}
                        placeholder="e.g., John Smith"
                    />
                </FormField>
                <FormField
                    id="verify-respondent-title"
                    label="Your Title / Position"
                    required
                    error={formErrors.respondentTitle}
                >
                    <Input
                        type="text"
                        required={false}
                        aria-required="true"
                        value={formData.respondentTitle}
                        onChange={(e) => updateField('respondentTitle', e.target.value)}
                        placeholder="e.g., Safety Director, HR Manager"
                    />
                </FormField>
            </div>

            <div className="grid grid-cols-1 gap-ds-4 sm:grid-cols-2">
                <FormField
                    id="verify-respondent-phone"
                    label="Phone Number"
                    required
                    error={formErrors.respondentPhone}
                >
                    <Input
                        type="tel"
                        required={false}
                        aria-required="true"
                        value={formData.respondentPhone}
                        onChange={(e) => updateField('respondentPhone', e.target.value)}
                        placeholder="(555) 123-4567"
                    />
                </FormField>
                <FormField id="verify-respondent-email" label="Email Address">
                    <Input
                        type="email"
                        value={formData.respondentEmail}
                        onChange={(e) => updateField('respondentEmail', e.target.value)}
                        placeholder="you@company.com"
                    />
                </FormField>
            </div>

            <div className="grid gap-ds-2">
                <span className="text-ds-sm font-semibold text-ds-content">
                    Electronic Signature
                    <span className="text-ds-status-danger-fg" aria-hidden="true"> *</span>
                    <span className="ds-visually-hidden"> required</span>
                </span>
                <p className="text-ds-xs text-ds-content-muted">
                    Draw your signature below. By signing, you certify that the information provided is true and accurate.
                </p>
                {isE2EVerifyMock && (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-fit"
                        onClick={() => updateField('signatureData', 'data:image/png;base64,e2e-signature')}
                    >
                        Use Test Signature
                    </Button>
                )}
                <SignaturePad onSignatureChange={(data) => updateField('signatureData', data)} />
                {formErrors.signatureData && (
                    <FieldMessage tone="error">{formErrors.signatureData}</FieldMessage>
                )}
            </div>

            <div className="rounded-ds-lg border border-ds-border bg-ds-surface-subtle p-ds-4">
                <p className="text-ds-xs leading-relaxed text-ds-content-secondary">
                    <strong>Certification:</strong> By submitting this form, I certify that I am authorized to provide this
                    employment verification on behalf of the above-referenced company, and that the information provided
                    herein is true, accurate, and complete to the best of my knowledge. I understand that providing false
                    information may result in penalties under federal and state law.
                </p>
            </div>
        </FormSection>
    );
}

export default RespondentSection;
