// Civilization creator: trait sliders with a live personality profile.
import { Dice5, Trash2 } from 'lucide-react';
import { CivConfig, TRAIT_KEYS, Traits } from '../simulation/types';
import { TECHNOLOGIES } from '../simulation/Technology';
import { CIV_COLORS } from '../simulation/names';

const TRAIT_LABELS: Record<keyof Traits, string> = {
  aggression: 'Aggression',
  trade: 'Trade',
  science: 'Science',
  migration: 'Migration',
  expansion: 'Expansion',
  diplomacy: 'Diplomacy',
  birthRate: 'Birth Rate',
  riskTaking: 'Risk Taking',
};

/** UI-only descriptors — they never feed the simulation. */
export function civProfile(traits: Traits): string[] {
  const tags: string[] = [];
  if (traits.science >= 70) tags.push('Scientific');
  if (traits.aggression >= 70) tags.push('Warlike');
  else if (traits.aggression <= 30) tags.push('Peaceful');
  if (traits.trade >= 70) tags.push('Merchant');
  if (traits.migration >= 70) tags.push('Nomadic');
  else if (traits.migration <= 30) tags.push('Low Migration');
  if (traits.expansion >= 70) tags.push('Expansionist');
  if (traits.diplomacy >= 70) tags.push('Diplomatic');
  if (traits.riskTaking >= 70) tags.push('Reckless');
  else if (traits.riskTaking <= 30) tags.push('Cautious');
  if (traits.birthRate >= 70) tags.push('Fertile');
  if (tags.length === 0) tags.push('Balanced');
  return tags.slice(0, 5);
}

interface Props {
  civ: CivConfig;
  onChange: (civ: CivConfig) => void;
  onRemove?: () => void;
  onRandomize?: () => void;
}

const STARTABLE_TECHS = TECHNOLOGIES.slice(1, 6); // agriculture..navigation

export function CivEditor({ civ, onChange, onRemove, onRandomize }: Props): JSX.Element {
  const setTrait = (key: keyof Traits, value: number): void => {
    onChange({ ...civ, traits: { ...civ.traits, [key]: value } });
  };

  const toggleTech = (id: string): void => {
    const has = civ.startTechs.includes(id);
    const startTechs = has ? civ.startTechs.filter((t) => t !== id) : [...civ.startTechs, id];
    if (!startTechs.includes('survival')) startTechs.unshift('survival');
    onChange({ ...civ, startTechs });
  };

  return (
    <div className="civ-editor">
      <div className="civ-editor-head">
        <input
          className="input civ-name-input"
          value={civ.name}
          maxLength={24}
          onChange={(e) => onChange({ ...civ, name: e.target.value })}
          aria-label="Civilization name"
        />
        <div className="color-swatches">
          {CIV_COLORS.slice(0, 10).map((c) => (
            <button
              key={c}
              className={`swatch ${civ.color === c ? 'swatch-active' : ''}`}
              style={{ background: c }}
              onClick={() => onChange({ ...civ, color: c })}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="civ-editor-actions">
          {onRandomize && (
            <button className="icon-btn" onClick={onRandomize} title="Randomize traits">
              <Dice5 size={15} />
            </button>
          )}
          {onRemove && (
            <button className="icon-btn" onClick={onRemove} title="Remove civilization">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="field-row">
        <label>Starting population</label>
        <input
          className="input input-num"
          type="number"
          min={100}
          max={100000}
          value={civ.startPopulation}
          onChange={(e) => onChange({ ...civ, startPopulation: Math.max(100, Math.min(100000, Number(e.target.value) || 1200)) })}
        />
      </div>

      <div className="trait-sliders">
        {TRAIT_KEYS.map((key) => (
          <div className="trait-row" key={key}>
            <span className="trait-label">{TRAIT_LABELS[key]}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={civ.traits[key]}
              onChange={(e) => setTrait(key, Number(e.target.value))}
              style={{ accentColor: civ.color }}
            />
            <span className="trait-value">{civ.traits[key]}</span>
          </div>
        ))}
      </div>

      <div className="field-row">
        <label>Starting technology</label>
        <div className="tech-checks">
          {STARTABLE_TECHS.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={civ.startTechs.includes(t.id)} onChange={() => toggleTech(t.id)} />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      <div className="profile-box">
        <div className="profile-name" style={{ color: civ.color }}>{civ.name || 'Unnamed'}</div>
        <div className="profile-tags">
          {civProfile(civ.traits).map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
