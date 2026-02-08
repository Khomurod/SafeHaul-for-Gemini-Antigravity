import React, { useState } from 'react';
import { MessageSquare, Pin, Clock, Send, Loader2 } from 'lucide-react';

/**
 * InternalNotesPanel - Quick add note, pinned notes, and note history
 */
export function InternalNotesPanel({
    notes = [],
    onAddNote,
    isLoading = false
}) {
    const [newNote, setNewNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Sort notes: pinned first, then by date
    const sortedNotes = [...notes].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    const pinnedNote = sortedNotes.find(n => n.pinned);

    const formatTime = (timestamp) => {
        if (!timestamp?.seconds) return '';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newNote.trim() || !onAddNote) return;

        setIsSubmitting(true);
        try {
            await onAddNote(newNote.trim());
            setNewNote('');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Quick Add Note */}
            <form onSubmit={handleSubmit} className="relative">
                <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note for the team..."
                    className="w-full px-3 py-2.5 pr-12 text-sm border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    rows={2}
                />
                <button
                    type="submit"
                    disabled={!newNote.trim() || isSubmitting}
                    className="absolute right-2 bottom-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
            </form>

            {/* Pinned Note */}
            {pinnedNote && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Pin size={12} className="text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700 uppercase">Pinned</span>
                    </div>
                    <p className="text-sm text-gray-700">{pinnedNote.content || pinnedNote.text}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <Clock size={10} />
                        {formatTime(pinnedNote.createdAt)}
                        {pinnedNote.author && <span>• {pinnedNote.author}</span>}
                    </div>
                </div>
            )}

            {/* Notes List */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                            <div className="h-3 bg-gray-100 rounded w-1/2" />
                        </div>
                    ))}
                </div>
            ) : sortedNotes.length === 0 ? (
                <div className="text-center py-4 text-gray-400">
                    <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notes yet</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                    {sortedNotes.filter(n => !n.pinned).slice(0, 5).map((note, index) => (
                        <div key={note.id || index} className="pb-3 border-b border-gray-100 last:border-b-0">
                            <p className="text-sm text-gray-700 leading-snug">
                                {note.content || note.text}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                                <Clock size={10} />
                                {formatTime(note.createdAt)}
                                {note.author && <span>• {note.author}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default InternalNotesPanel;
