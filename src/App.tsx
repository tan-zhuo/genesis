import { useEffect } from 'react';
import { Landing } from './components/Landing';
import { WorldSetup } from './components/WorldSetup';
import { SimulatorShell } from './components/SimulatorShell';
import { useSimulatorStore } from './state/simulatorStore';
import { configFromUrl } from './utils/serialization';

export default function App(): JSX.Element {
  const screen = useSimulatorStore((s) => s.screen);
  const createUniverse = useSimulatorStore((s) => s.createUniverse);
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const showToast = useSimulatorStore((s) => s.showToast);

  // Open a shared world from ?seed=...&config=...
  useEffect(() => {
    const cfg = configFromUrl(window.location.search);
    if (cfg) {
      createUniverse(cfg, 'Shared World', true);
      setScreen('simulator');
      showToast(`Loaded shared world (seed ${cfg.seed})`);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const toast = useSimulatorStore((s) => s.toast);

  return (
    <>
      {screen === 'landing' && <Landing />}
      {screen === 'setup' && <WorldSetup />}
      {screen === 'simulator' && <SimulatorShell />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
