import React, { useState, useEffect } from 'react';
import { db } from '@lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export function AudienceCommand({ companyId, onSelectSegment }) {
    const [segments, setSegments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isCancelled = false;
        if (!companyId) return;

        const fetchSegments = async () => {
            try {
                const q = collection(db, 'companies', companyId, 'segments');
                const snapshot = await getDocs(q);
                if (!isCancelled) {
                    setSegments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Error fetching segments:", err);
                if (!isCancelled) setIsLoading(false);
            }
        };

        fetchSegments();
        return () => { isCancelled = true; };
    }, [companyId]);

    const getHealthScore = (segment) => {
        // Mock logic for "List Health"
        if (segment.memberCount > 100) return 85;
        if (segment.memberCount > 50) return 92;
        return 78;
    };

    if (isLoading) return <div className="p-8 text-slate-400 font-bold animate-pulse text-center">Loading segments...</div>;

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-2">Audience Command</h1>
                    <p className="text-slate-500 font-medium tracking-tight">Real-time intelligence on your driver segments.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {segments.map(segment => (
                    <div key={segment.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:scale-[1.02] transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-[10rem] -mr-16 -mt-16 group-hover:bg-blue-100/50 transition-colors"></div>

                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className="h-14 w-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-blue-200 uppercase">
                                {segment.id.substring(0, 2)}
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">List Health</div>
                                <div className={`text-2xl font-black ${getHealthScore(segment) > 90 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {getHealthScore(segment)}%
                                </div>
                            </div>
                        </div>

                        <h3 className="font-black text-slate-900 text-2xl group-hover:text-blue-600 transition-colors uppercase tracking-tight mb-2 relative z-10">
                            {segment.id.replace(/_/g, ' ')}
                        </h3>

                        <div className="flex items-end justify-between mt-12 relative z-10">
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Active Members</div>
                                <div className="text-4xl font-black text-slate-900 tracking-tighter">{segment.memberCount || 0}</div>
                            </div>
                            <button
                                onClick={() => onSelectSegment(segment)}
                                className="px-8 py-4 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 shadow-xl shadow-slate-200 hover:shadow-blue-200 transition-all active:scale-95"
                            >
                                Blast Now
                            </button>
                        </div>
                    </div>
                ))}

                {segments.length === 0 && (
                    <div className="col-span-full py-24 text-center bg-slate-50/50 rounded-[3rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center gap-4">
                        <div className="text-4xl">🔎</div>
                        <p className="text-slate-500 font-black uppercase tracking-widest text-xs">No active segments found.</p>
                        <p className="text-slate-400 text-sm max-w-xs mx-auto">Segments are automatically calculated. Start filtering drivers in the Campaigns tab to seed the engine.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
