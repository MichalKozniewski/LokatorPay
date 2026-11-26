import React from 'react';

export function TenantsView({ store }) {
  // TODO (os3 - Frontend & UX): Rejestracja lokatorów w mieszkaniu
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
      <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
        Kolekcja: db.tenants • os3 (Frontend)
      </span>
      <h2 className="text-lg font-semibold text-slate-800">Lokatorzy Mieszkania</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Zarządzanie listą współlokatorów dzielących koszty najmu i mediów.
      </p>
    </div>
  );
}
