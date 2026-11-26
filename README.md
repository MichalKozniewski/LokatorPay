# NajemPro — Szablon Startowy (v0.1 Slate)

Czysty projekt React + Vite + Tailwind CSS przygotowany pod stopniowe dopisywanie funkcji.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

## Struktura projektu

- `src/store/useStore.js` — stan aplikacji (`db`), zapis w `localStorage` i miejsce na akcje (`os2`).
- `src/views/DashboardView.jsx` — widok pulpitu startowego.
- `src/views/RoomsView.jsx` — widok pod moduł pokoi i metrażu (`FR-03`).
- `src/views/TenantsView.jsx` — widok pod moduł lokatorów.
- `src/App.jsx` — główny układ aplikacji, nawigacja oraz panel debugowania stanu JSON (`os3`).
