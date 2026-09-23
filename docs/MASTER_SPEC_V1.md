# Master-specifikation – Langfristet gæld, Niveau 1, v1.0

## Formål og dokumenthierarki

Eleven gennemfører kæden **låneaftale → provenu → bogføring af låneoptagelse → kontraktmæssig ydelsesplan → betalingsrække → effektiv rente → amortiseret kostpris → årets bogføring → kortfristet/langfristet gæld → omklassifikation → endelige T-kontosaldi → afstemning → afslutning**. Eleven skal regne, ikke programmere. Appen må automatisere gentagelser, når eleven har demonstreret metoden; forløbet skal ikke blive et regneark i browseren.

Dette dokument fastlægger forløb og UX. [Generatorens kontrakt](GENERATOR_CONTRACT_V1.md) fastlægger caseudtræk og guardrails. [Valideringskontrakten](VALIDATION_CONTRACT_V1.md) fastlægger input, beregning og godkendelse. [Kontoplanen](ACCOUNT_PLAN_V1.md) fastlægger konti. [Referencecases](REFERENCE_CASES_V1.md) er det numeriske oracle R1–R6. Ved konflikt mellem krav må den senere implementering ikke vælge en ny regel stiltiende.

Regnskabsåret er 2026, og balancedatoen er 31/12/2026. De konsekvente betegnelser er **Annuitetslån**, **Serielån**, **Stående lån**, **Banklån**, **Obligationslån** og **amortiseret kostpris**.

## Hovedmenu og forløbsramme

Eleven vælger aktivt Annuitetslån, Serielån eller Stående lån. Først derefter genereres en case. Lånetypen trækkes aldrig tilfældigt; finansieringsform og øvrige caseparametre trækkes efter generatorens kontrakt. Valget åbner otte hovedtrin:

1. **Provenu:** Aflæs låneaftalen, beregn låneomkostninger og provenu manuelt med `=`. Banklån har variable og faste låneomkostninger; Obligationslån har kursværdi, kurtage beregnet af kursværdien og faste låneomkostninger. Opstillingen viser fradrag; elevens beløbsfelter er positive.
2. **Optagelse:** Indregn provenu manuelt på T-konti: Debet 5820 og Kredit 6320 ved Banklån eller 6330 ved Obligationslån. Ingen automatisk udfyldning af T-kontobeløb og ingen saldo på dette tidspunkt.
3. **Ydelsesplan:** Udled terminsrente og antal terminer. Ved Annuitetslån giver appen standardydelsen efter dansk Excel **YDELSE** på korrekt hovedstol, terminsrente og antal terminer. Eleven skriver ikke funktionskaldet. Ved Serielån er afdraget fast. Ved Stående lån er ordinært afdrag nul og hele hovedstolen forfalder sidste gang. Kontraktmæssige renter, afdrag og betalinger bygger på den nominelle hovedstol. Eleven udfylder og godkender Termin 1 og 2 manuelt; ved Stående lån også sidste termin. Derefter må appen udfylde resten read-only. En sidste annuitetsydelse kan justeres få øre for at lukke restgælden til 0,00.
4. **Effektiv rente:** Konstruér betalingsrækken med `+` provenu i Termin 0 og `−` de faktiske betalinger i Termin 1…n. Beløbsfeltet er positivt, og eleven vælger fortegn separat. Ved Annuitetslån og Serielån godkendes Termin 0, 1 og 2 manuelt; ved Stående lån også sidste termin. Appen udfylder resten og beregner derefter **effektiv rente pr. termin** efter dansk Excel **IA**. Eleven skriver ikke IA-funktionen. Der kræves ingen årlig effektiv rente.
5. **Amortisering:** To selvstændige tabeller, én for resultatopgørelsen og én for balancen. Startværdien for amortiseret kostpris er provenu. Kontraktmæssige renter og afdrag kommer fra ydelsesplanen. Først godkendes resultat Termin 1, så balance Termin 1; derefter Termin 2 i samme orden. Appen må udfylde resten. Kun de to første terminer kræves manuelt, også ved Stående lån. Den sidste automatiske amortisering kan justeres for en ren øreafrundingsrest, så kostpris ultimo er 0,00.
6. **Bogføring:** Alle faktiske terminer i 2026 bogføres manuelt, hver med betalingsblok før amortiseringsblok. Ydelsesplan og de to amortiseringstabeller er tilgængelige som reference. Betalingens nettoposteringer er Debet 4410 nominel rente, Debet 6320/6330 afdrag og Kredit 5820 betaling. Amortiseringens nettoposteringer er Debet 4450 og Kredit 6320/6330. Mellemregninger på relevante T-konti er tilladt. Ingen T-kontosaldo beregnes undervejs.
7. **Kort/lang:** Se terminsdatoer efter balancedagen til og med 31/12/2027. Eleven beregner kortfristet del manuelt som summen af **afdrag** med forfald i denne periode. Langfristet del er samlet amortiseret kostpris pr. 31/12 minus kortfristet del. Ved positiv kortfristet del omklassificeres manuelt Debet 6320/6330, Kredit 6760. Ved nul svarer eleven **Nej** på spørgsmålet om omklassifikation; ingen nulpostering oprettes. Først efter dette beregner eleven alle relevante T-kontosaldi manuelt med `=` og vælger D/K.
8. **Afslutning:** Tre slutkontroller skal stemme: kortfristet + langfristet = amortiseret kostpris, saldo 4410 + saldo 4450 = årets samlede renteomkostning, og relevante endelige T-kontosaldi med D/K = domænemodellen. Appen viser **3 af 3 kontroller korrekte**. Eleven skal selv trykke **Afslut Niveau 1**.

## Tabelkontrakt

Terminer står **ned gennem rækkerne**. Kolonnerne står i præcis denne orden:

- Ydelsesplan: `Termin | Dato | Restgæld primo | Ydelse | Rente | Afdrag | Restgæld ultimo`.
- Betalingsrække: `Termin | Dato | Fortegn | Beløb`.
- Resultatopgørelse: `Termin | Dato | Nominel rente | Amortisering | Renteomkostning i alt`.
- Balance: `Termin | Dato | Kostpris primo | Afdrag | Amortisering | Kostpris ultimo`.

Tabellerne transponeres aldrig. På små skærme bevares kolonnernes rækkefølge med vandret scrolling. Automatiske rækker markeres tydeligt som app-beregnede og er read-only. T-konti skal være visuelt tydelige; under bogføring kan desktopvisning placere T-konti ved siden af et selvstændigt scrollbar referencepanel.

## Tal, fortegn og kontrol

Alle almindelige beløbsfelter i provenuopgørelse, ydelsesplan, resultat, balance og kort/lang angiver positive beløb eller nul efter feltets domæne. Minustegnet ligger i opstillingen. På T-konti angiver positive beløb og Debet/Kredit retningen. Kun betalingsrækken til IA lader eleven vælge `+` eller `−` særskilt. Pengesummer vises med to decimaler, bortset fra naturlige hele kildebeløb. Effektiv rente vises med fire decimaler i procent, men anvendes med fuld intern præcision. Note: **Den viste rente er afrundet. Alle decimaler anvendes i beregningen.** UI'et skal kunne indsætte referencen `[Effektiv rente · fuld præcision]` i en elevformel.

Korrekte felter i en aktiv beregningsrække kan låses individuelt. Næste række åbnes først, når hele den nuværende række er korrekt. Under bogføring låses først hele den korrekte posteringsblok; enkelte elevlinjer låses ikke. Endelige T-kontosaldi beregnes **kun én gang til sidst**, efter hele årets bogføring, kort/lang-beregning og eventuel omklassifikation. [Valideringskontrakten](VALIDATION_CONTRACT_V1.md) fastlægger præcis delaccept og feedback.

## Navigation, historik og persistence

Aktuelt trin er fremhævet; godkendte trin er grønne og klikbare; fremtidige trin er grå og deaktiverede. Tidligere godkendte trin åbnes read-only med **Tilbage til aktuelt trin**. Historikken skal bevare elevens faktiske formler, værdier, T-kontolinjer og mellemregninger. Den må ikke erstatte gyldigt elev­arbejde med et normaliseret facit. Automatisk beregnede rækker markeres som sådanne.

Senere persistence skal mindst bevare `schemaVersion`, `rulesetVersion`, `generatorVersion`, valgt lånetype, genereret case/snapshot, aktuelt trin, elevinput, elevformler, godkendte felter, godkendte rækker, elevens T-kontolinjer, automatisk genererede rækker og historisk visning. Ved gendannelse er det gemte snapshot autoritativt; sessionen må aldrig generere en ny case.

**Nulstil denne opgave** bevarer den samme case og økonomiske data, men sletter svar og progression. **Start ny opgave** skaber ny generator-seed/case under den samme valgte lånetype. Begge handlinger skal kræve bekræftelse.

Efter **Afslut Niveau 1** vises et resume med lånetype, finansieringsform, optagelsesdato, løbetid, årlige terminer, provenu, effektiv rente pr. termin, amortiseret kostpris pr. 31/12, kortfristet og langfristet gæld. **Se afsluttet opgave** viser alle otte trin read-only med elevens faktiske arbejde.

## Visuel retning

Produktet hører visuelt til samme familie som Bogføringstræneren: varm lys baggrund, mørk teal, sennepsgul accent, grønt til godkendt, diskret rød/orange til fejl, afrundede kort og kompakt progression. Denne fase fastlægger kun specifikationen.
