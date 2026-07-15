'use strict';

/**
 * Custom-claims helpers.
 *
 * The super-admin marker historically exists in two shapes:
 *   1. top-level:  { globalRole: 'super_admin' }   (documented in README)
 *   2. nested:     { roles: { globalRole: 'super_admin' } }  (written by
 *      hrAdmin.onMembershipWrite — the canonical shape today)
 *
 * firestore.rules isSuperAdmin() and most callables accept BOTH; a few
 * callables checked only the nested shape and denied legitimately-claimed
 * super admins. All server-side checks should go through this helper.
 *
 * @param {object} [claims] - decoded token claims (request.auth.token) or
 *   a user record's customClaims object.
 * @returns {boolean}
 */
function isSuperAdminClaims(claims = {}) {
    const globalRole = claims.globalRole || claims.roles?.globalRole;
    return globalRole === 'super_admin';
}

module.exports = { isSuperAdminClaims };
