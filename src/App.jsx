import React, { useState } from 'react';
import { useStore } from './store/useStore';
import { DashboardView } from './views/DashboardView';
import { RoomsView } from './views/RoomsView';
import { TenantsView } from './views/TenantsView';

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showDebug, setShowDebug] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Pulpit' },
    { id: 'rooms', label: 'Pokoje' },
    { id: 'tenants', label: 'Lokatorzy' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Górny pasek nawigacji */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-slate-900">NajemPro</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              v0.1 slate
            </span>
          </div>

          <nav className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Główny obszar roboczy */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <DashboardView db={store.db} />}
        {activeTab === 'rooms' && <RoomsView store={store} />}
        {activeTab === 'tenants' && <TenantsView store={store} />}
      </main>

      {/* Podgląd stanu JSON (Debug) */}
      <footer className="max-w-4xl w-full mx-auto px-6 pb-8">
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs font-mono text-slate-600 hover:text-slate-900"
            >
              {showDebug ? '▼ Ukryj stan JSON (db)' : '▶ Pokaż stan JSON (db)'}
            </button>
            <button
              onClick={store.resetDb}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium"
            >
              Resetuj stan
            </button>
          </div>
          {showDebug && (
            <pre className="p-4 text-xs font-mono text-slate-700 overflow-x-auto bg-slate-900 text-slate-100">
              {JSON.stringify(store.db, null, 2)}
            </pre>
          )}
        </div>
      </footer>
    </div>
  );
}
