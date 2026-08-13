// The observer's hand: divine intervention tools. Pick a tool, click the map.
import { useEffect } from 'react';
import { InterventionType } from '../simulation/types';
import { useSimulatorStore } from '../state/simulatorStore';
import { useT } from '../i18n';

export const GOD_TOOLS: { id: InterventionType; icon: string; radius: number }[] = [
  { id: 'meteor', icon: '☄️', radius: 4 },
  { id: 'plague', icon: '🦠', radius: 14 },
  { id: 'quake', icon: '🌋', radius: 6 },
  { id: 'blight', icon: '🥀', radius: 7 },
  { id: 'bless', icon: '✨', radius: 7 },
  { id: 'spawnCiv', icon: '🏕', radius: 1 },
  { id: 'goldenAge', icon: '🌟', radius: 0 },
  { id: 'inciteWar', icon: '🗡', radius: 0 },
  { id: 'forcePeace', icon: '🕊', radius: 0 },
];

export function GodToolbar(): JSX.Element {
  const godTool = useSimulatorStore((s) => s.godTool);
  const setGodTool = useSimulatorStore((s) => s.setGodTool);
  const t = useT();

  // Esc cancels the active tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setGodTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setGodTool]);

  return (
    <div className="god-toolbar" data-tutorial="god">
      <div className="god-toolbar-label">{t('god.title')}</div>
      {GOD_TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`god-btn ${godTool === tool.id ? 'god-active' : ''}`}
          onClick={() => setGodTool(godTool === tool.id ? null : tool.id)}
          title={`${t(`god.${tool.id}`)} — ${t(`god.${tool.id}.desc`)}`}
        >
          <span className="god-icon">{tool.icon}</span>
        </button>
      ))}
      {godTool && (
        <div className="god-hint">
          {t(`god.${godTool}`)}: {t('god.clickMap')}
        </div>
      )}
    </div>
  );
}
