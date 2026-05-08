import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';

/** Shown after sandbox transfer (navigate state from SandboxActionPanel). */
export function SandboxTransferSuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const companyName = state?.companyName || state?.companyId || 'the selected company';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-green-100 p-8 text-center">
        <Building2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Transfer complete</h1>
        <p className="text-slate-600 mb-6">
          The application is now under <strong>{companyName}</strong> with status{' '}
          <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">New Application</span>.
        </p>
        <button
          type="button"
          onClick={() => navigate('/super-admin')}
          className="text-blue-600 hover:underline text-sm font-medium mr-4"
        >
          Super Admin
        </button>
        <button type="button" onClick={() => navigate('/')} className="text-slate-600 hover:underline text-sm">
          Home
        </button>
      </div>
    </div>
  );
}
