// Civilization creator: trait sliders with a live personality profile.
import { Dice5, Trash2 } from 'lucide-react';
import { CivConfig, TRAIT_KEYS, Traits } from '../simulation/types';
import { TECHNOLOGIES } from '../simulation/Technology';
import { CIV_COLORS } from '../simulation/names';
import { useLang, useT } from '../i18n';

/** UI-only descriptor keys (rendered via `tag.<key>`) — never feed the simulation. */
export function civProfile(traits: Traits): string[] {
  const tags: string[] = [];
  if (traits.science >= 70) tags.push('scientific');
  if (traits.aggression >= 70) tags.push('warlike');
  else if (traits.aggression <= 30) tags.push('peaceful');
  if (traits.trade >= 70) tags.push('merchant');
  if (traits.migration >= 70) tags.push('nomadic');
  else if (traits.migration <= 30) tags.push('lowMigration');
  if (traits.expansion >= 70) tags.push('expansionist');
  if (traits.diplomacy >= 70) tags.push('diplomatic');
  if (traits.riskTaking >= 70) tags.push('reckless');
  else if (traits.riskTaking <= 30) tags.push('cautious');
  if (traits.birthRate >= 70) tags.push('fertile');
  if (tags.length === 0) tags.push('balanced');
  return tags.slice(0, 5);
}

interface Props {
  civ: CivConfig;
  onChange: (civ: CivConfig) => void;
  onRemove?: () => void;
  onRandomize?: () => void;
}

const STARTABLE_TECHS = TECHNOLOGIES.filter((t) => t.tier === 1); // neolithic package

export function CivEditor({ civ, onChange, onRemove, onRandomize }: Props): JSX.Element {
  const t = useT();
  const lang = useLang();
  const setTrait = (key: keyof Traits, value: number): void => {
    onChange({ ...civ, traits: { ...civ.traits, [key]: value } });
  };

  const toggleTech = (id: string): void => {
    const has = civ.startTechs.includes(id);
    const startTechs = has ? civ.startTechs.filter((x) => x !== id) : [...civ.startTechs, id];
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
            <button className="icon-btn" onClick={onRandomize} title={t('civ.randomize')}>
              <Dice5 size={15} />
            </button>
          )}
          {onRemove && (
            <button className="icon-btn" onClick={onRemove} title={t('civ.remove')}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="field-row">
        <label>{t('civ.startPop')}</label>
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
            <span className="trait-label">{t(`trait.${key}`)}</span>
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
        <label>{t('civ.startTech')}</label>
        <div className="tech-checks">
          {STARTABLE_TECHS.map((tech) => (
            <label key={tech.id} className="check">
              <input type="checkbox" checked={civ.startTechs.includes(tech.id)} onChange={() => toggleTech(tech.id)} />
              {lang === 'zh' ? tech.nameZh : tech.name}
            </label>
          ))}
        </div>
      </div>

      <div className="profile-box">
        <div className="profile-name" style={{ color: civ.color }}>{civ.name || '—'}</div>
        <div className="profile-tags">
          {civProfile(civ.traits).map((tag) => (
            <span className="tag" key={tag}>{t(`tag.${tag}`)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
