import React from 'react';
import { Clock, CheckCircle, MessageSquare, FileText, AlertCircle } from 'lucide-react';

/**
 * ActivityTimeline - Shows status changes, outreach attempts, and completed steps
 */
export function ActivityTimeline({ activities = [], maxItems = 10 }) {
    // Sort by timestamp descending
    const sortedActivities = [...activities]
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
        .slice(0, maxItems);

    const getActivityIcon = (type) => {
        switch (type) {
            case 'status_change':
                return <CheckCircle size={14} className="text-green-500" />;
            case 'message':
            case 'outreach':
                return <MessageSquare size={14} className="text-blue-500" />;
            case 'document':
                return <FileText size={14} className="text-purple-500" />;
            case 'alert':
                return <AlertCircle size={14} className="text-amber-500" />;
            default:
                return <Clock size={14} className="text-gray-400" />;
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp?.seconds) return '';
        const date = new Date(timestamp.seconds * 1000);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffHours < 48) return 'Yesterday';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (sortedActivities.length === 0) {
        return (
            <div className="text-center py-6 text-gray-400">
                <Clock size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {sortedActivities.map((activity, index) => (
                <div
                    key={activity.id || index}
                    className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0"
                >
                    {/* Timeline dot and line */}
                    <div className="relative flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            {getActivityIcon(activity.type)}
                        </div>
                        {index < sortedActivities.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 absolute top-7 bottom-0" />
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                        <p className="text-sm text-gray-700 leading-snug">
                            {activity.description || activity.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                                {formatTime(activity.timestamp || activity.createdAt)}
                            </span>
                            {activity.user && (
                                <span className="text-xs text-gray-400">
                                    by {activity.user}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default ActivityTimeline;
