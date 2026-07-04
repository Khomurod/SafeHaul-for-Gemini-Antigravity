import React from 'react';
import { PenTool, Fingerprint } from 'lucide-react';
import { isFieldLocked } from '@features/signing/utils/prefillEngine';
import { SignerFieldOverlay } from '@features/signing/components/SignerFieldOverlay';

/**
 * Renders one signer-facing field overlay (text/date/checkbox/signature/initial).
 * Extracted verbatim from SigningRoom.jsx's renderField switch.
 */

const fillClass = 'w-full h-full min-w-0 min-h-0 box-border';

export function SignerField({
    field,
    signed,
    fieldValues,
    handleFieldChange,
    handleFieldFocus,
    handleEnterAdvance,
    handleSignatureTap,
}) {
    if (signed) return null;

    switch (field.type) {
        case 'text': {
            if (isFieldLocked(field)) {
                return (
                    <SignerFieldOverlay field={field} interactive={false}>
                        <div className={`${fillClass} border-2 border-blue-300 bg-blue-50/90 px-2 text-sm rounded flex items-center text-gray-700 font-medium overflow-hidden`}>
                            {field.defaultValue || ''}
                        </div>
                    </SignerFieldOverlay>
                );
            }
            return (
                <SignerFieldOverlay field={field}>
                    <input
                        className={`${fillClass} border-2 border-blue-400 bg-blue-50/90 px-2 text-base md:text-sm rounded`}
                        placeholder="Type here..."
                        value={fieldValues[field.id] || ''}
                        data-signer-input={field.id}
                        enterKeyHint="next"
                        onFocus={handleFieldFocus}
                        onKeyDown={handleEnterAdvance(field)}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    />
                </SignerFieldOverlay>
            );
        }
        case 'date': {
            if (isFieldLocked(field)) {
                return (
                    <SignerFieldOverlay field={field} interactive={false}>
                        <div className={`${fillClass} border-2 border-green-300 bg-green-50/90 px-2 text-sm rounded flex items-center text-gray-700 font-medium overflow-hidden`}>
                            {field.defaultValue || ''}
                        </div>
                    </SignerFieldOverlay>
                );
            }
            return (
                <SignerFieldOverlay field={field}>
                    <input
                        type="date"
                        className={`${fillClass} border-2 border-green-400 bg-green-50/90 px-2 text-base md:text-sm rounded`}
                        value={fieldValues[field.id] || ''}
                        data-signer-input={field.id}
                        onFocus={handleFieldFocus}
                        onKeyDown={handleEnterAdvance(field)}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    />
                </SignerFieldOverlay>
            );
        }
        case 'checkbox':
            return (
                <SignerFieldOverlay field={field}>
                    <label className={`${fillClass} flex items-center justify-center cursor-pointer m-0`}>
                        <input
                            type="checkbox"
                            className="w-full h-full max-w-full max-h-full min-w-0 min-h-0 accent-purple-600 cursor-pointer m-0"
                            checked={!!fieldValues[field.id]}
                            onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                        />
                    </label>
                </SignerFieldOverlay>
            );
        case 'signature':
        case 'initial': {
            const isInitial = field.type === 'initial';
            const value = fieldValues[field.id];
            const palette = isInitial
                ? { signed: 'bg-orange-50/80 border-orange-500', empty: 'bg-orange-50/90 border-orange-400 hover:bg-orange-100 animate-pulse', text: 'text-orange-700' }
                : { signed: 'bg-yellow-50/80 border-yellow-500', empty: 'bg-yellow-50/90 border-yellow-400 hover:bg-yellow-100 animate-pulse', text: 'text-yellow-700' };
            return (
                <SignerFieldOverlay field={field}>
                    <button
                        type="button"
                        onClick={() => handleSignatureTap(field)}
                        aria-label={
                            value
                                ? (isInitial ? 'Initials added — tap to redraw' : 'Signature added — tap to redraw')
                                : (isInitial ? 'Tap to add initials' : 'Tap to sign')
                        }
                        className={`${fillClass} cursor-pointer border-2 ${value ? 'border-solid p-0.5' : 'border-dashed'} rounded flex items-center justify-center gap-1 shadow-sm transition ${value ? palette.signed : palette.empty}`}
                    >
                        {value ? (
                            // Show the actual ink on the document — the signer
                            // sees exactly what the sealed PDF will contain.
                            <img
                                src={value}
                                alt={isInitial ? 'Your initials' : 'Your signature'}
                                className="w-full h-full object-contain pointer-events-none"
                                draggable={false}
                            />
                        ) : (
                            <span className={`${palette.text} font-medium text-xs flex items-center gap-1`}>
                                {isInitial ? <Fingerprint size={12} /> : <PenTool size={14} />}
                                {isInitial ? 'Initial' : 'Sign'}
                            </span>
                        )}
                    </button>
                </SignerFieldOverlay>
            );
        }
        default:
            return null;
    }
}

export default SignerField;
