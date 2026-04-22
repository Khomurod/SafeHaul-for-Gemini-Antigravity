import React, { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@lib/firebase';
import { AlertTriangle, X } from 'lucide-react';

export function FeatureDeactivationWarning() {
    const { currentCompanyProfile, currentUser } = useData();
    const [activeWarning, setActiveWarning] = useState(null);
    const [alertDocId, setAlertDocId] = useState(null);

    useEffect(() => {
        if (!currentCompanyProfile || !currentCompanyProfile.featureSchedules) return;

        const checkSchedules = () => {
            const now = new Date();
            // Check if current time is between 7:00 AM and 4:00 PM Central Time
            // For simplicity in JS without heavy libraries, we can approximate CT
            // by using UTC and adjusting. UTC is 5 or 6 hours ahead of CT.
            // A more robust way is to format the date to CT string and parse hours.
            const ctTimeString = now.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false });
            const ctHour = parseInt(ctTimeString.split(', ')[1].split(':')[0], 10);

            if (ctHour < 7 || ctHour >= 16) {
                return; // Outside business hours
            }

            // Find the first feature scheduled in the future
            for (const [featureKey, scheduledDateStr] of Object.entries(currentCompanyProfile.featureSchedules)) {
                if (scheduledDateStr) {
                    const scheduledDate = new Date(scheduledDateStr);
                    if (scheduledDate > now) {
                        // We found a scheduled feature
                        const lastShownKey = `feature_warning_shown_${currentCompanyProfile.id}_${featureKey}`;
                        const lastShownStr = localStorage.getItem(lastShownKey);
                        const lastShown = lastShownStr ? new Date(lastShownStr) : null;

                        // Show if never shown, or if > 2 hours ago
                        if (!lastShown || (now - lastShown) > 2 * 60 * 60 * 1000) {
                            setActiveWarning({
                                featureKey,
                                scheduledDate
                            });
                            localStorage.setItem(lastShownKey, now.toISOString());

                            // Log view to Firestore
                            logInteraction(featureKey, { views: 1 }).then(id => {
                                if (id) setAlertDocId(id);
                            });

                            return; // Only show one warning at a time
                        }
                    }
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
            if (alertDocId) {
                // we already have a doc for this session, just update it (approximate increment)
                // for simplicity we will just append a new log or update existing
                // Since firestore doesn't do offline increments easily without increment()
                // we'll just create a new doc for each interaction to be safe and aggregate in the admin view.
                // Or we can use the same doc and update. Let's just create a new doc per click/view for robustness.
            }

            const alertsRef = collection(db, "companies", currentCompanyProfile.id, "feature_alerts");
            const docRef = await addDoc(alertsRef, {
                featureKey,
                userId: currentUser.uid,
                userEmail: currentUser.email || 'Unknown',
                timestamp: serverTimestamp(),
                ...incrementData
            });
            return docRef.id;
        } catch (e) {
            console.error("Failed to log interaction", e);
            return null;
        }
    };

    if (!activeWarning) return null;

    const handleClose = () => {
        logInteraction(activeWarning.featureKey, { dismisses: 1 });
        setActiveWarning(null);
    };

    const handleContactSales = () => {
        logInteraction(activeWarning.featureKey, { salesClicks: 1 });
        window.open('https://t.me/tomr_robins0n', '_blank');
        setActiveWarning(null);
    };

    return (
        <div className="fixed inset-0 bg-red-900/40 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-red-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="bg-red-600 p-6 flex flex-col items-center text-center relative">
                    <button onClick={handleClose} className="absolute top-4 right-4 text-white/80 hover:text-white transition"><X size={24} /></button>
                    <AlertTriangle size={48} className="text-white mb-4 animate-bounce" />
                    <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Notice of Deactivation</h2>
                </div>
                <div className="p-6 text-center space-y-4">
                    <p className="text-gray-800 text-lg">
                        The feature <strong className="text-red-600 font-bold px-2 py-1 bg-red-50 rounded border border-red-100">{activeWarning.featureKey}</strong> is scheduled to be turned off for your company on:
                    </p>
                    <div className="text-xl font-black text-gray-900 bg-gray-100 py-3 rounded-lg border border-gray-200">
                        {activeWarning.scheduledDate.toLocaleString()}
                    </div>
                    <p className="text-sm text-gray-500">
                        Please reach out to our Sales Team immediately if you wish to keep this feature active.
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
