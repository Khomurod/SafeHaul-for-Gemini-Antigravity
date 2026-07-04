import React from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { AssignmentRow } from './AssignmentRow';

/** Recruiter assignment matrix — extracted verbatim from NumberAssignmentManager.jsx. */
export function AssignmentTable({ users, ...rowProps }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <UsersIcon className="text-purple-500" size={18} /> Recruiter Assignments
                </h3>
                <p className="text-xs text-gray-500 mt-1">Assign strict 1:1 lines for your team members.</p>
            </div>

            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                    <tr>
                        <th className="px-6 py-3 border-b border-gray-100">Team Member</th>
                        <th className="px-6 py-3 border-b border-gray-100">Role</th>
                        <th className="px-6 py-3 border-b border-gray-100">Assigned Number</th>
                        <th className="px-6 py-3 border-b border-gray-100">Connection</th>
                        <th className="px-6 py-3 border-b border-gray-100 w-10 text-center">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {users.map(user => (
                        <AssignmentRow key={user.id} user={user} {...rowProps} />
                    ))}
                </tbody>
            </table>
            {users.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">No team members found.</div>
            )}
        </div>
    );
}

export default AssignmentTable;
