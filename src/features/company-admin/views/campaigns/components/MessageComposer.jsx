import React, { useState, useEffect } from 'react';
import {
    MessageSquare, Mail, Layers, Sparkles, ChevronDown, Clock, Save, Trash2, AlertCircle
} from 'lucide-react';
import { db, functions } from '@lib/firebase';
import { collection, query, getDocs, orderBy, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '@shared/components/feedback/ToastProvider';

const PLACEHOLDERS = [
    { label: 'Driver Name', code: '[Driver Name]' },
    { label: 'Company Name', code: '[Company Name]' },
    { label: 'Recruiter Name', code: '[Recruiter Name]' }
];

export function MessageComposer({ companyId, messageConfig, setMessageConfig }) {
    const { showSuccess, showError } = useToast();
    const [templates, setTemplates] = useState([]);
    const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    const fetchTemplates = async () => {
        if (!companyId) return;
        const q = query(collection(db, 'companies', companyId, 'message_templates'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => {
        fetchTemplates();
    }, [companyId]);

    const handleSaveTemplate = async () => {
        const name = window.prompt("Enter a name for this template:");
        if (!name) return;

        setIsSavingTemplate(true);
        try {
            await addDoc(collection(db, 'companies', companyId, 'message_templates'), {
                name,
                method: messageConfig.method,
                subject: messageConfig.subject,
                message: messageConfig.message,
                createdAt: serverTimestamp()
            });
            showSuccess("Template saved!");
            fetchTemplates();
        } catch (err) {
            showError(err.message);
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = async (e, tid) => {
        e.stopPropagation();
        if (!window.confirm("Delete this template?")) return;
        try {
            await deleteDoc(doc(db, 'companies', companyId, 'message_templates', tid));
            showSuccess("Template deleted");
            fetchTemplates();
        } catch (err) { showError(err.message); }
    };

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
                            <button
                                onClick={handleSaveTemplate}
                                disabled={isSavingTemplate || !messageConfig.message}
                                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-full text-[10px] font-black hover:bg-blue-700 transition-all uppercase tracking-tight shadow-sm disabled:opacity-50"
                            >
                                <Save size={12} /> Save Draft
                            </button>
                            {isTemplateMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="p-3 border-b border-slate-50 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Template</div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {templates.length === 0 ? (
                                            <div className="p-4 text-[10px] text-slate-400 italic">No templates found</div>
                                        ) : (
                                            templates.map(t => (
                                                <div
                                                    key={t.id}
                                                    onClick={() => {
                                                        setMessageConfig(prev => ({ ...prev, message: t.message || t.text }));
                                                        setIsTemplateMenuOpen(false);
                                                    }}
                                                    className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 cursor-pointer group"
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight mb-1">{t.name}</div>
                                                            <div className="text-[10px] text-slate-500 line-clamp-1">{t.message || t.text}</div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => handleDeleteTemplate(e, t.id)}
                                                            className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
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

                    {messageConfig.method === 'sms' && (
                        <div className="mt-4 flex items-center justify-between px-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${messageConfig.message.length > 160 ? 'text-amber-500' : 'text-slate-400'}`}>
                                    {messageConfig.message.length} / {messageConfig.message.length > 160 ? '320' : '160'} Chars
                                </span>
                                {messageConfig.message.length > 160 && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 animate-in fade-in slide-in-from-left-2">
                                        <AlertCircle size={10} />
                                        <span className="text-[9px] font-black uppercase tracking-tighter">2 SMS Segments Detected</span>
                                    </div>
                                )}
                            </div>
                            <span className="text-[9px] font-bold text-slate-300 italic uppercase">Carrier compliance enforced</span>
                        </div>
                    )}
                </div>

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
    );
}
