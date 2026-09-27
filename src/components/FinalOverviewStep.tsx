import { lastManualTermValues } from '../domain';
import { D } from '../domain/decimal';
import { accountPostingLines, T_ACCOUNTS } from '../student/bookkeeping';
import type { BalanceField, IncomeField, ProceedsField, ScheduleField, StudentAction, StudentState } from '../student/types';
import { parsePostingAmount } from '../validation';

const date = (raw: string) => raw.split('-').reverse().join('.');
const money = (value: { toFixed(places: number): string }) => value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const income: IncomeField[] = ['nominalInterest', 'amortization', 'totalInterestExpense'];
const balance: BalanceField[] = ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'];
const incomeNames = ['Nominel rente', 'Amortisering', 'Renteomkostning i alt'];
const balanceNames = ['Kostpris primo', 'Afdrag', 'Amortisering', 'Kostpris ultimo'];
const schedule: ScheduleField[] = ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'];

function WorkValue({ raw, value }: { raw?: string; value: string }) {
  return <span className="r7-value">{raw && <small title={raw}>{raw}</small>}<strong>{value}</strong></span>;
}

export function FinalOverviewStep({ state, onAction }: { state: StudentState; onAction(action: StudentAction): void }) {
  const result = state.caseResult;
  const completed = state.sessionStatus === 'completed';
  const proceedsKeys: ProceedsField[] = state.generatedCase.caseInput.financingType === 'bank'
    ? ['variableCost', 'proceeds'] : ['marketValue', 'brokerage', 'proceeds'];
  const proceedsNames: Record<ProceedsField, string> = {
    variableCost: 'Variable låneomkostninger', marketValue: 'Kursværdi', brokerage: 'Kurtage', proceeds: 'Provenu',
  };
  const proceedsValues = result.proceeds;
  const last = result.contract.rows.length;
  const ordinaryLast = state.generatedCase.loanType === 'bullet'
    ? lastManualTermValues(result.incomeSchedule[last - 1]!, result.carryingSchedule[last - 1]!, result.effectiveInterest.rate) : null;
  const adjusted = ordinaryLast && !ordinaryLast.adjustment.isZero();
  const approvedBalanceCount = Object.values(state.completion.balances).filter((entry) => entry.approved).length;
  const reconciled = Object.values(state.completion.checks).every(Boolean);

  return <div className="step-work r7-work">
    <aside className="classification-reference r7-info" aria-label="Vejledning til afslutning">
      <h2 id="step-heading">Afslutning</h2>
      <p>Gennemgå din samlede løsning, før du afslutter Niveau 1.</p>
      {completed && <p className="r7-complete" role="status">✓ Niveau 1 er afsluttet</p>}
    </aside>
    <div className="r7-main">
      <section className="r7-section" aria-label="Provenu"><h3>Provenu</h3>
        <div className="r7-proceeds">{proceedsKeys.map((key) => {
          const amount = key === 'proceeds' ? proceedsValues.proceeds : key === 'variableCost'
            ? proceedsValues.financingType === 'bank' ? proceedsValues.variableCost : null
            : key === 'marketValue' ? proceedsValues.financingType === 'bond' ? proceedsValues.marketValue : null
              : proceedsValues.financingType === 'bond' ? proceedsValues.brokerage : null;
          return <div key={key}><span>{proceedsNames[key]}</span><WorkValue raw={state.proceeds[key]?.raw} value={`${amount ? money(amount) : '—'} kr.`} /></div>;
        })}</div>
      </section>
      <section className="r7-section" aria-label="Ydelsesplan"><h3>Ydelsesplan</h3>
        <div className="r7-table-scroll" tabIndex={0}><table className="finance-table r7-table"><thead><tr>
          {['Termin', 'Dato', 'Restgæld primo', 'Ydelse', 'Rente', 'Afdrag', 'Restgæld ultimo'].map((label) => <th scope="col" key={label}>{label}</th>)}
        </tr></thead><tbody>{result.contract.rows.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{date(row.date)}</td>
          {schedule.map((field) => <td key={field}><WorkValue raw={state.schedule.rows[row.term]?.[field]?.raw} value={money(row[field])} /></td>)}
        </tr>)}</tbody></table></div>
      </section>
      <section className="r7-section" aria-label="Pengestrømme"><h3>Pengestrømme</h3>
        <div className="r7-table-scroll" tabIndex={0}><table className="finance-table r7-table"><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th><th scope="col">Fortegn</th><th scope="col">Beløb</th></tr></thead>
          <tbody>{result.cashFlows.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{date(row.date)}</td><td>{row.direction === 'inflow' ? '+' : '−'}</td>
            <td><WorkValue raw={state.effectiveInterest.rows[row.term]?.amount} value={money(row.amount)} /></td></tr>)}</tbody></table></div>
      </section>
      <section className="r7-section r7-rate" aria-label="Effektiv rente"><h3>Effektiv rente pr. termin</h3><strong>{result.effectiveInterest.displayedPercent.replace('.', ',')} %</strong></section>
      {(['income', 'balance'] as const).map((table) => {
        const rows = table === 'income' ? result.incomeSchedule : result.carryingSchedule;
        const columns = table === 'income' ? income : balance;
        return <section className="r7-section" aria-label={`Amortiseret kostpris – ${table === 'income' ? 'Resultat' : 'Balance'}`} key={table}>
          <h3>Amortiseret kostpris – {table === 'income' ? 'Resultat' : 'Balance'}</h3>
          <div className="r7-table-scroll" tabIndex={0}><table className="finance-table r7-table"><thead><tr><th scope="col">Termin</th><th scope="col">Dato</th>
            {(table === 'income' ? incomeNames : balanceNames).map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{date(row.date)}</td>
              {columns.map((column) => {
                const saved = state.amortization.terms[row.term]?.[table][column as keyof (typeof state.amortization.terms)[number][typeof table]];
                const authoritative = row[column as keyof typeof row] as { toFixed(places: number): string };
                const ordinary = adjusted && row.term === last && ordinaryLast &&
                  (column === 'totalInterestExpense' || column === 'amortization' || column === 'closingCarryingAmount')
                  ? ordinaryLast[column] : authoritative;
                return <td key={column}><WorkValue raw={saved?.raw} value={money(ordinary)} />
                  {ordinary !== authoritative && <small className="r7-adjusted">Efter afrunding: {money(authoritative)}</small>}</td>;
              })}</tr>)}</tbody></table></div>
          {table === 'balance' && adjusted && <p className="r7-rounding">Afrundingsregulering: Appen {ordinaryLast.adjustment.isNegative() ? 'reducerer' : 'øger'} sidste termins amortisering med {money(ordinaryLast.adjustment.abs())} kr., så kostpris ultimo bliver 0,00 kr.</p>}
        </section>;
      })}
      <section className="r7-section" aria-label="Kortfristet og langfristet del"><h3>Kortfristet og langfristet del</h3>
        <div className="r7-proceeds"><div><span>Amortiseret kostpris pr. 31.12.2026</span><WorkValue raw={state.classification.fields.carryingAmount?.raw} value={`${money(result.classification.carryingAmount)} kr.`} /></div>
          <div><span>− Kortfristet del</span><WorkValue raw={state.classification.fields.shortTerm?.raw} value={`${money(result.classification.shortTerm)} kr.`} /></div>
          <div><span>= Langfristet del</span><WorkValue raw={state.classification.fields.longTerm?.raw} value={`${money(result.classification.longTerm)} kr.`} /></div></div>
      </section>
      <section className="r7-section" aria-label="Bogføring og slutsaldi"><h3>Bogføring og slutsaldi på T-konti</h3>
        <div className="r6-accounts r7-accounts">{T_ACCOUNTS.map(({ number, name }) => {
          const postings = accountPostingLines(state, number);
          const accountBalance = result.accountBalances?.find((entry) => entry.account === number);
          const saved = state.completion.balances[number];
          return <section className="r6-account" key={number} aria-label={`${number} ${name}`}><h4><span>{number}</span> {name}</h4>
            <div className="r6-thead"><span>Debet</span><span>Kredit</span></div><div className="r6-tsides">{(['D', 'K'] as const).map((side) => <div className="r6-tside" key={side}>
              {number === '5820' && side === 'D' && new D(state.generatedCase.caseInput.openingBankBalance).gt(0) &&
                <div className="r6-posting is-opening"><span>Saldo primo</span><strong>{money(new D(state.generatedCase.caseInput.openingBankBalance))}</strong></div>}
              {postings.filter(({ line }) => line.side === side).map(({ number: postingNumber, line }, index) => {
                const parsed = parsePostingAmount(line.amount);
                return <div className="r6-posting is-approved" key={`${postingNumber}-${index}`}><span aria-label={`Postering ${postingNumber}`}>{postingNumber}</span>
                  <span className="r7-posting-value">{line.amount.trim().startsWith('=') && <small title={line.amount}>{line.amount}</small>}<strong>{parsed.value ? money(parsed.value) : line.amount}</strong></span></div>;
              })}</div>)}</div>
            <div className="r6-saldo"><strong>Saldo</strong>{accountBalance?.status === 'balance' && saved?.approved
              ? <div className="r6-saldo-approved">{saved.raw && <small title={saved.raw}>{saved.raw}</small>}<span>{saved.side} · {money(accountBalance.amount)} kr. <b aria-label="Godkendt">✓</b></span></div>
              : <span>Ingen saldo</span>}</div>
          </section>;
        })}</div>
      </section>
      <section className="r7-section r7-status" aria-label="Afslutningsstatus"><h3>Afslutningsstatus</h3>
        <p>Trin 1–6 er godkendt. {approvedBalanceCount} saldi er godkendt. {reconciled ? 'Afstemningen er godkendt.' : 'Afstemningsstatus fremgår af Bogføring.'} {completed ? 'Niveau 1 er afsluttet.' : 'Gennemgå løsningen og afslut Niveau 1.'}</p>
      </section>
      {!completed && <div className="r7-final-action"><button className="button button-primary" type="button" onClick={() => onAction({ type: 'finishLevel1' })}>Afslut Niveau 1</button></div>}
    </div>
  </div>;
}
