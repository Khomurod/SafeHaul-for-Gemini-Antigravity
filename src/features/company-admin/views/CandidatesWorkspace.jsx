// src/features/company-admin/views/CandidatesWorkspace.jsx
//
// One destination for the candidate pool with a List <-> Sheet toggle, replacing
// the separate "Pipeline" sidebar route. The two modes intentionally keep their
// own data sources (no migration):
//   - List  -> CompanyCandidatesListPage (applications/leads via useCompanyDashboard)
//   - Sheet -> PipelineSheetPage (manual pipeline_entries via usePipelineEntries)
// The active mode is persisted in the URL (?view=list|sheet) so it's shareable
// and survives refresh; `defaultView` lets the legacy /drivers/pipeline deep link
// land directly in Sheet mode.

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, Table2 } from 'lucide-react';
import { CompanyCandidatesListPage } from './CompanyCandidatesListPage';
import { PipelineSheetPage } from './PipelineSheetPage';

const MODES = ['list', 'sheet'];

export function CandidatesWorkspace({ scope = 'applications', defaultView = 'list' }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const param = searchParams.get('view');
    const view = MODES.includes(param) ? param : (MODES.includes(defaultView) ? defaultView : 'list');

    const setView = (next) => {
        const params = new URLSearchParams(searchParams);
        params.set('view', next);
        setSearchParams(params, { replace: true });
    };

    const tabClass = (active) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            active
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
        }`;

    return (
        <div>
            <div className="px-4 pt-4 sm:px-6">
                <div
                    role="tablist"
                    aria-label="Candidate view mode"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === 'list'}
                        onClick={() => setView('list')}
                        className={tabClass(view === 'list')}
                    >
                        <List size={16} aria-hidden="true" /> List
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === 'sheet'}
                        onClick={() => setView('sheet')}
                        className={tabClass(view === 'sheet')}
                    >
                        <Table2 size={16} aria-hidden="true" /> Sheet
                    </button>
                </div>
            </div>

            {view === 'sheet'
                ? <PipelineSheetPage />
                : <CompanyCandidatesListPage scope={scope} />}
        </div>
    );
}

export default CandidatesWorkspace;
