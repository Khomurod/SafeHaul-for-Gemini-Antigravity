import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@lib/firebase';
import { UserPlus, Loader2, Plus } from 'lucide-react';
import { useToast } from '@shared/components/feedback';

export function TeamManagementTab({ currentCompanyProfile, isCompanyAdmin, onShowManageTeam }) {
    const { showSuccess, showError } = useToast();
    const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', role: 'hr_user' });
    const [addUserLoading, setAddUserLoading] = useState(false);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setAddUserLoading(true);
        try {
            const createFn = httpsCallable(functions, 'createPortalUser');
            await createFn({
                fullName: newUser.fullName,
                email: newUser.email,
                password: newUser.password,
                companyId: currentCompanyProfile.id,
                role: newUser.role
            });
            
            showSuccess(`User ${newUser.fullName} created successfully!`);
            setNewUser({ fullName: '', email: '', password: '', role: 'hr_user' });
        } catch (error) {
            console.error(error);
            showError("Failed to create user: " + error.message);
        } finally {
            setAddUserLoading(false);
        }
    };

    if (!isCompanyAdmin) {
        return <div className="p-10 text-center text-gray-500">Access Denied. Only Admins can manage the team.</div>;
    }

    return (
        <div className="space-y-8 max-w-3xl animate-in fade-in">
            <div className="border-b border-gray-200 pb-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900">Team Management</h2>
                <p className="text-sm text-gray-500 mt-1">Add new recruiters or admins to your company dashboard.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <UserPlus size={20} /> Add New User
                </h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                            <input
                                required
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newUser.fullName}
                                onChange={e => setNewUser({ ...newUser, fullName: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                            <input
                                required
                                type="email"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                            <input
                                required
                                type="password"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newUser.password}
                                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
                            <select
                                className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={newUser.role}
                                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                            >
                                <option value="hr_user">Recruiter (Standard)</option>
                                <option value="company_admin">Company Admin (Full Access)</option>
                            </select>
                        </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={addUserLoading}
                            className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                        >
                            {addUserLoading ? <Loader2 className="animate-spin" /> : <Plus size={18} />} Create User
                        </button>
                    </div>
                </form>
            </div>

            <div className="text-center pt-4">
                <button
                    onClick={onShowManageTeam}
                    className="text-blue-600 hover:underline text-sm font-semibold"
                >
                    View All Team Members & Goals
                </button>
            </div>
        </div>
    );
}
