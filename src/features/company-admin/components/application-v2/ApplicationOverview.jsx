import React from 'react';
import { RiskAssessmentBanner } from './RiskAssessmentBanner';
import { QuickFactsBar } from './QuickFactsBar';
import { StatusWorkflowGuide } from './StatusWorkflowGuide';
import { EmploymentTimeline } from './EmploymentTimeline';
import { DQComplianceIndicator } from './DQComplianceIndicator';
import { AccordionSection } from './AccordionSection';
import { PersonalInfoSection } from '../application/sections/PersonalInfoSection';
import { QualificationsSection } from '../application/sections/QualificationsSection';
import { SupplementalSection } from '../application/sections/SupplementalSection';

export function ApplicationOverview({
    appData,
    dqStatus,
    currentStatus,
    onWorkflowAction,
    dqFiles,
    setActiveSection,
    isEditing,
    onDataChange,
    canEditAllFields,
    onPhoneClick
}) {
    if (!appData) return null;

    return (
        <div className="space-y-5">
            {/* Risk Assessment */}
            <RiskAssessmentBanner appData={appData} />

            {/* Quick Facts */}
            <QuickFactsBar appData={appData} dqStatus={dqStatus} />

            {/* Workflow Guide */}
            <StatusWorkflowGuide currentStatus={currentStatus} onAction={onWorkflowAction} />

            {/* Employment Timeline */}
            <EmploymentTimeline appData={appData} />

            {/* DQ Compliance Preview */}
            <DQComplianceIndicator
                dqFiles={dqFiles}
                onViewDQFile={() => setActiveSection('dq')}
            />

            {/* Collapsible Data Sections */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <AccordionSection
                    title="Personal Information"
                    preview={`${appData.firstName || ''} ${appData.lastName || ''} • ${appData.city || ''}, ${appData.state || ''}`}
                    defaultOpen={false}
                    variant="default"
                >
                    <PersonalInfoSection
                        appData={appData}
                        isEditing={isEditing}
                        handleDataChange={onDataChange}
                        canEditAllFields={canEditAllFields}
                        onPhoneClick={onPhoneClick}
                    />
                </AccordionSection>

                <AccordionSection
                    title="Position & Qualifications"
                    preview={`${appData.positionApplyingTo || 'Driver'} • ${Array.isArray(appData.driverType) ? appData.driverType.join(', ') : appData.driverType || 'N/A'}`}
                    defaultOpen={false}
                    variant="default"
                >
                    <QualificationsSection
                        appData={appData}
                        isEditing={isEditing}
                        handleDataChange={onDataChange}
                        canEditAllFields={canEditAllFields}
                    />
                </AccordionSection>

                <AccordionSection
                    title="Driving Record & Safety"
                    preview={`${appData.violations?.length || 0} violations • ${appData.accidents?.length || 0} accidents`}
                    defaultOpen={false}
                    variant="default"
                >
                    <SupplementalSection appData={appData} />
                </AccordionSection>
            </div>
        </div>
    );
}
