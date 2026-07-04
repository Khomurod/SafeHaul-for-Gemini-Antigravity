import React from 'react';
import {
    Plus, Type, CheckSquare, Calendar, PenTool, Mail,
    User, Building2, Fingerprint
} from 'lucide-react';

/**
 * Field palette definitions for the envelope/template creator.
 * Extracted verbatim from EnvelopeCreator.jsx.
 */

// --- FIELD TEMPLATES ---
export const FIELD_TEMPLATES = {
    // Category 1: Standard Fields
    signature: { type: 'signature', required: true, label: 'Signature', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
    initial: { type: 'initial', required: true, label: 'Initial', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
    date_signed: { type: 'date', required: true, readOnly: true, prefillPolicy: 'locked', bindingKey: 'current_date', defaultValue: '{{current_date}}', label: 'Date Signed', fontSize: 'Auto' },
    // Category 2: Signer Info (Auto-mapped)
    name: { type: 'text', required: true, readOnly: false, prefillPolicy: 'editable', bindingKey: 'full_name', defaultValue: '{{full_name}}', label: 'Name', fontSize: 'Auto' },
    email_field: { type: 'text', required: true, readOnly: false, prefillPolicy: 'editable', bindingKey: 'email', defaultValue: '{{email}}', label: 'Email', fontSize: 'Auto' },
    company: { type: 'text', required: false, readOnly: false, prefillPolicy: 'editable', bindingKey: 'company_name', defaultValue: '{{company_name}}', label: 'Company', fontSize: 'Auto' },
    // Category 3: Data Fields
    text: { type: 'text', required: false, readOnly: false, prefillPolicy: 'editable', label: 'Text', defaultValue: '', fontSize: 'Auto' },
    checkbox: { type: 'checkbox', required: false, label: 'Checkbox', readOnly: false, prefillPolicy: 'editable', defaultValue: '', fontSize: 'Auto' },
};

export const FIELD_CATEGORIES = [
    {
        title: 'Standard Fields',
        items: [
            { templateId: 'signature', label: 'Signature', icon: PenTool, color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100' },
            { templateId: 'initial', label: 'Initial', icon: Fingerprint, color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
            { templateId: 'date_signed', label: 'Date Signed', icon: Calendar, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
        ]
    },
    {
        title: 'Signer Info',
        items: [
            { templateId: 'name', label: 'Name', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
            { templateId: 'email_field', label: 'Email', icon: Mail, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
            { templateId: 'company', label: 'Company', icon: Building2, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
        ]
    },
    {
        title: 'Data Fields',
        items: [
            { templateId: 'text', label: 'Text', icon: Type, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
            { templateId: 'checkbox', label: 'Checkbox', icon: CheckSquare, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
        ]
    }
];

/** Icon for a field type — extracted from the getIcon useCallback (stable identity). */
export const getFieldIcon = (type) => {
    switch (type) {
        case 'signature': return <PenTool size={14} />;
        case 'initial': return <Fingerprint size={14} />;
        case 'text': return <Type size={14} />;
        case 'checkbox': return <CheckSquare size={14} />;
        case 'date': return <Calendar size={14} />;
        default: return <Plus size={14} />;
    }
};
