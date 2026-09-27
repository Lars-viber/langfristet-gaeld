import type { AccountNumber } from '../domain';
import { D } from '../domain/decimal';
import { activeBalanceAccount, activeBookkeepingBlock, accountPostingLines, accountVisibleAmountCount, bookkeepingBlockState, bookkeepingBlocks, T_ACCOUNTS } from '../student/bookkeeping';
import type { StudentAction, StudentState } from '../student/types';
import type { StudentPostingLine } from '../validation';
import { feedbackFor, parsePostingAmount } from '../validation';

const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};
const blockTitle = (kind: string, term: number | null) => kind === 'origination' ? 'Optagelse'
  : kind === 'payment' ? `Betaling · termin ${term}`
    : kind === 'amortization' ? `Amortisering · termin ${term}` : 'Omklassifikation';

export function BookkeepingStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const historical = state.viewingStep !== state.currentStep;
  const blocks = bookkeepingBlocks(state);
  const active = activeBookkeepingBlock(state);
  const balanceAccount = activeBalanceAccount(state);
  const inBalancePhase = active === null;
  const finished = state.completedSteps.includes('yearBookkeeping');
  const activeState = active ? bookkeepingBlockState(state, active) : null;
  const relevantBalances = state.caseResult.accountBalances?.filter((entry) => entry.status === 'balance') ?? [];
  const balanceIndex = balanceAccount ? relevantBalances.findIndex((entry) => entry.account === balanceAccount) + 1 : 0;
  const referenceTerm = active?.term ?? (active?.kind === 'reclassification'
    ? state.caseResult.actual2026Terms.at(-1)?.term ?? null : null);
  function changeLines(lines: StudentPostingLine[]) {
    if (active) onAction({ type: 'setPostingBlockLines', number: active.number, lines });
  }
  function addLine(account: AccountNumber, side: 'D' | 'K') {
    if (active && !readOnly && active.expected.length) changeLines([...(activeState?.lines ?? []), { account, side, amount: '' }]);
  }
  function changeLine(index: number, amount: string) {
    if (activeState) changeLines(activeState.lines.map((line, i) => i === index ? { ...line, amount } : line));
  }
  function removeLine(index: number) {
    if (activeState) changeLines(activeState.lines.filter((_, i) => i !== index));
  }

  return <div className="step-work r6-work">
    <aside className="r6-info" aria-label="Vejledning til bogføring">
      <h2 id="step-heading">Bogføring</h2>
      {historical && <p className="r6-history" role="status">Du ser et tidligere trin. Trinnet er skrivebeskyttet.</p>}
      {active ? <>
        <strong className="r6-phase">Bogfør postering {active.number} af {blocks.length}</strong>
        <p className="r6-block-name">{blockTitle(active.kind, active.term)}</p>
        <p>{dateLabel(active.date)}{active.term === null ? '' : ` · Termin ${active.term}`}</p>
        <p>{active.kind === 'origination' ? 'Bogfør lånets optagelse på T-kontiene.'
          : active.kind === 'payment' ? 'Bogfør den kontraktuelle betaling på T-kontiene.'
            : active.kind === 'amortization' ? 'Bogfør amortiseringen på T-kontiene.'
              : 'Bogfør årets omklassifikation på T-kontiene.'}</p>
        {active.kind === 'origination' && <p className="r6-reference-value">Godkendt provenu <strong>{money(state.caseResult.proceeds.proceeds)} kr.</strong></p>}
        {active.kind === 'reclassification' && <p className="r6-reference-value">Godkendt kortfristet del <strong>{money(state.caseResult.classification.shortTerm)} kr.</strong></p>}
        {active.kind === 'reclassification' && !active.expected.length && <div className="r6-zero-answer">
          <p>Skal der foretages omklassifikation?</p>
          <div role="group" aria-label="Omklassifikation nødvendig?">{(['yes', 'no'] as const).map((answer) => <label key={answer}>
            <input type="radio" name="r6-reclassification" checked={state.classification.reclassificationAnswer === answer} disabled={readOnly}
              onChange={() => onAction({ type: 'setReclassificationAnswer', answer })} />{answer === 'yes' ? 'Ja' : 'Nej'}
          </label>)}</div>
          {state.classification.answerErrorCode && <p className="r6-error" role="alert">Kontrollér svaret.</p>}
        </div>}
        {activeState?.errors.length ? <p className="r6-error" role="alert">{activeState.errors.includes('IRRELEVANT_ACCOUNT')
          ? 'Brug kun de konti, der vedrører denne postering.' : 'Kontrollér konti, debet/kredit og beløb.'}</p> : null}
      </> : <>
        <strong className="r6-phase">Beregn saldi</strong>
        <p>Klargør T-kontiene ved at beregne saldoen på hver relevant konto.</p>
        {balanceAccount && <p className="r6-block-name">Saldo {balanceIndex} af {relevantBalances.length}<br />
          {balanceAccount} {T_ACCOUNTS.find((entry) => entry.number === balanceAccount)?.name}</p>}
        {finished && <p className="r6-complete">✓ Bogføring og saldi er godkendt.</p>}
      </>}
      <div className="r6-info-action">
        {historical ? <button className="button button-secondary" type="button" onClick={() => onAction({ type: 'returnToCurrentStep' })}>Tilbage til aktuelt trin</button>
          : finished ? <button className="button button-primary" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Afslutning</button>
            : active ? <button className="button button-primary" type="button"
              onClick={() => onAction(active.expected.length ? { type: 'checkPostingBlock', number: active.number } : { type: 'checkReclassificationAnswer' })}>
              {active.expected.length ? 'Kontrollér postering' : 'Kontrollér svar'}</button>
              : balanceAccount ? <button className="button button-primary" type="button"
                onClick={() => onAction({ type: 'checkFinalBalance', account: balanceAccount })}>Kontrollér saldo</button> : null}
      </div>
    </aside>
    <div className="r6-main">
      <div className="r6-references" aria-label="Godkendte beregninger fra trin 4">
        <section className="r6-reference-card" aria-label="Resultat, godkendt"><h3>Resultat · godkendt</h3>
          <div className="r6-reference-scroll" tabIndex={0}><table><thead><tr><th>Termin</th><th>Dato</th><th>Nominel rente</th><th>Amortisering</th><th>Renteomkostning i alt</th></tr></thead>
            <tbody>{state.caseResult.incomeSchedule.map((row) => <tr key={row.term} className={referenceTerm === row.term ? 'is-relevant' : ''}>
              <th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td><td>{money(row.nominalInterest)}</td><td>{money(row.amortization)}</td><td>{money(row.totalInterestExpense)}</td>
            </tr>)}</tbody></table></div></section>
        <section className="r6-reference-card" aria-label="Balance, godkendt"><h3>Balance · godkendt</h3>
          <div className="r6-reference-scroll" tabIndex={0}><table><thead><tr><th>Termin</th><th>Dato</th><th>Kostpris primo</th><th>Afdrag</th><th>Amortisering</th><th>Kostpris ultimo</th></tr></thead>
            <tbody>{state.caseResult.carryingSchedule.map((row) => <tr key={row.term} className={referenceTerm === row.term ? 'is-relevant' : ''}>
              <th scope="row">{row.term}</th><td>{dateLabel(row.date)}</td><td>{money(row.openingCarryingAmount)}</td><td>{money(row.principalRepayment)}</td><td>{money(row.amortization)}</td><td>{money(row.closingCarryingAmount)}</td>
            </tr>)}</tbody></table></div></section>
      </div>
      <div className="r6-accounts" aria-label="Permanente T-konti">{T_ACCOUNTS.map(({ number, name }) => {
        const approved = accountPostingLines(state, number);
        const pending = activeState?.lines.map((line, index) => ({ line, index })).filter(({ line }) => line.account === number) ?? [];
        const balance = state.caseResult.accountBalances?.find((entry) => entry.account === number);
        const saved = state.completion.balances[number];
        const count = accountVisibleAmountCount(state, number);
        const balanceActive = balanceAccount === number && !readOnly;
        return <section className={`r6-account ${balanceActive ? 'is-active' : ''}`} key={number} aria-label={`${number} ${name}`}>
          <h3><span>{number}</span> {name}</h3>
          <div className="r6-thead"><span>Debet</span><span>Kredit</span></div>
          <div className="r6-tsides">{(['D', 'K'] as const).map((side) => <div className="r6-tside" key={side}>
            {number === '5820' && side === 'D' && new D(state.generatedCase.caseInput.openingBankBalance).gt(0)
              && <div className="r6-posting is-opening"><span>Primo</span><strong>{money(new D(state.generatedCase.caseInput.openingBankBalance))}</strong></div>}
            {approved.filter(({ line }) => line.side === side).map(({ number: blockNumber, line }, index) => {
              const parsed = parsePostingAmount(line.amount);
              return <div className="r6-posting is-approved" key={`approved-${blockNumber}-${index}`}>
                <span aria-label={`Postering ${blockNumber}`}>{blockNumber}</span><strong>{parsed.correct && parsed.value ? money(parsed.value) : line.amount}</strong>
              </div>;
            })}
            {pending.filter(({ line }) => line.side === side).map(({ line, index }) => <div className="r6-posting is-editing" key={`pending-${index}`}>
              <span aria-label={`Postering ${active?.number}`}>{active?.number}</span>
              <input type="text" inputMode="decimal" aria-label={`${number} ${side === 'D' ? 'Debet' : 'Kredit'} beløb postering ${active?.number}`}
                placeholder="Beløb eller =" value={line.amount} disabled={readOnly} onChange={(event) => changeLine(index, event.target.value)} />
              {!readOnly && <button type="button" aria-label={`Fjern postering på ${number}`} onClick={() => removeLine(index)}>×</button>}
            </div>)}
            {!readOnly && active && active.expected.length > 0 && <button type="button" className="r6-add" onClick={() => addLine(number, side)}>+ Postering</button>}
          </div>)}</div>
          {inBalancePhase && <div className="r6-saldo">
            <strong>Saldo</strong>
            {!balance || balance.status === 'noBalance' ? <span>Ingen saldo</span>
              : balance?.status === 'balance' ? <>
                {saved?.approved ? <div className="r6-saldo-approved">
                  {saved.raw.startsWith('=') && <small>{saved.raw}</small>}
                  <span>{saved.side} · {money(balance.amount)} kr. <b aria-label="Godkendt">✓</b></span>
                </div> : <>
                  <div className="r6-saldo-controls"><div role="group" aria-label={`Saldo ${number} debet eller kredit`}>{(['D', 'K'] as const).map((side) =>
                    <label key={side}><input type="radio" name={`r6-saldo-${number}`} value={side} disabled={!balanceActive}
                      checked={saved?.side === side} onChange={() => onAction({ type: 'editFinalBalance', account: number, side })} />{side}</label>)}</div>
                    <input type="text" inputMode="decimal" aria-label={`Saldo beløb ${number}`} disabled={!balanceActive}
                      placeholder={count === 1 ? 'Indtast beløb' : 'Beregn saldoen med ='} value={saved?.raw ?? ''}
                      onChange={(event) => onAction({ type: 'editFinalBalance', account: number, formula: event.target.value })} />
                  </div>
                  {saved?.errorCode && <p className="r6-error" role="alert">{feedbackFor(saved.errorCode)}</p>}
                </>}
              </> : null}
          </div>}
        </section>;
      })}</div>
    </div>
  </div>;
}
