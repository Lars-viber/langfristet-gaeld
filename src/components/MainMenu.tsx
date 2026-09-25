import { useState } from 'react';
import type { LoanType } from '../domain';
import type { StudentState } from '../student';
import { LOAN_TYPE_LABELS } from '../app/labels';

const loanOptions: { type: LoanType; cue: string; symbol: string }[] = [
  { type: 'annuity', cue: 'Samme ydelse ved hver termin', symbol: '≈' },
  { type: 'serial', cue: 'Fast afdrag ved hver termin', symbol: '↘' },
  { type: 'bullet', cue: 'Hovedstolen betales ved udløb', symbol: '→' },
];

interface MainMenuProps {
  mode: 'menu' | 'resume' | 'corrupt' | 'legacy';
  restorable?: StudentState;
  onStart(loanType: LoanType): void;
  onContinue(): void;
  onNewCase(): void;
}

export function MainMenu({ mode, restorable, onStart, onContinue, onNewCase }: MainMenuProps) {
  const [selected, setSelected] = useState<LoanType | null>(null);
  const input = restorable?.generatedCase.caseInput;

  return (
    <main id="main-content" className="menu-page">
      <section className="menu-intro" aria-labelledby="page-title">
        <div className="menu-intro-copy">
          <p className="eyebrow">Regnskab · Niveau 1</p>
          <h1 id="page-title">Langfristet <em>gæld</em></h1>
          <p className="lead">Fra låneaftale til afsluttende afstemning. Du bygger løsningen trin for trin.</p>
          <p className="intro-note">Du skal regne – ikke programmere. Dit arbejde gemmes, så du kan fortsætte senere.</p>
        </div>
        <div className="intro-aside" aria-label="Forløbets ramme">
          <span className="aside-index">01—08</span>
          <strong>Ét lån. Otte trin.</strong>
          <p>Vælg lånetype, arbejd dig gennem opgaven, og vend tilbage til de trin du har gennemført.</p>
          <div className="aside-decoration" aria-hidden="true"><span /><span /><span /><span /></div>
        </div>
      </section>

      {mode === 'resume' && restorable && input ? (
        <section className="menu-section" aria-labelledby="resume-title">
          <div className="section-heading">
            <p className="eyebrow">Gemt arbejde</p>
            <h2 id="resume-title">Din opgave venter på dig</h2>
          </div>
          <div className="resume-card">
            <div>
              <span className="status-chip">{restorable.sessionStatus === 'completed' ? 'Gennemført' : 'I gang'}</span>
              <h3>{LOAN_TYPE_LABELS[restorable.generatedCase.loanType]}</h3>
              <p>{input.financingType === 'bank' ? 'Banklån' : 'Obligationslån'} · Lånedato {input.issueDate.split('-').reverse().join('.')}</p>
            </div>
            <div className="resume-actions">
              <button className="button button-primary" type="button" onClick={onContinue}>
                {restorable.sessionStatus === 'completed' ? 'Se afsluttet opgave' : 'Fortsæt opgave'} <span aria-hidden="true">→</span>
              </button>
              <button className="button button-text" type="button" onClick={onNewCase}>Ny opgave</button>
            </div>
          </div>
        </section>
      ) : mode === 'legacy' ? (
        <section className="menu-section" aria-labelledby="legacy-title"><div className="recovery-card" role="status"><span className="recovery-mark" aria-hidden="true">!</span><div>
          <h2 id="legacy-title">Opgaven er blevet opdateret</h2><p>Forløbet og bogføringen er ændret, så en tidligere gemt opgave kan ikke fortsættes sikkert. Start en ny opgave for at arbejde med den opdaterede version.</p>
          <button className="button button-primary" type="button" onClick={onNewCase}>Start ny opgave</button>
        </div></div></section>
      ) : mode === 'corrupt' ? (
        <section className="menu-section" aria-labelledby="corrupt-title">
          <div className="recovery-card" role="alert">
            <span className="recovery-mark" aria-hidden="true">!</span>
            <div>
              <h2 id="corrupt-title">Den gemte opgave kan ikke åbnes</h2>
              <p>Den gemte opgave kan ikke åbnes. Du kan starte en ny opgave.</p>
              <button className="button button-primary" type="button" onClick={onNewCase}>Start ny opgave</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="menu-section" aria-labelledby="choose-title">
          <div className="section-heading">
            <p className="eyebrow">Begynd her</p>
            <h2 id="choose-title">Vælg lånetype</h2>
            <p>Du vælger selv lånetypen. Casen oprettes først, når du trykker Start opgave.</p>
          </div>
          <div className="loan-grid" role="group" aria-label="Vælg lånetype">
            {loanOptions.map(({ type, cue, symbol }, index) => (
              <button
                className={`loan-card ${selected === type ? 'is-selected' : ''}`}
                key={type}
                type="button"
                aria-pressed={selected === type}
                onClick={() => setSelected(type)}
              >
                <span className="loan-card-top"><span className="loan-index">0{index + 1}</span><span className="loan-symbol" aria-hidden="true">{symbol}</span></span>
                <strong>{LOAN_TYPE_LABELS[type]}</strong>
                <span className="loan-cue">{cue}</span>
                <span className="loan-card-bottom">{selected === type ? 'Valgt' : 'Vælg lån'} <span aria-hidden="true">↗</span></span>
              </button>
            ))}
          </div>
          <div className="start-row">
            <p>{selected ? `${LOAN_TYPE_LABELS[selected]} er valgt.` : 'Vælg et lån for at fortsætte.'}</p>
            <button className="button button-primary" type="button" disabled={!selected} onClick={() => selected && onStart(selected)}>
              Start opgave <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
