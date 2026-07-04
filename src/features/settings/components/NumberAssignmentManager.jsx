import React, { useState } from 'react';
import { Phone, AlertCircle, Save, RefreshCw, Beaker } from 'lucide-react';
import { SMSDiagnosticModal } from './SMSDiagnosticModal';
import { useLineAssignments } from '../hooks/useLineAssignments';
import { sanitizePhone, buildLineModel } from '../utils/linePhone';
import { DefaultLineSection } from './number-assignment/DefaultLineSection';
import { AssignmentTable } from './number-assignment/AssignmentTable';

/**
 * NumberAssignmentManager
 * =======================
 * Company-admin screen that maps SMS lines to recruiters and picks the
 * company default line.
 *
 * Split for readability (behavior unchanged):
 *  - ../hooks/useLineAssignments.js            — data/logic (listener, roster, backfill, verify, save)
 *  - ../utils/linePhone.js                     — sanitizePhone + stable line-token model
 *  - ./number-assignment/DefaultLineSection.jsx — default line card
 *  - ./number-assignment/AssignmentTable.jsx    — recruiter matrix (rows in AssignmentRow.jsx)
 */
export function NumberAssignmentManager({ companyId }) {
    const {
        loading,
        configDoc,
        users,
        saving,
        verifyingLine,
        lineStatuses,
        assignments,
        setAssignments,
        defaultNumber,
        setDefaultNumber,
        assignmentTokenOverrides,
        setAssignmentTokenOverrides,
        savedAssignmentTokens,
        defaultTokenOverride,
        setDefaultTokenOverride,
        savedDefaultToken,
        hasChanges,
        handleVerifyLine,
        handleSave,
    } = useLineAssignments(companyId);

    const [showTestModal, setShowTestModal] = useState(false);

    if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading inventory...</div>;

    if (!configDoc || !configDoc.isActive) {
        return (
            <div className="bg-orange-50 p-6 rounded-xl border border-orange-100 text-center">
                <AlertCircle className="mx-auto text-orange-400 mb-2" />
                <h3 className="text-orange-800 font-bold">SMS Integration Not Active</h3>
                <p className="text-orange-600 text-sm mt-1">Please contact a Super Admin to enable SMS for your company.</p>
            </div>
        );
    }

    const inventory = configDoc.inventory || []; // Array of { phoneNumber, ... }

    // Resilience: if a default line is configured but is not present in the synced
    // inventory (e.g. the number was added directly at the provider, or the sync is
    // stale), the dropdown would otherwise have no matching <option> and silently render
    // as "-- Select Default Number --" -- hiding a default that is configured and used to
    // send. Surface it as a selectable option instead, mirroring the per-recruiter matrix.
    const sanitizedDefault = sanitizePhone(defaultNumber);
    const defaultInInventory = inventory.some(num => sanitizePhone(num.phoneNumber) === sanitizedDefault);

    const { lines, resolveLineToken, tokenForPhone, phoneForToken } = buildLineModel(inventory);

    if (inventory.length === 0) {
        return (
            <div className="bg-gray-50 p-8 rounded-xl border border-gray-200 text-center">
                <Phone className="mx-auto text-gray-400 mb-3" size={32} />
                <h3 className="text-gray-900 font-bold">No Numbers Found</h3>
                <p className="text-gray-500 text-sm mt-1">We couldn't find any phone numbers connected to your provider account.</p>
                <button className="mt-4 text-blue-600 hover:underline text-sm font-medium flex items-center justify-center gap-2 mx-auto">
                    <RefreshCw size={14} /> Refresh Inventory
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Phone className="text-blue-600" size={24} /> Number Assignments
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">inventory: {inventory.length} numbers available</p>
                </div>
                <div className="flex items-center gap-3">
                    {hasChanges && (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200 animate-pulse">
                            <AlertCircle size={12} /> UNSAVED CHANGES
                        </span>
                    )}
                    {/* Diagnostic Test Button */}
                    <button
                        onClick={() => setShowTestModal(true)}
                        className="px-3 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <Beaker size={16} />
                        Diagnostic Lab
                    </button>
                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 ${hasChanges ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200' : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                    >
                        {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                        {hasChanges ? 'Save Changes Now' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Default Number Section */}
            <DefaultLineSection
                lines={lines}
                sanitizedDefault={sanitizedDefault}
                defaultInInventory={defaultInInventory}
                defaultNumber={defaultNumber}
                setDefaultNumber={setDefaultNumber}
                defaultTokenOverride={defaultTokenOverride}
                setDefaultTokenOverride={setDefaultTokenOverride}
                savedDefaultToken={savedDefaultToken}
                tokenForPhone={tokenForPhone}
                phoneForToken={phoneForToken}
                resolveLineToken={resolveLineToken}
                handleVerifyLine={handleVerifyLine}
                verifyingLine={verifyingLine}
                lineStatuses={lineStatuses}
            />

            {/* Assignment Matrix */}
            <AssignmentTable
                users={users}
                inventory={inventory}
                lines={lines}
                assignments={assignments}
                setAssignments={setAssignments}
                assignmentTokenOverrides={assignmentTokenOverrides}
                setAssignmentTokenOverrides={setAssignmentTokenOverrides}
                savedAssignmentTokens={savedAssignmentTokens}
                tokenForPhone={tokenForPhone}
                phoneForToken={phoneForToken}
                resolveLineToken={resolveLineToken}
                handleVerifyLine={handleVerifyLine}
                verifyingLine={verifyingLine}
                lineStatuses={lineStatuses}
            />

            {/* SMS Diagnostic Lab Modal */}
            {showTestModal && (
                <SMSDiagnosticModal
                    companyId={companyId}
                    inventory={inventory}
                    onClose={() => setShowTestModal(false)}
                />
            )}
        </div>
    );
}
