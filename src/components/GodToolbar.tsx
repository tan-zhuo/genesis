// The observer's hand: divine intervention tools. Pick a tool, click the map.
import { useEffect } from 'react';
import { InterventionType } from '../simulation/types';
import { useSimulatorStore } from '../state/simulatorStore';
import { useT } from '../i18n';
import { GOD_TOOL_ICONS } from './icons';

export const GOD_TOOLS: { id: InterventionType; radius: number }[] = [
  { id: 'meteor', radius: 4 },
  { id: 'plague', radius: 14 },
  { id: 'quake', radius: 6 },
  { id: 'blight', radius: 7 },
  { id: 'bless', radius: 7 },
  { id: 'spawnCiv', radius: 1 },
  { id: 'goldenAge', radius: 0 },
  { id: 'inciteWar', radius: 0 },
  { id: 'forcePeace', radius: 0 },
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
      {GOD_TOOLS.map((tool) => {
        const Icon = GOD_TOOL_ICONS[tool.id];
        return (
          <button
            key={tool.id}
            className={`god-btn ${godTool === tool.id ? 'god-active' : ''}`}
            onClick={() => setGodTool(godTool === tool.id ? null : tool.id)}
            title={`${t(`god.${tool.id}`)} — ${t(`god.${tool.id}.desc`)}`}
          >
            <Icon size={16} />
          </button>
        );
      })}
      {godTool && (
        <div className="god-hint">
          {t(`god.${godTool}`)}: {t('god.clickMap')}
        </div>
      )}
    </div>
  );
}
