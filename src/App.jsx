import React, { useState } from 'react';
import { useStore } from './store/useStore';
import { DashboardView } from './views/DashboardView';
import { RoomsView } from './views/RoomsView';
import { TenantsView } from './views/TenantsView';
import { MetersView } from './views/MetersView';
import { SettlementsView } from './views/SettlementsView';

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Pulpit' },
    { id: 'rooms', label: 'Pokoje (m²)' },
    { id: 'tenants', label: 'Lokatorzy' },
    { id: 'meters', label: 'Liczniki Mediów' },
    { id: 'settlements', label: 'Bilans i Przelewy' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Górny pasek nawigacji */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-slate-900">LokatorPay</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              v0.1 slate
            </span>
          </div>

          <nav className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
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
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <DashboardView db={store.db} />}
        {activeTab === 'rooms' && <RoomsView store={store} />}
        {activeTab === 'tenants' && <TenantsView store={store} />}
        {activeTab === 'meters' && <MetersView store={store} />}
        {activeTab === 'settlements' && <SettlementsView store={store} />}
      </main>
    </div>
  );
}