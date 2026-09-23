# Valideringskontrakt – Niveau 1, v1.0

Dette dokument er autoritativt for elevinput, økonomiske beregninger, delkontrol, låsning, bogføring og afslutning. [Master-specifikationen](MASTER_SPEC_V1.md) definerer forløbet; [generatoren](GENERATOR_CONTRACT_V1.md) definerer casene; [kontoplanen](ACCOUNT_PLAN_V1.md) definerer konti.

## Felttyper og notation

Hvert felt mærkes entydigt som én af følgende typer:

| Type | Betydning | Godkendelse |
| --- | --- | --- |
| Oplyst | Kildetal fra låneaftale eller godkendt case | Eleven aflæser; read-only. |
| Beregn manuelt med `=` | Eleven demonstrerer en reel beregning | Skal begynde med `=` og have en faktisk operation; literal-resultat alene afvises. |
| Indtast eller brug tidligere godkendt værdi | Eleven angiver beløbet eller vælger en godkendt reference | Værdi kontrolleres mod modellen. |
| App-beregning | Appen regner efter godkendte elevinput | Fx YDELSE, IA og gentagne rækker; read-only. |
| T-konto – manuel postering | Eleven skriver hver Debet/Kredit-linje | Positivt beløb; ingen klik eller autofill af beløb. |
| Saldo – manuel `=` | Kun ved afsluttende T-kontosaldi | Beregning med `=` og separat D/K-valg. |
| Kontrol/read-only | Automatisk eller historisk information | Kan ikke ændres. |

Formelinput skal støtte `+`, `−`, `*`, `/`, `(`, `)` og `%` med dansk talnotation, fx `7.500.000`, `1,5`, `1,5%` og `879.228,80`. Whitespace ignoreres. `=7.500.000*1,5%` og andre matematisk ækvivalente udtryk godkendes efter **resultat**, ikke efter tekststreng. En korrekt literal som `=112.500` opfylder ikke kravet om faktisk operation. Parseren må ikke kræve ét bestemt algebraisk udtryk. Fejl i syntaks, division eller ikke-endelige resultater afvises uden facit.

## Fortegn og præcision

- Provenuopgørelser: beregnede og indtastede beløb er positive; fradrag fremgår af opstillingen. Hjælpetekst: **Beregn et positivt beløb med =. Fortegnet fremgår af opstillingen.**
- Ydelsesplan: restgæld primo, ydelse og rente er positive; afdrag og restgæld ultimo er positive eller nul.
- Resultat: nominel rente, amortisering og samlet renteomkostning er positive i Niveau 1-casene.
- Balance: kostpris primo og amortisering er positive; afdrag og kostpris ultimo er positive eller nul.
- Kort/lang: beløb er positive eller nul. T-kontobeløb er positive, og D/K bærer retningen.
- **Betalingsrækken til IA er særtilfældet:** Beløbsfeltet forbliver positivt, mens eleven vælger `+` eller `−` med særskilte knapper. Termin 0 er `+provenu`; Termin 1…n er `−betaling`.

Penge afrundes deterministisk til to decimaler med kommerciel **half-up**. Kildebeløb, provenu og kursværdi kan naturligt være hele kroner. Godkendte synlige monetære beløb med to decimaler bruges som grundlag for næste synlige beregning. Undtagelsen er IA, der lagres og bruges med fuld intern præcision; den vises med fire decimaler i procent. UI'et skal kunne indsætte `[Effektiv rente · fuld præcision]` i elevens amortiseringsformel og vise: **Den viste rente er afrundet. Alle decimaler anvendes i beregningen.** Decimal-sikker aritmetik er facitgrundlag; almindelig binær floating-point er ikke økonomisk sandhedskilde.

## Provenu og ydelsesplan

Banklån: `variable låneomkostninger = hovedstol × sats`; `provenu = hovedstol − variable låneomkostninger − faste låneomkostninger`. Eleven beregner begge med `=`. Obligationslån: `kursværdi = hovedstol × kurs/100`; `kurtage = kursværdi × kurtagesats`; `provenu = kursværdi − kurtage − faste låneomkostninger`. Eleven beregner alle tre med `=`. Kurtagegrundlaget er altid kursværdi.

Ydelsesplanens kolonner er `Termin | Dato | Restgæld primo | Ydelse | Rente | Afdrag | Restgæld ultimo`, med terminer ned gennem rækkerne. Terminsrenten er nominel rente p.a. divideret med antal årlige terminer. `round2` betyder half-up til øre.

- **Annuitetslån:** Appen beregner `standardydelse = round2(hovedstol × r / (1 − (1+r)^(-n)))` efter godkendt hovedstol, terminsrente og antal terminer. På hver ikke-sidste termin: `rente = round2(restgæld primo × r)`, `afdrag = round2(standardydelse − rente)`, `restgæld ultimo = round2(restgæld primo − afdrag)`. På sidste termin: samme rente, afdrag = hele resterende restgæld, ydelse = rente + afdrag og restgæld ultimo = 0,00. Sidste ydelse kan afvige få øre.
- **Serielån:** `fast afdrag = hovedstol / n`; `rente = round2(restgæld primo × r)`; `ydelse = round2(rente + afdrag)`; `restgæld ultimo = round2(restgæld primo − afdrag)`. Sidste række lukker restgælden til 0,00.
- **Stående lån:** På ordinære terminer: `rente = round2(hovedstol × r)`, afdrag = 0, ydelse = rente og restgæld ultimo = hovedstol. På sidste termin: samme rente, afdrag = hele hovedstolen, ydelse = rente + hovedstol og restgæld ultimo = 0,00.

Annuitetslån og Serielån kræver Termin 1 og 2 manuelt; Stående lån kræver Termin 1, 2 og **sidste termin** manuelt. Først efter disse godkendelser tilbydes **Beregn resterende terminer efter samme princip**. Automatiske rækker er markerede og read-only.

## Betalingsrække og IA

Kolonner: `Termin | Dato | Fortegn | Beløb`. Termin 0 står på optagelsesdatoen; de øvrige på de faktiske terminsdatoer. Annuitetslån og Serielån: Termin 0 → 1 → 2 godkendes, derefter må appen udfylde resten. Stående lån: Termin 0 → 1 → 2 → sidste termin, derefter resten. IA-knappen åbner først, når **hele** betalingsrækken er korrekt. Den faktiske justerede sidste annuitetsydelse bruges.

IA er den positive rente pr. termin `r`, der løser `0 = provenu − Σ(betaling_t/(1+r)^t)` for t = 1…n. Den fulde fundne rate bruges internt; kun visningen afrundes. Eleven konstruerer cashflows, mens appen udfører IA-beregningen.

## Amortiseret kostpris

To separate tabeller bevares. **Resultat:** `Termin | Dato | Nominel rente | Amortisering | Renteomkostning i alt`. **Balance:** `Termin | Dato | Kostpris primo | Afdrag | Amortisering | Kostpris ultimo`. Tabellerne transponeres aldrig; små skærme bruger vandret scrolling. Balance starter med `kostpris primo = provenu`.

På hver ikke-sidste termin: `effektiv renteomkostning = round2(kostpris primo × fuld IA)`; `amortisering = round2(effektiv renteomkostning − nominel rente)`; `renteomkostning i alt = nominel rente + amortisering`; `kostpris ultimo = round2(kostpris primo − afdrag + amortisering)`. Nominel rente og afdrag kommer fra ydelsesplanen. Samme amortisering bruges i begge tabeller. På sidste termin må appen sætte `amortisering = round2(afdrag − kostpris primo)` for at lukke kostpris ultimo til 0,00; samlet renteomkostning bliver nominel rente + denne justerede amortisering. Det er kun en ren øreafrundingsjustering og kan markeres diskret.

Delkontrol er **resultat Termin 1 → balance Termin 1 → resultat Termin 2 → balance Termin 2 → Beregn resterende terminer**. Dette gælder også Stående lån. Inden for den aktive beregningsrække kan korrekte felter låses enkeltvis, mens forkerte felter forbliver redigerbare. Næste række åbnes først, når den aktuelle række er helt korrekt.

## T-konti, net movement og delaccept

Første indregning: Debet 5820, Kredit 6320 ved Banklån eller 6330 ved Obligationslån, begge med provenu. Kun terminer med betalingsdato i 2026 bogføres. For hver sådan termin kommer **Kontrollér betaling** før **Kontrollér amortisering**:

- Betaling: 4410 netto Debet nominel rente; 6320/6330 netto Debet afdrag; 5820 netto Kredit samlet betaling. Nulafdrag på Stående lån kræver ingen nulpostering.
- Amortisering: 4450 netto Debet amortisering; 6320/6330 netto Kredit amortisering.
- Omklassifikation ved positiv kortfristet del: 6320/6330 netto Debet og 6760 netto Kredit med samme beløb. Ved nul svarer eleven **Nej** til omklassifikation og posterer intet.

For hver relevant konto og posteringsblok beregnes `studentNet = sum(Debet) − sum(Kredit)`. Dette sammenholdes med forventet fortegnet nettobevægelse (Debet positivt, Kredit negativt). Eksempel: Debet 400.000 og Kredit 100.000 opfylder netto 300.000 Debet. Samtidig skal hele blokken balancere `sum(Debet) = sum(Kredit)`. Kun relevante konti er tilladt; uvedkommende konti eller kunstige stuffingposteringer afvises. Elevens faktiske linjer og mellemregninger bevares i historikken.

Konto-status kan vises vejledende, men **ingen** elevlinje låses enkeltvis. Først når alle relevante nettobevægelser er korrekte og hele betalingsblokken balancerer, låses hele betalingsblokken read-only, og amortiseringsblokken åbner. Når amortiseringen er korrekt og balancerer, låses den, terminen godkendes, og næste termin åbner. T-kontosaldi beregnes ikke efter optagelsen, betaling, amortisering eller hver termin.

## Kort/lang, slutsaldi og slutkontrol

Kortfristet del pr. 31/12/2026 er summen af **kontraktmæssige afdrag**, der forfalder efter balancedagen og senest 31/12/2027. Den omfatter hverken hele ydelser, rente eller amortisering. Eleven beregner beløbet med `=`. Langfristet del er `amortiseret kostpris pr. 31/12/2026 − kortfristet del`, også beregnet med `=`. Differencen i `kortfristet + langfristet − samlet amortiseret kostpris` skal være 0,00.

**Kun én gang til sidst**, efter hele årets bogføring, kort/lang og eventuel omklassifikation, beregner eleven hver relevant T-kontosaldo med en faktisk `=`-operation og vælger separat D eller K. Beløbet er positivt. Korrekte konti kan godkendes og låses enkeltvis; forkerte forbliver redigerbare. Konti uden posteringssaldo vises read-only som **Ingen saldo** og kræver ikke `=0`.

De tre slutkontroller er: (A) langfristet + kortfristet = amortiseret kostpris; (B) saldo 4410 + saldo 4450 = årets samlede renteomkostning i resultatopgørelsestabellen; (C) alle relevante slutsaldi og D/K svarer til modellen. Ved tre korrekte kontroller vises **3 af 3 kontroller korrekte**. Afslutning kræver stadig elevens tryk på **Afslut Niveau 1**.

## Feedback, progression og historik

Feedback skal hjælpe uden facit: **Brug = til at foretage beregningen.**; **Kontrollér formlen.**; **Beregningen stemmer ikke endnu.**; **Kontrollér fortegnet.**; **Husk, at kurtage beregnes af kursværdien.** Appen indsætter aldrig facit efter forkert svar.

Godkendte tidligere trin er read-only og må ikke mutere state. Historikken viser elevens faktiske formler, værdier og T-kontolinjer, også gyldige mellemregninger; app-beregnede rækker markeres. En gendannet session bruger det gemte case-snapshot og skaber ikke en ny case.
