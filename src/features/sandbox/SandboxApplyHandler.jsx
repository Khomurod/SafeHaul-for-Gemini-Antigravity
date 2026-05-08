import React from 'react';
import { DriverApplicationWizard } from '@features/driver-app/components/application/DriverApplicationWizard';
import { SANDBOX_COMPANY_ID } from './sandboxConstants';

/**
 * Public sandbox mirror of the guest apply flow: same Stepper + steps as live apply, fixed SANDBOX tenant.
 */
export function SandboxApplyHandler() {
  return <DriverApplicationWizard isSandboxMode companyId={SANDBOX_COMPANY_ID} />;
}

export default SandboxApplyHandler;
