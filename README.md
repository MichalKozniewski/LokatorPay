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
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

Lokalnie frontend łączy się z `http://localhost:8000`, a API używa SQLite w `backend/lokatorpay.db`.

## Zarządzanie członkostwem

Administrator może usunąć lokatora z lokalu albo przekazać swoją rolę jednemu z lokatorów. Jeśli w lokalu są inni członkowie, administrator musi najpierw przekazać rolę, aby go opuścić. Ostatni członek może opuścić lokal po potwierdzeniu; wtedy lokal, pokoje i zaproszenia są usuwane. Usunięcie konta usuwa użytkownika ze wszystkich lokali i czyści przypisania jego pokoi, ale zachowuje lokale dla pozostałych członków.

## Weryfikacja kryteriów FR-01–FR-03

| Kryterium | Ocena w obecnym kodzie | Miejsca w kodzie |
|---|---|---|
| Konto powstaje po podaniu poprawnego e-maila i hasła | Tak; API tworzy użytkownika i zwraca token po rejestracji. | `src/views/AuthView.jsx:12–29`; `src/store/useStore.js:265–280`; `backend/main.py:89–103, 528–560` |
| Zajęty e-mail i słabe hasło są odrzucane z komunikatem | Tak; duplikat zwraca czytelny błąd, a hasło musi mieć min. 8 znaków, wielką literę, cyfrę i znak specjalny. | `src/store/useStore.js:46–59, 265–280`; `src/views/AuthView.jsx:12–29, 122–133`; `backend/main.py:89–103, 528–550` |
| Hasła są hashowane bcrypt | Tak; używany jest `CryptContext` ze schematem `bcrypt`. | `backend/security.py:24–33`; zapis hasha przy rejestracji: `backend/main.py:528–550` |
| HTTPS i JWT wygasający po 60 minutach (NFR-02) | Tak w produkcji: ruch do API spoza localhost przez HTTP jest blokowany, a token ma 60 minut ważności. Lokalny tryb deweloperski celowo dopuszcza HTTP. | `backend/main.py:34–48, 62`; `backend/security.py:22–43`; `src/store/useStore.js:13–33`; `vite.config.js:5–16` |
| Twórca lokalu automatycznie dostaje rolę Administratora | Tak. | `backend/main.py:711–737` |
| Administrator może zaprosić linkiem lub e-mailem | Częściowo: generowany jest unikalny, jednorazowy link, opcjonalnie przypisany do e-maila; przycisk `mailto` przygotowuje wiadomość w kliencie poczty, ale API nie wysyła e-maila automatycznie. | `backend/main.py:1069–1094`; `src/views/DashboardRoomsView.jsx:261–275, 920–970` |
| Po kliknięciu linku lokator trafia do właściwego lokalu | Tak, po zalogowaniu lub rejestracji. Token z `?invite=...` jest zachowany do czasu uwierzytelnienia; API sprawdza zaproszenie i zwraca stan wskazanego lokalu. Link wykorzystany lub przypisany do innego e-maila jest odrzucany. | `src/store/useStore.js:96–101, 211–245, 308–340`; `src/views/OnboardingApartmentView.jsx:26–38, 89–119`; `backend/main.py:1096–1144` |
| Lokator widzi dane wyłącznie lokali, do których należy (NFR-02) | Tak dla obecnie zaimplementowanych danych lokali, członków, pokoi, wydatków i zaproszeń. Lista lokali jest filtrowana po zalogowanym użytkowniku, a bez członkostwa szczegóły i operacje na cudzym lokalu są blokowane. Zaproszenia są zwracane tylko administratorowi. | `backend/main.py:148–183` (`require_member`, `require_admin`), `452–526` (`serialize_apartment_state`), `688–753` (`list_user_apartments`, `get_apartment_details`), `804–904` (wydatki wymagają członkostwa), oraz wywołania strażników dostępu w endpointach zapisu |
| Administrator może dodać pokoje o dodatnim metrażu | Tak; API przyjmuje metraż od 0,01 do 9999,99 m². | Formularz: `src/views/DashboardRoomsView.jsx:619–680`; walidacja i endpoint: `backend/main.py:1147–1193` |
| Suma metrażu lokalu jest obliczana poprawnie | Tak; sumowane są metraże pokoi przypisanych do danego lokalu. | `backend/main.py:452–486` (`serialize_apartment_state`) |
| Do pokoju można przypisać zarejestrowanego lokatora z tego lokalu | Tak; przypisanie wymaga członkostwa w tym samym lokalu, a ograniczenie bazy nie pozwala przypisać go do dwóch pokoi. | `backend/main.py:1157–1193, 1226–1260`; `backend/models.py:77–80`; formularz: `src/views/DashboardRoomsView.jsx:647–680, 802–840` |

## Czynsz proporcjonalny (FR-05, NFR-07)

Administrator ustawia czynsz za okres rozliczeniowy. Domyślny jest miesiąc kalendarzowy; przy pierwszej konfiguracji można zamiast niego wybrać cykl powtarzany od wskazanego dnia miesiąca (1–28). Typ cyklu i dzień startu są stałe po zapisaniu konfiguracji, aby granice już rozpoczętych okresów nie zmieniały się wstecz.

Udział i kwota są liczone tylko dla pokoi przypisanych lokatorom: udział = metraż przypisanego pokoju / suma metraży przypisanych pokoi. Pokoje nieprzypisane nie wchodzą do mianownika. Kwoty są rozdzielane w groszach metodą największych reszt, z deterministycznym rozstrzyganiem remisów, więc ich suma jest dokładnie równa czynszowi.

Kwota czynszu i granice bieżącego okresu są zapisywane jako snapshot. Zmiana metrażu lub przypisania pokoju aktualizuje bieżący podział; wcześniejsze okresy pozostają niezmienione. Przy przypisaniu lokatora w trakcie okresu administrator wybiera, czy uwzględnić tę osobę w bieżącym czynszu. Jeśli ją wyłączy, pozostaje przypisana do pokoju, ale nie ponosi udziału w tym okresie; od następnego okresu przypisani lokatorzy są uwzględniani automatycznie. Administrator może później edytować udział tej osoby w bieżącym okresie z poziomu podsumowania czynszu. Czynsz za osoby uwzględnione w podziale nadal sumuje się dokładnie do pełnej kwoty okresu.

Kod: interfejs i podsumowanie w `src/views/DashboardRoomsView.jsx`; zapis ustawień z frontendu w `src/store/useStore.js`; walidacja konfiguracji, granice cyklu i rozdział groszy w `backend/main.py`; tabele konfiguracji i snapshotów w `backend/models.py`.

## Wspólne wydatki i bilanse (FR-04)

Każdy członek lokalu może dodać wydatek z opisem i kwotą, wskazać płatnika oraz uczestników. Koszt jest dzielony po równo tylko między zaznaczone osoby; lokator, który nie korzysta np. z Netflixa, może zostać odznaczony i nie zostanie obciążony tym wydatkiem. Pozostały grosz trafia do uczestników w deterministycznej kolejności. Płatnik może nie być uczestnikiem. Formularz jest widoczny od razu, domyślnie ustawia zalogowanego lokatora jako płatnika i zaznacza wszystkich członków, dzięki czemu typowy wydatek można zapisać bez nawigowania po dodatkowych widokach.

Wydatek i udziały są zapisywane razem w jednej transakcji bazy danych. Po zapisie API zwraca odświeżoną listę wydatków i bilanse: wpłata płatnika pomniejszona o należne udziały, a suma bilansów pozostaje równa 0,00 zł. Formularz wymaga opisu, kwoty, płatnika i co najmniej jednego uczestnika. Wymóg czasu poniżej 30 sekund zależy od użytkownika i nie jest mierzony automatycznym testem.

Kod: formularz, historia wydatków i widok bilansów w `src/views/DashboardRoomsView.jsx`; klient API w `src/store/useStore.js`; walidacja, równy podział groszy i obliczanie bilansów w `backend/main.py`; tabele `Expense` i `ExpenseShare` w `backend/models.py`.

## Przelewy wyrównawcze (FR-08, NFR-01, NFR-07)

Na podstawie aktualnych bilansów system proponuje plan z minimalną liczbą przelewów. Saldo ujemne oznacza kwotę do zapłaty, a dodatnie — kwotę do otrzymania. Dla przykładowych sald A = −30 zł, B = +20 zł i C = +10 zł plan wynosi A → B: 20 zł oraz A → C: 10 zł. Algorytm grupuje salda w podzbiory sumujące się do zera, a następnie dopasowuje dłużników do wierzycieli.

Tylko wskazany nadawca może oznaczyć aktualną propozycję jako zrealizowaną. Zapis przelewu natychmiast aktualizuje bilanse i propozycje, a ostatnie potwierdzenia są widoczne w historii. Aplikacja zapisuje potwierdzenie użytkownika — nie wykonuje przelewu bankowego. Przykład akceptacyjny z sześcioma zadłużeniami zweryfikowano: wynik to dokładnie dwa przelewy, a obliczenie planu trwało poniżej 500 ms.

Kod: algorytm, bilanse i endpoint potwierdzania w `backend/main.py`; trwały zapis potwierdzonych przelewów w modelu `TransferPayment` z `backend/models.py`; propozycje i historia w `src/views/DashboardRoomsView.jsx`; wywołanie API i odświeżanie stanu w `src/store/useStore.js`.

W tym repozytorium polecenie startowe uruchamia `uvicorn main:app`, więc aktywna implementacja API znajduje się w `backend/main.py`. `backend/apartaments.py` jest niepodłączonym prototypem z danymi w pamięci i nie stanowi aktywnej ścieżki zaproszeń ani autoryzacji. Backend nie ma obecnie endpointów ani modeli dla liczników, więc ich izolacji nie można jeszcze potwierdzić.

## Konfiguracja produkcyjna

Przed budowaniem frontendu ustaw `VITE_API_URL` na adres API HTTPS, np. `https://api.example.com`. Build produkcyjny przerwie się, jeśli adres jest brakujący lub używa HTTP.

Backend wymaga `ENV=production`, `JWT_SECRET_KEY` oraz `FRONTEND_ORIGIN` z originem HTTPS. Za reverse proxy uruchom Uvicorn z obsługą nagłówków proxy ograniczoną do adresu zaufanego proxy, np. `--proxy-headers --forwarded-allow-ips=<adres-proxy>`. Nie wystawiaj bezpośrednio portu aplikacji do niezaufanej sieci.
