import React from 'react';

export function SettlementsView({ store }) {
  // TODO (os2 - Algorytmy kompensacji / os3 - Frontend): Minimalizacja przelewów i eksport PDF
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
      <span className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-200 text-slate-700 rounded mb-2">
        Algorytm Kompensacji • Eksport PDF
      </span>
      <h2 className="text-lg font-semibold text-slate-800">Bilans i Minimalizacja Przelewów</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Automatyczne bilanse, redukcja liczby transakcji wyrównawczych oraz eksport miesięcznego raportu PDF dla właściciela.
      </p>
    </div>
  );
}
