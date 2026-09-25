import { AppShell } from './AppShell';
import { useSession } from './useSession';
import { MainMenu } from '../components/MainMenu';

export function App() {
  const { screen, notice, start, resume, dispatch, reset, newCase } = useSession();

  return (
    <div className="site">
      <a className="skip-link" href="#main-content">Spring til indhold</a>
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
