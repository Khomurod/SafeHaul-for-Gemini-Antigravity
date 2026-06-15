import React from 'react';
import { Wand2, PencilLine } from 'lucide-react';

/**
 * Presentational intake chooser for the public driver application (D1).
 *
 * First incremental extraction from the ~970-line PublicApplyHandler god-component
 * (container/presentational split). Pure/stateless — all behaviour stays in the
 * container via props, so this is behaviour-identical and guarded by the existing
 * PublicApplyHandler intake test.
 *
 * @param {object} props
 * @param {string} props.companyName
 * @param {() => void} props.onChooseAutoFill
 * @param {() => void} props.onChooseManual
 * @param {React.RefObject<HTMLInputElement>} props.cdlInputRef
 * @param {(event: React.ChangeEvent<HTMLInputElement>) => void} props.onCdlFileChange
 */
export function IntakeChooser({ companyName, onChooseAutoFill, onChooseManual, cdlInputRef, onCdlFileChange }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200 max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{companyName}</h1>
          <p className="text-gray-600">
            How would you like to start your driver application?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onChooseAutoFill}
            className="rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 p-6 text-left transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <Wand2 className="text-blue-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-900">Upload CDL for Auto-Fill (Fastest)</h3>
            </div>
            <p className="text-sm text-gray-600">
              Upload one CDL photo and we pre-fill your name, date of birth, address, CDL number, and expiration date.
            </p>
          </button>

          <button
            type="button"
            onClick={onChooseManual}
            className="rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 p-6 text-left transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <PencilLine className="text-gray-700" size={20} />
              <h3 className="text-lg font-semibold text-gray-900">Fill Out Manually</h3>
            </div>
            <p className="text-sm text-gray-600">
              Start at Step 1 and enter everything by hand, just like the current flow.
            </p>
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          You can review and edit everything before submitting.
        </div>

        <input
          ref={cdlInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={onCdlFileChange}
        />
      </div>
    </div>
  );
}

export default IntakeChooser;
