import React from 'react';
import { UploadCloud, Clock } from 'lucide-react';
import DateTripletField from '@shared/components/form/DateTripletField';

const DynamicQuestionRenderer = ({
    question,
    index,
    formData,
    onAnswerChange,
    onCheckboxChange,
    handleFileUpload
}) => {
    const ty = new Date().getFullYear();
    const questionKey = (q, idx) => q.id || q.key || `custom-question-${idx}`;
    const qKey = typeof question === 'string' ? question : questionKey(question, index);
    const answer = (formData.customAnswers && formData.customAnswers[qKey]) || '';

    if (typeof question === 'string') {
        return (
            <div key={index} className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">
                    {question} <span className="text-red-500">*</span>
                </label>
                <textarea
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    value={answer}
                    onChange={(e) => onAnswerChange(qKey, e.target.value)}
                    required
                />
            </div>
        );
    }

    const q = question;
    const key = qKey;

    switch (q.type) {
        case 'paragraph':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <textarea
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        rows={4}
                        value={answer}
                        onChange={(e) => onAnswerChange(key, e.target.value)}
                        required={q.required}
                    />
                </div>
            );

        case 'shortAnswer':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={answer}
                        onChange={(e) => onAnswerChange(key, e.target.value)}
                        required={q.required}
                    />
                </div>
            );

        case 'multipleChoice':
            return (
                <div key={key} className="space-y-3">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <div className="space-y-2">
                        {q.options?.map((opt, i) => (
                            <label key={i} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                                <input
                                    type="radio"
                                    name={key}
                                    value={opt}
                                    checked={answer === opt}
                                    onChange={(e) => onAnswerChange(key, e.target.value)}
                                    required={q.required}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span className="text-sm text-gray-700">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
            );

        case 'checkboxes': {
            const selectedOptions = Array.isArray(answer) ? answer : [];
            return (
                <div key={key} className="space-y-3">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <div className="space-y-2">
                        {q.options?.map((opt, i) => (
                            <label key={i} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={selectedOptions.includes(opt)}
                                    onChange={() => onCheckboxChange(key, opt)}
                                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
            );
        }

        case 'dropdown':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <select
                        className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={answer}
                        onChange={(e) => onAnswerChange(key, e.target.value)}
                        required={q.required}
                    >
                        <option value="">Select an option...</option>
                        {q.options?.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            );

        case 'date':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <DateTripletField
                        label=""
                        idPrefix={`dyn-q-${key}`}
                        name={String(key)}
                        value={answer}
                        onChange={(_, v) => onAnswerChange(key, v)}
                        required={q.required}
                        maxToday={false}
                        minYear={ty - 100}
                        maxYear={ty + 25}
                        helpText="Month / Day / Year."
                    />
                </div>
            );

        case 'time':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}
                    <div className="relative">
                        <Clock size={18} className="absolute left-3 top-3.5 text-gray-400" />
                        <input
                            type="time"
                            className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={answer}
                            onChange={(e) => onAnswerChange(key, e.target.value)}
                            required={q.required}
                        />
                    </div>
                </div>
            );

        case 'fileUpload':
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}

                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 text-center hover:bg-gray-100 transition-colors">
                        <input
                            type="file"
                            id={`file-${key}`}
                            className="hidden"
                            required={q.required && !answer}
                            onChange={(e) => {
                                if (handleFileUpload) handleFileUpload(key, e.target.files[0]);
                                onAnswerChange(key, e.target.files[0]?.name || '');
                            }}
                        />
                        <label htmlFor={`file-${key}`} className="cursor-pointer flex flex-col items-center">
                            <UploadCloud size={24} className="text-blue-500 mb-2" />
                            <span className="text-sm text-blue-600 font-medium">Click to upload file</span>
                            {answer && <span className="text-xs text-gray-500 mt-2">Selected: {answer}</span>}
                        </label>
                    </div>
                </div>
            );

        case 'linearScale': {
            const min = q.min ?? 1;
            const max = q.max ?? 5;
            const scaleValues = Array.from({ length: max - min + 1 }, (_, i) => min + i);
            return (
                <div key={key} className="space-y-3">
                    <label className="block text-sm font-bold text-gray-800">
                        {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.helpText && <p className="text-xs text-gray-500">{q.helpText}</p>}

                    <div className="flex items-center justify-between gap-4 max-w-md mx-auto py-2">
                        <span className="text-xs text-gray-500 font-medium">{q.minLabel || 'Min'}</span>
                        <div className="flex gap-4">
                            {scaleValues.map(val => (
                                <label key={val} className="flex flex-col items-center gap-1 cursor-pointer">
                                    <input
                                        type="radio"
                                        name={key}
                                        value={val}
                                        checked={Number(answer) === val}
                                        onChange={(e) => onAnswerChange(key, Number(e.target.value))}
                                        required={q.required}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-xs text-gray-600">{val}</span>
                                </label>
                            ))}
                        </div>
                        <span className="text-xs text-gray-500 font-medium">{q.maxLabel || 'Max'}</span>
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
};

export default DynamicQuestionRenderer;
