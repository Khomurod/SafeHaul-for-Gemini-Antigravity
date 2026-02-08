import React from 'react';
import { AlertTriangle, FileX, Clock, BadgeAlert, ShieldAlert, Calendar } from 'lucide-react';

/**
 * ComplianceFlags - "Requires Review" chips for gaps, missing docs, license issues
 */
export function ComplianceFlags({ appData, dqStatus }) {
    const flags = [];

    // --- Employment Gap Detection ---
    const checkEmploymentGaps = () => {
        const employers = appData?.employers || appData?.employmentHistory || [];
        if (employers.length < 2) return null;

        // Sort by end date descending
        const sorted = [...employers].sort((a, b) => {
            const dateA = new Date(a.endDate || a.to || Date.now());
            const dateB = new Date(b.endDate || b.to || Date.now());
            return dateB - dateA;
        });

        for (let i = 0; i < sorted.length - 1; i++) {
            const current = sorted[i];
            const next = sorted[i + 1];

            const currentStart = new Date(current.startDate || current.from);
            const nextEnd = new Date(next.endDate || next.to);

            if (currentStart && nextEnd) {
                const gapDays = (currentStart - nextEnd) / (1000 * 60 * 60 * 24);
                if (gapDays > 30) {
                    return Math.floor(gapDays);
                }
            }
        }
        return null;
    };

    // --- Check for Missing Required Documents ---
    const checkMissingDocs = () => {
        const docs = appData?.uploadedDocuments || appData?.documents || {};
        const requiredDocs = ['cdlFront', 'cdlBack', 'medicalCard'];
        const missing = requiredDocs.filter(doc => !docs[doc]);
        return missing.length > 0 ? missing : null;
    };

    // --- Check License Expiration ---
    const checkLicenseExpiration = () => {
        const expDate = appData?.licenseExpirationDate || appData?.cdlExpiration;
        if (!expDate) return 'unknown';

        const exp = new Date(expDate);
        const now = new Date();
        const daysUntilExp = (exp - now) / (1000 * 60 * 60 * 24);

        if (daysUntilExp < 0) return 'expired';
        if (daysUntilExp < 30) return 'expiring';
        return null;
    };

    // --- Check Medical Card Expiration ---
    const checkMedicalExpiration = () => {
        const expDate = appData?.medicalCardExpiration;
        if (!expDate) return null;

        const exp = new Date(expDate);
        const now = new Date();
        const daysUntilExp = (exp - now) / (1000 * 60 * 60 * 24);

        if (daysUntilExp < 0) return 'expired';
        if (daysUntilExp < 30) return 'expiring';
        return null;
    };

    // --- Check Violations/Accidents ---
    const checkSafetyIssues = () => {
        const violations = appData?.violations?.length || 0;
        const accidents = appData?.accidents?.length || 0;
        if (violations > 0 || accidents > 0) {
            return { violations, accidents };
        }
        return null;
    };

    // --- Build Flags ---
    const employmentGap = checkEmploymentGaps();
    if (employmentGap) {
        flags.push({
            id: 'employment-gap',
            type: 'warning',
            icon: Clock,
            label: `${employmentGap}-day employment gap`,
            description: 'Requires explanation'
        });
    }

    const missingDocs = checkMissingDocs();
    if (missingDocs) {
        flags.push({
            id: 'missing-docs',
            type: 'error',
            icon: FileX,
            label: `${missingDocs.length} missing document${missingDocs.length > 1 ? 's' : ''}`,
            description: missingDocs.join(', ')
        });
    }

    const licenseStatus = checkLicenseExpiration();
    if (licenseStatus === 'expired') {
        flags.push({
            id: 'license-expired',
            type: 'error',
            icon: BadgeAlert,
            label: 'CDL Expired',
            description: 'License has expired'
        });
    } else if (licenseStatus === 'expiring') {
        flags.push({
            id: 'license-expiring',
            type: 'warning',
            icon: Calendar,
            label: 'CDL Expiring Soon',
            description: 'Within 30 days'
        });
    } else if (licenseStatus === 'unknown') {
        flags.push({
            id: 'license-unknown',
            type: 'info',
            icon: BadgeAlert,
            label: 'CDL Expiration Unknown',
            description: 'Needs verification'
        });
    }

    const medicalStatus = checkMedicalExpiration();
    if (medicalStatus === 'expired') {
        flags.push({
            id: 'medical-expired',
            type: 'error',
            icon: ShieldAlert,
            label: 'Medical Card Expired',
            description: 'Renewal required'
        });
    } else if (medicalStatus === 'expiring') {
        flags.push({
            id: 'medical-expiring',
            type: 'warning',
            icon: Calendar,
            label: 'Medical Card Expiring',
            description: 'Within 30 days'
        });
    }

    const safetyIssues = checkSafetyIssues();
    if (safetyIssues) {
        flags.push({
            id: 'safety-review',
            type: 'warning',
            icon: AlertTriangle,
            label: 'Safety Review Needed',
            description: `${safetyIssues.violations} violation${safetyIssues.violations !== 1 ? 's' : ''}, ${safetyIssues.accidents} accident${safetyIssues.accidents !== 1 ? 's' : ''}`
        });
    }

    // --- DQ File Status ---
    if (dqStatus && dqStatus.incomplete > 0) {
        flags.push({
            id: 'dq-incomplete',
            type: 'warning',
            icon: FileX,
            label: `${dqStatus.incomplete} DQ File${dqStatus.incomplete > 1 ? 's' : ''} Incomplete`,
            description: 'Review DQ Files tab'
        });
    }

    // --- No Flags State ---
    if (flags.length === 0) {
        return (
            <div className="text-center py-4 text-green-600">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg">✓</span>
                </div>
                <p className="text-sm font-medium">All checks passed</p>
            </div>
        );
    }

    const typeStyles = {
        error: 'bg-red-50 border-red-200 text-red-700',
        warning: 'bg-amber-50 border-amber-200 text-amber-700',
        info: 'bg-blue-50 border-blue-200 text-blue-700'
    };

    return (
        <div className="space-y-2">
            {flags.map(flag => {
                const Icon = flag.icon;
                return (
                    <div
                        key={flag.id}
                        className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border ${typeStyles[flag.type]}`}
                    >
                        <Icon size={16} className="shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">{flag.label}</p>
                            <p className="text-xs opacity-75">{flag.description}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default ComplianceFlags;
