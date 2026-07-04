import React from 'react';
import { AlertCircle, RefreshCw, ShieldCheck, Activity } from 'lucide-react';
import { MISSING_TOKEN, lineDisplay, sanitizePhone } from '../../utils/linePhone';

/** One team-member row of the assignment matrix — extracted verbatim from NumberAssignmentManager.jsx. */
export function AssignmentRow({
    user,
    inventory,
    lines,
    assignments,
    setAssignments,
    assignmentTokenOverrides,
    setAssignmentTokenOverrides,
    savedAssignmentTokens,
    tokenForPhone,
    phoneForToken,
    resolveLineToken,
    handleVerifyLine,
    verifyingLine,
    lineStatuses,
}) {
    const rawPhone = assignments[user.id] || '';
    const currentPhone = sanitizePhone(rawPhone);
    const selectedToken = assignmentTokenOverrides[user.id] ?? (tokenForPhone(currentPhone) || resolveLineToken(savedAssignmentTokens[user.id]) || (currentPhone ? MISSING_TOKEN : ''));
    const isAssigned = !!currentPhone || !!assignmentTokenOverrides[user.id];

    // Match against sanitized inventory numbers
    const invItem = inventory.find(i => sanitizePhone(i.phoneNumber) === currentPhone);
    const hasDedicated = invItem?.hasDedicatedCredentials;

    return (
        <tr className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 text-sm font-medium text-gray-900 border-r border-gray-50">
                {user.name || user.fullName || user.email}
                <div className="text-xs text-gray-400 font-normal">{user.email}</div>
                {user._unlinkedAssignment && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        <AlertCircle size={10} /> Not in current team
                    </div>
                )}
            </td>
            <td className="px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">
                {user.role?.replace('_', ' ')}
            </td>
            <td className="px-6 py-4">
                <div className="flex flex-col gap-1">
                    <select
                        value={selectedToken}
                        onChange={(e) => {
                            const t = e.target.value;
                            setAssignmentTokenOverrides(prev => {
                                const next = { ...prev };
                                if (t === MISSING_TOKEN) delete next[user.id];
                                else next[user.id] = t;
                                return next;
                            });
                            const nextPhone = !t ? '' : (t === MISSING_TOKEN ? currentPhone : phoneForToken(t));
                            setAssignments(prev => ({ ...prev, [user.id]: nextPhone }));
                        }}
                        className={`w-full p-2 border rounded text-sm outline-none transition-all ${isAssigned ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-400'
                            }`}
                    >
                        <option value="">No Direct Line</option>
                        {/* 1. Show existing inventory (label-first so it stays readable even if a
                            browser/DLP extension hides the raw digits) */}
                        {lines.map((l, idx) => (
                            <option key={l.token} value={l.token}>
                                {lineDisplay(l.label, l.phone, idx)}
                            </option>
                        ))}
                        {/* 2. Resilience: If currently assigned number is MISSING from inventory, show it anyway */}
                        {isAssigned && !invItem && (
                            <option value={MISSING_TOKEN}>
                                {currentPhone} (Missing from sync)
                            </option>
                        )}
                    </select>
                    {isAssigned && hasDedicated && (
                        <div className="flex items-center gap-1 text-[9px] text-blue-600 font-bold uppercase tracking-tighter">
                            <ShieldCheck size={10} /> Dedicated Credentials
                        </div>
                    )}
                </div>
            </td>
            <td className="px-6 py-4">
                {isAssigned ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleVerifyLine(currentPhone)}
                            disabled={verifyingLine === currentPhone}
                            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                            title="Verify Connection"
                        >
                            {verifyingLine === currentPhone ? (
                                <RefreshCw size={14} className="animate-spin text-gray-400" />
                            ) : (
                                <Activity size={14} className={lineStatuses[currentPhone] ? 'text-blue-500' : 'text-gray-400'} />
                            )}
                        </button>
                        {lineStatuses[currentPhone] ? (
                            <span className={`text-[10px] font-medium ${lineStatuses[currentPhone].success ? 'text-green-600' : 'text-red-600'
                                }`}>
                                {lineStatuses[currentPhone].success ? 'Connected' : 'Failed'}
                            </span>
                        ) : isAssigned && !invItem ? (
                            <span className="text-[10px] text-orange-500 font-medium">Inventory Mismatch</span>
                        ) : (
                            <span className="text-[10px] text-gray-400">Untested</span>
                        )}
                    </div>
                ) : (
                    <span className="text-gray-300">-</span>
                )}
            </td>
            <td className="px-6 py-4 text-center">
                {isAssigned ? (
                    <div
                        className={`w-2 h-2 rounded-full mx-auto ${!lineStatuses[currentPhone]
                            ? (invItem ? 'bg-blue-400' : 'bg-orange-400')
                            : lineStatuses[currentPhone].success === false ? 'bg-red-500' : 'bg-green-500'
                            }`}
                        title={!lineStatuses[currentPhone] ? 'Untested' : lineStatuses[currentPhone].success === false ? 'Connection Error' : 'Active'}
                    ></div>
                ) : (
                    <div className="w-2 h-2 rounded-full bg-gray-200 mx-auto" title="No Assignment"></div>
                )}
            </td>
        </tr>
    );
}

export default AssignmentRow;
