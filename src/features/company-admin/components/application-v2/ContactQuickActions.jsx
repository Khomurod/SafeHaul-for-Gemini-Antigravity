import React from 'react';
import { Phone, Mail, MessageCircle, Send as SendIcon, Copy, ExternalLink } from 'lucide-react';
import { formatPhoneNumber } from '@shared/utils/helpers';
import { useToast } from '@shared/components/feedback';

// Helper to normalize phone for links
const normalizePhone = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
};

/**
 * ContactQuickActions - Phone, email, SMS shortcuts with prefilled templates
 */
export function ContactQuickActions({
    phone,
    email,
    applicantName = '',
    onPhoneClick
}) {
    const { showSuccess } = useToast();

    const normalizedPhone = phone ? normalizePhone(phone) : null;
    const formattedPhone = phone ? formatPhoneNumber(phone) : null;

    const handleCopy = (text, label) => {
        navigator.clipboard.writeText(text);
        showSuccess(`${label} copied to clipboard`);
    };

    // SMS template
    const smsTemplate = encodeURIComponent(
        `Hi ${applicantName.split(' ')[0] || 'there'}, this is a message from SafeHaul regarding your driver application. Please reply or call us back at your earliest convenience.`
    );

    // Email template
    const emailSubject = encodeURIComponent(`Your Driver Application - SafeHaul`);
    const emailBody = encodeURIComponent(
        `Hi ${applicantName.split(' ')[0] || 'there'},\n\nThank you for your interest in joining our team.\n\nWe wanted to follow up regarding your driver application. Please let us know if you have any questions.\n\nBest regards,\nSafeHaul Team`
    );

    // Telegram link
    const getTelegramLink = () => {
        if (!normalizedPhone) return null;
        const cleanPhone = normalizedPhone.replace(/\D/g, '');
        return `https://t.me/+${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}`;
    };

    const actions = [
        {
            id: 'call',
            label: 'Call',
            icon: Phone,
            color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200',
            available: !!phone,
            href: phone ? `tel:${normalizedPhone}` : null,
            onClick: () => onPhoneClick?.(phone)
        },
        {
            id: 'sms',
            label: 'SMS',
            icon: MessageCircle,
            color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200',
            available: !!phone,
            href: phone ? `sms:${normalizedPhone}?body=${smsTemplate}` : null
        },
        {
            id: 'email',
            label: 'Email',
            icon: Mail,
            color: 'text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-200',
            available: !!email,
            href: email ? `mailto:${email}?subject=${emailSubject}&body=${emailBody}` : null
        },
        {
            id: 'telegram',
            label: 'Telegram',
            icon: SendIcon,
            color: 'text-sky-600 bg-sky-50 hover:bg-sky-100 border-sky-200',
            available: !!phone,
            href: getTelegramLink(),
            external: true
        }
    ];

    return (
        <div className="space-y-3">
            {/* Contact Info */}
            <div className="space-y-2">
                {phone && (
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                            <Phone size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">{formattedPhone}</span>
                        </div>
                        <button
                            onClick={() => handleCopy(phone, 'Phone')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                )}
                {email && (
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                            <Mail size={14} className="text-gray-400 shrink-0" />
                            <span className="text-sm font-medium text-gray-700 truncate">{email}</span>
                        </div>
                        <button
                            onClick={() => handleCopy(email, 'Email')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition shrink-0"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
                {actions.map(action => {
                    const Icon = action.icon;

                    if (!action.available) {
                        return (
                            <div
                                key={action.id}
                                className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-300 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed"
                            >
                                <Icon size={16} />
                                {action.label}
                            </div>
                        );
                    }

                    const content = (
                        <>
                            <Icon size={16} />
                            {action.label}
                            {action.external && <ExternalLink size={12} />}
                        </>
                    );

                    if (action.onClick && !action.href) {
                        return (
                            <button
                                key={action.id}
                                onClick={action.onClick}
                                className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border rounded-lg transition ${action.color}`}
                            >
                                {content}
                            </button>
                        );
                    }

                    return (
                        <a
                            key={action.id}
                            href={action.href}
                            target={action.external ? '_blank' : undefined}
                            rel={action.external ? 'noopener noreferrer' : undefined}
                            onClick={action.onClick}
                            className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border rounded-lg transition ${action.color}`}
                        >
                            {content}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

export default ContactQuickActions;
