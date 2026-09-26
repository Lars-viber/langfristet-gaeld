import { lastManualTermValues } from '../domain';
import { amortizationSubrowStatus, deriveStudentView } from '../student';
import type { BalanceField, IncomeField, StudentAction, StudentState } from '../student/types';
import type { ValidationErrorCode } from '../validation';
import { ValidationMessage } from './ValidationMessage';

type Subtable = 'income' | 'balance';
type Column = IncomeField | BalanceField;
const incomeColumns: IncomeField[] = ['nominalInterest', 'amortization', 'totalInterestExpense'];
const balanceColumns: BalanceField[] = ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'];
const labels: Record<Column, string> = {
  nominalInterest: 'Nominel rente', amortization: 'Amortisering', totalInterestExpense: 'Renteomkostning i alt',
  openingCarryingAmount: 'Kostpris primo', principalRepayment: 'Afdrag', closingCarryingAmount: 'Kostpris ultimo',
};
const dateLabel = (date: string) => date.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => {
  const [whole, fraction] = value.toFixed(2).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};
const isTransfer = (subtable: Subtable, column: Column) => subtable === 'income' ? column === 'nominalInterest'
  : column === 'openingCarryingAmount' || column === 'principalRepayment' || column === 'amortization';

export function AmortizationStep({ state, onAction, readOnly }: {
  state: StudentState; onAction(action: StudentAction): void; readOnly: boolean;
}) {
  const view = deriveStudentView(state);
  const count = state.caseResult.contract.rows.length;
  const standing = state.generatedCase.loanType === 'bullet';
  const historical = state.viewingStep !== state.currentStep;
  const canContinue = state.completedSteps.includes('amortizedCost') && !readOnly && !historical;
  const activeTerm = readOnly ? null : view.activeAmortizationTerm;
  const activeSubtable = readOnly ? null : view.activeAmortizationSubtable;
  const payment = activeTerm === null ? null : state.caseResult.contract.rows[activeTerm - 1];
  const priorCost = activeTerm && activeTerm > 1 && amortizationSubrowStatus(state, activeTerm - 1, 'balance') !== 'locked'
    ? state.caseResult.carryingSchedule[activeTerm - 2]?.closingCarryingAmount : null;
  const manualLast = standing ? lastManualTermValues(state.caseResult.incomeSchedule[count - 1]!,
    state.caseResult.carryingSchedule[count - 1]!, state.caseResult.effectiveInterest.rate) : null;
  const adjusted = Boolean(manualLast && state.amortization.terms[count]?.approved && !manualLast.adjustment.isZero());
  const instruction = standing
    ? 'Din opgave: Udfyld termin 1, termin 2 og sidste termin. Når de er korrekte, beregner appen de øvrige terminer.'
    : 'Din opgave: Udfyld termin 1 og termin 2. Når begge terminer er korrekte, beregner appen de resterende terminer.';

  function table(subtable: Subtable) {
    const columns: Column[] = subtable === 'income' ? incomeColumns : balanceColumns;
    const title = subtable === 'income' ? 'Resultat' : 'Balance';
    const rows = subtable === 'income' ? state.caseResult.incomeSchedule : state.caseResult.carryingSchedule;
    const active = activeTerm !== null && activeSubtable === subtable;
    return <section className={`work-card amortization-table-card ${active ? 'is-active-table' : ''}`} aria-label={title} key={subtable}>
      <div className="amortization-table-top"><div><h3>{title}</h3><p className="amortization-instruction">{instruction}</p></div>
        {active && <button className="button button-primary" type="button" onClick={() => onAction({ type: 'checkAmortizationSubrow', term: activeTerm, subtable })}>
          Kontrollér {title.toLowerCase()} termin {activeTerm}</button>}</div>
      <p className="amortization-equation">{subtable === 'income'
        ? 'Nominel rente + Amortisering = Renteomkostning i alt'
        : 'Kostpris primo − Afdrag + Amortisering = Kostpris ultimo'}</p>
      <div className="table-scroll amortization-scroll" role="region" aria-label={`Vandret rulbar tabel: ${title}`} tabIndex={0}>
        <table className="finance-table amortization-table"><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>
          {columns.map((column) => <th scope="col" key={column}>{labels[column]}</th>)}</tr></thead>
          <tbody>{rows.map((row) => {
            const status = amortizationSubrowStatus(state, row.term, subtable);
            const saved = state.amortization.terms[row.term]?.[subtable] as Partial<Record<Column, { raw: string; approved: boolean; errorCode: ValidationErrorCode | null }>> | undefined;
            return <tr key={row.term} className={`row-${status}`}><th scope="row">{row.term}{status === 'approved' && <span className="amortization-row-check" aria-label="Godkendt">✓</span>}</th>
              <td>{dateLabel(row.date)}</td>{columns.map((column) => {
                const entry = saved?.[column];
                const id = `amortization-${subtable}-${row.term}-${column}`;
                const authoritative = row[column as keyof typeof row] as { toFixed(places: number): string };
                const ordinary = standing && row.term === count && manualLast &&
                  (column === 'totalInterestExpense' || column === 'amortization' || column === 'closingCarryingAmount')
                  ? manualLast[column] : authoritative;
                const adjustedCell = adjusted && row.term === count &&
                  (column === 'totalInterestExpense' || column === 'amortization' || column === 'closingCarryingAmount');
                return <td key={column}>{status === 'appCalculated' ? <span className="calculated-value">{money(authoritative)}</span>
                  : status === 'locked' ? <span className="empty-value">—</span>
                    : <div className={`table-field amortization-field ${entry?.approved ? 'is-approved' : ''}`}>
                      <input id={id} aria-label={`Termin ${row.term}, ${title}, ${labels[column]}`} type="text" inputMode="decimal"
                        autoComplete="off" spellCheck={false} value={entry?.raw ?? ''}
                        placeholder={isTransfer(subtable, column) ? 'Indtast beløb'
                          : column === 'amortization' || column === 'closingCarryingAmount' ? 'Beregn et positivt beløb med =' : 'Beregn med ='}
                        readOnly={readOnly || Boolean(entry?.approved)}
                        onChange={(event) => onAction({ type: 'editAmortizationField', term: row.term, subtable, field: column, raw: event.target.value })}
                        aria-invalid={entry?.errorCode ? true : undefined}
                        aria-describedby={entry?.errorCode ? `${id}-feedback` : undefined} />
                      {entry?.approved && <span className="amortization-result">{money(ordinary)} kr. <span aria-label="Godkendt">✓</span></span>}
                      {adjustedCell && <span className="amortization-adjusted">Efter afrunding: {money(authoritative)} kr.</span>}
                      <ValidationMessage code={entry?.errorCode ?? null} id={`${id}-feedback`} />
                    </div>}</td>;
              })}</tr>;
          })}</tbody></table>
      </div>
      {adjusted && subtable === 'balance' && manualLast && <p className="amortization-rounding-note" role="status">
        Afrundingsregulering: Appen {manualLast.adjustment.isNegative() ? 'reducerer' : 'øger'} sidste termins amortisering med {money(manualLast.adjustment.abs())} kr., så kostpris ultimo bliver 0,00 kr.
      </p>}
    </section>;
  }

  return <div className="step-work amortization-work r4-amortization-work">
    <aside className="amortization-reference" aria-label="Vejledning til amortiseret kostpris">
      <h2 id="step-heading">Amortiseret kostpris</h2>
      <p>Beregn lånets renteomkostning og udviklingen i den amortiserede kostpris.</p>
      <dl><div><dt>Godkendt provenu</dt><dd>{money(state.caseResult.proceeds.proceeds)} kr.</dd></div>
        <div><dt>Effektiv rente pr. termin</dt><dd>{state.caseResult.effectiveInterest.displayedPercent.replace('.', ',')} %</dd></div></dl>
      <p>Appen anvender den fulde beregnede præcision for den effektive rente.</p>
      {activeTerm !== null && payment && <div className="amortization-current-reference"><strong>Termin {activeTerm} · {dateLabel(payment.date)}</strong>
        <dl><div><dt>Nominel rente</dt><dd>{money(payment.nominalInterest)} kr.</dd></div>
          <div><dt>Afdrag</dt><dd>{money(payment.principalRepayment)} kr.</dd></div>
          {priorCost && <div><dt>Forrige kostpris ultimo</dt><dd>{money(priorCost)} kr.</dd></div>}</dl></div>}
      {historical && <p className="amortization-history-note" role="status">Du ser et tidligere trin. Trinnet er skrivebeskyttet.</p>}
      {historical ? <button className="button button-secondary amortization-continue" type="button" onClick={() => onAction({ type: 'returnToCurrentStep' })}>Tilbage til aktuelt trin</button>
        : canContinue && <button className="button button-primary amortization-continue" type="button" onClick={() => onAction({ type: 'continueToNextStep' })}>Fortsæt til Kort/lang</button>}
    </aside>
    <div className="amortization-main">{table('income')}{table('balance')}</div>
  </div>;
}
