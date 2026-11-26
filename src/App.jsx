import React, { useState } from 'react';
import { useStore } from './store/useStore';
import { AuthView } from './views/AuthView';
import { OnboardingApartmentView } from './views/OnboardingApartmentView';
import { DashboardRoomsView } from './views/DashboardRoomsView';
import { Button, Badge } from './components/ui';

export default function App() {
  const store = useStore();
  const [creatingNewApt, setCreatingNewApt] = useState(false);

  if (store.loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-sm font-medium text-slate-700">Weryfikacja sesji i ładowanie lokalu...</p>
      </div>
    );
  }

  // US1: Widok autoryzacji (Rejestracja i Logowanie)
  if (!store.session) {
    return <AuthView store={store} />;
  }

  const { apartment, role } = store.scopedData;
  const hasApartment = Boolean(apartment);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Nawigacja responsywna (320px - 1920px) */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center">
              LP
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 tracking-tight truncate">
                  LokatorPay
                </span>
                {role && (
                  <Badge variant={role === 'admin' ? 'primary' : 'neutral'}>
                    {role === 'admin' ? 'Administrator' : 'Lokator'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 truncate">
                {store.session.user.name} ({store.session.user.email})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Przełącznik lokali (wsparcie wielu mieszkań użytkownika) */}
            {store.apartments.length > 0 && (
              <select
                aria-label="Wybierz aktywny lokal"
                value={apartment?.id || ''}
                onChange={(e) => {
                  setCreatingNewApt(false);
                  store.switchApartment(e.target.value);
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs sm:text-sm font-medium text-slate-800 max-w-[180px] sm:max-w-[240px]"
              >
                {store.apartments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.name}
                  </option>
                ))}
              </select>
            )}

            {hasApartment && (
              <Button
                variant="secondary"
                onClick={() => setCreatingNewApt((prev) => !prev)}
                className="text-xs sm:text-sm px-3"
              >
                {creatingNewApt ? 'Wróć do lokalu' : '+ Lokal'}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={store.logout}
              className="text-xs sm:text-sm px-3"
            >
              Wyloguj
            </Button>
          </div>
        </div>
      </header>

      {/* Powiadomienie o realizacji zaproszenia do lokalu */}
      {store.inviteBanner && (
        <div className="max-w-5xl w-full mx-auto px-3 sm:px-6 pt-4">
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
              store.inviteBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span>{store.inviteBanner.message}</span>
            <button
              type="button"
              onClick={store.clearInviteBanner}
              className="text-xs font-bold underline shrink-0"
            >
              Zamknij
            </button>
          </div>
        </div>
      )}

      {/* Główna zawartość */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {!hasApartment || creatingNewApt ? (
          <OnboardingApartmentView
            store={{
              ...store,
              createApartment: async (payload) => {
                await store.createApartment(payload);
                setCreatingNewApt(false);
              },
              joinApartmentByToken: async (rawInput) => {
                await store.joinApartmentByToken(rawInput);
                setCreatingNewApt(false);
              },
            }}
          />
        ) : (
          <DashboardRoomsView store={store} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-3 sm:px-6 text-center text-xs text-slate-600">
        LokatorPay &bull; Modułowy system rozliczeń lokatorskich
      </footer>
    </div>
  );
}