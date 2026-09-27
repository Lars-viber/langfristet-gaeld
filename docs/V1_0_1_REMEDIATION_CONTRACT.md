# v1.0.1 Remediation Contract

**Status: updated through R7.** This document is the authoritative product contract for the v1.0.1 remediation of *Langfristet gæld – Niveau 1*. It supersedes conflicting v1.0.0 behaviour. R0 originally changed documentation only; the later implementation phases follow the step contracts below.

## Global learning contract

The frozen principle is: **“Eleven skal regne – ikke programmere. Appen må automatisere gentagelser, når eleven først har demonstreret metoden.”**

Every editable field explicitly declares one action, so a student never guesses whether \`=\` is required:

| Action | Contract |
| --- | --- |
| Oplyst | Read-only information. |
| Indtast | Enter/transfer an already-known value; \`=\` is not required. |
| Beregn med = | A real calculation is required; a bare answer is rejected. |
| App-beregning | App calculation happens only after an explicit student action. |
| Indtast beløb – = kan bruges | Particularly T-accounts: enter a known amount or calculate with \`=\`; never autofill. |

Ordinary monetary amounts are positive. Direction is supplied by visible +/−, Debet/Kredit, a separate cash-flow sign, or D/K for a balance. Manual positive calculation states “Beregn et positivt beløb med =”. A negative cost states “Beløbet skal beregnes som et positivt beløb. Fradraget vises allerede med − i opstillingen.” T-accounts state “Indtast et positivt beløb. Debet/Kredit fremgår af den valgte side.” Cash-flow states “Indtast et positivt beløb. Vælg fortegnet separat.” Closing balances state “Beregn et positivt saldobeløb med =, og angiv derefter D eller K.”

Use *omkostningsføre*, *omkostningsføres*, *omkostningsføring*—never “udgiftsføre”, “udgiftsføres”, or “udgiftsføring”. **Renteudgift, bank, lån** remains unchanged.

## Visual, responsive, and case contract

The authoritative visual reference is *Opstilling af årsregnskab*. Use 'Segoe UI', system-ui, sans-serif. No teal/mustard palette, serif hero headings, or landing-page look.

| Token | Value |
| --- | --- |
| primary / hover / medium / light | #0050A4 / #003F82 / #1769C2 / #DCEBFA |
| background / surface | #F4F8FD / #FFFFFF |
| text / muted / border | #172B3A / #536879 / #D6E1EC |
| success / error | #278369 / #A53A32 |
| radius / small-radius / shadow | 12px / 7px / 0 4px 20px #172B3A08 |

Approved values: background #F0F8F4, border #8CBDAB. Invalid treatment #FDF4F3 / #D3A49F. Calculated/app values #EDF4FC / #C3D7EB. Target sizing: body about 15px; work headings 20–26px; labels 13–15px; help/status 11–13px; compact tables 12–13px.

Design laptop-first at **1366 × 768**. This is a teaching work app: actively use width with compact boxes and modest spacing. Place reference beside working setup, result beside balance, instruction beside T-accounts, and three T-accounts side-by-side where width permits. Vertical scrolling is valid for genuinely large student content, not whitespace. Small viewports stack; term tables may internally scroll horizontally, never transpose.

Use this dynamic opening:
> En klasse B-virksomhed har den [optagelsesdato] optaget et lån. Lånets størrelse og betingelser fremgår nedenfor. Lånet er uden for handelsbeholdningen. Første indregning sker til kostpris, og den efterfølgende måling sker til amortiseret kostpris. Første betaling sker efter én fuld termin. I det følgende skal du hjælpe virksomheden med at beregne og måle lånet og til sidst bogføre det i årsregnskabet for 2026.

Show compact assumptions: loan type, financing, principal, **Optagelsesdato**, term, payments/year, nominal annual rate. The drawdown date is visible throughout.

Financial year is 2026. One payment/year: drawdown always 01.01.2026. Two or four payments/year: drawdown 01.01.2026 or 01.07.2026; never mid-year with one annual payment. First payment follows one full term. Dates: primo+1 31.12; primo+2 30.06/31.12; primo+4 31.03/30.06/30.09/31.12; medio+2 first 31.12, then 30.06/31.12; medio+4 first 30.09, then 31.12/31.03/30.06 etc. 2026 payment counts: primo+1=1, primo+2=2, primo+4=4, medio+2=1, medio+4=2.

Money is decimal-safe, two decimals, HALF_UP. Payment-plan calculations each round to two decimals and students continue from the displayed approved amount; no hidden high-precision money. Annuity payment is fixed to two decimals; final payment may adjust by a few øre to close debt to 0,00, with a discreet note. Effective interest displays with four percentage decimals, stores full precision, and uses full precision: two-decimal opening cost × full rate → HALF_UP two-decimal result, then continue from the visible money amount. Last automatic amortisation may adjust a pure rounding residue, not conceal a professional error.

## Universal term-table and progression rules

Immediately above **every** student-worked term table, state manual terms and mark their rows. App-calculated/future rows must not resemble editable rows. For annuity/serial:
> Din opgave: Udfyld termin 1 og termin 2. Når begge terminer er korrekte, beregner appen de resterende terminer.

For bullet loans:
> Din opgave: Udfyld termin 1, termin 2 og sidste termin. Når de er korrekte, beregner appen de øvrige terminer.

This applies to payment plan, cash flow, amortised-cost result and balance, and every other term table. Cash flow term 0 is manual. Bullet-loan last term is manual in all relevant tables, replacing any former exception.

There are seven visible steps: Provenu, Ydelsesplan, Effektiv rente, Amortiseret kostpris, Kort/lang, Bogføring, Afslutning. A professionally complete step turns green; student stays on it with work visible; app never auto-navigates. “Fortsæt til …” alone advances. Completed prior steps are read-only clickable history; future steps lock; historical viewing does not change progress. Completion happens only through “Afslut Niveau 1”.

## Step 1 — Provenu

Use a real vertical statement with one right-aligned amount column. BANK: Hovedstol − Variable låneomkostninger − Faste låneomkostninger = Provenu. Supply principal, variable cost rate, fixed costs; calculate positive variable costs and proceeds with =, showing “Beregn et positivt beløb med =” for variable cost. OBLIGATION: Nominel hovedstol × kurs = kursværdi − kurtage − faste låneomkostninger = provenu. Calculate kursværdi, kurtage DKK, and proceeds with =. Kurtage is always based on kursværdi, never nominal principal. Preserve original formula and result after approval; bare answers do not pass. Then show “Fortsæt til Ydelsesplan” without auto-navigation.

## Step 2 — Ydelsesplan

No posting. Compactly show principal, Optagelsesdato, term, payments/year, nominal rate, and “Lånet er optaget [dato]. Første betaling sker efter én fuld termin.” First require: enter principal; calculate term rate with =; calculate total terms with =.

Annuity uses structured YDELSE inputs (term rate, number of terms, principal) and “Beregn ydelse”; student does not type =YDELSE. App calculates positive two-decimal payment. Serial loan calculates fixed repayment as principal / total terms with =. Bullet loan has zero running-term repayment and remaining debt in last term.

Table is **Termin | Dato | Restgæld primo | Ydelse | Rente | Afdrag | Restgæld ultimo**—term first and date second, never transposed. Manual opening debt is never autofilled: term 1 enters principal; term 2 enters preceding closing debt; a manual bullet final term enters preceding closing debt. Annuity calculates interest, repayment, closing debt; serial calculates interest, payment, closing debt; bullet demonstrates interest, repayment, payment, closing debt. App calculates remainder only after the required manual terms.

## Step 3 — Effektiv rente

No posting. Show approved proceeds, payments/payment plan and dates. Cash-flow table: **Termin | Dato | Fortegn | Beløb**. Term 0 is drawdown date; student selects + and enters proceeds. Terms 1 and 2 select − and enter contractual payment. Bullet loans also complete last term manually; app calculates remainder. Amounts are positive; sign is separate. After correct manual flow, structured “Beregn effektiv rente” runs—not =IA(...). Label “Effektiv rente pr. termin”, show four decimals, and explain: “Den viste rente er afrundet. Appen anvender den fulde beregnede præcision i de efterfølgende beregninger.”

## Step 4 — Amortiseret kostpris

No posting. Show two distinct tables with term/date first and all columns retained:

- RESULTAT: Termin | Dato | Nominel rente | Amortisering | Renteomkostning i alt
- BALANCE: Termin | Dato | Kostpris primo | Afdrag | Amortisering | Kostpris ultimo

Initial cost is Step-1 proceeds. In manual terms, RESULTAT enters nominal interest from payment plan; calculates total interest as opening cost × full effective rate; calculates positive amortisation as total interest − nominal interest. Visually show Nominel rente + Amortisering = Renteomkostning i alt. BALANCE enters opening cost (proceeds in term 1; prior closing cost later), repayment from payment plan and amortisation from result; calculate closing cost: opening cost − repayment + amortisation. Flow: term result → term balance → term complete. Apply 1+2 / 1+2+last, then app-calculate remainder.

## Step 5 — Kortfristet / langfristet

No posting; classify at 31.12.2026. Short-term part is **contractual principal repayments** due after 31.12.2026 and through 31.12.2027—not payment, interest or amortisation. Show relevant payment plan read-only. Student enters amortised cost at 31.12.2026 and calculates positive short-term amount with =; help is “Brug de kontraktuelle afdrag – ikke de samlede ydelser.” Calculate positive long-term amount = amortised cost − short-term part in a genuine vertical, one-column statement. If no 2027 principal repayment exists, ask “Forfalder der afdrag på hovedstolen i perioden 01.01.2027–31.12.2027?” Correct Nej gives 0,00; no artificial =0. No reclassification posting here.

## Step 6 — Bogføring og saldi på permanente T-konti

This is the first place with posting, and it contains all posting. Phase A posts chronologically: drawdown/proceeds; each actual 2026 payment followed by its amortisation; finally 31.12.2026 reclassification. Each professional block is checked separately. No per-row/per-side locking that exposes answers. Only a correct full, balanced block locks and remains read-only history; then next block opens. Every block receives an automatic sequential posting number, shared by all its actual student lines and shown beside their amounts; the number is never student input. Approved lines display Danish-formatted amounts while their raw inputs remain saved.

Use the working concept of *Kontering af løn på T-konti Niveau 2 V2* from TAccountCard.tsx, PostingRow.tsx, workspace.css, but this contract’s blue palette. A T-account has number/name, Debet/Kredit, horizontal T-bar, vertical separator, + Postering each side, independent rows, deletion of unlocked rows, and read-only approved history. Three columns at about 1366px. Always show all six:
- 4410 Renteudgift, bank, lån
- 4450 Låneomkostninger/amortisering
- 5820 Bankkonto
- 6320 Lån hos kreditinstitutter
- 6330 Obligationslån
- 6760 Kortfristet del af langfristede gældsforpligtelser

All six T-accounts are visible from the start and remain the same workspace through both phases. T-account amounts are **never** autofilled. Student chooses account and side, then “Indtast beløb – = kan bruges” for a positive amount; zero and negative posting lines are rejected. All postings must always be visible directly on the account: no Vis flere, accordion/collapse, pagination, history modal/popup, hidden history, or summary replacing postings. Account height may grow. During Phase A, do not show an automatic current balance.

Expected postings: bank drawdown 5820 D / 6320 K = proceeds; bond drawdown 5820 D / 6330 K = proceeds. Payment: 4410 D = nominal interest, 6320/6330 D = repayment, 5820 K = total payment. Amortisation: 4450 D and 6320/6330 K = amortisation. If short-term > 0: 6320/6330 D and 6760 K = short-term part. If zero: ask “Skal der foretages omklassifikation?”; correct Nej, with no zero posting. Validate expected **net per account**, not a prescribed row split; accept D400/K100 for expected D300 if the block balances, relevant accounts are used, and account net is correct. Preserve actual student rows and reject irrelevant accounts.

During posting, show approved complete amortised-cost RESULTAT and BALANCE tables as reference: all columns, about ten terms visible in internal vertical scroll, the active term highlighted, no Vis flere. The left information box directs the current numbered block without revealing accounts or amounts. Issue references approved proceeds; reclassification references the approved short-term part.

After the final posting, Phase B calculates closing balances on **those same T-accounts**, not in another step or table. Posting lines remain locked and visible. A net-zero or unused account shows “Ingen saldo” without =0. Exactly one posting line permits direct positive amount entry; two or more require a real calculation with =. The student chooses D/K separately. Approve balances account by account, retaining raw formulas, formatted results and D/K. Expected balances derive from approved student lines and must agree with the authoritative posting model. Internal consistency guards include approved balances, short-term plus long-term equalling carrying amount, and approved expense balances matching approved postings. Step 6 completes only after all blocks and relevant balances are approved, without auto-navigation; “Fortsæt til Afslutning” alone advances.

R7 carries exactly three approved Step-6 polish corrections: the read-only opening balance on 5820 is labelled **Saldo primo** (not a numbered posting); completely empty unlocked draft posting rows are ignored by account/net/balance validation and discarded only when a block is successfully approved, while every non-empty line retains the existing validation and raw student entry; and the left information panel uses the same light-blue Step-5 treatment in active, balance, completed and historical states. All other Step-6 workflow and economics remain frozen.

## Step 7 — Afslutning

Step 7 is one coherent, compact, read-only review in this order: original Opgavetekst; all bank/bond Låneaftale assumptions (kurs is a number, not a percent); Step-1 proceeds with student raw inputs/formulas and approved results; the complete seven-column Ydelsesplan; full four-column cash flow including term 0; Effective rate per term shown to four percentage decimals (never expose internal precision); complete Resultat and Balance amortised-cost tables with student raw manual work and the existing standing rounding note only if applicable; Step-5 short/long statement with raw student input/formulas; all six permanent T-accounts with every approved gross/split line and sequential posting number, 5820 Saldo primo, approved balances, raw balance work and D/K; and compact final status. No new student calculations, posting, account checks, editing, wizard, tabs, accordion, pagination, Vis flere, or parallel economic engine. Normal wide tables may scroll internally; every T-account posting remains directly visible and three T-accounts sit across on desktop. The original task and case agreement are already rendered by the shared workspace immediately before the Step-7 review body.

Only **after the entire overview** show “Afslut Niveau 1”. Entering Step 7 leaves it active and the session incomplete. Clicking the final button completes Step 7 and the session while preserving the case, all raw formulas/inputs, posting lines, balances, D/K and approvals in schema v2. The overview remains visible with a small completed status; all seven steps become green, navigable and read-only. Existing new-task and reset actions retain their semantics. Refresh before and after the click restores the corresponding Step-7 state without creating a new case or schema v3. Historical steps return to the finished overview through the existing navigation.

## Error feedback

Use short non-revealing feedback: “Brug = til at foretage beregningen.”; “Kontrollér formlen.”; “Beregningen stemmer ikke endnu.”; “Kontrollér fortegnet.”; the positive-cost message above; “Kontrollér kontoen.”; “Kontrollér, hvilken side af kontoen posteringen skal stå på.”; “Bogføringen er ikke i balance endnu.” Never reveal answers.

## Later remediation and test strategy

Later remediation must address conflicts in existing student state, progression, persistence, UI, validation, etc.; R0 only records that necessity. Preserve domain/generator economics unless a later phase demonstrates a real conflict.

Testing is intentionally lower volume: no generator stress, large seed sweeps, repeated release gates, or redundant regression. Small change: relevant targeted tests + typecheck. Normal feature/remediation: targeted tests + existing regression once. Generator/economic engine: small smoke only if actually changed. Stress testing only for fundamental generator/economic-engine change.
