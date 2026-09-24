# Langfristet gæld – Niveau 1

En browserbaseret undervisningsapp til træning i langfristede gældsforpligtelser. Version 1.0.0 dækker Niveau 1-forløbet fra valg af finansiering til afsluttende kontrol af posteringer og saldi.

## Indeholder

- Deterministisk generering af Niveau 1-cases for annuitets-, serie- og stående lån.
- Trinvis beregning af provenu, betalingsplan, effektiv rente, amortiseret kostpris og klassifikation.
- Validering af elevens mellemregninger, posteringer og afsluttende kontosaldi.
- Lokal genoptagelse af en igangværende case i browseren.

## Kør lokalt

Kræver en aktuel LTS-version af Node.js.

```bash
npm ci
npm run dev
```

Kvalitetstjek før release:

```bash
npm test
npm run typecheck
npm run build
```

## GitHub Pages

Ved push til `main` bygger workflowet appen og publicerer den via GitHub Pages. Den forventede adresse er [https://lars-viber.github.io/langfristet-gaeld/](https://lars-viber.github.io/langfristet-gaeld/), når Pages er aktiveret i repositoryets indstillinger.

## Fagligt grundlag

Niveau 1 følger den frosne v1.0-specifikation og tilhørende kontrakter:

- [Overordnet faglig og UX-mæssig specifikation](docs/MASTER_SPEC_V1.md)
- [Generatorens kontrakt](docs/GENERATOR_CONTRACT_V1.md)
- [Valideringskontrakt](docs/VALIDATION_CONTRACT_V1.md)
- [Kontoplan](docs/ACCOUNT_PLAN_V1.md)
- [Referencecases R1–R6](docs/REFERENCE_CASES_V1.md)

## Release

Aktuel version: `1.0.0`.
