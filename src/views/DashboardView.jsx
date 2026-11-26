import React from 'react';

export function DashboardView({ db }) {
  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
        <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
          LokatorPay • Zero Paywalli i Limitów
        </span>
        <h2 className="text-lg font-semibold text-slate-800">
          Sprawiedliwe rozliczanie rachunków i mediów domowych
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
          Podział czynszu według metrażu pokoi, liczniki prądu i wody (kWh, m³) oraz automatyczne bilanse eliminujące niezręczne upominanie się o zwrot gotówki.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-slate-600">
          <span>Pokoje: <strong>{db.rooms.length}</strong></span>
          <span>Lokatorzy: <strong>{db.tenants.length}</strong></span>
          <span>Odczyty liczników: <strong>{db.meters.length}</strong></span>
          <span>Wydatki: <strong>{db.expenses.length}</strong></span>
        </div>
      </div>
    </div>
  );
}
