import React from 'react';

const InputField = ({ label, id, name, type = 'text', value, onChange, onBlur, required = false, placeholder, className = "", error }) => {
    const isFile = type === 'file';
    // C2: associate the error message with the input for assistive tech.
    const errorId = error ? `${id || name}-error` : undefined;

    const handleChange = (e) => {
        if (isFile) {
            // Special handling for files: always send the File object or null/undefined
            // Note: The onChange prop for file inputs should now be the handleFileUpload function from useFormLogic
            onChange(name, e.target.files[0] || null);
        } else {
            onChange(name, e.target.value);
        }
    };

    // C5 foundation: optional on-blur passthrough (same (name, value) shape as onChange)
    // so callers can validate a field once the user leaves it. No-op when not provided,
    // so existing call sites are unaffected.
    const handleBlur = onBlur
        ? (e) => onBlur(name, isFile ? (e.target.files?.[0] || null) : e.target.value)
        : undefined;

    // Determine the current file status for display
    let fileStatusText = '';
    let isFileUploaded = false;
    if (isFile && value) {
        if (value instanceof File) {
            fileStatusText = `Selected: ${value.name}`;
            // Or could show 'Ready for upload'
        } else if (value.name) {
            // Assume it's the { url, name } object from a loaded draft or successful upload
            fileStatusText = `Uploaded: ${value.name}`;
            isFileUploaded = true;
        }
    }

    const fileClasses = 'file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100';

    // For file inputs, we don't pass the 'value' prop to prevent React issues and allow re-uploads.
    const fileInputProps = isFile ? {
        // Important: leave value undefined for type="file"
    } : {
        value: value || ""
    };

    // C2: red border + red focus ring when invalid; default blue otherwise.
    const stateClasses = error
        ? 'border-red-400 focus:ring-red-500'
        : 'border-gray-300 focus:ring-blue-500';

    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
                {isFile && fileStatusText && (
                    <span className={`ml-2 text-xs font-normal ${isFileUploaded ? 'text-green-600' : 'text-blue-500'}`}>
                        ({fileStatusText})
                    </span>
                )}
            </label>
            <input
                type={type}
                id={id}
                name={name}
                onChange={handleChange}
                onBlur={handleBlur}
                required={required}
                placeholder={placeholder}
                // C2: WCAG 2.1 AA — programmatically expose required/invalid state and the
                // associated error message so screen readers announce them.
                aria-required={required || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorId}
                className={'w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 text-gray-700 ' + stateClasses + ' ' + className + ' ' + (isFile ? fileClasses : '')}
                {...fileInputProps}
            />
            {error && (
                <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
};

export default InputField;
