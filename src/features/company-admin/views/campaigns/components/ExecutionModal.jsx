import React from 'react';
import { Play } from 'lucide-react';

export function ExecutionModal({ count, method, scheduledFor, onConfirm, onCancel, isExecuting }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-2">
                        <Play size={32} className="ml-1" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                            {scheduledFor ? 'Confirm Schedule' : 'Confirm Launch'}
                        </h3>
                        <p className="text-slate-500 font-medium mt-2">
                            You are about to {scheduledFor ? 'schedule' : 'queue'} <strong>{count}</strong> {method === 'sms' ? 'SMS messages' : 'Emails'}.
                            {scheduledFor && (
                                <span className="block mt-2 text-blue-600 font-bold">
                                    Target: {new Date(scheduledFor).toLocaleString()}
                                </span>
                            )}
                            <br />{!scheduledFor && "This action requires carrier compliance checks."}
                        </p>
                    </div>
                    <div className="flex gap-4 w-full pt-4">
                        <button
                            onClick={onCancel}
                            disabled={isExecuting}
                            className="flex-1 px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isExecuting}
                            className="flex-1 px-8 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                        >
                            {isExecuting ? 'Processing...' : (scheduledFor ? 'Schedule Mission' : 'Commence Mission')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
