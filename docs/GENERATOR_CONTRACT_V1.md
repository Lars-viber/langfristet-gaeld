# Generatorkontrakt – Niveau 1, v1.0

[Master-specifikationen](MASTER_SPEC_V1.md) beskriver elevforløbet. Dette dokument er autoritativt for udtræk, datoer og afvisning af cases. Den senere generator skal gemme seed, versionsnumre og det fulde case-snapshot til stabil gendannelse.

## Valg og sandsynligheder

Lånetypen vælges aktivt af eleven blandt **Annuitetslån**, **Serielån** og **Stående lån**, før en case genereres. Den randomiseres aldrig. For hver ny opgave under den valgte lånetype trækkes de øvrige uafhængige parametre fra de angivne, ensartede valgmængder, medmindre andet er angivet.

| Parameter | Muligheder | Fordeling |
| --- | --- | --- |
| Finansieringsform | Banklån; Obligationslån | 50 %; 50 % |
| Nominel hovedstol | 6.500.000 til 12.000.000 kr. i trin à 500.000 kr. | Ensartet over 12 værdier; altid over 6.000.000 kr. |
| Løbetid | 4; 5 hele år | 50 %; 50 % |
| Årlige terminer | 1; 2; 4 | Hver 1/3 |
| Nominel rente p.a. | Hele procenter 4 % til 10 % | Ensartet over 7 værdier |
| Regnskabsår | 2026 | Fast |
| Bankens startsaldo | 500.000; 750.000; 1.000.000; 1.250.000; 1.500.000 kr. Debet | Ensartet over 5 værdier |

Ved **1 årlig termin** er optagelse altid 1/1/2026. Ved **2 eller 4 årlige terminer** er optagelse 1/1/2026 eller 1/7/2026 med 50 % hver. Kombinationen 1/7/2026 og 1 årlig termin findes aldrig. Første betaling kommer efter én fuld normal termin.

## Finansieringsform og provenu

**Banklån:** Variable låneomkostninger trækkes ensartet blandt 1,0 %, 1,5 %, 2,0 %, 2,5 % og 3,0 % af nominel hovedstol. Faste låneomkostninger trækkes ensartet blandt 50.000, 100.000, 150.000 og 200.000 kr. `provenu = hovedstol − variable låneomkostninger − faste låneomkostninger`. Eleven beregner variable låneomkostninger og provenu manuelt med `=`.

**Obligationslån:** Kurs trækkes ensartet blandt 96, 97, 98 og 99. Kurtagesats trækkes ensartet blandt 0,5 %, 1,0 % og 1,5 %. Faste låneomkostninger trækkes ensartet blandt 50.000, 100.000 og 150.000 kr. `kursværdi = hovedstol × kurs/100`; `kurtage = kursværdi × kurtagesats`; `provenu = kursværdi − kurtage − faste låneomkostninger`. **Kurtage beregnes altid af kursværdien.** Eleven beregner kursværdi, kurtage i kroner og provenu manuelt med `=`. Kun underkurs forekommer. Der indgår ingen tinglysning eller registreringsafgift.

Grundbeløb, kursværdi og provenu skal være hele kroner i Niveau 1. Pengeregler og præcision følger [valideringskontrakten](VALIDATION_CONTRACT_V1.md).

## Terminsdatoer

| Årlige terminer | Faste datoer hvert år | Første betaling ved 1/1/2026 | Første betaling ved 1/7/2026 | Betalinger i 2026 ved primo/medio |
| --- | --- | --- | --- | --- |
| 1 | 31/12 | 31/12/2026 | Ikke mulig | 1/— |
| 2 | 30/6, 31/12 | 30/6/2026 | 31/12/2026 | 2/1 |
| 4 | 31/3, 30/6, 30/9, 31/12 | 31/3/2026 | 30/9/2026 | 4/2 |

Ved mediooptagelse fortsætter 2 årlige terminer 30/6, 31/12 osv. og 4 årlige terminer 31/12, 31/3, 30/6 osv. efter første betaling. Antal terminer er `løbetid × årlige terminer`; optagelsesdatoen flytter betalingskalenderen, men reducerer ikke antal kontraktmæssige terminer.

## Kontraktmæssig plan og betalingsrække

Terminsrenten er `nominel rente p.a. / årlige terminer`. Annuitetslån får en standardydelse efter YDELSE-logik på nominel hovedstol, terminsrente og antal terminer, afrundet til øre. Den sidste betaling justeres om nødvendigt få øre for at lukke nominel restgæld. Serielån får fast afdrag `hovedstol / antal terminer`. Stående lån betaler kun rente frem til sidste termin, hvor hele hovedstolen betales. Rækkerne og half-up-reglerne er præciseret i [valideringskontrakten](VALIDATION_CONTRACT_V1.md).

IA beregnes på den faktiske, afrundede betalingsrække: `+provenu` i Termin 0 og negativ faktisk betaling i hver senere termin. Den positive, endelige rente pr. termin bruges med fuld intern præcision. Amortiseret kostpris starter ved provenu og lukkes til 0,00 ved udløb med en ren afrundingsjustering på sidste række.

## Hårde guardrails og invariants

En case skal forkastes og trækkes på ny, hvis blot én af følgende betingelser brydes:

- Nominel hovedstol > 6.000.000 kr.; `0 < provenu < hovedstol`; `provenu ≥ 90 % × hovedstol`.
- Obligationslån har kurs under 100, og kurtage er beregnet af kursværdien.
- Ingen mediooptagelse med 1 årlig termin; første betaling og samtlige terminsdatoer følger kalenderen ovenfor.
- Sidste kontraktmæssige restgæld og sidste amortiserede kostpris er begge 0,00.
- IA kan løses fra betalingsrækken og er positiv og endelig.
- Kortfristet + langfristet gæld er præcis samlet amortiseret kostpris pr. 31/12/2026.
- Alle forventede posteringsblokke balancerer; endelige relevante T-kontosaldi svarer til domænemodellen.
- Casen giver ingen tvetydige eller uunderviselige øreafrundinger. Kun de definerede justeringer af sidste annuitetsydelse og sidste amortisering accepteres.
- Bankkontoens slutbalance i 2026 er ikke negativ, når startsaldo, provenu og alle faktiske 2026-betalinger medregnes. Hvis den er negativ, forkastes casen og der trækkes en ny.

Disse checks udføres **efter** udtræk, før casen vises. Et gendannet case-snapshot genbruges uden nyt udtræk. R1–R6 i [referencecases](REFERENCE_CASES_V1.md) er faste verifikationscases, ikke udtryk for en særskilt sandsynlighedsfordeling.
