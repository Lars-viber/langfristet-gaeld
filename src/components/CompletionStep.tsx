import type { AccountNumber } from '../domain';
import type { StudentAction, StudentState } from '../student';
import type { StudentPostingLine } from '../validation';
import { ValidationMessage } from './ValidationMessage';

const accountNames: Record<AccountNumber, string> = {
  '4410': 'Renteudgift, bank, lån',
  '4450': 'Låneomkostninger/amortisering',
  '5820': 'Bankkonto',
  '6320': 'Lån hos kreditinstitutter',
  '6330': 'Obligationslån',
  '6760': 'Kortfristet del af langfristede gældsforpligtelser',
};
const checks = [
  { key: 'debtReconciles', letter: 'A', title: 'Gældens fordeling', detail: 'Langfristet + kortfristet = amortiseret kostpris pr. 31.12.2026.' },
  { key: 'financialExpenseReconciles', letter: 'B', title: 'Årets renteomkostning', detail: 'Saldo 4410 + saldo 4450 = årets samlede renteomkostning i resultatopgørelsen.' },
  { key: 'accountsReconcile', letter: 'C', title: 'Endelige T-kontosaldi', detail: 'Alle relevante slutsaldi og D/K stemmer med posteringerne.' },
] as const;

function danishMoney(raw: string): string {
  const [whole, fraction = '00'] = raw.split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')} kr.`;
}

function movements(state: StudentState, account: AccountNumber): { label: string; line: StudentPostingLine }[] {
  const entries: { label: string; lines: StudentPostingLine[] }[] = [
    { label: 'Låneoptagelse', lines: state.initialRecognition.lines },
    ...state.caseResult.actual2026Terms.flatMap((row) => [
      { label: `Termin ${row.term} · betaling`, lines: state.bookkeeping[row.term]?.payment.lines ?? [] },
      { label: `Termin ${row.term} · amortisering`, lines: state.bookkeeping[row.term]?.amortization.lines ?? [] },
    ]),
    { label: 'Omklassifikation', lines: state.classification.reclassification.lines },
  ];
  return entries.flatMap((entry) => entry.lines.filter((line) => line.account === account).map((line) => ({ label: entry.label, line })));
}

export function CompletionStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const balances = state.caseResult.accountBalances ?? [];
  const allBalancesApproved = balances.length > 0 && Object.values(state.completion.balances).every((balance) => balance.approved);
  const checksPassed = Object.values(state.completion.checks).filter(Boolean).length;
  return <div className="step-work completion-work">
    <p className="calculation-help">Beregn først hver relevant slutsaldo ud fra dine faktiske posteringer. Skriv en formel med <strong>=</strong> og vælg D eller K særskilt. Beløbet i feltet skal være positivt. Konti uden saldo kræver ingen beregning.</p>
    <section className="work-card" aria-labelledby="balances-heading">
      <div className="work-card-heading"><p className="eyebrow">A · Slutsaldi</p><h3 id="balances-heading">Afsluttende T-konti</h3><p>Alle saldi beregnes her, efter årets posteringer og kort/lang.</p></div>
      <div className="balance-list">{balances.map((balance) => {
        const saved = state.completion.balances[balance.account];
        const locked = readOnly || Boolean(saved?.approved);
        const entries = movements(state, balance.account);
        return <section className="balance-account" key={balance.account} aria-label={`Konto ${balance.account}`}>
          <div className="balance-heading"><div><strong>{balance.account} · {accountNames[balance.account]}</strong><span>T-konto</span></div>
            {balance.status === 'noBalance' && <span className="balance-none">Ingen saldo</span>}</div>
          {balance.status === 'balance' && <>
            <div className="account-movements" aria-label={`Posteringer på konto ${balance.account}`}>
              {balance.account === '5820' && <div><span>Primo bank</span><span>D {danishMoney(state.generatedCase.caseInput.openingBankBalance)}</span></div>}
              {entries.map(({ label, line }, index) => <div key={index}><span>{label}</span><span>{line.side} {line.amount} kr.</span></div>)}
            </div>
            <div className="balance-answer">
              <label htmlFor={`balance-${balance.account}`}>Saldo · manuel beregning med =</label>
              <div className="balance-controls">
                <input id={`balance-${balance.account}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
                  value={saved?.raw ?? ''} placeholder="= …" readOnly={locked}
                  aria-invalid={saved?.errorCode ? true : undefined}
                  aria-describedby={saved?.errorCode ? `balance-${balance.account}-feedback` : undefined}
                  onChange={(event) => onAction({ type: 'editFinalBalance', account: balance.account, formula: event.target.value })} />
                <label className="balance-side">D/K
                  <select value={saved?.side ?? ''} disabled={locked}
                    onChange={(event) => onAction({ type: 'editFinalBalance', account: balance.account, side: event.target.value === '' ? null : event.target.value as 'D' | 'K' })}>
                    <option value="">Vælg</option><option value="D">Debet</option><option value="K">Kredit</option>
                  </select>
                </label>
                {!locked && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkFinalBalance', account: balance.account })}>Kontrollér saldo</button>}
                {saved?.approved && <span className="approved-mark">✓ Godkendt</span>}
              </div>
              <ValidationMessage code={saved?.errorCode ?? null} id={`balance-${balance.account}-feedback`} />
            </div>
          </>}
        </section>;
      })}</div>
    </section>
    {allBalancesApproved && <section className="work-card" aria-labelledby="checks-heading">
      <div className="work-card-heading"><p className="eyebrow">B · Slutkontrol</p><h3 id="checks-heading">Tre afsluttende kontroller</h3></div>
      <div className="final-checks">{checks.map((check) => <div className="final-check" key={check.key}>
        <span className="check-letter">{check.letter}</span>
        <div><strong>{check.title}</strong><p>{check.detail}</p></div>
        {state.completion.checks[check.key] ? <span className="approved-mark">✓ Korrekt</span>
          : !readOnly && <button className="button button-secondary" type="button" onClick={() => onAction({ type: 'runFinalChecks', check: check.key })}>Kontrollér {check.letter}</button>}
      </div>)}</div>
      <p className="checks-count" role="status">{checksPassed} af 3 kontroller korrekte</p>
      {checksPassed === 3 && !readOnly && <div className="finish-action">
        <p>Alle kontroller stemmer. Afslut niveauet, når du er klar.</p>
        <button className="button button-primary" type="button" onClick={() => onAction({ type: 'finishLevel1' })}>Afslut Niveau 1</button>
      </div>}
    </section>}
  </div>;
}
