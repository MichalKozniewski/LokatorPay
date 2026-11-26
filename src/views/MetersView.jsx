import React from 'react';

export function MetersView({ store }) {
  // TODO (os3 - Frontend & UX / os2 - Algorytmy): Wpisywanie stanu liczników (kWh, m³)
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
      <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
        Kolekcja: db.meters • kWh oraz m³
      </span>
      <h2 className="text-lg font-semibold text-slate-800">Obsługa Liczników Mediów</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Wpisywanie stanu licznika prądu (kWh) i wody (m³) oraz automatyczne wyliczanie kwot dla lokatorów.
      </p>
    </div>
  );
}
