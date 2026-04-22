import React, { useEffect } from 'react';
import Step1_Contact from '../../../features/driver-app/components/application/steps/Step1_Contact';
import Step2_Qualifications from '../../../features/driver-app/components/application/steps/Step2_Qualifications';
import Step3_License from '../../../features/driver-app/components/application/steps/Step3_License';
import Step4_Violations from '../../../features/driver-app/components/application/steps/Step4_Violations';
import Step5_Accidents from '../../../features/driver-app/components/application/steps/Step5_Accidents';
import Step6_Employment from '../../../features/driver-app/components/application/steps/Step6_Employment';
import Step7_General from '../../../features/driver-app/components/application/steps/Step7_General';
import Step8_Review from '../../../features/driver-app/components/application/steps/Step8_Review';
import Step9_Consent from '../../../features/driver-app/components/application/steps/Step9_Consent';
import { DynamicQuestionsStep } from '../../../features/driver-app/components/application/steps/DynamicQuestionsStep';
import { initializeSignatureCanvas, clearCanvas } from '@/lib/signature';
import { WizardProvider, useWizard } from '../../../features/driver-app/hooks/useWizardLogic';

// Base page config (without custom questions)
const basePageConfig = [
    { title: "Step 1: Personal Information", component: Step1_Contact },
    { title: "Step 2: Qualification Information", component: Step2_Qualifications },
    { title: "Step 3: License Information", component: Step3_License },
    { title: "Step 4: Motor Vehicle Record", component: Step4_Violations },
    { title: "Step 5: Accident History", component: Step5_Accidents },
    { title: "Step 6: Employment History", component: Step6_Employment },
    { title: "Step 7: General Questions", component: Step7_General },
    { title: "Step 8: Review Information", component: Step8_Review },
    { title: "Step 9: Agreements & Signature", component: Step9_Consent },
];

const StepperUI = ({
    formData, updateFormData, onNavigate,
    onPartialSubmit, onFinalSubmit, submissionStatus,
    handleFileUpload, isUploading
}) => {
    const { currentConfig, currentStepIndex, progressPercent, isLastStep } = useWizard();

    const currentTitle = currentConfig?.title || "Application Step";
    // For custom step, we use the imported DynamicQuestionsStep instead of defining it in config
    const CurrentStepComponent = currentConfig?.isCustomStep ? DynamicQuestionsStep : currentConfig?.component;

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Initialize canvas only on the signature step
        if (isLastStep) {
            setTimeout(() => {
                initializeSignatureCanvas();
                // Only clear canvas if there is no saved signature already
                if (!formData.signature) {
                    clearCanvas();
                }
            }, 100);
        }
    }, [currentStepIndex, isLastStep, formData.signature]);

    const barColor = submissionStatus === 'success' ? 'bg-green-600' :
        submissionStatus === 'error' ? 'bg-red-600' :
        submissionStatus === 'queued' ? 'bg-amber-500' : 'bg-blue-600';
    // P3 FIX: Only show 100% on success, not on error/queued
    const barWidth = submissionStatus === 'success' ? '100%' : `${progressPercent}%`;

    if (!CurrentStepComponent) {
        return <div className="p-6 text-center text-red-500">Error: Step {currentStepIndex + 1} not found.</div>;
    }

    return (
        <>
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                <h2 id="step-title" className="text-lg font-semibold text-gray-700">{currentTitle}</h2>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
                    <div
                        id="progress-bar"
                        className={`h-2.5 rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: barWidth }}
                    ></div>
                </div>
            </div>

            <div id="step-content-wrapper" className="p-6 sm:p-8">
                <form id="driver-form" onSubmit={(e) => e.preventDefault()}>
                    {currentConfig?.isCustomStep ? (
                        <CurrentStepComponent
                            questions={currentConfig.customQuestions}
                            formData={formData}
                            updateFormData={updateFormData}
                            onNavigate={onNavigate}
                            handleFileUpload={handleFileUpload}
                        />
                    ) : (
                        <CurrentStepComponent
                            formData={formData}
                            updateFormData={updateFormData}
                            onNavigate={onNavigate}
                            onPartialSubmit={onPartialSubmit}
                            onFinalSubmit={onFinalSubmit}
                            handleFileUpload={handleFileUpload}
                            isUploading={isUploading}
                            isSubmitting={submissionStatus === 'submitting'}
                        />
                    )}
                </form>
            </div>
        </>
    );
};

const Stepper = ({
    step, formData, updateFormData, onNavigate,
    onPartialSubmit, onFinalSubmit, submissionStatus,
    handleFileUpload, isUploading,
    customQuestions = []
}) => {
    return (
        <WizardProvider
            step={step}
            basePageConfig={basePageConfig}
            customQuestions={customQuestions}
            insertCustomStepAt={7}
        >
            <StepperUI
                formData={formData}
                updateFormData={updateFormData}
                onNavigate={onNavigate}
                onPartialSubmit={onPartialSubmit}
                onFinalSubmit={onFinalSubmit}
                submissionStatus={submissionStatus}
                handleFileUpload={handleFileUpload}
                isUploading={isUploading}
            />
        </WizardProvider>
    );
};

export default Stepper;