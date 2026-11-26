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
    { id: 'meters', label: 'Liczniki' },
    { id: 'settlements', label: 'Bilans' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col overflow-x-hidden">
      {/* Link szybkiego przejścia do treści dla klawiatury (WCAG AA) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-700 focus:text-white focus:rounded-lg focus:font-semibold"
      >
        Przejdź do głównej treści
      </a>

      {/* Responsywny pasek nawigacji (320px -> 1920px) */}
      <header className="bg-white border-b border-slate-300 px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 truncate">
                LokatorPay
              </span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-900 shrink-0">
                NFR-05
              </span>
            </div>
          </div>

          <nav
            aria-label="Nawigacja główna"
            className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 bg-slate-200/80 p-1.5 rounded-xl"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 ${
                    isActive
                      ? 'bg-indigo-700 text-white shadow-sm'
                      : 'bg-white/70 text-slate-900 hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Główny obszar roboczy */}
      <main
        id="main-content"
        className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8"
      >
        {activeTab === 'dashboard' && <DashboardView db={store.db} />}
        {activeTab === 'rooms' && <RoomsView store={store} />}
        {activeTab === 'tenants' && <TenantsView store={store} />}
        {activeTab === 'meters' && <MetersView store={store} />}
        {activeTab === 'settlements' && <SettlementsView store={store} />}
      </main>
    </div>
  );
}