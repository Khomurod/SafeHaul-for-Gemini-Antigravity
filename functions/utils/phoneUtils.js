/**
 * Normalize phone numbers for keychain document IDs and inventory matching.
 * @param {string} phoneNumber
 * @returns {string} E.164-like string (e.g. +15551234567)
 */
function normalizePhoneForKeychain(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        throw new Error('Invalid phone number');
    }
    const rawSanitized = phoneNumber.replace(/[^0-9+]/g, '');
    return rawSanitized.startsWith('+') ? rawSanitized : `+${rawSanitized}`;
}

module.exports = { normalizePhoneForKeychain };
