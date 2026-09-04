# Pedagogický deník

Digitální pedagogický deník pro učitele základní školy. Aplikace běží v prohlížeči
(bez serveru, funguje i offline) a všechna data ukládá lokálně do prohlížeče (IndexedDB).
Pro přenos mezi počítači slouží záloha ve formátu JSON (Nastavení → Záloha dat).

## Co aplikace umí

| Sekce | Funkce |
| --- | --- |
| **Přehled** | Připomínky na dnes a zítra, dnešní hodiny podle skutečného rozvrhu (odpadlé, suplování, kroužky, svátky, prázdniny) s tlačítkem „Zapsat hodinu“ (předvyplní další téma z plánu) a označením už zapsaných, události na 14 dní, stav tematických plánů, poslední zápisy a poznámky |
| **Kalendář** | Malý kalendář v levém menu (barevné tečky událostí, víkendy, státní svátky ČR, prázdniny), kliknutím velký měsíční kalendář s termíny testů, písemek, schůzek, porad, akcí a úkolů |
| **Třídy a skupiny** | Kmenové třídy, rozdělení na skupiny (např. angličtina na půl s kolegyní), skupiny napříč třídami v ročníku, kroužky napříč ročníky, tlačítko „Rozdělit na poloviny“, zasedací pořádek a podklady na třídní schůzky u každé skupiny |
| **Žáci** | Rychlé hledání v menu (Ctrl+K), seznam s filtry, export do Excelu, profil žáka s průměry za pololetí a podklady na schůzku s rodiči (kontakty, štítky IVP/PLPP/SPU…, poznámky s časovou osou: pochvaly, napomenutí, komunikace s rodiči), slovní hodnocení a návrh známky na vysvědčení |
| **Hodnocení** | Klasifikační tabulka skupiny podle *Průběžného hodnocení 2026-27*: kategorie s váhami, známky nebo body (převod procent na známku dle nastavené škály), vážený průměr, návrh známky, přepínač pololetí, rychlý zápis klávesami 1–5 / N, export do Excelu pro přepis do Školy online, losování žáka |
| **Zápisy z hodin** | Datum, hodina, skupina, probrané učivo, domácí úkol, chybějící žáci; zápis může rovnou odškrtnout téma v tematickém plánu |
| **Tematické plány** | Nahrání z Wordu (.docx) s automatickou detekcí nadpisů, odstavců, odrážek, tabulek, měsíců a hodinových dotací; odškrtávání probraného, procento plnění, tisk |
| **Docházka** | Tabulka absencí žáků skupiny/třídy podle zápisů z hodin, po měsících nebo za celý rok, export XLSX a tisk |
| **Zasedací pořádek** | Rozmístění žáků v lavicích přetahováním, náhodné rozesazení, tisk |
| **Pracovní výkaz** | Evidence pracovní doby vyplněná z rozvrhu (přímá práce, suplování, kroužky, svátky, prázdniny), ruční úpravy, export do nahrané školní šablony XLSX se zachováním formátování a tiskových stran, tisk |
| **Rozvrh** | Rozvrh po týdnech s daty: pravidelné hodiny a kroužky, odpadlé hodiny nebo celé dny (projektový den, nepřítomnost) s důvodem, suplování navíc, zápis hodiny přímo z políčka, fajfka u zapsaných; nahrání ze souboru JSON |
| **Import známek** | Excel s žáky v řádcích a hodnoceními ve sloupcích (známky 1–5, body s maximem, N); spárování žáků podle jména |
| **Import dat** | Excel se žáky (export „Karta žáka – seznam“ ze Školy online): automatické rozpoznání sloupců Třída / Příjmení / Jméno / Skupina / Ročník / Datum narození / Občanství, hodnota skupiny „-“ = bez skupiny, ruční úprava mapování, vytvoření tříd a skupin, volitelný štítek OMJ; Word s tematickým plánem |
| **Nastavení** | Záložky Nastavení / Import dat / Pracovní výkaz; zámek PINem, připomínky, školní prázdniny (celostátní termíny MŠMT + vlastní), evidence pracovní doby (šablona a výchozí údaje), průvodce novým školním rokem, učitel, školní rok, konec 1. pololetí, předměty, kategorie hodnocení a váhy, procentní škála, text pravidel hodnocení, záloha/obnova, ukázková data |

### Škola online

Škola online nemá veřejné rozhraní pro učitele, aplikace s ní proto pracuje přes soubory:

1. Ve Škole online vyexportujte seznam žáků (Karta žáka – seznam) do Excelu → nahrajte v sekci **Import dat**.
   Doporučený postup na začátku roku: import žáků, poté rozvrh (ručně nebo ze souboru JSON) a tematické plány (z Wordu nebo ze souboru JSON).
2. Známky zapisujte v sekci **Hodnocení** → tlačítkem *Export XLSX* získáte tabulku
   (list „Seznam známek“ je připraven pro přepis do Školy online).
3. Odkaz **Škola online** v levém menu otevře aplikaci školy v nové záložce.

## Desktopová aplikace pro Windows (doporučeno)

Aplikace je postavená na [Tauri](https://tauri.app): používá prohlížečové jádro WebView2,
které je součástí Windows 10/11, takže instalátor má jen několik megabajtů. Data zůstávají
v profilu aplikace na daném počítači, automatická záloha se ukládá jednou denně do
`Dokumenty\Pedagogický deník\zalohy` (posledních 30 záloh).

1. Otevřete stránku **Releases** repozitáře a stáhněte `Pedagogicky-denik_<verze>_x64-setup.exe`
   (instalace bez práv správce).
2. Windows může zobrazit varování SmartScreen, protože aplikace není podepsaná
   certifikátem: klikněte na *Další informace* → *Přesto spustit*.
3. Při prvním spuštění aplikace nabídne obnovu dat ze zálohy předchozí verze, pokud ji
   najde ve složce Dokumenty.

**Aktualizace:** aplikace si při spuštění zkontroluje nové vydání na GitHubu, stáhne je a po
potvrzení se restartuje. Aktualizační balíčky jsou podepsané; soukromý klíč je uložen jako
tajemství repozitáře `TAURI_SIGNING_PRIVATE_KEY` (a případně
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), veřejný klíč je v `src-tauri/tauri.conf.json`.

Instalátor sestavuje workflow `.github/workflows/desktop.yml` (ručně přes
*Actions → Desktop app → Run workflow*, nebo automaticky po vytvoření tagu `v1.x.y`).
Novou verzi vydáte zvýšením `version` v `package.json` a spuštěním workflow.

Lokální sestavení desktopové verze (vyžaduje Rust a na Linuxu balíčky WebKitGTK):

```bash
npm run desktop:dev     # okno aplikace nad vývojovým serverem
npm run desktop:build   # instalátor pro aktuální platformu do src-tauri/target/release/bundle
```

## Spuštění ve vývojovém režimu (prohlížeč)

```bash
npm install
npm run dev       # vývojový server, http://localhost:5173
npm run build     # produkční sestavení do složky dist/
npm run preview   # náhled produkčního sestavení
```

Složku `dist/` lze nahrát na libovolný statický hosting (GitHub Pages, školní web),
nebo `dist/index.html` otevřít přímo z disku. Součástí repozitáře je workflow
`.github/workflows/deploy.yml`, které aplikaci automaticky nasadí na GitHub Pages
z hlavní větve (v nastavení repozitáře zapněte Pages → Source: GitHub Actions).

## Technologie

React 19, TypeScript, Vite, Tailwind CSS 4, Dexie (IndexedDB), react-router, Tauri 2 (desktop),
[mammoth](https://github.com/mwilliamson/mammoth.js) (čtení .docx),
[SheetJS](https://sheetjs.com/) (čtení a zápis Excelu), date-fns, lucide-react.

## Struktura

```
src/
  db/schema.ts        datový model (Dexie tabulky)
  db/seed.ts          výchozí kategorie hodnocení, ukázková data
  lib/grading.ts      vážený průměr, převod procent na známku
  lib/excelImport.ts  načtení sešitu, odhad sloupců, rozdělení jména
  lib/docxImport.ts   detekce textu ve Wordu → položky plánu
  lib/export.ts       export známek a žáků do XLSX
  lib/backup.ts       záloha a obnova JSON
  components/         layout, modální okna, hooky nad databází
  pages/              jednotlivé obrazovky aplikace
```

## Bezpečnost dat

Repozitář neobsahuje žádné osobní údaje: žádná jména žáků ani učitele, adresu školy,
rozvrh ani tematické plány. Vše si uživatel nahraje až v aplikaci, kde data zůstávají
v jeho počítači.

Data zůstávají pouze v prohlížeči (resp. v profilu desktopové aplikace) daného počítače. Doporučujeme pravidelně stahovat
zálohu (Nastavení → Stáhnout zálohu) a ukládat ji na zabezpečené místo. Smazání dat
prohlížeče (cookies a data webů) aplikaci vymaže – obnovíte ji ze zálohy.
