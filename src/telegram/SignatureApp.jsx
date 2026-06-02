import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle, Eraser, Loader2, PenTool, Save, ShieldCheck } from 'lucide-react';
import { functions } from '@lib/firebase';
import { clearCanvas, getSignatureDataUrl, initializeSignatureCanvas } from '@lib/signature';
import { getE2EQueryParam, isE2ETestMode } from '@lib/runtime/e2eMode';

const E2E_SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAUCAYAAABwR4+JAAAAAXNSR0IArs4c6QAAAO5JREFUaEPt1zEOgjAURdEtjPEEXoCLcAuuYfQAroJzMJ5BG8kpXAxwsf96YfNQfGrJ1zR56Qvwf6MQQxgkNC+CP+zr79WD4QxR2jEfSxO93Jt0NdRnM6xQ81YeJX1FW/EMubQIq4B15xTCg+0haEoQO4jYl3mRr6z4nQ18fpwevUJj2wkfjmaB2YRQ4c2tw+Zx0AMmN7cN6wEJxS3R+lAk4lHCAZ5QULvXLiP9hCV2dAW8hJw8YZSUdBBQ+J0F6sN2W3/8c2kP4aK8e5zQ3VCfN8bYQ9xH+Hh2BV9AE2Lh5ws6gN95AAAAAElFTkSuQmCC';

function getTelegramWebApp() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
}

export default function SignatureApp() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const sessionToken = searchParams.get('token') || '';
  const telegramWebApp = getTelegramWebApp();
  const initData = telegramWebApp?.initData || '';

  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();
  }, [telegramWebApp]);

  useEffect(() => {
    async function loadSession() {
      if (!sessionToken) {
        setError('Missing signature token.');
        setStatus('error');
        return;
      }
      if (isE2ETestMode && getE2EQueryParam('e2eTelegram', '') === 'mock') {
        setSession({
          status: 'awaiting_signature',
          companyName: 'E2E Logistics',
          appSlug: 'e2e-company',
          consentAccepted: true,
          expired: false,
        });
        setStatus('ready');
        return;
      }
      try {
        const getStatus = httpsCallable(functions, 'getTelegramSessionStatus');
        const response = await getStatus({ sessionToken, initData });
        const data = response.data || {};
        if (data.expired || data.status !== 'awaiting_signature' || !data.consentAccepted) {
          setError('This signature session is not ready. Please return to Telegram.');
          setStatus('error');
          return;
        }
        setSession(data);
        setStatus('ready');
      } catch (err) {
        console.error('[SignatureApp] Session load failed:', err);
        setError(err?.message || 'Could not load the signature session.');
        setStatus('error');
      }
    }
    loadSession();
  }, [initData, sessionToken]);

  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setTimeout(() => {
      initializeSignatureCanvas();
      clearCanvas();
    }, 50);
    return () => clearTimeout(timer);
  }, [status]);

  const saveSignature = () => {
    if (isE2ETestMode && getE2EQueryParam('e2eTelegramSig', '') === 'mock') {
      setSignature(E2E_SIGNATURE_DATA_URL);
      return;
    }
    const dataUrl = getSignatureDataUrl();
    if (!dataUrl || dataUrl.length < 100) {
      setError('Please draw your signature first.');
      return;
    }
    setError('');
    setSignature(dataUrl);
  };

  const clearSignature = () => {
    clearCanvas();
    setSignature('');
    setError('');
  };

  const submitSignature = async () => {
    if (!signature) return;
    setSubmitting(true);
    setError('');
    try {
      if (isE2ETestMode && getE2EQueryParam('e2eTelegram', '') === 'mock') {
        setResult({ confirmationNumber: 'SAF-2026-E2E01', applicationId: 'e2e-app' });
        return;
      }
      const complete = httpsCallable(functions, 'completeTelegramApplication');
      const response = await complete({ sessionToken, signature, initData });
      setResult(response.data || {});
      setTimeout(() => telegramWebApp?.close?.(), 1500);
    } catch (err) {
      console.error('[SignatureApp] Submit failed:', err);
      setError(err?.message || 'Could not submit your signature.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white border border-red-100 rounded-xl p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Signature unavailable</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white border border-green-100 rounded-xl p-6 text-center shadow-sm">
          <CheckCircle className="text-green-600 mx-auto mb-3" size={42} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Application submitted</h1>
          {result.confirmationNumber && (
            <p className="text-sm text-gray-600">
              Confirmation: <span className="font-mono font-bold">{result.confirmationNumber}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <section className="max-w-md mx-auto bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Sign application</h1>
              <p className="text-xs text-gray-500">{session?.companyName || 'SafeHaul'}</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Draw your legal signature below. Your consent was accepted in Telegram before this step.
          </p>

          <div className="border-2 border-dashed border-blue-200 rounded-xl h-44 bg-white overflow-hidden">
            <canvas id="signature-canvas" className="w-full h-full cursor-crosshair touch-none"></canvas>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={saveSignature}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Save size={18} /> Save
            </button>
            <button
              type="button"
              onClick={clearSignature}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200"
            >
              <Eraser size={18} /> Clear
            </button>
          </div>

          <button
            type="button"
            onClick={submitSignature}
            disabled={!signature || submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <PenTool size={18} />}
            Submit signature
          </button>
        </div>
      </section>
    </main>
  );
}
