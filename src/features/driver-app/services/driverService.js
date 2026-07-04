/**
 * driverService — compatibility barrel.
 * =====================================
 * The original single-file service was split by responsibility (verbatim
 * moves, behavior unchanged). Existing imports keep working through these
 * re-exports:
 *
 *  - ./driverOfferService.js       — respondToOffer
 *  - ./driverDashboardService.js   — profile/application/job reads
 *  - ./applicationSubmitService.js — uploadApplicationFile + submitDriverApplication
 */

export { respondToOffer } from './driverOfferService';
export {
    fetchDriverProfile,
    fetchMyApplications,
    getDriverApplicationHistory,
    fetchRecommendedJobs,
    getSavedJobs,
} from './driverDashboardService';
export {
    uploadApplicationFile,
    submitDriverApplication,
} from './applicationSubmitService';
