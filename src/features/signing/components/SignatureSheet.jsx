import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { ChevronLeft, Eraser } from 'lucide-react';

/**
 * Signature / initials capture surface shared by mobile and desktop.
 *
 * Fullscreen on phones (maximum drawing area for a finger), centered dialog on
 * md+ screens. Uses react-signature-canvas so strokes are smoothed and the
 * adopted PNG is trimmed to the ink bounding box.
 */
export function SignatureSheet({ kind = 'signature', onCancel, onAdopt }) {
    const padRef = useRef(null);
    const wrapperRef = useRef(null);
    const [size, setSize] = useState({ width: 320, height: 200 });
    const isInitial = kind === 'initial';

    // The canvas element needs explicit pixel dimensions (width/height attrs).
    // Measure the flexible wrapper and re-measure on resize/rotation — an
    // orientation change mid-signature re-sizes the pad (drawing is cleared by
    // the library on resize, which is acceptable: a half-drawn signature at the
    // old aspect would be distorted anyway).
    useEffect(() => {
        const measure = () => {
            const el = wrapperRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setSize({
                width: Math.max(280, Math.floor(rect.width)),
                height: Math.max(160, Math.floor(rect.height)),
            });
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, []);

    const clear = () => padRef.current?.clear();

    const adopt = () => {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return;
        let dataUrl;
        try {
            // Trim whitespace so the ink fills the field box when stamped.
            dataUrl = pad.getTrimmedCanvas().toDataURL('image/png');
        } catch {
            // Trimming depends on a canvas API that may be unavailable (tests).
            dataUrl = pad.toDataURL('image/png');
        }
        onAdopt(dataUrl);
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-center md:items-center md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={isInitial ? 'Draw your initials' : 'Draw your signature'}
        >
            <div className="bg-white flex flex-col w-full h-full md:h-auto md:max-w-xl md:rounded-2xl md:shadow-2xl overflow-hidden">
                <div
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white"
                    style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
                >
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-gray-600 font-medium flex items-center gap-1 -ml-1 px-2 py-1"
                    >
                        <ChevronLeft size={20} /> Cancel
                    </button>
                    <h2 className="font-bold text-gray-900">
                        {isInitial ? 'Draw your initials' : 'Draw your signature'}
                    </h2>
                    <button
                        type="button"
                        onClick={clear}
                        className="text-blue-600 font-medium px-2 py-1 flex items-center gap-1"
                    >
                        <Eraser size={16} /> Clear
                    </button>
                </div>

                <div
                    ref={wrapperRef}
                    className="flex-1 md:flex-none md:h-72 mx-4 my-4 border-2 border-dashed border-gray-300 rounded-xl bg-white relative"
                >
                    <SignatureCanvas
                        ref={padRef}
                        canvasProps={{
                            width: size.width,
                            height: size.height,
                            className: 'rounded-xl',
                            // touchAction none: strokes must never scroll the page.
                            style: { touchAction: 'none', width: '100%', height: '100%' },
                            'data-testid': 'signature-sheet-canvas',
                        }}
                        penColor="#0f172a"
                        minWidth={1.2}
                        maxWidth={2.6}
                        velocityFilterWeight={0.7}
                    />
                    <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none">
                        {isInitial ? 'Draw your initials' : 'Sign'} with your finger or mouse
                    </p>
                </div>

                <div
                    className="px-4 pb-4 bg-white border-t border-gray-100"
                    style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                >
                    <p className="text-[11px] text-gray-500 my-3 leading-snug">
                        By tapping Adopt, you agree this drawing is your legal{' '}
                        {isInitial ? 'initials' : 'signature'} and will be applied where you tap{' '}
                        {isInitial ? 'Initial' : 'Sign'} in this document.
                    </p>
                    <button
                        type="button"
                        onClick={adopt}
                        className="w-full py-4 md:py-3 bg-blue-600 text-white font-bold rounded-xl shadow active:scale-[0.98] transition"
                    >
                        Adopt &amp; continue
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SignatureSheet;
