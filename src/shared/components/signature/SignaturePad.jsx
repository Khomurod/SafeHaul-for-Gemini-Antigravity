import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SignaturePad
 * ============
 * Plain-canvas draw-to-sign component (no external dependency), extracted
 * verbatim from VerificationPortal.jsx so other flows can share it.
 *
 * Contract (unchanged from the original inline component):
 *  - `onSignatureChange(dataUrl)` is called with a `data:image/png;base64,...`
 *    string when the user finishes a stroke, and with `null` when cleared.
 *  - The canvas is 150px tall and stretches to its parent's width.
 *
 * NOTE: The driver application / offer modal / Telegram flows use
 * `src/lib/signature.js` (DOM-id based) and the signing room uses
 * `react-signature-canvas` (SignatureSheet). Those have different visuals and
 * validation semantics and are intentionally NOT migrated to this component.
 */
export function SignaturePad({ onSignatureChange }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        canvas.width = parent.offsetWidth;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#1a2332';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    useEffect(() => {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [resizeCanvas]);

    const getPosition = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        if (e.touches) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    };

    const startDrawing = (e) => {
        e.preventDefault();
        setIsDrawing(true);
        const ctx = canvasRef.current.getContext('2d');
        const pos = getPosition(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const ctx = canvasRef.current.getContext('2d');
        const pos = getPosition(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        if (!hasSignature) setHasSignature(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        if (hasSignature && canvasRef.current) {
            onSignatureChange(canvasRef.current.toDataURL('image/png'));
        }
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
        onSignatureChange(null);
    };

    return (
        <div>
            <div className="border-2 border-dashed border-gray-300 rounded-lg relative bg-white cursor-crosshair overflow-hidden"
                 style={{ touchAction: 'none' }}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full"
                />
                {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-gray-400 text-sm">Draw your signature here</span>
                    </div>
                )}
            </div>
            {hasSignature && (
                <button type="button" onClick={clearSignature}
                        className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline">
                    Clear Signature
                </button>
            )}
        </div>
    );
}

export default SignaturePad;
