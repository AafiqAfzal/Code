# Změny

## Připravovaná verze

- Tisk tematického plánu jako dokument: hlavička (školní rok, předmět, ročník, vyučující, škola, plnění), tabulka Měsíc / Učivo / Hodiny / Probráno (data) / Realizovaná témata, nadpisy celků, podpis; respektuje filtr měsíce, „skrýt hotové“ a „realizovaná témata“
- Tisk delších stránek pokračuje na dalších listech (dřív se uřízl po první stránce – týkalo se i pracovního výkazu a podkladů na schůzky)
- Zápisy z hodin: filtr podle předmětu a třídy či skupiny (třída ukáže i zápisy svých skupin); výběr si aplikace pamatuje, „Zrušit filtr“ vrátí všechny zápisy
- Zasedací pořádek po lavicích: v řadě dvoumístné lavice oddělené uličkou (výchozí 3 lavice, počet lze změnit), lavici lze přepnout na jednomístnou; náhodné rozesazení plní lavice od tabule, volná místa zůstanou vzadu; starší pořádky se převedou samy

## 3.1.0

- Hodnocení: klik na název sloupce otevře úpravu celého hodnocení – název, datum, kategorie, váha a max. bodů se změní u všech žáků (známky zůstanou, z bodů se přepočítají); odtud lze sloupec i smazat
- Hodnocení: pohyb v tabulce šipkami, po zápisu známky se kurzor posune na dalšího žáka; průměry a procenta s desetinnou čárkou (2,25)
- Import žáků: prázdná buňka „Skupina“ už žáka z nikoho nevyřadí (vyřadí jen „-“); před importem přehled, co se stane (noví, upravení, přesunutí, nejasné řádky); žák, který změnil třídu, se podle data narození přesune, ne zdvojí; jmenovci v různých třídách se nespojí; předmět skupin se musí vybrat
- Import známek: opakovaný import stejného souboru nic nezdvojí; neplatné hodnoty („2+“, text v bodech) se přeskočí a vypíšou; body s desetinnou čárkou („7,5“); bez sloupce jména se páruje jen jednoznačné příjmení
- Export do Excelu přes bezpečnou knihovnu (stará knihovna xlsx s bezpečnostními chybami je pryč); čitelné názvy souborů („… 2026-2027 1. pololetí.xlsx“)
- Poznámky k žákovi: volitelné datum (např. včerejší telefonát s rodiči) a úprava existujících poznámek
- Rozvrh se vejde na šířku notebooku (akce dne pod datem), dlouhé názvy kroužků se zkrátí; zaškrtávání spojených skupin neztrácí kurzor
- Přehled ve státní svátek a o prázdninách: pravidelné hodiny „nekoná se“, bez výzvy k zápisu
- Potvrzení před smazáním tématu v plánu a před přidáním ukázkových dat k existujícím žákům
- Texty: „1 zapsaná hodina / 2 zapsané hodiny / 5 zapsaných hodin“, „Zapomenutý PIN“, podklady na schůzky bez prázdného „Vyučující:“, počty dívek a chlapců jen když jsou známé
- Zabezpečení desktopové verze: pravidla pro obsah stránky (CSP), přístup jen do složky Dokumenty/Pedagogický deník (ne do celých Dokumentů), funkční „Otevřít složku záloh“, odstraněná nepoužívaná součást; sestavení instalátoru z ověřených verzí nástrojů

## 3.0.8

- Zasedací pořádek v desktopové verzi: přetahování žáků myší funguje (Windows ho dřív blokovalo); nově i přesun kliknutím – klik na žáka, pak na místo (prohození, klik na seznam = odsadit, Esc = zrušit); rychlé přesuny za sebou už žáky neztrácí
- Hodnocení: známka z bodů odpovídá zobrazenému procentu (89,96 % → „90 %“ → 1); chybějící váha nerozbije průměr; váha 0 jde nastavit; sloupec s datem v druhém pololetí se zobrazí (přepne pololetí); stejný sloupec nejde přidat dvakrát; rychlé psaní kláves nezapíše známku dvakrát
- Hodnocení a docházka: odkaz na skupinu (z Tříd, z karty žáka) otevře opravdu tu skupinu a předmět, i když se data ještě načítají
- Zápisy z hodin: přepojení zápisu na jiné téma nebo smazání zápisu zruší odškrtnutí původního tématu (pokud ho neodškrtl jiný zápis); prázdné „Probrané učivo“ ohlásí chybu
- Kalendář: suplování se v počtu hodin nepočítá dvakrát
- Pracovní výkaz: přestávka na oběd se odečítá jen u dne delšího než 6 hodin (§ 88 zákoníku práce); ruční úpravy se ukládají samy a při přechodu na jinou stránku či měsíc se neztratí
- Průvodce novým rokem: skupiny se přejmenují správně (6.A → 7.A, ne až 9.A), kroužky ročník nemění, výjimky v rozvrhu zadané na nový rok zůstanou, s odcházející třídou se smažou i její hodiny v rozvrhu; pojistka proti dvojímu spuštění; chyba se ohlásí
- Rozepsaná práce: okno se změnami se při Esc nebo kliknutí vedle zeptá, zda zavřít bez uložení; automatický zámek PINem aplikaci jen skryje – po odemčení je vše, jak bylo

## 3.0.7

- Zálohy: prázdná databáze se už automaticky nezálohuje, takže nepřepíše poslední dobrou zálohu; nabídka obnovy na prázdném přehledu vybere nejnovější neprázdnou zálohu
- Zálohy: před každou obnovou ze zálohy (a před „Smazat všechna data“) se současný stav uloží jako „…-pred-obnovou.json“ (v prohlížeči se stáhne)
- Zálohy: ruční záloha („Uložit zálohu jako…“) a záloha před novým školním rokem mají vlastní název a automatická záloha je nepřepíše ani nesmaže; průvodce novým rokem v desktopu zálohuje sám těsně před přechodem
- Zálohy: zápis přes dočasný soubor (při pádu nebo plném disku zůstane předchozí záloha celá), záloha i před instalací aktualizace
- Obrazovka PINu: obnova ze zálohy se nejdřív zeptá
- Datum „dnes“ podle místního času – po půlnoci (do 1:00, v létě do 2:00) už aplikace nebere včerejšek (přehled, zápisy, známky, pololetí, připomínky, výkaz, název zálohy)
- Výchozí kategorie hodnocení: obnovení už neodpojí známky od kategorií; smazání používané kategorie se zeptá
- Zasedací pořádek: zmenšení počtu řad/míst žáky neztratí (kdo se nevejde, je mezi neposazenými), náhodné rozesazení a vyprázdnění se zeptají, už se nezakládají prázdné duplicitní plány
- Smazání žáka odstraní i jeho členství ve skupinách, místo v zasedacím pořádku, absence a slovní hodnocení; třídu se žáky nejde smazat
- Import z Excelu: čtení přes bezpečnější knihovnu (soubory .xlsx a .csv; starší .xls je potřeba v Excelu uložit jako .xlsx), chyba při načtení se zobrazí

## 3.0.6

- Tematické plány: u tématu probíraného ve více hodinách se zobrazí všechna data (např. „3× 5.10., 12.10., 19.10.“), po najetí myší i skupina; dřív se ukázalo jen poslední datum
- Zápis z hodiny: opakované zapsání téhož tématu už nepřepíše datum prvního probrání; v nabídce plánu je vidět, kolikrát se téma probíralo

## 3.0.5

- Skupiny: žák je v ročníku jen v jedné skupině předmětu – přidáním do druhé skupiny (i kolegyně) se z první odebere; platí i pro opakovaný import žáků z Excelu („-“ = bez skupiny)
- Zápis ze suplování: bez tematického plánu (nenabízí se, nepředvyplňuje se), předmět volným textem, v seznamu označen „Supl.“
- Spojené skupiny: u suplování i pravidelné hodiny lze přidat další skupinu (např. obě skupiny Aj, když kolegyně chybí); žáci se objeví v docházce zápisu a absence se započte v docházce obou skupin
- Kroužek: vlastní začátek a konec (zobrazí se v rozvrhu i na přehledu dne)
- Zápis z hodiny z přehledu/rozvrhu se otevře i bez nahraných tematických plánů

## 3.0.4

- Suplování: volba „Jiný předmět…“ s ručním zadáním názvu (Matematika, Tělesná výchova…), nabídka běžných předmětů
- Rozvrh: odpadnutí jednotlivé hodiny je na první pohled – křížek v rohu políčka po najetí myší a zvýrazněná volba „Tato hodina odpadá (jen tento den)“ v nabídce políčka
- Rozvrh: v odpadlém dni lze jednotlivou hodinu vyjmout („Tuto hodinu přesto odučím“) a přidat hodinu navíc / suplování (i když den odpadá)
- Kalendář: klik na den zobrazí rozvrh dne, kde lze nechat odpadnout jednotlivou hodinu (nebo celý den) a zase ji obnovit
- Zápisy z hodin: kroužky se neváží na tematický plán (nenabízí se položky ani se nepředvyplňují)
- Pracovní výkaz: pracovní doba po dnech Po–Pá (od–do) a přestávka na oběd (výchozí 30 min), odpracováno = přítomnost minus oběd

## 3.0.3

- Rozvrh: dozory o přestávkách v úzkých sloupcích mezi hodinami, dozor během hodiny (polední pauza) jako políčko hodiny

## 3.0.2

- Rozvrh: dozory o přestávkách a v polední pauze (proužek nad hodinou, přehled dne, nahrání ze souboru JSON, ruční přidání z políčka)

## 3.0.1

- Záloha do složky Dokumenty při každém zavření aplikace (dosud jen jednou denně při spuštění)
- Nastavení: obnova z libovolné zálohy ve složce Dokumenty, nejen v prázdné aplikaci

## 3.0.0

- Desktopová vrstva přepsaná z Electronu na Tauri: instalátor jen několik MB, používá WebView2 zabudovaný ve Windows
- Při prvním spuštění nabídka obnovy dat ze zálohy předchozí verze (složka Dokumenty)
- Podepsané automatické aktualizace (klíč jako tajemství repozitáře)
- Zálohy, oznámení a aktualizace beze změny chování pro uživatele

## 2.1.0

- Žáci: filtr podle štítků a pohlaví, barevné odlišení dívek a chlapců (pohlaví z importu), narozeniny v kartě a na přehledu, karta bez kontaktů
- Hodnocení: nabídka skupin/tříd podle předmětu a rozvrhu, užší sloupce, zápis známek najetím myší a klávesou i na české klávesnici, poznámka žáka po najetí
- Zápisy z hodin a docházka: nabídka skupin/tříd podle předmětu a rozvrhu
- Třídy a skupiny: docházka a podklady na schůzky pro celou třídu, skupiny kolegů s vyučujícím (skryté v nabídkách), nadpis podle třídy
- Skupiny ve stejné grafice v seznamu žáků

## 2.0.0

- Rozvrh po týdnech: odpadlé hodiny a dny, suplování, kroužky, zápis hodiny z políčka, fajfka u zapsaných hodin
- Časy hodin 1.–8. podle školy, bez nulté hodiny
- Kalendář: malý kalendář v menu, víkendy, státní svátky ČR (včetně Velikonoc), školní prázdniny
- Kroužky jako skupiny napříč ročníky
- Pololetí: konec 1. pololetí v Nastavení, přepínač v Hodnocení a v podkladech pro rodiče, průměry za pololetí v kartě žáka
- Rychlé hledání žáka (Ctrl+K)
- Evidence pracovní doby: vyplnění z rozvrhu, export do školní šablony XLSX, tisk
- Menu ve skupinách; zasedací pořádek a podklady na schůzky u tříd a žáků; import a výkaz jako záložky v Nastavení
- Docházka, tisk podkladů pro rodiče, zasedací pořádek, import známek z Excelu, zámek PINem, připomínky, průvodce novým školním rokem
- Menší instalátor, automatické aktualizace, zálohy včetně uložených souborů
- Repozitář bez osobních údajů: rozvrh a tematické plány se nahrávají ze souborů JSON

## 1.5.0

- Odstranění osobních údajů z repozitáře, rozvrh a plány ze souborů JSON

## 1.0.0 – 1.4.0

- První verze: hodnocení, žáci, třídy a skupiny, kalendář, tematické plány z Wordu, import ze Školy online, desktopová aplikace
