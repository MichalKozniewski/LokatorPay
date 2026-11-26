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

## Zarządzanie członkostwem

Administrator może usunąć lokatora z lokalu albo przekazać swoją rolę jednemu z lokatorów. Jeśli w lokalu są inni członkowie, administrator musi najpierw przekazać rolę, aby go opuścić. Ostatni członek może opuścić lokal po potwierdzeniu; wtedy lokal, pokoje i zaproszenia są usuwane. Usunięcie konta usuwa użytkownika ze wszystkich lokali i czyści przypisania jego pokoi, ale zachowuje lokale dla pozostałych członków.

## Weryfikacja kryteriów FR-01–FR-03

| Kryterium | Ocena w obecnym kodzie | Miejsca w kodzie |
|---|---|---|
| Konto powstaje po podaniu poprawnego e-maila i hasła | Tak; API tworzy użytkownika i zwraca token po rejestracji. | `src/views/AuthView.jsx:11–20`; `src/store/useStore.js:262–277`; `backend/main.py:71–94, 223–256` |
| Zajęty e-mail i słabe hasło są odrzucane z komunikatem | Tak; duplikat zwraca czytelny błąd, a hasło musi mieć min. 8 znaków, wielką literę, cyfrę i znak specjalny. | `src/store/useStore.js:46–59, 262–270`; `src/views/AuthView.jsx:13–27, 122–133`; `backend/main.py:71–90, 223–245` |
| Hasła są hashowane bcrypt | Tak; używany jest `CryptContext` ze schematem `bcrypt`. | `backend/security.py:24–33`; zapis hasha przy rejestracji: `backend/main.py:232–238` |
| HTTPS i JWT wygasający po 60 minutach (NFR-02) | Tak w produkcji: ruch do API spoza localhost przez HTTP jest blokowany, a token ma 60 minut ważności. Lokalny tryb deweloperski celowo dopuszcza HTTP. | `backend/main.py:25–38, 51–55`; `backend/security.py:22–43`; `src/store/useStore.js:13–33`; `vite.config.js:5–16` |
| Twórca lokalu automatycznie dostaje rolę Administratora | Tak. | `backend/main.py:404–429` |
| Administrator może zaprosić linkiem lub e-mailem | Częściowo: generowany jest unikalny, jednorazowy link, opcjonalnie przypisany do e-maila; przycisk `mailto` przygotowuje wiadomość w kliencie poczty, ale API nie wysyła e-maila automatycznie. | `backend/main.py:584–606`; `src/views/DashboardRoomsView.jsx:172–180, 548–599` |
| Po kliknięciu linku lokator trafia do właściwego lokalu | Tak, po zalogowaniu lub rejestracji. Token z `?invite=...` jest zachowany do czasu uwierzytelnienia; API sprawdza zaproszenie i zwraca stan wskazanego lokalu. Link wykorzystany lub przypisany do innego e-maila jest odrzucany. | `src/store/useStore.js:93–100, 201–241, 305–332`; `src/views/OnboardingApartmentView.jsx:24–38, 89–119`; `backend/main.py:611–658` |
| Lokator widzi dane wyłącznie lokali, do których należy (NFR-02) | Tak dla obecnie zaimplementowanych danych lokali, członków, pokoi i zaproszeń. Lista lokali jest filtrowana po zalogowanym użytkowniku, a bez członkostwa szczegóły i operacje na cudzym lokalu są blokowane. Zaproszenia są zwracane tylko administratorowi. | `backend/main.py:125–150` (`require_member`, `require_admin`), `152–220` (`serialize_apartment_state`), `381–399` (`list_user_apartments`), `434–444` (`get_apartment_details`), sprawdzenia administratora przy modyfikacjach: `453`, `498`, `590`, `678`, `716`, `746`, `780`; przypisywany lokator jest też sprawdzany na `686` i `757` |
| Administrator może dodać pokoje o dodatnim metrażu | Tak; API przyjmuje metraż od 0,01 do 9999,99 m². | Formularz: `src/views/DashboardRoomsView.jsx:230–308`; walidacja i endpoint: `backend/main.py:662–703` |
| Suma metrażu lokalu jest obliczana poprawnie | Tak; sumowane są metraże pokoi przypisanych do danego lokalu. | `backend/main.py:152–186` (`serialize_apartment_state`) |
| Do pokoju można przypisać zarejestrowanego lokatora z tego lokalu | Tak; przypisanie wymaga członkostwa w tym samym lokalu, a ograniczenie bazy nie pozwala przypisać go do dwóch pokoi. | `backend/main.py:672–703, 739–767`; `backend/models.py:77–78`; formularz: `src/views/DashboardRoomsView.jsx:270–292, 426–447` |

W tym repozytorium polecenie startowe uruchamia `uvicorn main:app`, więc aktywna implementacja API znajduje się w `backend/main.py`. `backend/apartaments.py` jest niepodłączonym prototypem z danymi w pamięci i nie stanowi aktywnej ścieżki zaproszeń ani autoryzacji. Backend nie ma obecnie endpointów ani modeli dla liczników i wydatków, więc ich izolacji nie można jeszcze potwierdzić.

## Konfiguracja produkcyjna

Przed budowaniem frontendu ustaw `VITE_API_URL` na adres API HTTPS, np. `https://api.example.com`. Build produkcyjny przerwie się, jeśli adres jest brakujący lub używa HTTP.

Backend wymaga `ENV=production`, `JWT_SECRET_KEY` oraz `FRONTEND_ORIGIN` z originem HTTPS. Za reverse proxy uruchom Uvicorn z obsługą nagłówków proxy ograniczoną do adresu zaufanego proxy, np. `--proxy-headers --forwarded-allow-ips=<adres-proxy>`. Nie wystawiaj bezpośrednio portu aplikacji do niezaufanej sieci.
