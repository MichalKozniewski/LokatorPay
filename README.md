# LokatorPay

Frontend React/Vite oraz API FastAPI z bazą SQLAlchemy.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

API (w osobnym terminalu):

```bash
cd backend
python -m pip install -r requitements.txt
uvicorn main:app --reload
```

Lokalnie frontend łączy się z `http://localhost:8000`, a API używa SQLite w `backend/lokatorpay.db`.

## Konfiguracja produkcyjna

Przed budowaniem frontendu ustaw `VITE_API_URL` na adres API HTTPS, np. `https://api.example.com`. Build produkcyjny przerwie się, jeśli adres jest brakujący lub używa HTTP.

Backend wymaga `ENV=production`, `JWT_SECRET_KEY` oraz `FRONTEND_ORIGIN` z originem HTTPS. Za reverse proxy uruchom Uvicorn z obsługą nagłówków proxy ograniczoną do adresu zaufanego proxy, np. `--proxy-headers --forwarded-allow-ips=<adres-proxy>`. Nie wystawiaj bezpośrednio portu aplikacji do niezaufanej sieci.
