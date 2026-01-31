const InputField = ({ label, id, name, type = 'text', value, onChange, required = false, placeholder, error, className = "" }) => {
    const isFile = type === 'file';

    const handleChange = (e) => {
        if (isFile) {
            // Special handling for files: always send the File object or null/undefined
            // Note: The onChange prop for file inputs should now be the handleFileUpload function from useFormLogic
            onChange(name, e.target.files[0] || null);
        } else {
            onChange(name, e.target.value);
        }
    };

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

    const baseClasses = "w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 text-gray-700";
    const statusClasses = error
        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
        : "border-gray-300 focus:ring-blue-500 focus:border-blue-500";

    const combinedClasses = `${baseClasses} ${statusClasses} ${className} ${isFile ? fileClasses : ''}`;

    const errorId = error ? `${id}-error` : undefined;

    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                {label} {required && <span className="text-red-500" aria-hidden="true">*</span>}
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
                required={required}
                aria-required={required}
                aria-invalid={!!error}
                aria-describedby={errorId}
                placeholder={placeholder}
                className={combinedClasses}
                {...fileInputProps}
            />
            {error && (
                <p id={errorId} className="mt-1 text-sm text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
};

export default InputField;