// "World History" modal: headline stats + generated narrative + export.
import { X, Download } from 'lucide-react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { exportHistoryText, summarizeWorld } from '../utils/history';

export function HistorySummary({ universe }: { universe: Universe }): JSX.Element | null {
  const showSummary = useSimulatorStore((s) => s.showSummary);
  const setShowSummary = useSimulatorStore((s) => s.setShowSummary);
  if (!showSummary || !universe.snapshot) return null;

  const summary = summarizeWorld(universe.snapshot, universe.events);

  const download = (): void => {
    const text = exportHistoryText(universe.snapshot!, universe.events);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-history-year-${universe.snapshot!.year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowSummary(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>WORLD HISTORY</h2>
          <div>
            <button className="icon-btn" onClick={download} title="Export history as text">
              <Download size={16} />
            </button>
            <button className="icon-btn" onClick={() => setShowSummary(false)} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="summary-headline">
          {summary.headline.map((h) => (
            <div className="big-stat" key={h.label}>
              <span className="big-stat-value">{h.value}</span>
              <span className="big-stat-label">{h.label}</span>
            </div>
          ))}
        </div>
        <div className="summary-narrative">
          {summary.narrative.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
