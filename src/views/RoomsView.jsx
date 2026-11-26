import React from 'react';

export function RoomsView({ store }) {
  // TODO (os3 - Frontend & UX): Formularz pokoi z metrażem (m²) + przypisanie lokatorów
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
      <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
        FR-03 • os2 (DB) / os3 (Frontend)
      </span>
      <h2 className="text-lg font-semibold text-slate-800">Pokoje i Metraż (m²)</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Definiowanie listy pokoi wraz z metrażem w m², sumowanie powierzchni mieszkania oraz przypisywanie lokatorów do pokoi.
      </p>
    </div>
  );
}
