# Pilot Application Reliability Plan

## Goal Description
The driver application suffers from reliability issues during file uploads (CDL, Med Card) and final submission. Users report uploads not working and the submit button being unresponsive. This plan aims to make these flows "bulletproof" by introducing robust state management, explicit user feedback (progress bars), retry mechanisms, and preventing race conditions (navigating while uploading).

## User Review Required
> [!IMPORTANT]
> **No Code Changes Yet**: As requested, this is a pure planning document. Code changes will only start after you approve this plan.

> [!WARNING]
> **UX Change**: We will be blocking navigation ("Next" / "Submit") while a file is uploading. This is necessary to prevent data loss or incomplete submissions.

## Proposed Architecture Logic
We will move away from "fire-and-forget" uploads inside generic Input fields to a dedicated **Upload Management** strategy.

### 1. New Component: `UploadField`
A dedicated component to replace [InputField](file:///c:/Users/Kholmurod/Desktop/SafeHaul-for-Gemini-Antigravity/src/shared/components/form/InputField.jsx#3-62) for file uploads.
- **Features**:
    - **Auto-Upload**: Immediately uploads upon selection.
    - **Progress Bar**: Visual indicator of upload status (0-100%).
    - **Status Indicators**: Icons for "Uploading", "Success", "Error".
    - **Retry Logic**: If upload fails, a "Retry" button appears immediately.
    - **Preview**: Shows a thumbnail for images.
    - **State Control**: Tells the parent form if it is currently "busy".

### 2. Global Upload State
The main Wizard component ([DriverApplicationWizard](file:///c:/Users/Kholmurod/Desktop/SafeHaul-for-Gemini-Antigravity/src/features/driver-app/components/application/DriverApplicationWizard.jsx#11-230)) needs to know if *any* child component is uploading.
- **Current Issue**: [Step3_License](file:///c:/Users/Kholmurod/Desktop/SafeHaul-for-Gemini-Antigravity/src/features/driver-app/components/application/steps/Step3_License.jsx#9-286) receives `isUploading` but ignores it.
- **Fix**: 
    - Ensure all Steps accept `isUploading`.
    - Disable "Next/Continue" buttons if `isUploading` is true.
    - Disable the final "Submit" button if `isUploading` is true.

### 3. Robust Submission Logic
- **Pre-Submit Validation**: Ensure all required uploads are not just "selected" but successfully "uploaded" (have a valid URL).
- **Idempotency**: Prevent double-clicks on the Submit button.
- **Retry**: Wrap the [submitDriverApplication](file:///c:/Users/Kholmurod/Desktop/SafeHaul-for-Gemini-Antigravity/src/features/driver-app/services/driverService.js#212-243) call in a retry wrapper (3 attempts with backoff) to handle network blips.

---

## Proposed Changes

### `src/features/driver-app/components/application`

#### [NEW] `UploadField.jsx`
- Create a new component in `components/` folder.
- Props: `label`, `value` (existing URL/object), `onUpload` (async start), `onSuccess`, `onError`.
- Internal state: `progress`, `status` ('idle', 'uploading', 'success', 'error').
- UI: File input hidden, custom styled button. Progress bar overlay.

#### [MODIFY] `DriverApplicationWizard.jsx`
- **Upload Handler**: Improve `handleFileUpload` to return the *promise*, allowing `UploadField` to track it. Use `uploadBytesResumable` instead of `uploadBytes` for progress events if possible (or just fake progress for small files to show activity).
- **Safety**: Pass `isUploading` to all steps.
- **Submission**: Add a "Retrying..." state if the first attempt fails.

#### [MODIFY] `steps/Step3_License.jsx` (and Step 7, Step 9)
- **Props**: Destructure `isUploading`.
- **Navigation**: Disable "Continue" button `disabled={isUploading}`.
- **Fields**: Replace `<InputField type="file" ... />` with `<UploadField ... />`.
    - Pass `handleFileUpload` which returns the promise.
    - Display the uploaded file name/preview from `formData`.

#### [MODIFY] `steps/Step9_Consent.jsx`
- **Submission**: Disable "Submit" button `disabled={isUploading || isSubmitting}`.
- **Validation**: Ensure Signature is saved before allowing submit (already present, but double check).

### `src/features/driver-app/services/driverService.js`

#### [MODIFY] `uploadApplicationFile`
- **Enhancement**: Add retry logic (try 3 times before failing).
- **Error Handling**: Throw specific errors that the UI can show ("Network Error", "File too large").

## Configuration Changes
> [!IMPORTANT]
> **CORS Fix Required**: The reported error is due to missing CORS configuration on the Firebase Storage bucket.

#### [EXECUTE] Apply CORS Rule
- **Action**: Run `gsutil cors set cors.json gs://truckerapp-system.firebasestorage.app`
- **Verification**: Verify that `cors.json` allows origin `["*"]` or specifics like `["http://localhost:5000"]`.

---

## Verification Plan

### Automated Tests
*None currently exist for this specific UI flow.* We will verify manually due to the visual nature of the changes.

### Manual Verification
1.  **Upload Reliability Test**:
    -   Open Driver App (Wizard).
    -   Go to Step 3 (License).
    -   **Action**: Select a large image file for CDL Front.
    -   **Verify**: Progress bar appears. "Continue" button is DISABLED.
    -   **Action**: Wait for completion.
    -   **Verify**: "Continue" button is ENABLED. Green checkmark appears.
    -   **Action**: Disconnect Internet (Simulate Network Fail). Try to upload CDL Back.
    -   **Verify**: Error message appears with "Retry" button.
    -   **Action**: Reconnect Internet. Click "Retry".
    -   **Verify**: Upload succeeds.

2.  **Submission Robustness Test**:
    -   Fill out all steps.
    -   Go to Step 9 (Signature).
    -   **Action**: Draw signature and Save.
    -   **Action**: Click "Submit Full Application".
    -   **Verify**: Loading spinner appears. Button invalidates immediately (no double submit).
    -   **Verify**: Success modal appears.

3.  **Race Condition Check**:
    -   **Action**: Start an upload. Immediately try to click "Next" or Navigation tabs.
    -   **Verify**: Navigation is blocked/disabled until upload finishes.
