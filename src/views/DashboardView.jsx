import React from 'react';

export function DashboardView({ db }) {
  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-800">Pulpit Główny (Szablon Startowy)</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Czysta baza gotowa pod rozbudowę. Wybierz zakładkę u góry lub zacznij dopisywać własne komponenty.
        </p>
        <div className="mt-6 flex justify-center gap-6 text-xs text-slate-600">
          <span>Pokoje: <strong>{db.rooms.length}</strong></span>
          <span>Lokatorzy: <strong>{db.tenants.length}</strong></span>
          <span>Rachunki: <strong>{db.bills.length}</strong></span>
        </div>
      </div>
    </div>
  );
}
