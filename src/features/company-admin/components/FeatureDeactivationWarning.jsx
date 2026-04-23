import React, { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@lib/firebase';
import { AlertTriangle, X } from 'lucide-react';

export function FeatureDeactivationWarning() {
    const { currentCompanyProfile, currentUser } = useData();
    const [activeWarnings, setActiveWarnings] = useState([]);

    useEffect(() => {
        if (!currentCompanyProfile || !currentCompanyProfile.featureSchedules) return;

        const checkSchedules = () => {
            const now = new Date();
            // Check if current time is between 7:00 AM and 4:00 PM Central Time
            const ctTimeString = now.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false });
            const ctHour = parseInt(ctTimeString.split(', ')[1].split(':')[0], 10);

            if (ctHour < 7 || ctHour >= 16) {
                return; // Outside business hours
            }

            // Find all features scheduled in the future
            const scheduledFeatures = [];
            for (const [featureKey, scheduledDateStr] of Object.entries(currentCompanyProfile.featureSchedules)) {
                if (scheduledDateStr) {
                    const scheduledDate = new Date(scheduledDateStr);
                    if (scheduledDate > now) {
                        scheduledFeatures.push({ featureKey, scheduledDate });
                    }
                }
            }

            if (scheduledFeatures.length > 0) {
                // Use a composite key to ensure we don't spam them if the schedule hasn't changed much
                // but track the fact that we've shown "a" warning. We'll show a single warning for all of them.
                const lastShownKey = `feature_warnings_shown_${currentCompanyProfile.id}`;
                const lastShownStr = localStorage.getItem(lastShownKey);
                const lastShown = lastShownStr ? new Date(lastShownStr) : null;

                // Show if never shown, or if > 2 hours ago
                if (!lastShown || (now - lastShown) > 2 * 60 * 60 * 1000) {
                    setActiveWarnings(scheduledFeatures);
                    localStorage.setItem(lastShownKey, now.toISOString());

                    // Log view to Firestore for all features
                    scheduledFeatures.forEach(f => {
                        logInteraction(f.featureKey, { views: 1 });
                    });
                }
            }
        };

        checkSchedules();

        // Also set up an interval to check periodically (e.g. every minute)
        const interval = setInterval(checkSchedules, 60000);
        return () => clearInterval(interval);

    }, [currentCompanyProfile, currentUser]);

    const logInteraction = async (featureKey, incrementData) => {
        if (!currentCompanyProfile || !currentUser) return null;
        try {
            const alertsRef = collection(db, "companies", currentCompanyProfile.id, "feature_alerts");
            await addDoc(alertsRef, {
                featureKey,
                userId: currentUser.uid,
                userEmail: currentUser.email || 'Unknown',
                timestamp: serverTimestamp(),
                ...incrementData
            });
        } catch (e) {
            console.error("Failed to log interaction", e);
        }
    };

    if (activeWarnings.length === 0) return null;

    const handleClose = () => {
        activeWarnings.forEach(f => logInteraction(f.featureKey, { dismisses: 1 }));
        setActiveWarnings([]);
    };

    const handleContactSales = () => {
        activeWarnings.forEach(f => logInteraction(f.featureKey, { salesClicks: 1 }));
        window.open('https://t.me/tomr_robins0n', '_blank');
        setActiveWarnings([]);
    };

    return (
        <div className="fixed inset-0 bg-red-900/40 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-red-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="bg-red-600 p-6 flex flex-col items-center text-center relative">
                    <button onClick={handleClose} className="absolute top-4 right-4 text-white/80 hover:text-white transition"><X size={24} /></button>
                    <AlertTriangle size={48} className="text-white mb-4 animate-bounce" />
                    <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Notice of Deactivation</h2>
                </div>
                <div className="p-6 text-center space-y-4">
                    <p className="text-gray-800 text-lg">
                        The following features are scheduled to be turned off for your company:
                    </p>
                    <div className="text-left font-medium text-gray-900 bg-gray-100 p-4 rounded-lg border border-gray-200 space-y-3 max-h-48 overflow-y-auto">
                        {activeWarnings.map(w => (
                            <div key={w.featureKey} className="flex flex-col border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                                <span className="font-bold text-red-600">{w.featureKey}</span>
                                <span className="text-sm text-gray-600">On: {w.scheduledDate.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500 pt-2">
                        Please reach out to our Sales Team immediately if you wish to keep these features active.
                    </p>
                    <div className="pt-4">
                        <button
                            onClick={handleContactSales}
                            className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-black rounded-lg shadow-lg hover:from-red-700 hover:to-red-800 transition transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Contact Sales
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
