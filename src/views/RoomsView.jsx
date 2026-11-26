import React from 'react';

export function RoomsView({ store }) {
  // TODO (os3): Podłącz formularz i listę pokoi (FR-03) korzystając ze `store`
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
      <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
        FR-03 • Kolekcja: db.rooms
      </span>
      <h2 className="text-lg font-semibold text-slate-800">Moduł: Pokoje i Metraż</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Miejsce na formularz dodawania pokoi z metrażem (m²), sumowanie powierzchni oraz przypisywanie lokatorów.
      </p>
    </div>
  );
}
