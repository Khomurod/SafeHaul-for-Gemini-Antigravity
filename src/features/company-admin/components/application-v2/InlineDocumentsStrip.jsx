import React from 'react';
import { FileText, Image, Eye, Download, AlertCircle } from 'lucide-react';

/**
 * InlineDocumentsStrip - Horizontal row of document thumbnail cards with quick view
 */
export function InlineDocumentsStrip({
    documents = {},
    fileUrls = {},
    onViewDocument
}) {
    // Define expected documents
    const documentTypes = [
        { key: 'cdlFront', label: 'CDL Front', required: true },
        { key: 'cdlBack', label: 'CDL Back', required: true },
        { key: 'medicalCard', label: 'Medical Card', required: true },
        { key: 'mvr', label: 'MVR', required: false },
        { key: 'ssnCard', label: 'SSN Card', required: false },
        { key: 'proofOfAddress', label: 'Proof of Address', required: false },
    ];

    // Merge documents and fileUrls
    const allDocs = { ...documents };
    Object.entries(fileUrls).forEach(([key, url]) => {
        if (url && !allDocs[key]) {
            allDocs[key] = { url };
        }
    });

    const isImage = (url) => {
        if (!url) return false;
        const lower = url.toLowerCase();
        return lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp');
    };

    const handleView = (docKey, docData) => {
        const url = docData?.url || docData;
        if (url && onViewDocument) {
            onViewDocument(docKey, url);
        } else if (url) {
            window.open(url, '_blank');
        }
    };

    const uploadedCount = documentTypes.filter(dt => allDocs[dt.key]).length;
    const requiredCount = documentTypes.filter(dt => dt.required).length;
    const requiredUploaded = documentTypes.filter(dt => dt.required && allDocs[dt.key]).length;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Documents</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${requiredUploaded === requiredCount
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                    {uploadedCount}/{documentTypes.length} uploaded
                </span>
            </div>

            {/* Document Thumbnails */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {documentTypes.map(docType => {
                    const docData = allDocs[docType.key];
                    const url = docData?.url || docData;
                    const hasDoc = !!url;
                    const isImg = isImage(url);

                    return (
                        <div
                            key={docType.key}
                            className={`relative shrink-0 w-24 h-20 rounded-lg border-2 overflow-hidden group cursor-pointer transition ${hasDoc
                                    ? 'border-gray-200 hover:border-blue-400'
                                    : docType.required
                                        ? 'border-dashed border-amber-300 bg-amber-50'
                                        : 'border-dashed border-gray-200 bg-gray-50'
                                }`}
                            onClick={() => hasDoc && handleView(docType.key, docData)}
                        >
                            {hasDoc ? (
                                <>
                                    {/* Thumbnail */}
                                    {isImg ? (
                                        <img
                                            src={url}
                                            alt={docType.label}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                            <FileText size={24} className="text-gray-400" />
                                        </div>
                                    )}

                                    {/* Hover Overlay */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition">
                                            <Eye size={14} />
                                        </button>
                                        <a
                                            href={url}
                                            download
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition"
                                        >
                                            <Download size={14} />
                                        </a>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    {docType.required ? (
                                        <AlertCircle size={16} className="text-amber-400 mb-1" />
                                    ) : (
                                        <Image size={16} className="text-gray-300 mb-1" />
                                    )}
                                </div>
                            )}

                            {/* Label */}
                            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-white text-[10px] text-center truncate">
                                {docType.label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default InlineDocumentsStrip;
