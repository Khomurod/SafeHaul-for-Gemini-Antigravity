import React from 'react';

/** Radio button helper — extracted verbatim from VerificationPortal.jsx. */
export const RadioGroup = ({ name, value, onChange, options, error: fieldError }) => (
    <div>
        <div className="flex flex-wrap gap-4 mt-1">
            {options.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                        ${value === opt.value ? 'border-blue-600 bg-blue-600' : 'border-gray-300 group-hover:border-gray-400'}`}>
                        {value === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <input type="radio" name={name} className="sr-only"
                           checked={value === opt.value}
                           onChange={() => onChange(opt.value)} />
                    <span className={`text-sm font-medium ${value === opt.value ? 'text-blue-900' : 'text-gray-700'}`}>
                        {opt.label}
                    </span>
                </label>
            ))}
        </div>
        {fieldError && <p className="text-red-500 text-xs mt-1 font-medium">{fieldError}</p>}
    </div>
);

export default RadioGroup;
