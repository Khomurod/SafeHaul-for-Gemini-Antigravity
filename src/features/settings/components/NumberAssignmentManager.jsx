import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db, functions } from '@lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { Phone, Users as UsersIcon, Check, AlertCircle, Save, RefreshCw, Beaker, ShieldCheck, ShieldAlert, Activity, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { SMSDiagnosticModal } from './SMSDiagnosticModal';

export function NumberAssignmentManager({ companyId }) {
    const { showSuccess, showError } = useToast();
    const [configDoc, setConfigDoc] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Connection verification state
    const [verifyingLine, setVerifyingLine] = useState(null); // phoneNumber
    const [lineStatuses, setLineStatuses] = useState({}); // { phoneNumber: { success: bool, timestamp, identity } }

    // Local state for edits before save
    const [assignments, setAssignments] = useState({});
    const [initialAssignments, setInitialAssignments] = useState({});
    const [defaultNumber, setDefaultNumber] = useState('');
    const [assignmentTokenOverrides, setAssignmentTokenOverrides] = useState({});
<<<<<<< ours
    const [defaultTokenOverride, setDefaultTokenOverride] = useState(null);
=======
    const [savedAssignmentTokens, setSavedAssignmentTokens] = useState({});
    const [defaultTokenOverride, setDefaultTokenOverride] = useState(null);
    const [savedDefaultToken, setSavedDefaultToken] = useState('');
>>>>>>> theirs
    const [showTestModal, setShowTestModal] = useState(false);

    // Canonical E.164 normalization. Mirrors functions/shared/normalizePhone so that a
    // number stored in any format -- "(555) 123-4567", "5551234567", "15551234567",
    // "+15551234567" -- collapses to the SAME string the synced inventory uses
    // (+15551234567). Without this, an assigned/default line saved in a different format
    // silently fails to match its inventory entry: the per-recruiter row falls back to a
    // "Missing from sync" warning and the Company Default Line shows "-- Select --" even
    // though the line is configured and actively sending. Normalizing here also means the
    // value we write on Save is already canonical, so future linking stays consistent.
    const sanitizePhone = (num) => {
        if (!num) return "";
        const str = String(num);
        const digits = str.replace(/[^0-9]/g, '');
        // No actual digits (e.g. "", "+", punctuation-only) -> treat as empty, so the
        // verify button never renders and we never send the bare "+" to the backend.
        if (digits.length === 0) return "";
        // Preserve numbers that already carry an explicit "+" prefix EXACTLY as stored.
        // The synced inventory and the per-line keychain entries are keyed by this same
        // "+ then digits" form (see functions normalizePhoneForKeychain), so rewriting a
        // country code here would break inventory matching and line verification.
        if (str.trim().startsWith('+')) return `+${digits}`;
        // No "+" at all: apply US/CA normalization so a line saved as "(555) 123-4567",
        // "5551234567" or "15551234567" collapses to the +1XXXXXXXXXX form the synced
        // inventory uses -- otherwise the dropdown can't find a matching option and the
        // line silently reads as unassigned even though it's configured and sending.
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
        return `+${digits}`;
    };

    const hasTokenChanges = Object.keys(assignmentTokenOverrides).length > 0 || defaultTokenOverride !== null;
    const hasChanges = JSON.stringify(assignments) !== JSON.stringify(initialAssignments) ||
        defaultNumber !== (configDoc?.defaultPhoneNumber || configDoc?.config?.defaultPhoneNumber || '') ||
        hasTokenChanges;

    useEffect(() => {
        if (!companyId) return;

        // 1. Listen to Integration Doc
        const unsub = onSnapshot(doc(db, 'companies', companyId, 'integrations', 'sms_provider'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                console.log("[SMS Config] Loaded Data:", data);
                setConfigDoc(data);

                // Sanitize incoming assignments
                const incomingAssignments = data.assignments || {};
                const sanitizedMap = {};
                Object.keys(incomingAssignments).forEach(uid => {
                    sanitizedMap[uid] = sanitizePhone(incomingAssignments[uid]);
                });

                setAssignments(sanitizedMap);
                setInitialAssignments(JSON.parse(JSON.stringify(sanitizedMap))); // Deep copy
                setDefaultNumber(sanitizePhone(data.defaultPhoneNumber || data.config?.defaultPhoneNumber || ''));
                setAssignmentTokenOverrides({});
<<<<<<< ours
                setDefaultTokenOverride(null);
=======
                setSavedAssignmentTokens(data.assignmentLineTokens || {});
                setDefaultTokenOverride(null);
                setSavedDefaultToken(data.defaultLineToken || '');
>>>>>>> theirs
            } else {
                console.log("[SMS Config] Document does not exist.");
                setConfigDoc(null);
            }
            setLoading(false);
        });

        // 2. Fetch Users (Recruiters/Admins)
        const fetchUsers = async () => {
            try {
                // Get memberships
                const q = query(collection(db, 'memberships'), where('companyId', '==', companyId));
                const memberSnap = await getDocs(q);

                const membershipMap = {};
                const memberUserIds = [];

                memberSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.userId) {
                        memberUserIds.push(data.userId);
                        membershipMap[data.userId] = data.role;
                    }
                });

                if (memberUserIds.length === 0) {
                    setUsers([]);
                    return;
                }

                // Batch fetch users
                const batchSize = 30;
                const fetchedUsers = [];

                for (let i = 0; i < memberUserIds.length; i += batchSize) {
                    const batchIds = memberUserIds.slice(i, i + batchSize);
                    const userQ = query(
                        collection(db, 'users'),
                        where(documentId(), 'in', batchIds)
                    );
                    const userSnap = await getDocs(userQ);
                    userSnap.docs.forEach(d => {
                        fetchedUsers.push({
                            id: d.id,
                            ...d.data(),
                            role: membershipMap[d.id]
                        });
                    });
                }

                setUsers(fetchedUsers);
            } catch (e) {
                console.error("Error fetching users for assignment", e);
            }
        };

        fetchUsers();

        return () => unsub();
    }, [companyId]);

    // Surface EVERY user that has a line assigned, even when the company
    // memberships -> users join did not return them. A number can be linked and
    // actively sending while its owner is missing from the roster (a former
    // member, a missing/!companyId membership record, or an account whose
    // users-doc id differs from the uid the assignment was keyed by). Without
    // this, that assignment is invisible: the matrix only renders rows built
    // from memberships, so the linked number silently shows as unassigned for
    // everyone. We resolve any assignment-key uid that isn't already listed and
    // append it (flagged), so the assignment is always visible and manageable.
    useEffect(() => {
        const assignedUids = Object.keys(assignments || {}).filter(
            (uid) => uid && sanitizePhone(assignments[uid])
        );
        if (assignedUids.length === 0) return;

        const known = new Set(users.map((u) => u.id));
        const missing = assignedUids.filter((uid) => !known.has(uid));
        if (missing.length === 0) return;

        let cancelled = false;
        (async () => {
            const extras = [];
            const resolved = new Set();
            for (let i = 0; i < missing.length; i += 30) {
                const batch = missing.slice(i, i + 30);
                try {
                    const snap = await getDocs(
                        query(collection(db, 'users'), where(documentId(), 'in', batch))
                    );
                    snap.docs.forEach((d) => {
                        resolved.add(d.id);
                        extras.push({ id: d.id, ...d.data(), role: 'external', _unlinkedAssignment: true });
                    });
                } catch (e) {
                    console.error('[SMS Config] Failed to resolve assigned user docs', e);
                }
            }
            // Assignment keys with no users doc at all still get a placeholder row
            // so the dangling assignment is visible and can be cleared/reassigned.
            missing.forEach((uid) => {
                if (!resolved.has(uid)) {
                    extras.push({ id: uid, name: 'Unknown / former user', email: uid, role: 'unassigned', _unlinkedAssignment: true });
                }
            });
            if (!cancelled && extras.length) {
                setUsers((prev) => {
                    const ids = new Set(prev.map((p) => p.id));
                    const merged = extras.filter((e) => !ids.has(e.id));
                    return merged.length ? [...prev, ...merged] : prev;
                });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assignments, users]);

    const handleVerifyLine = async (phoneNumber) => {
        // Guard against malformed/blank numbers (the bare "+") reaching the backend.
        if (!phoneNumber || phoneNumber.replace(/[^0-9]/g, '').length === 0) return;
        setVerifyingLine(phoneNumber);

        try {
            const verifyFn = httpsCallable(functions, 'verifyLineConnection');
            const result = await verifyFn({ companyId, phoneNumber });

            setLineStatuses(prev => ({
                ...prev,
                [phoneNumber]: {
                    success: true,
                    identity: result.data.identity,
                    timestamp: result.data.timestamp
                }
            }));
            showSuccess(`Line ${phoneNumber} is active (${result.data.identity})`);
        } catch (error) {
            console.error(`Verification Failed: ${phoneNumber}`, error);
            setLineStatuses(prev => ({
                ...prev,
                [phoneNumber]: {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            }));
            showError(`Line ${phoneNumber} connection failed: ${error.message}`);
        } finally {
            setVerifyingLine(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Save through the backend by stable line tokens instead of raw phone values.
            // Some browser/privacy layers redact phone numbers in Firestore snapshots before
            // React sees them, so saving raw <option> phone values can turn a selected line
            // into an empty string. The callable re-reads the authoritative inventory with
<<<<<<< ours
            // Admin SDK and maps tokens (ln0/ln1/...) back to real phone numbers server-side.
=======
            // Admin SDK and maps stable line IDs back to real phone numbers server-side.
>>>>>>> theirs
            const saveAssignments = httpsCallable(functions, 'saveSmsLineAssignments');
            await saveAssignments({
                companyId,
                assignmentTokens: assignmentTokenOverrides,
                ...(defaultTokenOverride !== null ? { defaultToken: defaultTokenOverride } : {})
            });

            setInitialAssignments(JSON.parse(JSON.stringify(assignments)));
<<<<<<< ours
=======
            setSavedAssignmentTokens(prev => ({ ...prev, ...assignmentTokenOverrides }));
            if (defaultTokenOverride !== null) setSavedDefaultToken(defaultTokenOverride);
>>>>>>> theirs
            setAssignmentTokenOverrides({});
            setDefaultTokenOverride(null);
            showSuccess("Assignments updated successfully.");
        } catch (error) {
            console.error(error);
            showError("Failed to save assignments.");
        } finally {
            setSaving(false);
        }
    };

    // Warn about unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

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

    // Non-phone option tokens + human-readable labels.
    // Some browsers/extensions (corporate DLP tools, embedded/AI browsers) strip
    // phone-like text AND attribute values out of the page. When an <option value> is the
    // raw phone number it gets blanked, the <select> can no longer match its current value,
    // and every line silently collapses to the first option ("No Direct Line"). Using the
    // backend-provided stable lineId as the option value keeps selection working even when
    // inventory rows are reordered, and leading each option with the line's saved label
    // ("Main Number", "Tom's Number") keeps the list readable even when the digits
    // themselves are hidden. The stored value (assignments / defaultPhoneNumber) stays the
    // real phone number — only the dropdown's internal value changes.
    const MISSING_TOKEN = '__missing__';
    const lines = inventory.map((num, idx) => ({
        token: num.lineId || num.id || `ln${idx}`,
        phone: sanitizePhone(num.phoneNumber),
        label: num.label,
        usageType: num.usageType,
    }));
    // Only ever match a NON-empty phone. Otherwise, if a line's phone resolves to "" (e.g.
    // a browser/DLP layer strips phone numbers out of the data the page receives), an
    // unassigned recruiter's empty currentPhone would "match" the first empty-phone line and
    // every row would collapse to showing that line ("Main Number"), and selecting another
    // line couldn't stick. Guarding on a non-empty phone keeps unassigned = "No Direct Line"
    // and makes selection exact.
    const resolveLineToken = (token) => {
        if (!token) return '';
        if (lines.some(l => l.token === token)) return token;
        const legacyMatch = String(token).match(/^ln(\d+)$/);
        if (legacyMatch) return lines[Number(legacyMatch[1])]?.token || token;
        return token;
    };
    const tokenForPhone = (phone) => (phone ? (lines.find(l => l.phone === phone)?.token || '') : '');
    const phoneForToken = (token) => lines.find(l => l.token === resolveLineToken(token))?.phone || '';
    const lineDisplay = (label, phone, idx, suffix) => {
        const name = (label && String(label).trim()) || `Line ${idx + 1}`;
        const base = phone ? `${name} (${phone})` : name;
        return suffix ? `${base} ${suffix}` : base;
    };

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
<<<<<<< ours
                        value={defaultTokenOverride ?? (tokenForPhone(sanitizedDefault) || (sanitizedDefault ? MISSING_TOKEN : ''))}
=======
                        value={defaultTokenOverride ?? (tokenForPhone(sanitizedDefault) || resolveLineToken(savedDefaultToken) || (sanitizedDefault ? MISSING_TOKEN : ''))}
>>>>>>> theirs
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

            {/* Assignment Matrix */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <UsersIcon className="text-purple-500" size={18} /> Recruiter Assignments
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Assign strict 1:1 lines for your team members.</p>
                </div>

                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                        <tr>
                            <th className="px-6 py-3 border-b border-gray-100">Team Member</th>
                            <th className="px-6 py-3 border-b border-gray-100">Role</th>
                            <th className="px-6 py-3 border-b border-gray-100">Assigned Number</th>
                            <th className="px-6 py-3 border-b border-gray-100">Connection</th>
                            <th className="px-6 py-3 border-b border-gray-100 w-10 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {users.map(user => {
                            const rawPhone = assignments[user.id] || '';
                            const currentPhone = sanitizePhone(rawPhone);
<<<<<<< ours
                            const selectedToken = assignmentTokenOverrides[user.id] ?? (tokenForPhone(currentPhone) || (currentPhone ? MISSING_TOKEN : ''));
=======
                            const selectedToken = assignmentTokenOverrides[user.id] ?? (tokenForPhone(currentPhone) || resolveLineToken(savedAssignmentTokens[user.id]) || (currentPhone ? MISSING_TOKEN : ''));
>>>>>>> theirs
                            const isAssigned = !!currentPhone || !!assignmentTokenOverrides[user.id];

                            // Match against sanitized inventory numbers
                            const invItem = inventory.find(i => sanitizePhone(i.phoneNumber) === currentPhone);
                            const hasDedicated = invItem?.hasDedicatedCredentials;

                            return (
                                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
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
                        })}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">No team members found.</div>
                )}
            </div>

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

