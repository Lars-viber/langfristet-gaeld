import { AppShell } from './AppShell';
import { useSession } from './useSession';
import { MainMenu } from '../components/MainMenu';

export function App() {
  const { screen, notice, start, resume, dispatch, reset, newCase } = useSession();

  return (
    <div className="site">
      <a className="skip-link" href="#main-content">Spring til indhold</a>
      {screen.kind !== 'active' && <header className="site-bar">
        <div className="site-bar-inner">
          <div className="brand" aria-label="Langfristet gæld"><span className="brand-mark" aria-hidden="true">LG</span><span>Langfristet gæld<small>Økonomi i praksis</small></span></div>
          <span className="site-level">Niveau 1 · 2026</span>
        </div>
      </header>}
      {notice && <div className="site-notice" role="alert">{notice}</div>}
      {screen.kind === 'loading' ? (
        <main id="main-content" className="loading-page" aria-busy="true"><div className="loading-indicator" aria-hidden="true" /><p>Åbner din opgave…</p></main>
      ) : screen.kind === 'active' ? (
        <AppShell state={screen.state} onAction={dispatch} onReset={reset} onNewCase={newCase} />
      ) : (
        <MainMenu
          mode={screen.kind}
          restorable={screen.kind === 'resume' ? screen.state : undefined}
          onStart={start}
          onContinue={resume}
          onNewCase={newCase}
        />
      )}
      <footer className="site-footer"><span>Langfristet gæld · Niveau 1</span><span>Dit arbejde gemmes i denne browser</span></footer>
    </div>
  );
}
