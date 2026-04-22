import React, { createContext, useContext, useMemo } from 'react';

// The Context
const WizardContext = createContext();

export const useWizard = () => {
    const context = useContext(WizardContext);
    if (!context) {
        throw new Error("useWizard must be used within a WizardProvider");
    }
    return context;
};

// The Provider
export const WizardProvider = ({
    children,
    step,
    basePageConfig,
    customQuestions = [],
    insertCustomStepAt = 7, // Insert custom questions before Review
}) => {

    // 1. Build the dynamic configuration
    const pageConfig = useMemo(() => {
        if (!customQuestions || customQuestions.length === 0) {
            return basePageConfig.map((config, idx) => ({
                ...config,
                title: `Step ${idx + 1} of ${basePageConfig.length}: ${config.title.split(': ')[1]}`
            }));
        }

        const totalSteps = basePageConfig.length + 1;
        const config = [];
        let configIdx = 0;

        for (let i = 0; i < basePageConfig.length; i++) {
            const baseTitle = basePageConfig[i].title.split(': ')[1];

            if (i === insertCustomStepAt) {
                // Insert Custom Questions step
                config.push({
                    title: `Step ${configIdx + 1} of ${totalSteps}: Additional Questions`,
                    isCustomStep: true,
                    customQuestions: customQuestions
                });
                configIdx++;
            }

            // Push base step
            config.push({
                ...basePageConfig[i],
                title: `Step ${configIdx + 1} of ${totalSteps}: ${baseTitle}`
            });
            configIdx++;
        }

        return config;
    }, [customQuestions, basePageConfig, insertCustomStepAt]);

    const totalSteps = pageConfig.length;

    // Safety check for out-of-bounds step
    const currentStepIndex = Math.min(Math.max(0, step), totalSteps - 1);
    const currentConfig = pageConfig[currentStepIndex];

    const progressPercent = ((currentStepIndex + 1) / totalSteps) * 100;
    const isLastStep = currentStepIndex === totalSteps - 1;

    const value = {
        pageConfig,
        currentConfig,
        totalSteps,
        currentStepIndex,
        progressPercent,
        isLastStep
    };

    return (
        <WizardContext.Provider value={value}>
            {children}
        </WizardContext.Provider>
    );
};
