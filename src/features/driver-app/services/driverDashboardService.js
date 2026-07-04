import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    documentId,
    collectionGroup
} from "firebase/firestore";
import { db } from '@lib/firebase';

/**
 * Driver dashboard reads (profile, application history, jobs).
 * Extracted verbatim from driverService.js.
 */

// --- Dashboard Data Fetching ---
export async function fetchDriverProfile(uid) {
    try {
        const docRef = doc(db, "drivers", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
}

export async function fetchMyApplications(email, userId) {
    // We need at least one identifier
    if (!email && !userId) return [];

    const results = [];
    const processedIds = new Set(); // To prevent duplicates

    // --- Helper to add docs to results safely ---
    const addDocs = (snapshot) => {
        snapshot.docs.forEach(doc => {
            // Avoid duplicates if we query by both Email and UID
            if (processedIds.has(doc.id)) return;
            processedIds.add(doc.id);

            const data = doc.data();
            const companyId = doc.ref.parent.parent ? doc.ref.parent.parent.id : 'unknown';

            results.push({
                id: `${doc.id}_${companyId}`, // Unique React Key
                originalId: doc.id,           // Real Firestore ID
                companyId: companyId,
                companyName: data.companyName || 'Unknown Company',
                isGeneral: false,
                ...data
            });
        });
    };

    // --- 1. Fetch Company Applications ---
    // We try querying by Driver ID first (more reliable), then by Email (for legacy)
    try {
        // Strategy A: By Driver ID (New System)
        if (userId) {
            const idQuery = query(
                collectionGroup(db, 'applications'),
                where('driverId', '==', userId)
            );
            const idSnap = await getDocs(idQuery);
            addDocs(idSnap);
        }

        // Strategy B: By Email (Legacy / Fallback)
        if (email) {
            const emailQuery = query(
                collectionGroup(db, 'applications'),
                where('email', '==', email)
            );
            const emailSnap = await getDocs(emailQuery);
            addDocs(emailSnap);
        }
    } catch (error) {
        console.error("Error fetching company applications:", error);
        // We continue to leads even if this fails
    }

    // --- 2. Sort In-Memory (Robust) ---
    // This fixes the issue where documents without 'submittedAt' were disappearing
    return results.sort((a, b) => {
        const getMillis = (item) => {
            if (item.submittedAt?.seconds) return item.submittedAt.seconds;
            if (item.createdAt?.seconds) return item.createdAt.seconds;
            return 0;
        };
        return getMillis(b) - getMillis(a); // Newest first
    });
}

export async function getDriverApplicationHistory(applicantKey) {
    if (!applicantKey || typeof applicantKey !== 'string') return [];

    const historyQuery = query(
        collectionGroup(db, 'applications'),
        where('applicantKey', '==', applicantKey),
        orderBy('submittedAt', 'desc')
    );

    const snapshot = await getDocs(historyQuery);
    return snapshot.docs.map((appDoc) => {
        const data = appDoc.data();
        const companyId = appDoc.ref.parent.parent ? appDoc.ref.parent.parent.id : 'unknown';
        return {
            id: appDoc.id,
            companyId,
            ...data
        };
    });
}

export async function fetchRecommendedJobs(driverType) {
    if (!driverType) return [];
    try {
        const companiesRef = collection(db, "companies");
        const q = query(companiesRef, where(`hiringPreferences.${driverType}`, "==", true));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error finding jobs:", e);
        return [];
    }
}

export async function getSavedJobs(driverId) {
    if (!driverId) return [];
    try {
        const savedRef = collection(db, "drivers", driverId, "saved_jobs");
        const snapshot = await getDocs(savedRef);
        const savedIds = snapshot.docs.map(doc => doc.id);

        if (savedIds.length === 0) return [];

        const chunks = [];
        for (let i = 0; i < savedIds.length; i += 10) {
            chunks.push(savedIds.slice(i, i + 10));
        }

        let allSavedCompanies = [];
        for (const chunk of chunks) {
            const q = query(collection(db, "companies"), where(documentId(), "in", chunk));
            const snap = await getDocs(q);
            const companies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allSavedCompanies = [...allSavedCompanies, ...companies];
        }
        return allSavedCompanies;

    } catch (e) {
        console.error("Error fetching saved jobs:", e);
        return [];
    }
}
