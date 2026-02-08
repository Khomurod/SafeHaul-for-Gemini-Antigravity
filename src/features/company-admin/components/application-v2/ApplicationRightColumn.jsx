import React from 'react';
import { Clock, MessageSquare, Phone, AlertTriangle } from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';
import { InternalNotesPanel } from './InternalNotesPanel';
import { ContactQuickActions } from './ContactQuickActions';
import { ComplianceFlags } from './ComplianceFlags';

/**
 * ApplicationRightColumn - Sticky sidebar with activity, notes, contact, and compliance
 */
export function ApplicationRightColumn({
    appData,
    activities = [],
    notes = [],
    dqStatus,
    onAddNote,
    onPhoneClick,
    isLoadingNotes = false
}) {
    const applicantName = `${appData?.firstName || ''} ${appData?.lastName || ''}`.trim();

    return (
        <div className="sticky top-0 space-y-4 max-h-screen overflow-y-auto pb-6">
            {/* Contact Quick Actions */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    Contact
                </h3>
                <ContactQuickActions
                    phone={appData?.phone}
                    email={appData?.email}
                    applicantName={applicantName}
                    onPhoneClick={onPhoneClick}
                />
            </div>

            {/* Compliance Flags */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-gray-400" />
                    Compliance Review
                </h3>
                <ComplianceFlags appData={appData} dqStatus={dqStatus} />
            </div>

            {/* Internal Notes */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MessageSquare size={14} className="text-gray-400" />
                    Internal Notes
                </h3>
                <InternalNotesPanel
                    notes={notes}
                    onAddNote={onAddNote}
                    isLoading={isLoadingNotes}
                />
            </div>

            {/* Activity Timeline */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Clock size={14} className="text-gray-400" />
                    Activity
                </h3>
                <ActivityTimeline activities={activities} maxItems={8} />
            </div>
        </div>
    );
}

export default ApplicationRightColumn;
