# Kontoplan – Niveau 1, v1.0

Dette er den autoritative kontoplan for Niveau 1. [Master-specifikationen](MASTER_SPEC_V1.md) beskriver elevforløbet, og [valideringskontrakten](VALIDATION_CONTRACT_V1.md) fastlægger kontrollen af posteringer. Beløb på T-konti skrives positivt; Debet/Kredit bestemmer retningen.

| Konto | Betegnelse | Normalsaldo | Anvendelse |
| --- | --- | --- | --- |
| 4410 | Renteudgift, bank, lån | Debet | Nominel rente ved faktiske terminer i 2026, for både Banklån og Obligationslån. |
| 4450 | Låneomkostninger/amortisering | Debet | Periodens positive amortisering af forskellen mellem provenu og kontraktmæssig gæld. |
| 5820 | Bankkonto | Debet | Startsaldo, provenu ved optagelse og faktiske betalinger. |
| 6320 | Lån hos kreditinstitutter | Kredit | Banklån: provenu ved optagelse; afdrag, amortisering og eventuel omklassifikation. |
| 6330 | Obligationslån | Kredit | Obligationslån: provenu ved optagelse; afdrag, amortisering og eventuel omklassifikation. |
| 6760 | Kortfristet del af langfristede gældsforpligtelser | Kredit | Kortfristet del efter omklassifikation, når beløbet er større end nul. |

6320 og 6330 bruges gensidigt udelukkende i den enkelte case. 6760 har **Ingen saldo**, når den kortfristede del er nul og ingen postering er foretaget. Konto 6320 betyder her **Lån hos kreditinstitutter**; en tidligere kontobetegnelse for dette nummer gælder ikke i projektet. Konto 6330 og 6760 skal senere indarbejdes i projektets masterkontoplan.

## Forventet anvendelse

- **Optagelse:** Debet 5820, Kredit 6320 eller 6330 med provenu. Første indregning sker til provenu.
- **Betaling:** Debet 4410 med nominel rente, Debet 6320/6330 med afdrag, Kredit 5820 med hele betalingen. Ved afdrag nul oprettes ingen nulpostering.
- **Amortisering:** Debet 4450 og Kredit 6320/6330 med samme amortiseringsbeløb.
- **Omklassifikation:** Når kortfristet del er positiv: Debet 6320/6330 og Kredit 6760. Ved nul foretages ingen postering.

Disse linjer angiver forventede **nettobevægelser**. Gyldige mellemregninger med flere elevlinjer accepteres, når nettobevægelsen pr. relevant konto er korrekt, blokken balancerer, og ingen uvedkommende konto anvendes. Endelige T-kontosaldi beregnes kun én gang, efter hele årets bogføring og eventuel omklassifikation.
