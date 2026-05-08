import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { functions } from '@lib/firebase';
import { useData } from '@/context/DataContext';
import { Loader2, Trash2, ArrowRightCircle, ShieldAlert } from 'lucide-react';

/**
 * Post-submit actions for sandbox applications. Delete / transfer require Super Admin (callable enforces).
 */
export function SandboxActionPanel({
  applicationId,
  confirmationNumber,
  onDeletedRestart,
  onTransferComplete,
}) {
  const navigate = useNavigate();
  const { currentUserClaims } = useData();
  const isSuperAdmin =
    currentUserClaims?.roles?.globalRole === 'super_admin' ||
    currentUserClaims?.globalRole === 'super_admin';

  const [companies, setCompanies] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCompanies = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingList(true);
    setError('');
    try {
      const fn = httpsCallable(functions, 'listSandboxTenantCompanies');
      const { data } = await fn({});
      setCompanies(data?.companies || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Could not load companies.');
    } finally {
      setLoadingList(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleDelete = async () => {
    if (!isSuperAdmin || !applicationId) return;
    setBusy(true);
    setError('');
    try {
      const fn = httpsCallable(functions, 'deleteSandboxApplication');
      await fn({ applicationId });
      onDeletedRestart?.();
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    if (!isSuperAdmin || !applicationId || !targetId) return;
    setBusy(true);
    setError('');
    try {
      const fn = httpsCallable(functions, 'transferSandboxApplication');
      const { data } = await fn({ applicationId, targetCompanyId: targetId });
      onTransferComplete?.(data);
      navigate('/sandbox/transfer-success', {
        state: {
          companyName: data?.companyName,
          companyId: data?.companyId,
          applicationId: data?.applicationId,
        },
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Sandbox submission complete</h2>
            <p className="text-sm text-slate-600 mt-1">
              Application saved under tenant <code className="text-xs bg-slate-100 px-1 rounded">SANDBOX</code>.
              Use the actions below (Super Admin) to clean up or move this record into a live pipeline.
            </p>
          </div>
        </div>

        {confirmationNumber && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Confirmation</p>
            <p className="font-mono font-semibold text-slate-800">{confirmationNumber}</p>
            <p className="text-xs text-slate-400 mt-1">Application id: {applicationId}</p>
          </div>
        )}

        {!isSuperAdmin && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Sign in as a Super Admin to delete or transfer this test application.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Transfer to company</label>
            {loadingList ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading tenants…
              </div>
            ) : (
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={!isSuperAdmin || busy}
              >
                <option value="">Select active company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.id})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleTransfer}
              disabled={!isSuperAdmin || !targetId || busy}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
              Transfer to selected company
            </button>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!isSuperAdmin || busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-red-200 text-red-700 font-semibold text-sm hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete sandbox application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
