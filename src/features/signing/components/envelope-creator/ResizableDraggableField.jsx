import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { X, Scaling } from 'lucide-react';

/**
 * Resizable & draggable field overlay.
 *
 * Presentation only. Every calculation below is frozen: the percentage↔pixel
 * conversions in both directions, the `pageHeight || 800` fallback, the 8 px
 * minimum size floor, the window-level mousemove/mouseup lifecycle, the
 * `bounds="parent"` constraint, the `.resize-handle, .label-input` drag
 * exclusions, the `size.width > 40` label threshold, and the exact
 * `onStop(id, pageNum, x%, y%)` / `onResize(id, w%, h%)` payloads.
 *
 * The two class names `resize-handle` and `label-input` are load-bearing — they
 * are the selectors react-draggable's `cancel` prop matches — so they are kept
 * verbatim alongside the token classes.
 *
 * Field-type tones use the same `--ds-*` status tokens as the sidebar palette,
 * which is what makes the palette a legend for these overlays.
 */

/**
 * Domain → visual mapping for a placed field. Merged only where the previous
 * hues were adjacent (signature yellow + initial orange → warning), so the four
 * groups stay distinguishable and match the palette buttons one-for-one.
 */
const FIELD_TONE = {
    signature: 'bg-ds-status-warning-bg border-ds-status-warning-border',
    initial: 'bg-ds-status-warning-bg border-ds-status-warning-border',
    text: 'bg-ds-status-info-bg border-ds-status-info-border',
    date: 'bg-ds-status-success-bg border-ds-status-success-border',
};
const FIELD_TONE_FALLBACK = 'bg-ds-status-accent-bg border-ds-status-accent-border';

export const ResizableDraggableField = React.memo(({ field, pageNum, pageWidth, pageHeight, onStop, onResize, onRemove, getIcon, onLabelChange, isSelected, onSelect }) => {
    const nodeRef = useRef(null);
    const safePageHeight = pageHeight || 800;
    const wPx = (field.width / 100) * pageWidth;
    const hPx = (field.height / 100) * safePageHeight;
    const xPx = (field.x / 100) * pageWidth;
    const yPx = (field.y / 100) * safePageHeight;

    const [size, setSize] = useState({ width: wPx, height: hPx });
    const sizeRef = useRef({ width: wPx, height: hPx });

    useEffect(() => {
        const next = { width: wPx, height: hPx };
        setSize(next);
        sizeRef.current = next;
    }, [wPx, hPx]);

    const handleMouseDown = (e) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = sizeRef.current.width;
        const startHeight = sizeRef.current.height;

        const doDrag = (dragEvent) => {
            const next = {
                // PRECISION FIX: Minimum size reduced to 8px
                width: Math.max(8, startWidth + dragEvent.clientX - startX),
                height: Math.max(8, startHeight + dragEvent.clientY - startY),
            };
            sizeRef.current = next;
            setSize(next);
        };

        const stopDrag = () => {
            window.removeEventListener('mousemove', doDrag);
            window.removeEventListener('mouseup', stopDrag);
            const { width, height } = sizeRef.current;
            onResize(field.id, (width / pageWidth) * 100, (height / safePageHeight) * 100);
        };

        window.addEventListener('mousemove', doDrag);
        window.addEventListener('mouseup', stopDrag);
    };

    const handleDragStop = (e, data) => {
        onStop(field.id, pageNum, (data.x / pageWidth) * 100, (data.y / safePageHeight) * 100);
    };

    const tone = FIELD_TONE[field.type] || FIELD_TONE_FALLBACK;
    const fieldName = field.label || 'Untitled field';

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            position={{ x: xPx, y: yPx }}
            onStop={handleDragStop}
            cancel=".resize-handle, .label-input"
        >
            <div
                ref={nodeRef}
                onClick={(e) => { e.stopPropagation(); onSelect(field.id); }}
                className={`group absolute z-50 flex cursor-move flex-col rounded-ds-sm border-2 pointer-events-auto shadow-ds-md transition
                    ${isSelected ? 'ring-2 ring-ds-focus ring-offset-1' : ''}
                    ${tone}`
                }
                style={{ width: size.width, height: size.height }}
            >
                <div className="flex shrink-0 items-center gap-ds-1 overflow-hidden p-ds-1">
                    <span aria-hidden="true" className="text-ds-content">{getIcon(field.type)}</span>
                    {size.width > 40 && (
                        <input
                            className="label-input w-full cursor-text truncate border-none bg-transparent p-0 text-ds-xs font-bold uppercase text-ds-content focus:ring-0"
                            aria-label={`Label for ${field.type} field on page ${pageNum}`}
                            value={field.label}
                            onChange={(e) => onLabelChange(field.id, e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                <button
                    type="button"
                    aria-label={`Remove ${fieldName} from page ${pageNum}`}
                    onMouseDown={(e) => { e.stopPropagation(); onRemove(field.id); }}
                    className="absolute -right-2 -top-2 z-50 rounded-full bg-ds-action-danger p-0.5 text-ds-content-inverse shadow-ds-sm focus-visible:outline-none focus-visible:shadow-ds-focus"
                >
                    <X size={10} aria-hidden="true" />
                </button>

                {/* The resize affordance stays a pointer-only control: react-draggable
                    cancels dragging on `.resize-handle`, and the mousemove/mouseup
                    mathematics above is frozen. Keyboard-operable placement is an open
                    item recorded against the sub-slice F close-out. It is no longer
                    hover-only, so touch and low-vision users can see it. */}
                <div
                    className="resize-handle absolute bottom-0 right-0 flex h-3 w-3 cursor-se-resize items-end justify-end p-0.5 opacity-60 transition group-hover:opacity-100"
                    onMouseDown={handleMouseDown}
                    aria-hidden="true"
                >
                    <Scaling size={10} className="text-ds-content-secondary" />
                </div>
            </div>
        </Draggable>
    );
});

export default ResizableDraggableField;
