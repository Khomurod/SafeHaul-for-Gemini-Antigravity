import React from 'react';
import { Check, RefreshCw, ShieldCheck, ShieldAlert, Activity, Wifi, WifiOff } from 'lucide-react';
import { MISSING_TOKEN, lineDisplay } from '../../utils/linePhone';

/** Company Default Line card — extracted verbatim from NumberAssignmentManager.jsx. */
export function DefaultLineSection({
    lines,
    sanitizedDefault,
    defaultInInventory,
    defaultNumber,
    setDefaultNumber,
    defaultTokenOverride,
    setDefaultTokenOverride,
    savedDefaultToken,
    tokenForPhone,
    phoneForToken,
    resolveLineToken,
    handleVerifyLine,
    verifyingLine,
    lineStatuses,
}) {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Check className="text-green-500" size={18} /> Company Default Line
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Used for automated system messages and unassigned recruiters.
                    </p>
                </div>
            </div>
            <div className="flex gap-3 max-w-lg">
                <select
                    value={defaultTokenOverride ?? (tokenForPhone(sanitizedDefault) || resolveLineToken(savedDefaultToken) || (sanitizedDefault ? MISSING_TOKEN : ''))}
                    onChange={(e) => {
                        const t = e.target.value;
                        setDefaultTokenOverride(t);
                        if (!t) setDefaultNumber('');
                        else if (t !== MISSING_TOKEN) setDefaultNumber(phoneForToken(t));
                        // MISSING_TOKEN: keep the configured-but-unsynced default as-is
                    }}
                    className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                    <option value="">-- Select Default Number --</option>
                    {lines.map((l, idx) => (
                        <option key={l.token} value={l.token}>
                            {lineDisplay(l.label, l.phone, idx, `· ${l.usageType || 'Line'}`)}
                        </option>
                    ))}
                    {/* Resilience: configured default that isn't in the synced inventory */}
                    {sanitizedDefault && !defaultInInventory && (
                        <option value={MISSING_TOKEN}>
                            {sanitizedDefault} (Missing from sync)
                        </option>
                    )}
                </select>
                {defaultNumber && (
                    <button
                        onClick={() => handleVerifyLine(defaultNumber)}
                        disabled={verifyingLine === defaultNumber}
                        className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="Verify Connectivity"
                    >
                        {verifyingLine === defaultNumber ? (
                            <RefreshCw size={16} className="animate-spin" />
                        ) : lineStatuses[defaultNumber]?.success ? (
                            <Wifi size={16} className="text-green-500" />
                        ) : lineStatuses[defaultNumber]?.success === false ? (
                            <WifiOff size={16} className="text-red-500" />
                        ) : (
                            <Activity size={16} />
                        )}
                    </button>
                )}
            </div>
            {lineStatuses[defaultNumber] && (
                <div className={`mt-3 p-2 rounded text-[10px] flex items-center gap-2 ${lineStatuses[defaultNumber].success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                    {lineStatuses[defaultNumber].success ? (
                        <>
                            <ShieldCheck size={12} />
                            Verified: {lineStatuses[defaultNumber].identity}
                        </>
                    ) : (
                        <>
                            <ShieldAlert size={12} />
                            Error: {lineStatuses[defaultNumber].error}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default DefaultLineSection;
