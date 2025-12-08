# Bingo
To je repozitorij skupine Digitalna Brigada & Seljaki2 za prvo vajo pri predmetu RUPS.

Zagon je najlažji preko terminala, s pomočjo ukaza `npm start`.

## Dokumentacija funkcij (po datotekah)

Spodaj so na kratko dokumentirane funkcije, razdeljene po izvornih datotekah. Za vsako funkcijo so navedeni vhodni parametri, kaj vrača in kaj počne (max 3 stavki).

### `index.html`

- `toggleDarkMode()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Preklopi temo med temno in svetlo tako, da kliče `window.api.setTheme('dark'|'light')` in posodobi ikono gumba za preklop.

- `loadCategories()`
	- Vhodni parametri: /
	- Vrača: Promise (void) — asinhrono
	- Kaj naredi: Potegne kategorije preko `window.api.loadMenu()`, dynamično ustvari kartice kategorij v DOM-u, omogoči izbiro/odznačevanje kategorij in brisanje (desni klik).

- `loadGrades()`
	- Vhodni parametri: /
	- Vrača: Promise (void) — asinhrono
	- Kaj naredi: Potegne starostne skupine preko `window.api.loadMenu()`, izriše kartice v DOM, omogoči izbiro starostne skupine in brisanje ter poveže gumb za začetek igre z izbiro.

- `enableStartButton()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Preveri ali je izbrana starostna skupina, vsaj ena kategorija in vsaj en igralec; na podlagi tega omogoči ali onemogoči gumb "Začni igro" in posodobi CSS razrede.

- `updateAddPlayerButtonState()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Omogoči ali onemogoči gumb za dodajanje igralca glede na `MAX_PLAYERS` ter posodobi njegove razrede za vizualni feedback.

- `saveLoggedInPlayers()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Shrani seznam trenutno dodanih igralcev (id, first_name, last_name) v `localStorage` za ohranjanje med sejami.

- `createPlayerElement(player)`
	- Vhodni parametri: `player` (objekt z vsaj `first_name`, `last_name`, opcijsko `id`)
	- Vrača: DOM element (div)
	- Kaj naredi: Ustvari in vrne DOM element, ki predstavlja vrstico igralca z imenom in gumbom za odstranjevanje ter poveže dogodek za odstranitev iz seznama in `localStorage`.

- `loadSavedPlayers()` (IIFE se izvaja ob nalaganju)
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Prebere `loggedInPlayers` iz `localStorage` in obnovi vidni seznam igralcev ter stanje gumba za dodajanje.

- `onPlayerAdded` (IPC callback)
	- Vhodni parametri: `player` (objekt)
	- Vrača: /
	- Kaj naredi: Preveri podvojitve, doda novega igralca v UI in `localStorage`, ter posodobi stanje gumbov (omejitev igralcev ipd.).

### `index.js`

- `checkTablesExist(tables)`
	- Vhodni parametri: `tables` (array of string)
	- Vrača: Promise<array> — seznam manjkajočih tabel
	- Kaj naredi: Poskuša iz Supabase naresti SELECT po vsaki tabeli in vrne tiste, ki vrnejo napako ali jih ni mogoče poizvedovati.

- `runMigrationsFromFolder(migrationsDir)`
	- Vhodni parametri: `migrationsDir` (string)
	- Vrača: Promise<void>
	- Kaj naredi: Izvede SQL migracijske datoteke v podani mapi proti PostgreSQL bazi (uporablja `postgres`), spremlja zaključene migracije v tabeli `_migrations` in ignorira že obstoječe tabele.

- `ensureSchema()`
	- Vhodni parametri: /
	- Vrača: Promise<void>
	- Kaj naredi: Preveri, ali so ključne tabele prisotne; če manjkajo in je `RUN_MIGRATIONS=true` ter je `DATABASE_URL` nastavljen, poskusi pognati migracije in nato zagotovi osnovne podatke (npr. age groups).

- `ensureAgeGroups()`
	- Vhodni parametri: /
	- Vrača: Promise<void>
	- Kaj naredi: Poskusi vstaviti privzete starostne skupine preko Supabase klienta; če to ne uspe, uporabi direktno PostgreSQL povezavo kot fallback.

- `createWindow()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Ustvari glavno Electron okno (`BrowserWindow`), naloži `index.html`, in v dev načinu odpre DevTools ali v produkciji odstrani meni.

- `createAddPlayerWindow()` / `createAddAgeGroupWindow()` / `createAddCategoryWindow()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Ustvari pripadajoče modalne pod-Okne za dodajanje igralca, starostne skupine ali kategorije, nastavi `preload` in upravlja življenjski cikel okna.

- `createBingoBoard()`
	- Vhodni parametri: /
	- Vrača: 5x5 boolean matrika
	- Kaj naredi: Ustvari in vrne novo Bingo ploščo (5x5) z vnaprej označenim sredinskim poljem kot "free" (true).

- `selectRandomSquare(board)`
	- Vhodni parametri: `board` (5x5 boolean matrika)
	- Vrača: [r, c] ali null
	- Kaj naredi: Poišče vse neoznačene (false) kvadrate na plošči in naključno vrne enega izmed njih, ali `null` če ni več prostih.

- `hasBingo(board)`
	- Vhodni parametri: `board` (5x5 boolean matrika)
	- Vrača: boolean
	- Kaj naredi: Preveri ali ima plošča Bingo (polna vrstica, stolpec ali ena izmed diagonalk) in vrne `true` ali `false`.

- IPC handler: `loadMenu` (ipcMain.handle)
	- Vhodni parametri: /
	- Vrača: `{ ageGroups, categories }` ali `{ error }`
	- Kaj naredi: Hkrati prebere vse `AgeGroups` in `Category` iz Supabase in jih vrne za izris menija v UI.

- IPC handler: `startGame`
	- Vhodni parametri: `{ group, categories, players }` (group:number, categories: number[], players: number[])
	- Vrača: `{ questions, players }` ali `{ error }` (questions so vprašanja, players so inicializirani igralci z boardi)
	- Kaj naredi: Poizvra iz tabele `Questions` vprašanja za dano starostno skupino in kategorije, inicializira interno `currentGame` strukturo z igralci in ploščami ter vrne vprašanja in stanje igralcev.

- IPC handler: `answer`
	- Vhodni parametri: `{ playerId, questionId, selectedIndex, tile }`
	- Vrača: `{ correct, bingo, board }` ali `{ error }`
	- Kaj naredi: Preveri pravilnost odgovora proti bazi, posodobi rezultat igralca (točke, št. pravilnih/napačnih), označi polje na plošči (ali izvede naključno, če klient ni izbral veljavnega) in preveri bingo.

- IPC handler: `endGame`
	- Vhodni parametri: /
	- Vrača: seznam vstavljenih `Leaderboard` vnosov ali `{ error }`
	- Kaj naredi: Shrani rezultate igre v tabelo `Leaderboard` za vsakega igralca in trenutno izbrane kategorije ter izprazni `currentGame`.

- IPC handler: `addQuestion`
	- Vhodni parametri: `question` (objekt z `age_group_id, category_id, text, answers, correct_answer, image_path`)
	- Vrača: `{ success: true, data }` ali `{ success: false, error }`
	- Kaj naredi: Vstavi novo vprašanje v tabelo `Questions` (image_path lahko vsebuje podatkovni URI) in vrne rezultat vstavljanja.

- IPC handler: `list-questions`
	- Vhodni parametri: `filters` (npr. `{ age_group_id, category_id }`)
	- Vrača: `{ data }` ali `{ error }`
	- Kaj naredi: Vrne seznam vprašanj po neobveznih filtih; podpira `.in()` za več kategorij.

- IPC handler: `delete-question`
	- Vhodni parametri: `id` (številka ali string)
	- Vrača: `{ success: true }` ali `{ success: false, error }`
	- Kaj naredi: Pobriše vrstico iz `Questions` in poizkusi odstraniti lokalno sliko iz mape `images/`, če pot kaže tja.

- IPC handler: `update-question`
	- Vhodni parametri: `question` (objekt z `id` in posodobitvami)
	- Vrača: `{ success: true, data }` ali `{ success: false, error }`
	- Kaj naredi: Posodobi obstoječe vprašanje v bazi z danimi polji.

- IPC handler: `leaderboard`
	- Vhodni parametri: /
	- Vrača: `{ ageGroups, categories, grouped }` ali `{ error }`
	- Kaj naredi: Prebere podatke iz `Leaderboard`, `AgeGroups` in `Category`, nato združi rezultate po starostnih skupinah in kategorijah za lažje prikazovanje v UI.

### `game.html`

- `enterData()`
	- Vhodni parametri: /
	- Vrača: Promise<void>
	- Kaj naredi: Prebere `parameters` iz `localStorage`, validira izbrane igralce/kategorije, kliče `window.api.startGame()` in inicializira lokalne strukture igre (vprašanja, plošče) ter začne igro.

- `play()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Napreduje na naslednje vprašanje (ciklično), nastavi trenutno igralca, naloži sliko/vprasanje v UI, generira gumbe odgovorov in izbere/nastavi ciljno polje za to vprašanje.

- `renderAnswerButtons(options)`
	- Vhodni parametri: `options` (array of strings)
	- Vrača: /
	- Kaj naredi: Dinamično ustvari gumbe za odgovore glede na število možnosti (2–4) in poveže dogodek `click` na `selectedAnswer`.

- `selectedAnswer(event)`
	- Vhodni parametri: `event` (klik na gumb)
	- Vrača: Promise<void>
	- Kaj naredi: Pošlje odgovor strežniku preko `window.api.answer(...)`, posodobi lokalno ploščo igralca glede na odgovor, predvaja kratko animacijo za pravilen/napačen odgovor in ob Bingo rezultatu kliče `endGame()`.

- `shuffle(array)`
	- Vhodni parametri: `array` (array)
	- Vrača: / (ureja polje in place)
	- Kaj naredi: Naključno premeša elemente v polju (Fisher–Yates).

- `startTimer()` / `updateTimerDisplay(time)` / `updateProgressBar(time)`
	- Vhodni parametri: `time` (število sekund za update) za pomožne funkcije
	- Vrača: /
	- Kaj naredi: Upravljajo števec na zaslonu: `startTimer` zažene interval, `updateTimerDisplay` osveži tekst, `updateProgressBar` posodobi barvo in širino napredka glede na preostali čas.

- `renderBoards()` / `createEmptyBoard()` / `drawBoardCells(gridEl, board)`
	- Vhodni parametri: `renderBoards()` /, `createEmptyBoard()` /, `drawBoardCells(gridEl, board)` DOM element in board matrika
	- Vrača: /
	- Kaj naredi: Generirajo in prikazujejo vizualne Bingo plošče za vse igralce, vključno z začetnim stanjem (prost center) in numeracijo celic.

- `assignTileForQuestion()` / `updateBoardSelectionUI(playerIdx)`
	- Vhodni parametri: `playerIdx` (število) za updateBoardSelectionUI
	- Vrača: /
	- Kaj naredi: `assignTileForQuestion` naključno določi vrstico ali stolpec kot ciljno in predizbere veljavno polje; `updateBoardSelectionUI` osveži UI, označi dovoljena polja in poveže klike za izbiro polja.

- `highlightTurn(playerIdx)`
	- Vhodni parametri: `playerIdx` (število)
	- Vrača: /
	- Kaj naredi: Vizualno označi panel igralca, ki je na vrsti, in prikaže pripadni 'Your Turn' badge.

- `disableAnswerButtons()` / `enableAnswerButtons()`
	- Vhodni parametri: /
	- Vrača: /
	- Kaj naredi: Onemogočata / omogočata gumbe za odgovore ter posodabljata njihove CSS razrede za vizualno stanje.

- `endGame(winnerIdx)`
	- Vhodni parametri: `winnerIdx` (število)
	- Vrača: Promise<void>
	- Kaj naredi: Označi igro kot končano, ustavi timer, onemogoči interakcije, prikaže modal z zmagovalcem in kliče `window.api.endGame()` za zapis rezultatov.

- `showToast(message, type)`
	- Vhodni parametri: `message` (string), `type` (string: 'info'|'success'|'error')
	- Vrača: /
	- Kaj naredi: Prikaže kratko pojavno obvestilo (toast) z ustreznim stilom in ga po ~1.85s avtomatsko skrije.