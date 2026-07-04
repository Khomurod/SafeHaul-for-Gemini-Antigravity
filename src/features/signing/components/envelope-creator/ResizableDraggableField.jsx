import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { X, Scaling } from 'lucide-react';

/** Resizable & draggable field overlay — extracted verbatim from EnvelopeCreator.jsx. */
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
                className={`absolute cursor-move pointer-events-auto border-2 rounded flex flex-col shadow-lg transition z-50 group
                    ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                    ${field.type === 'signature' ? 'bg-yellow-400/80 border-yellow-600' :
                        field.type === 'initial' ? 'bg-orange-300/80 border-orange-600' :
                            field.type === 'text' ? 'bg-blue-100/90 border-blue-500' :
                                field.type === 'date' ? 'bg-green-100/90 border-green-500' :
                                    'bg-purple-100/90 border-purple-500'}`
                }
                style={{ width: size.width, height: size.height }}
            >
                <div className="flex items-center gap-1 p-1 overflow-hidden shrink-0">
                    {getIcon(field.type)}
                    {size.width > 40 && (
                        <input
                            className="label-input bg-transparent border-none text-[9px] font-bold uppercase w-full focus:ring-0 p-0 truncate cursor-text"
                            value={field.label}
                            onChange={(e) => onLabelChange(field.id, e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                <button
                    onMouseDown={(e) => { e.stopPropagation(); onRemove(field.id); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-700 z-50"
                >
                    <X size={10} />
                </button>

                <div
                    className="resize-handle absolute bottom-0 right-0 w-3 h-3 cursor-se-resize flex items-end justify-end p-0.5 opacity-0 group-hover:opacity-100 transition"
                    onMouseDown={handleMouseDown}
                >
                    <Scaling size={10} className="text-gray-600" />
                </div>
            </div>
        </Draggable>
    );
});

export default ResizableDraggableField;
