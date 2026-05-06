import React from 'react';
import { Building2, Search, X, LogOut, Loader2, Wrench } from 'lucide-react';

export function DashboardHeader({
    searchQuery,
    setSearchQuery,
    onBackfillEmployers,
    backfillingEmployers,
    onLogout
}) {
    return (
        <header className="sticky top-0 z-10 bg-white shadow-md border-b border-gray-200">
            <div className="container mx-auto p-4 flex justify-between items-center gap-4">

                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-lg text-white">
                        <Building2 size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Super Admin</h1>
                </div>

                <div className="relative flex-1 max-w-xl">
                    <input
                        type="text"
                        placeholder="Global Search..."
                        className="w-full p-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Search
                        size={20}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    {searchQuery && (
                        <button
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            onClick={() => setSearchQuery('')}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">

                    <button
                        onClick={onBackfillEmployers}
                        disabled={backfillingEmployers}
                        className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-lg shadow-sm transition-colors ${backfillingEmployers
                                ? 'bg-orange-300 cursor-not-allowed'
                                : 'bg-orange-600 hover:bg-orange-700'
                            }`}
                        title="Backfill employer field names in all existing applications"
                    >
                        {backfillingEmployers ?
                            <Loader2 size={16} className="animate-spin" /> :
                            <Wrench size={16} />
                        }
                        {backfillingEmployers ? "Backfilling..." : "Backfill Employers"}
                    </button>

                </div>

                <button
                    id="logout-button-super"
                    className="px-3 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-all flex items-center gap-2 ml-2"
                    onClick={onLogout}
                >
                    <LogOut size={18} />
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    );
}