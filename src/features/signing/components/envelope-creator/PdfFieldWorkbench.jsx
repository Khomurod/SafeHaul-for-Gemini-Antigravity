import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { ResizableDraggableField } from './ResizableDraggableField';
import {
    PDF_VIEWPORT_WIDTH_DEFAULT,
    clampPdfViewportWidth,
    zoomPercentLabel,
} from '@features/signing/utils/envelopePdfZoom';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

/**
 * Center column of the envelope creator: PDF viewer with zoom controls and the
 * draggable field overlay per page. Extracted verbatim from EnvelopeCreator.jsx.
 */
export function PdfFieldWorkbench({
    workbenchRef,
    file,
    numPages,
    setNumPages,
    activePage,
    pageRefs,
    pageDimensions,
    onPageLoadSuccess,
    pdfViewportWidth,
    setPdfViewportWidth,
    fields,
    selectedFieldId,
    setSelectedFieldId,
    updateFieldPosition,
    updateFieldSize,
    removeField,
    updateFieldLabel,
    getIcon,
}) {
    return (
        <div
            ref={workbenchRef}
            className="flex-1 overflow-y-auto bg-gray-200 p-8 flex justify-center relative scroll-smooth"
            onClick={() => setSelectedFieldId(null)}
        >
            {file && (
                <div
                    className="absolute top-3 right-6 z-30 flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-300 bg-white/95 px-2 py-1.5 text-[11px] shadow-md backdrop-blur-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="font-bold text-gray-500 pr-0.5">PDF zoom</span>
                    <button
                        type="button"
                        title="Zoom out"
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-700"
                        onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w - 48))}
                    >
                        <ZoomOut size={14} />
                    </button>
                    <button
                        type="button"
                        title="Reset zoom"
                        className="min-w-[3rem] px-1.5 py-0.5 rounded-md bg-gray-100 font-mono font-bold text-gray-800 hover:bg-gray-200"
                        onClick={() => setPdfViewportWidth(PDF_VIEWPORT_WIDTH_DEFAULT)}
                    >
                        {zoomPercentLabel(pdfViewportWidth)}%
                    </button>
                    <button
                        type="button"
                        title="Zoom in"
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-700"
                        onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w + 48))}
                    >
                        <ZoomIn size={14} />
                    </button>
                    <span className="hidden md:inline text-gray-400 border-l border-gray-200 pl-2 ml-0.5">
                        Ctrl/⌘ + scroll
                    </span>
                </div>
            )}
            {file && (
                <Document
                    file={file}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="flex flex-col gap-8 pb-16"
                >
                    {numPages > 0 && Array.from(new Array(numPages), (el, index) => {
                        const pageNum = index + 1;
                        const dims = pageDimensions[pageNum];

                        return (
                            <div key={pageNum} ref={(el) => (pageRefs.current[pageNum] = el)} data-page-num={pageNum} className={`relative shadow-2xl border-2 bg-white inline-block ring-1 ring-black/5 ${activePage === pageNum ? 'border-blue-400' : 'border-gray-400'}`}>
                                {/* FEAT-1: Page label badge */}
                                <div className={`absolute top-2 left-2 z-20 px-2 py-1 rounded-md text-[10px] font-bold ${activePage === pageNum ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                    Page {pageNum} / {numPages}
                                </div>
                                <Page
                                    pageNumber={pageNum}
                                    width={pdfViewportWidth}
                                    onLoadSuccess={onPageLoadSuccess}
                                    renderAnnotationLayer={false}
                                    renderTextLayer={false}
                                />
                                <div className="absolute inset-0 z-10 pointer-events-none">
                                    {fields.filter(f => f.page === pageNum).map((field) => (
                                        <ResizableDraggableField
                                            key={field.id}
                                            field={field}
                                            pageNum={pageNum}
                                            pageWidth={pdfViewportWidth}
                                            pageHeight={dims ? dims.height : 900}
                                            onStop={updateFieldPosition}
                                            onResize={updateFieldSize}
                                            onRemove={removeField}
                                            getIcon={getIcon}
                                            onLabelChange={updateFieldLabel}
                                            isSelected={selectedFieldId === field.id}
                                            onSelect={setSelectedFieldId}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </Document>
            )}
        </div>
    );
}

export default PdfFieldWorkbench;
