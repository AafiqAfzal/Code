# Pedagogický deník

Digitální pedagogický deník pro učitele základní školy. Aplikace běží v prohlížeči
(bez serveru, funguje i offline) a všechna data ukládá lokálně do prohlížeče (IndexedDB).
Pro přenos mezi počítači slouží záloha ve formátu JSON (Nastavení → Záloha dat).

## Co aplikace umí

| Sekce | Funkce |
| --- | --- |
| **Přehled** | Připomínky na dnes a zítra, dnešní hodiny z rozvrhu s tlačítkem „Zapsat hodinu“ (předvyplní další téma z plánu) a označením už zapsaných, události na 14 dní, stav tematických plánů, poslední zápisy a poznámky |
| **Kalendář** | Měsíční kalendář s termíny testů, písemek, schůzek, porad, akcí a úkolů; odškrtávání hotového |
| **Třídy a skupiny** | Kmenové třídy, rozdělení na skupiny (např. angličtina na půl s kolegyní), skupiny napříč třídami v ročníku, tlačítko „Rozdělit na poloviny“ |
| **Žáci** | Seznam s vyhledáváním a filtry, export do Excelu, profil žáka (kontakty, štítky IVP/PLPP/SPU…, poznámky s časovou osou: pochvaly, napomenutí, komunikace s rodiči), slovní hodnocení a návrh známky na vysvědčení |
| **Hodnocení** | Klasifikační tabulka skupiny podle *Průběžného hodnocení 2026-27*: kategorie s váhami, známky nebo body (převod procent na známku dle nastavené škály), vážený průměr, návrh známky, rychlý zápis klávesami 1–5 / N, export do Excelu pro přepis do Školy online, losování žáka |
| **Zápisy z hodin** | Datum, hodina, skupina, probrané učivo, domácí úkol, chybějící žáci; zápis může rovnou odškrtnout téma v tematickém plánu |
| **Tematické plány** | Nahrání z Wordu (.docx) s automatickou detekcí nadpisů, odstavců, odrážek, tabulek, měsíců a hodinových dotací; odškrtávání probraného, procento plnění, tisk |
| **Docházka** | Tabulka absencí žáků skupiny/třídy podle zápisů z hodin, po měsících nebo za celý rok, export XLSX a tisk |
| **Tisk pro rodiče** | Jedna stránka na žáka: známky s váhami, průměr, absence, slovní hodnocení, volitelně poznámky, podpisy; pro celou skupinu nebo jednoho žáka |
| **Zasedací pořádek** | Rozmístění žáků v lavicích přetahováním, náhodné rozesazení, tisk |
| **Rozvrh** | Týdenní rozvrh učitele (0.–9. hodina, časy podle školy); napájí přehled „Dnes učím“. Nahrání rozvrhu ze souboru JSON s navázáním dělených hodin na skupiny „sk. N“ |
| **Import známek** | Excel s žáky v řádcích a hodnoceními ve sloupcích (známky 1–5, body s maximem, N); spárování žáků podle jména |
| **Import dat** | Excel se žáky (export „Karta žáka – seznam“ ze Školy online): automatické rozpoznání sloupců Třída / Příjmení / Jméno / Skupina / Ročník / Datum narození / Občanství, hodnota skupiny „-“ = bez skupiny, ruční úprava mapování, vytvoření tříd a skupin, volitelný štítek OMJ; Word s tematickým plánem |
| **Nastavení** | Zámek aplikace PINem (při spuštění a po nečinnosti), připomínky událostí (systémová oznámení a přehled), průvodce přechodem na nový školní rok, učitel, školní rok, předměty, kategorie hodnocení a váhy, procentní škála, text pravidel hodnocení, záloha/obnova, ukázková data |

### Škola online

Škola online nemá veřejné rozhraní pro učitele, aplikace s ní proto pracuje přes soubory:

1. Ve Škole online vyexportujte seznam žáků (Karta žáka – seznam) do Excelu → nahrajte v sekci **Import dat**.
   Doporučený postup na začátku roku: import žáků, poté rozvrh (ručně nebo ze souboru JSON) a tematické plány (z Wordu nebo ze souboru JSON).
2. Známky zapisujte v sekci **Hodnocení** → tlačítkem *Export XLSX* získáte tabulku
   (list „Seznam známek“ je připraven pro přepis do Školy online).
3. Odkaz **Škola online** v levém menu otevře aplikaci školy v nové záložce.

## Desktopová aplikace pro Windows (doporučeno)

Aplikaci lze nainstalovat jako běžný program: ikona na ploše, data uložená
v profilu aplikace na daném počítači, automatická záloha jednou denně do složky
`Dokumenty\Pedagogický deník\zalohy` (uchovává se posledních 30 záloh).

1. Otevřete stránku **Releases** repozitáře na GitHubu a stáhněte
   `PedagogickyDenik-Setup-<verze>.exe` (instalace bez práv správce)
   nebo `PedagogickyDenik-Portable-<verze>.exe` (bez instalace, stačí spustit).
2. Windows může zobrazit varování SmartScreen, protože aplikace není podepsaná
   certifikátem: klikněte na *Další informace* → *Přesto spustit*.
3. Po spuštění: Import dat → seznam žáků, Rozvrh, Tematické plány.

**Aktualizace:** nainstalovaná aplikace si při spuštění sama zkontroluje nové vydání na GitHubu,
stáhne je a po potvrzení (nebo při ukončení) nainstaluje. Data zůstávají zachována.
Stav a ruční kontrola: Nastavení → Aktualizace aplikace.

Instalátor sestavuje workflow `.github/workflows/desktop.yml` (ručně přes
*Actions → Desktop app → Run workflow*, nebo automaticky po vytvoření tagu `v1.x.y`).
Novou verzi vydáte zvýšením `version` v `package.json` a spuštěním workflow.

Lokální sestavení desktopové verze:

```bash
npm run electron:dev          # spustí desktopové okno nad produkčním sestavením
npm run electron:build        # instalátor pro Windows do složky release/
npm run electron:build:linux  # AppImage pro Linux
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

React 19, TypeScript, Vite, Tailwind CSS 4, Dexie (IndexedDB), react-router,
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
