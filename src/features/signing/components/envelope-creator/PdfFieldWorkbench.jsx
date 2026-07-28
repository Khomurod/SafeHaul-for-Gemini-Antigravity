import React, { useId } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton, Button } from '@/design-system/components';
import { ResizableDraggableField } from './ResizableDraggableField';
import { AiSuggestionOverlay } from './AiSuggestionOverlay';
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
 * draggable field overlay per page.
 *
 * Presentation only. Everything the rest of the creator depends on is frozen:
 * the `workbenchRef` the Ctrl/⌘+wheel listener tests with `el.contains(e.target)`,
 * the canvas click that deselects, the toolbar's `stopPropagation` so its own
 * clicks do not deselect, the exact ±48 px zoom steps through
 * `clampPdfViewportWidth`, the `PDF_VIEWPORT_WIDTH_DEFAULT` reset,
 * `zoomPercentLabel`, `onLoadSuccess({ numPages })`, the `pageRefs` registration,
 * the `data-page-num` attribute, the `Page {n} / {total}` badge text, the
 * `renderAnnotationLayer`/`renderTextLayer` flags, the `pointer-events-none`
 * overlay layer, the `f.page === pageNum` filter and the
 * `pageHeight={dims ? dims.height : 900}` fallback.
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
    // AI Field Assistant. Suggestions render in their own layer above the field
    // layer and are never part of `fields` until the reviewer applies them.
    aiSuggestions = [],
    selectedSuggestionId = null,
    onSelectSuggestion,
    onMoveSuggestion,
    onResizeSuggestion,
    onAcceptSuggestion,
    onRejectSuggestion,
}) {
    const rawId = useId().replace(/:/g, '');
    const zoomLabelId = `pdf-zoom-label-${rawId}`;
    const zoomPercent = zoomPercentLabel(pdfViewportWidth);

    return (
        <div
            ref={workbenchRef}
            className="relative flex flex-1 justify-center overflow-y-auto bg-ds-canvas p-ds-8 scroll-smooth"
            onClick={() => setSelectedFieldId(null)}
        >
            {file && (
                <div
                    role="group"
                    aria-labelledby={zoomLabelId}
                    className="absolute right-6 top-3 z-30 flex flex-wrap items-center gap-ds-1 rounded-ds-xl border border-ds-border bg-ds-surface px-ds-2 py-ds-1 text-ds-xs shadow-ds-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span id={zoomLabelId} className="pr-0.5 font-bold text-ds-content-secondary">PDF zoom</span>
                    <IconButton
                        label="Zoom out"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w - 48))}
                    >
                        <ZoomOut size={14} aria-hidden="true" />
                    </IconButton>
                    <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Reset zoom to 100 percent, currently ${zoomPercent} percent`}
                        className="min-w-[3rem] font-mono"
                        onClick={() => setPdfViewportWidth(PDF_VIEWPORT_WIDTH_DEFAULT)}
                    >
                        {zoomPercent}%
                    </Button>
                    <IconButton
                        label="Zoom in"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPdfViewportWidth((w) => clampPdfViewportWidth(w + 48))}
                    >
                        <ZoomIn size={14} aria-hidden="true" />
                    </IconButton>
                    <span className="ml-0.5 hidden border-l border-ds-border-subtle pl-2 text-ds-content-secondary md:inline">
                        Ctrl/⌘ + scroll
                    </span>
                    {/* Announce the level so keyboard and screen-reader users get the
                        same feedback the visible percentage gives everyone else. */}
                    <span role="status" className="ds-visually-hidden">
                        {`Zoom ${zoomPercent} percent`}
                    </span>
                </div>
            )}
            {file && (
                <Document
                    file={file}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="flex flex-col gap-ds-8 pb-16"
                >
                    {numPages > 0 && Array.from(new Array(numPages), (el, index) => {
                        const pageNum = index + 1;
                        const dims = pageDimensions[pageNum];

                        return (
                            <div
                                key={pageNum}
                                ref={(el) => (pageRefs.current[pageNum] = el)}
                                data-page-num={pageNum}
                                className={`relative inline-block border-2 bg-ds-surface shadow-ds-lg ${
                                    activePage === pageNum ? 'border-ds-action-primary' : 'border-ds-border'
                                }`}
                            >
                                {/* FEAT-1: Page label badge */}
                                <div
                                    className={`absolute left-2 top-2 z-20 rounded-ds-md px-2 py-1 text-ds-xs font-bold ${
                                        activePage === pageNum
                                            ? 'bg-ds-action-primary text-ds-content-inverse'
                                            : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg'
                                    }`}
                                >
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
                                {aiSuggestions.length > 0 && (
                                    <div
                                        className="absolute inset-0 z-20 pointer-events-none"
                                        aria-label={`AI field suggestions on page ${pageNum}`}
                                        role="group"
                                    >
                                        {aiSuggestions
                                            .filter((suggestion) => suggestion.page === pageNum)
                                            .map((suggestion) => (
                                                <AiSuggestionOverlay
                                                    key={suggestion.suggestionId}
                                                    suggestion={suggestion}
                                                    pageNum={pageNum}
                                                    pageWidth={pdfViewportWidth}
                                                    pageHeight={dims ? dims.height : 900}
                                                    isSelected={selectedSuggestionId === suggestion.suggestionId}
                                                    onSelect={onSelectSuggestion}
                                                    onMove={onMoveSuggestion}
                                                    onResize={onResizeSuggestion}
                                                    onAccept={onAcceptSuggestion}
                                                    onReject={onRejectSuggestion}
                                                />
                                            ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Document>
            )}
        </div>
    );
}

export default PdfFieldWorkbench;
