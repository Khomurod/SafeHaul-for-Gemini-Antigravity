import React from 'react';

/**
 * FMCSA info banner + applicant details card.
 * Extracted verbatim from VerificationPortal.jsx.
 */
export function ApplicantDetailsCard({ verificationData }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded p-4 mb-6">
                <p className="text-sm text-blue-800 leading-relaxed">
                    Under <strong>FMCSA 49 CFR Part 391.23</strong>, prospective employers of commercial motor vehicle
                    drivers are required to investigate the driver's employment record for the preceding 3 years.
                    Your cooperation in providing this information is <strong>required by federal regulation</strong>.
                    Previous employers must respond within <strong>30 days</strong> of receiving this request.
                </p>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-3 border-b border-gray-200 pb-2">Applicant Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                    <span className="text-gray-500 font-medium">Applicant Name:</span>
                    <span className="ml-2 font-bold text-gray-900">{verificationData?.applicantName}</span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Reported Dates:</span>
                    <span className="ml-2 text-gray-900">{verificationData?.employmentStartDate} to {verificationData?.employmentEndDate}</span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Requesting Company:</span>
                    <span className="ml-2 text-gray-900">{verificationData?.companyName}</span>
                </div>
                <div>
                    <span className="text-gray-500 font-medium">Response Deadline:</span>
                    <span className="ml-2 font-bold text-red-600">{verificationData?.expiresAt ? new Date(verificationData.expiresAt).toLocaleDateString() : 'N/A'}</span>
                </div>
            </div>
        </div>
    );
}

export default ApplicantDetailsCard;
