export const SUPER_ADMIN_ROLES = Object.freeze(['super_admin']);
export const DRIVER_ROLES = Object.freeze(['driver']);
export const COMPANY_WORKSPACE_ROLES = Object.freeze([
  'company_admin',
  'super_admin',
  'hr_user',
  'recruiter',
]);

export function isCompanyWorkspaceRole(role) {
  return COMPANY_WORKSPACE_ROLES.includes(role);
}
