import React, { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { useToast } from '@shared/components/feedback/ToastProvider';
import { auth } from '@lib/firebase';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { updateUser } from '@features/auth';
import { User, Mail, Lock, Save, Camera } from 'lucide-react';

export const UserProfilePage = () => {
    const { currentUser, currentCompanyProfile } = useData();
    const { showSuccess, showError } = useToast();

    const [profileData, setProfileData] = useState({
        displayName: '',
        email: '',
        photoURL: ''
    });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    useEffect(() => {
        if (currentUser) {
            setProfileData({
                displayName: currentUser.displayName || '',
                email: currentUser.email || '',
                photoURL: currentUser.photoURL || ''
            });
        }
    }, [currentUser]);

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async () => {
        if (!profileData.displayName.trim()) {
            showError('Display name cannot be empty.');
            return;
        }
        setIsSavingProfile(true);
        try {
            await updateProfile(auth.currentUser, {
                displayName: profileData.displayName.trim()
            });
            // Also update the portal_users document
            await updateUser(currentUser.uid, { name: profileData.displayName.trim() });
            showSuccess('Profile updated successfully!');
        } catch (err) {
            console.error('Error updating profile:', err);
            showError('Failed to update profile.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passwordData.currentPassword || !passwordData.newPassword) {
            showError('Please fill in both current and new password fields.');
            return;
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            showError('New passwords do not match.');
            return;
        }
        if (passwordData.newPassword.length < 6) {
            showError('New password must be at least 6 characters.');
            return;
        }

        setIsSavingPassword(true);
        try {
            // Re-authenticate first
            const credential = EmailAuthProvider.credential(currentUser.email, passwordData.currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // Then update password
            await updatePassword(auth.currentUser, passwordData.newPassword);
            showSuccess('Password changed successfully!');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            console.error('Error changing password:', err);
            if (err.code === 'auth/wrong-password') {
                showError('Current password is incorrect.');
            } else {
                showError('Failed to change password. Please try again.');
            }
        } finally {
            setIsSavingPassword(false);
        }
    };

    const getInitials = (name) => {
        if (!name) return 'U';
        const parts = name.split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Page Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <User size={24} className="text-indigo-600" />
                    My Profile
                </h1>
                <p className="text-sm text-gray-500">Manage your account settings and preferences.</p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-2xl mx-auto space-y-6">

                    {/* Profile Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <User size={18} /> Profile Information
                        </h2>

                        <div className="flex items-center gap-6 mb-6">
                            <div className="relative">
                                {profileData.photoURL ? (
                                    <img src={profileData.photoURL} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                                        {getInitials(profileData.displayName)}
                                    </div>
                                )}
                                <button className="absolute bottom-0 right-0 p-1.5 bg-white border border-gray-300 rounded-full shadow hover:bg-gray-50 transition">
                                    <Camera size={14} className="text-gray-600" />
                                </button>
                            </div>
                            <div className="flex-1">
                                <p className="text-lg font-medium text-gray-900">{profileData.displayName || 'No Name Set'}</p>
                                <p className="text-sm text-gray-500">{currentCompanyProfile?.companyName || 'No Company'}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                <input
                                    type="text"
                                    name="displayName"
                                    value={profileData.displayName}
                                    onChange={handleProfileChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <Mail size={14} className="inline mr-1" /> Email Address
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={profileData.email}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2 disabled:opacity-50"
                            >
                                <Save size={16} /> {isSavingProfile ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    {/* Password Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Lock size={18} /> Change Password
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                                <input
                                    type="password"
                                    name="currentPassword"
                                    value={passwordData.currentPassword}
                                    onChange={handlePasswordChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={handleChangePassword}
                                disabled={isSavingPassword}
                                className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium flex items-center gap-2 disabled:opacity-50"
                            >
                                <Lock size={16} /> {isSavingPassword ? 'Changing...' : 'Change Password'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default UserProfilePage;
