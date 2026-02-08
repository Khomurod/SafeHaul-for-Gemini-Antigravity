import React from 'react';
import { ProgressIndicator } from './ProgressIndicator';
import { InlineDocumentsStrip } from './InlineDocumentsStrip';
import { QuickFactsBar } from './QuickFactsBar';
import { AccordionSection } from './AccordionSection';
import { PersonalInfoSection } from '../application/sections/PersonalInfoSection';
import { QualificationsSection } from '../application/sections/QualificationsSection';
import { SupplementalSection } from '../application/sections/SupplementalSection';
import { EmploymentTimeline } from './EmploymentTimeline';
import { RiskAssessmentBanner } from './RiskAssessmentBanner';

/**
 * ApplicationLeftColumn - Main content area with progress, summary, accordions, and documents
 */
export function ApplicationLeftColumn({
    appData,
    currentStatus,
    dqStatus,
    fileUrls = {},
    isEditing,
    onDataChange,
    canEditAllFields,
    onPhoneClick,
    onViewDocument,
    setActiveSection
}) {
    if (!appData) return null;

    // Quick summary data for the summary row
    const summaryItems = [
        { label: 'CDL Class', value: appData.cdlClass || appData.cdlType || '--' },
        { label: 'Driver Type', value: Array.isArray(appData.driverType) ? appData.driverType.join(', ') : appData.driverType || '--' },
        { label: 'Experience', value: appData.yearsExperience ? `${appData.yearsExperience} years` : '--' },
        { label: 'Location', value: [appData.city, appData.state].filter(Boolean).join(', ') || '--' },
        { label: 'Last Employer', value: appData.employers?.[0]?.companyName || appData.employmentHistory?.[0]?.companyName || '--' }
    ];

    return (
        <div className="space-y-5">
            {/* Risk Assessment Banner */}
            <RiskAssessmentBanner appData={appData} />

            {/* Progress Indicator */}
            <ProgressIndicator appData={appData} currentStatus={currentStatus} />

            {/* Quick Summary Row */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {summaryItems.map((item, index) => (
                        <div key={index} className="text-center md:text-left">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {item.label}
                            </span>
                            <span className="block text-sm font-semibold text-gray-800 mt-0.5 truncate">
                                {item.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Facts (original component) */}
            <QuickFactsBar appData={appData} dqStatus={dqStatus} />

            {/* Inline Documents Strip */}
            <InlineDocumentsStrip
                documents={appData.uploadedDocuments || appData.documents || {}}
                fileUrls={fileUrls}
                onViewDocument={onViewDocument}
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
                    title="Employment History"
                    preview={`${appData.employers?.length || appData.employmentHistory?.length || 0} employer${(appData.employers?.length || appData.employmentHistory?.length || 0) !== 1 ? 's' : ''}`}
                    defaultOpen={false}
                    variant="default"
                >
                    <EmploymentTimeline appData={appData} />
                </AccordionSection>

                <AccordionSection
                    title="Driving Record & Safety"
                    preview={`${appData.violations?.length || 0} violation${(appData.violations?.length || 0) !== 1 ? 's' : ''} • ${appData.accidents?.length || 0} accident${(appData.accidents?.length || 0) !== 1 ? 's' : ''}`}
                    defaultOpen={false}
                    variant="default"
                >
                    <SupplementalSection appData={appData} />
                </AccordionSection>
            </div>
        </div>
    );
}

export default ApplicationLeftColumn;
