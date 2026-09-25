import { useEffect, useMemo, useState } from 'react';
import type { LoanType } from '../domain';
import { clearStudentSession, createLegacyLocalStorageAdapter, createLocalStorageAdapter } from '../persistence';
import type { PersistenceErrorCode } from '../persistence';
import type { StudentAction, StudentState } from '../student';
import { clearAppSession, loadAppSession, startStudentCase, transitionStudentSession } from './controller';

export type Screen =
  | { kind: 'loading' }
  | { kind: 'menu' }
  | { kind: 'resume'; state: StudentState }
  | { kind: 'legacy' }
  | { kind: 'corrupt'; code: PersistenceErrorCode }
  | { kind: 'active'; state: StudentState };

export function useSession() {
  const adapter = useMemo(() => createLocalStorageAdapter(), []);
  const legacyAdapter = useMemo(() => createLegacyLocalStorageAdapter(), []);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadAppSession(adapter);
    if (loaded.status === 'restored') setScreen({ kind: 'resume', state: loaded.state });
    else if (loaded.status === 'empty') {
      try { setScreen(legacyAdapter.load() === null ? { kind: 'menu' } : { kind: 'legacy' }); }
      catch { setScreen({ kind: 'corrupt', code: 'STORAGE_ERROR' }); }
    }
    else setScreen({ kind: 'corrupt', code: loaded.code });
  }, [adapter, legacyAdapter]);

  function start(loanType: LoanType | null): void {
    const result = startStudentCase(adapter, loanType);
    if (result.status === 'started') {
      setNotice(null);
      setScreen({ kind: 'active', state: result.state });
    } else if (result.status === 'error') {
      setNotice(result.reason === 'storage'
        ? 'Opgaven kunne ikke gemmes. Prøv igen, når browserens lager er tilgængeligt.'
        : 'Opgaven kunne ikke oprettes. Prøv igen.');
    }
  }

  function resume(): void {
    if (screen.kind !== 'resume') return;
    setNotice(null);
    setScreen({ kind: 'active', state: screen.state });
  }

  function dispatch(action: StudentAction): void {
    if (screen.kind !== 'active') return;
    const result = transitionStudentSession(adapter, screen.state, action);
    if (!result.changed) return;
    setScreen({ kind: 'active', state: result.state });
    setNotice(result.saveError
      ? 'Ændringen er synlig, men kunne ikke gemmes. Prøv igen, før du lukker siden.'
      : null);
  }

  function reset(): void {
    if (screen.kind !== 'active') return;
    if (!globalThis.confirm('Start den samme opgave forfra? Dine svar og din fremgang slettes.')) return;
    dispatch({ type: 'resetCurrentCase' });
  }

  function newCase(): void {
    if (screen.kind !== 'legacy' && !globalThis.confirm('Start en ny opgave? Den gemte opgave og dine svar slettes.')) return;
    const result = clearAppSession(adapter);
    if (result.status === 'error') {
      setNotice('Den gemte opgave kunne ikke slettes. Prøv igen.');
      return;
    }
    const legacyResult = clearStudentSession(legacyAdapter);
    if (legacyResult.status === 'error') {
      setNotice('Den tidligere gemte opgave kunne ikke slettes. Prøv igen.');
      return;
    }
    setNotice(null);
    setScreen({ kind: 'menu' });
  }

  return { screen, notice, start, resume, dispatch, reset, newCase };
}
