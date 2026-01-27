import React, { useState, useEffect } from 'react';
import {
    MessageSquare, Mail, Layers, Sparkles, ChevronDown, Clock
} from 'lucide-react';
import { db } from '@lib/firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';

const PLACEHOLDERS = [
    { label: 'Driver Name', code: '[Driver Name]' },
    { label: 'Company Name', code: '[Company Name]' },
    { label: 'Recruiter Name', code: '[Recruiter Name]' }
];

export function MessageComposer({ companyId, messageConfig, setMessageConfig }) {
    const [templates, setTemplates] = useState([]);
    const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        const fetchTemplates = async () => {
            const q = query(collection(db, 'companies', companyId, 'message_templates'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchTemplates();
    }, [companyId]);

    const handlePlaceholderClick = (code) => {
        setMessageConfig(prev => ({ ...prev, message: prev.message + " " + code }));
    };

    return (
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm h-full flex flex-col min-h-[700px]">
                <div className="flex justify-between items-start mb-12">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Sparkles className="text-blue-600" /> Draft Command
                        </h2>
                        <p className="text-slate-500 font-medium text-sm tracking-tight">Compose your sequence intelligence here.</p>
                    </div>

                    <div className="flex p-1.5 bg-slate-100/50 rounded-2xl border border-slate-100">
                        <button
                            onClick={() => setMessageConfig(prev => ({ ...prev, method: 'sms' }))}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-tighter transition-all ${messageConfig.method === 'sms' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <MessageSquare size={14} /> SMS
                        </button>
                        <button
                            onClick={() => setMessageConfig(prev => ({ ...prev, method: 'email' }))}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-tighter transition-all ${messageConfig.method === 'email' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Mail size={14} /> Email
                        </button>
                    </div>
                </div>

                {messageConfig.method === 'email' && (
                    <div className="mb-8 animate-in slide-in-from-top-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1 block">Subject Line</label>
                        <input
                            type="text"
                            placeholder="Enter email subject..."
                            className="w-full p-6 bg-slate-50 border border-slate-100 rounded-3xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-50/50"
                            value={messageConfig.subject}
                            onChange={(e) => setMessageConfig(prev => ({ ...prev, subject: e.target.value }))}
                        />
                    </div>
                )}

                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4 ml-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Message Intelligence</label>
                        <div className="relative">
                            <button
                                onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black text-slate-500 hover:bg-slate-100 transition-all uppercase tracking-tight"
                            >
                                <Layers size={12} /> Templates <ChevronDown size={10} />
                            </button>
                            {isTemplateMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="p-3 border-b border-slate-50 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Template</div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {templates.length === 0 ? (
                                            <div className="p-4 text-[10px] text-slate-400 italic">No templates found</div>
                                        ) : (
                                            templates.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => {
                                                        setMessageConfig(prev => ({ ...prev, message: t.text }));
                                                        setIsTemplateMenuOpen(false);
                                                    }}
                                                    className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight mb-1">{t.name}</div>
                                                    <div className="text-[10px] text-slate-500 line-clamp-1">{t.text}</div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <textarea
                        className="flex-1 w-full p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-50/50 resize-none leading-relaxed"
                        placeholder="Hi [Driver Name], type your message here..."
                        value={messageConfig.message}
                        onChange={(e) => setMessageConfig(prev => ({ ...prev, message: e.target.value }))}
                    />

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <div className="flex gap-2">
                            {PLACEHOLDERS.map(p => (
                                <button
                                    key={p.code}
                                    onClick={() => handlePlaceholderClick(p.code)}
                                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-tight hover:bg-blue-100 transition-all border border-blue-100 shadow-sm"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-4 w-px bg-slate-200 mx-2"></div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                            <Clock size={12} className="text-slate-400" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Interval:</span>
                            <input
                                type="number"
                                className="w-12 bg-transparent text-[10px] font-black text-blue-600 outline-none"
                                value={messageConfig.interval}
                                onChange={e => setMessageConfig(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                            />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Min</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
