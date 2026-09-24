# Generator stress audit – Level 1 v1.0

GeneratorVersion: 1.0.0. Audited frozen generator commit: 87b9efd9651aceec1d4e4f8a4c22ed1570309257.
Branch: feature/v1-long-term-debt. Main/L0: f1f37cd874aebbc52f14e65e0e09f44aaae962ef.

## Method and result

| Layer | Method | Cases | Failures | Runtime |
| --- | --- | ---: | ---: | ---: |
| A | Exhaustive raw structural parameter enumeration for one caller loanType | 235200 | 0 | 3.80 s |
| B | Full domain engine on endpoint matrix across all three loanTypes | 2880 | 0 | 103.29 s |
| C | Public generator, disjoint seeded ranges and independent full-domain guardrail check | 30000 | 0 | 1871.71 s |

All three layers passed their required invariant gates. Structural enumeration is a count and static-contract audit, not a probability sample. The full amortization and IA engine runs only in B and C.

## A – structural parameter space

Bank: 84000; bond: 151200; total per caller loanType: 235200; corresponding three-type space: 705600.
All static guardrail failure category counts: 0. Every combination used an allowed option, correct financing-specific terms, valid frequency/date pair, whole-kroner proceeds and costs, issue price below par where applicable, brokerage on market value, and proceeds strictly between 90% of principal and principal.

| Static check category | Failures |
| --- | ---: |
| Option sets and financing-specific terms | 0 |
| Principal floor | 0 |
| Medio+1 exclusion | 0 |
| Whole source kroner | 0 |
| Whole proceeds | 0 |
| Proceeds bounds | 0 |
| Bank variable-cost whole kroner | 0 |
| Bank cost base | 0 |
| Bond issue price below par | 0 |
| Bond market value whole kroner | 0 |
| Bond brokerage whole kroner | 0 |
| Brokerage on market value | 0 |
| Financing result type | 0 |

| Financing | Minimum proceeds/principal | Maximum proceeds/principal |
| --- | ---: | ---: |
| bank | 0.939230769230769230769230769230769230769230769230769230769231 | 0.985833333333333333333333333333333333333333333333333333333333 |
| bond | 0.922523076923076923076923076923076923076923076923076923076923 | 0.980883333333333333333333333333333333333333333333333333333333 |

The five structurally allowed frequency/date pairs are primo+1, primo+2, primo+4, medio+2, and medio+4. Enumeration does not assign these five pairs equal probability.

## B – extremal matrix

Bank: 960; bond: 1920; total: 2880; invariant failures: 0.
Each case used endpoint values for principal, years, annual rate, opening bank and financing costs, all five frequency/date pairs, and each of annuity, serial and bullet. The full domain engine and generator guardrails verified schedule, IA, amortization, classification, postings, accounts, 2026 cash and final checks.

Minimum 2026 Bankkonto: 4221400 kr. Case: loanType=serial, seed=matrix, financingType=bond, principal=6500000, issueDate=2026-01-01, ppy=1, rate=0.10, openingBank=500000, years=4, financingTerms={"issuePrice":"96","brokerageRate":"0.015","fixedCost":"150000"}. Proceeds: 5,996,400 kr.; 2026 cash payments: 2275000 kr.; 500,000 + 5,996,400 − 2,275,000 = 4,221,400.

## C – seeded end-to-end generation

10,000 annuity cases: seeds 0–9,999. 10,000 serial cases: seeds 10,000–19,999. 10,000 bullet cases: seeds 20,000–29,999. Total 30,000 distinct seeds; invariant failures: 0.
The public generateLevel1Case API was called for each seed. The resulting case was independently recalculated with the full domain engine and checked for allowed options, proceeds, final nominal principal, positive finite IA, positive amortization, zero final carrying amount, year-end classification, balanced nonzero postings, reconciled accounts, nonnegative 2026 bank, final checks A/B/C, contractual dates, and the correct count of 2026 payment dates.

### Attempts and rejection

Attempts histogram: 1 → 30000. Minimum 1; maximum 1; mean 1.00; attempts > 1: 0.
Natural rejection observed: no. All accepted cases in this sample were raw first draws. No rejected-draw distribution was reconstructed.

### Distribution smoke checks

For each option the gate was z = abs(observed − expected) / sqrt(N × p × (1 − p)), with z ≤ 6. N is conditional for financing-specific terms and ppy-specific issue dates.

| Distribution | Option | N | Expected | Observed | Deviation | z |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| financing | bank | 30000 | 15000.00 | 14995 | -5.00 | 0.058 |
| financing | bond | 30000 | 15000.00 | 15005 | 5.00 | 0.058 |
| years | 4 | 30000 | 15000.00 | 15027 | 27.00 | 0.312 |
| years | 5 | 30000 | 15000.00 | 14973 | -27.00 | 0.312 |
| paymentsPerYear | 1 | 30000 | 10000.00 | 10050 | 50.00 | 0.612 |
| paymentsPerYear | 2 | 30000 | 10000.00 | 10005 | 5.00 | 0.061 |
| paymentsPerYear | 4 | 30000 | 10000.00 | 9945 | -55.00 | 0.674 |
| annualRate | 0.04 | 30000 | 4285.71 | 4221 | -64.71 | 1.068 |
| annualRate | 0.05 | 30000 | 4285.71 | 4278 | -7.71 | 0.127 |
| annualRate | 0.06 | 30000 | 4285.71 | 4345 | 59.29 | 0.978 |
| annualRate | 0.07 | 30000 | 4285.71 | 4246 | -39.71 | 0.655 |
| annualRate | 0.08 | 30000 | 4285.71 | 4180 | -105.71 | 1.744 |
| annualRate | 0.09 | 30000 | 4285.71 | 4388 | 102.29 | 1.688 |
| annualRate | 0.10 | 30000 | 4285.71 | 4342 | 56.29 | 0.929 |
| principal | 6500000 | 30000 | 2500.00 | 2493 | -7.00 | 0.146 |
| principal | 7000000 | 30000 | 2500.00 | 2504 | 4.00 | 0.084 |
| principal | 7500000 | 30000 | 2500.00 | 2494 | -6.00 | 0.125 |
| principal | 8000000 | 30000 | 2500.00 | 2497 | -3.00 | 0.063 |
| principal | 8500000 | 30000 | 2500.00 | 2623 | 123.00 | 2.569 |
| principal | 9000000 | 30000 | 2500.00 | 2472 | -28.00 | 0.585 |
| principal | 9500000 | 30000 | 2500.00 | 2469 | -31.00 | 0.648 |
| principal | 10000000 | 30000 | 2500.00 | 2419 | -81.00 | 1.692 |
| principal | 10500000 | 30000 | 2500.00 | 2503 | 3.00 | 0.063 |
| principal | 11000000 | 30000 | 2500.00 | 2536 | 36.00 | 0.752 |
| principal | 11500000 | 30000 | 2500.00 | 2433 | -67.00 | 1.400 |
| principal | 12000000 | 30000 | 2500.00 | 2557 | 57.00 | 1.191 |
| openingBank | 500000 | 30000 | 6000.00 | 5879 | -121.00 | 1.746 |
| openingBank | 750000 | 30000 | 6000.00 | 6048 | 48.00 | 0.693 |
| openingBank | 1000000 | 30000 | 6000.00 | 6017 | 17.00 | 0.245 |
| openingBank | 1250000 | 30000 | 6000.00 | 6004 | 4.00 | 0.058 |
| openingBank | 1500000 | 30000 | 6000.00 | 6052 | 52.00 | 0.751 |
| bankVariable | 0.01 | 14995 | 2999.00 | 3083 | 84.00 | 1.715 |
| bankVariable | 0.015 | 14995 | 2999.00 | 2943 | -56.00 | 1.143 |
| bankVariable | 0.02 | 14995 | 2999.00 | 3034 | 35.00 | 0.715 |
| bankVariable | 0.025 | 14995 | 2999.00 | 2979 | -20.00 | 0.408 |
| bankVariable | 0.03 | 14995 | 2999.00 | 2956 | -43.00 | 0.878 |
| bankFixed | 50000 | 14995 | 3748.75 | 3689 | -59.75 | 1.127 |
| bankFixed | 100000 | 14995 | 3748.75 | 3776 | 27.25 | 0.514 |
| bankFixed | 150000 | 14995 | 3748.75 | 3731 | -17.75 | 0.335 |
| bankFixed | 200000 | 14995 | 3748.75 | 3799 | 50.25 | 0.948 |
| bondPrice | 96 | 15005 | 3751.25 | 3678 | -73.25 | 1.381 |
| bondPrice | 97 | 15005 | 3751.25 | 3736 | -15.25 | 0.288 |
| bondPrice | 98 | 15005 | 3751.25 | 3786 | 34.75 | 0.655 |
| bondPrice | 99 | 15005 | 3751.25 | 3805 | 53.75 | 1.013 |
| bondBrokerage | 0.005 | 15005 | 5001.67 | 4955 | -46.67 | 0.808 |
| bondBrokerage | 0.01 | 15005 | 5001.67 | 5006 | 4.33 | 0.075 |
| bondBrokerage | 0.015 | 15005 | 5001.67 | 5044 | 42.33 | 0.733 |
| bondFixed | 50000 | 15005 | 5001.67 | 4926 | -75.67 | 1.310 |
| bondFixed | 100000 | 15005 | 5001.67 | 4974 | -27.67 | 0.479 |
| bondFixed | 150000 | 15005 | 5001.67 | 5105 | 103.33 | 1.789 |
| issuePpy2 | 2026-01-01 | 10005 | 5002.50 | 4995 | -7.50 | 0.150 |
| issuePpy2 | 2026-07-01 | 10005 | 5002.50 | 5010 | 7.50 | 0.150 |
| issuePpy4 | 2026-01-01 | 9945 | 4972.50 | 5028 | 55.50 | 1.113 |
| issuePpy4 | 2026-07-01 | 9945 | 4972.50 | 4917 | -55.50 | 1.113 |
| issueOverall | 2026-01-01 | 30000 | 20000.00 | 20073 | 73.00 | 0.894 |
| issueOverall | 2026-07-01 | 30000 | 10000.00 | 9927 | -73.00 | 0.894 |

Maximum observed z: 2.569 for principal=8500000 (observed 2623, expected 2500.00). All categories passed z ≤ 6.

### Issue date, frequency and option coverage

| Frequency/date | Observed | Expected 2026 payment dates |
| --- | ---: | ---: |
| 1/2026-01-01 | 10050 | 1 |
| 2/2026-01-01 | 4995 | 2 |
| 2/2026-07-01 | 5010 | 1 |
| 4/2026-01-01 | 5028 | 4 |
| 4/2026-07-01 | 4917 | 2 |

For ppy=1 all 10,050 cases were primo. Conditional ppy=2 counts were primo 4,995 and medio 5,010 (N=10,005). Conditional ppy=4 counts were primo 5,028 and medio 4,917 (N=9,945). Overall primo was 20,073 and medio 9,927, against expectations of 20,000 and 10,000. Medio+1 count: 0. Every allowed option, including both financing forms and all five frequency/date pairs, occurred at least once. All actual 2026 payment counts matched the table above.

### Duplicates

Full case input fingerprints include all economic caseInput fields and exclude seed, attempts and generatorVersion. Loan-economics fingerprints also exclude openingBankBalance. Both use deterministic JSON serialization.

| LoanType | Generated | Unique full | Duplicate full | Full duplicate rate | Unique economics | Duplicate economics | Economics duplicate rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| annuity | 10000 | 9748 | 252 | 2.52% | 8839 | 1161 | 11.61% |
| serial | 10000 | 9743 | 257 | 2.57% | 8787 | 1213 | 12.13% |
| bullet | 10000 | 9766 | 234 | 2.34% | 8865 | 1135 | 11.35% |

All loanTypes passed the broad gates of at least 75% unique full inputs and 60% unique loan economics.

### Economic observations

| Financing | Seeded minimum proceeds/principal | Seeded maximum proceeds/principal |
| --- | ---: | ---: |
| bank | 0.939230769230769230769230769230769230769230769230769230769231 (seed 926) | 0.985833333333333333333333333333333333333333333333333333333333 (seed 164) |
| bond | 0.922523076923076923076923076923076923076923076923076923076923 (seed 875) | 0.980883333333333333333333333333333333333333333333333333333333 (seed 327) |

Minimum seeded 2026 Bankkonto: 4271400 kr. Case: loanType=serial, seed=13602, financingType=bond, principal=6500000, issueDate=2026-01-01, ppy=1, rate=0.10, openingBank=500000, years=4, financingTerms={"issuePrice":"96","brokerageRate":"0.015","fixedCost":"100000"}. Proceeds: 6,046,400 kr.; 2026 cash payments: 2275000 kr.; 500,000 + 6,046,400 − 2,275,000 = 4,271,400.

Minimum effective rate per term: 0.010812651901981245611855465056248609221847390497788534345085. Case: loanType=bullet, seed=21294, financingType=bank, principal=11000000, issueDate=2026-07-01, ppy=4, rate=0.04, openingBank=750000, years=5, financingTerms={"variableCostRate":"0.01","fixedCost":"50000"}.
Maximum effective rate per term: 0.137558784127981042222267626791835172169672533880098073445305. Case: loanType=serial, seed=12168, financingType=bond, principal=8000000, issueDate=2026-01-01, ppy=1, rate=0.10, openingBank=750000, years=4, financingTerms={"issuePrice":"96","brokerageRate":"0.015","fixedCost":"150000"}.
These observed rate endpoints are audit observations, not new product limits.

### Reproducibility after stress

PASS. Regenerated and compared deterministic serialized output for: annuity/0, annuity/5000, annuity/9999, serial/10000, serial/15000, serial/19999, bullet/20000, bullet/25000, bullet/29999.
The repeat checks occurred after all 30,000 first-pass generations, guarding against hidden global RNG state.

## Regression and scope checks

Stress command: node_modules/.bin/vitest.cmd run --config vitest.stress.config.ts — PASS (1 stress file, 1 stress test). The package.json script is stress:generator = vitest run --config vitest.stress.config.ts.
Normal command: node_modules/.bin/vitest.cmd run — PASS (13 files, 168 tests); the stress file is excluded.
Typecheck: node_modules/.bin/tsc.cmd --noEmit — PASS.
Dependencies unchanged: PASS. L0/L1/L2/L3 production layers unchanged: PASS. R1–R6 fixtures and frozen specification files unchanged: PASS.

## Limits

Statistical distribution checks are smoke tests and not proof of cryptographic or ideal randomness.
This is a deterministic 30,000-seed sample from a finite discrete space; the z threshold is deliberately broad. No natural rejection was observed, so the audit cannot characterize a rejected-candidate distribution. Structural enumeration checks static combinations without running IA or amortization for every one. The measured runtimes describe this machine and are not pass/fail gates.

L4 PASS. No remediation or L5 work is included.
