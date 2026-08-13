// World creation wizard: world parameters, civilizations, rules.
import { useMemo, useState } from 'react';
import { ArrowLeft, Dice5, Play, Plus, Upload } from 'lucide-react';
import { useSimulatorStore } from '../state/simulatorStore';
import { defaultConfig, WORLD_PRESETS } from '../simulation/presets';
import { CivConfig, WorldConfig } from '../simulation/types';
import { SeededRandom } from '../simulation/Random';
import { randomCivConfig } from '../simulation/World';
import { CivEditor } from './CivEditor';
import { RuleBuilder } from './RuleBuilder';
import { importConfig } from '../utils/serialization';
import { Tutorial } from './Tutorial';
import { useT } from '../i18n';

let randomizeCounter = 1;

export function WorldSetup(): JSX.Element {
  const t = useT();
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const createUniverse = useSimulatorStore((s) => s.createUniverse);
  const showToast = useSimulatorStore((s) => s.showToast);
  const [config, setConfig] = useState<WorldConfig>(() => defaultConfig());
  const [openCiv, setOpenCiv] = useState<number>(0);
  const [section, setSection] = useState<'world' | 'civs' | 'rules'>('world');

  const patch = (p: Partial<WorldConfig>): void => setConfig((c) => ({ ...c, ...p }));

  const updateCiv = (i: number, civ: CivConfig): void => {
    setConfig((c) => ({ ...c, civs: c.civs.map((x, j) => (j === i ? civ : x)) }));
  };

  const addCiv = (): void => {
    if (config.civs.length >= 20) return;
    // UI-level randomization; determinism only matters once the seed is fixed.
    const rng = new SeededRandom(`${config.seed}-newciv-${config.civs.length}-${randomizeCounter++}`);
    const taken = new Set(config.civs.map((c) => c.name));
    const civ = randomCivConfig(rng, taken, config.civs.length);
    setConfig((c) => ({ ...c, civs: [...c.civs, civ] }));
    setOpenCiv(config.civs.length);
  };

  const removeCiv = (i: number): void => {
    if (config.civs.length <= 2) {
      showToast(t('setup.needTwo'));
      return;
    }
    setConfig((c) => ({ ...c, civs: c.civs.filter((_, j) => j !== i) }));
    setOpenCiv(0);
  };

  const randomizeCiv = (i: number): void => {
    const rng = new SeededRandom(`randomize-${randomizeCounter++}`);
    const taken = new Set(config.civs.filter((_, j) => j !== i).map((c) => c.name));
    const fresh = randomCivConfig(rng, taken, i);
    updateCiv(i, { ...fresh, name: config.civs[i].name, color: config.civs[i].color });
  };

  const randomSeed = (): void => {
    randomizeCounter++;
    patch({ seed: String(Math.floor(Math.random() * 1_000_000)) });
  };

  const start = (): void => {
    if (config.civs.length < 2) {
      showToast(t('setup.addTwo'));
      return;
    }
    createUniverse(config, undefined, true);
    setScreen('simulator');
  };

  const importFile = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          setConfig(importConfig(text));
          showToast(t('setup.imported'));
        } catch (err) {
          showToast(t('setup.importFailed', { err: err instanceof Error ? err.message : 'invalid file' }));
        }
      });
    };
    input.click();
  };

  const civTiles = useMemo(() => config.width * config.height, [config.width, config.height]);

  return (
    <div className="setup">
      <Tutorial />
      <header className="setup-header">
        <button className="btn btn-ghost btn-sm" onClick={() => setScreen('landing')}>
          <ArrowLeft size={14} /> {t('setup.back')}
        </button>
        <h1>{t('setup.title')}</h1>
        <div className="setup-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={importFile}>
            <Upload size={14} /> {t('setup.import')}
          </button>
          <button className="btn btn-primary" onClick={start} data-tutorial="start">
            <Play size={15} /> {t('setup.start')}
          </button>
        </div>
      </header>

      <div className="setup-tabs">
        <button className={`tab ${section === 'world' ? 'tab-active' : ''}`} onClick={() => setSection('world')} data-tutorial="world">
          {t('setup.tabWorld')}
        </button>
        <button className={`tab ${section === 'civs' ? 'tab-active' : ''}`} onClick={() => setSection('civs')} data-tutorial="civs">
          {t('setup.tabCivs')} <span className="badge">{config.civs.length}</span>
        </button>
        <button className={`tab ${section === 'rules' ? 'tab-active' : ''}`} onClick={() => setSection('rules')} data-tutorial="rules">
          {t('setup.tabRules')} <span className="badge">{config.rules.length}</span>
        </button>
      </div>

      <main className="setup-main">
        {section === 'world' && (
          <div className="panel setup-panel">
            <div className="field-row">
              <label>{t('setup.seed')}</label>
              <div className="seed-row">
                <input className="input" value={config.seed} maxLength={64} onChange={(e) => patch({ seed: e.target.value || '1' })} />
                <button className="icon-btn" onClick={randomSeed} title="🎲">
                  <Dice5 size={15} />
                </button>
              </div>
              <p className="hint">{t('setup.seedHint')}</p>
            </div>
            <div className="field-row">
              <label>{t('setup.mapSize', { w: config.width, h: config.height, n: civTiles.toLocaleString('en-US') })}</label>
              <div className="size-btns">
                {[120, 200, 300, 400, 600].map((s) => (
                  <button
                    key={s}
                    className={`chip ${config.width === s ? 'chip-active' : ''}`}
                    onClick={() => patch({ width: s, height: s })}
                  >
                    {s}×{s}
                  </button>
                ))}
              </div>
              {config.width >= 400 && <p className="hint">{t('setup.bigMapHint')}</p>}
            </div>
            <div className="field-row">
              <label>{t('setup.continents')}</label>
              <div className="size-btns">
                <button className={`chip ${!config.continents ? 'chip-active' : ''}`} onClick={() => patch({ continents: 0 })}>
                  {t('setup.auto')}
                </button>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`chip ${config.continents === n ? 'chip-active' : ''}`}
                    onClick={() => patch({ continents: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-row">
              <label>{t('setup.ocean', { v: Math.round(config.seaLevel * 100) })}</label>
              <input type="range" min={30} max={70} value={config.seaLevel * 100} onChange={(e) => patch({ seaLevel: Number(e.target.value) / 100 })} />
            </div>
            <div className="field-row">
              <label>{t('setup.resources', { v: config.resourceRichness.toFixed(1) })}</label>
              <input type="range" min={0} max={20} value={config.resourceRichness * 10} onChange={(e) => patch({ resourceRichness: Number(e.target.value) / 10 })} />
            </div>
            <div className="field-row">
              <label>{t('setup.disasters', { v: config.disasterFrequency === 0 ? t('setup.never') : `${config.disasterFrequency.toFixed(1)}×` })}</label>
              <input type="range" min={0} max={20} value={config.disasterFrequency * 10} onChange={(e) => patch({ disasterFrequency: Number(e.target.value) / 10 })} />
            </div>
            <div className="field-row">
              <label>{t('setup.fromPreset')}</label>
              <div className="size-btns">
                {WORLD_PRESETS.map((p) => (
                  <button key={p.id} className="chip" title={t(`preset.${p.id}.desc`)} onClick={() => setConfig(p.config())}>
                    {t(`preset.${p.id}.name`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'civs' && (
          <div className="setup-civs">
            <div className="civ-tabs">
              {config.civs.map((c, i) => (
                <button
                  key={i}
                  className={`civ-tab ${openCiv === i ? 'civ-tab-active' : ''}`}
                  style={{ borderColor: openCiv === i ? c.color : undefined }}
                  onClick={() => setOpenCiv(i)}
                >
                  <span className="dot" style={{ background: c.color }} />
                  {c.name || `Civ ${i + 1}`}
                </button>
              ))}
              {config.civs.length < 20 && (
                <button className="civ-tab civ-tab-add" onClick={addCiv}>
                  <Plus size={13} /> {t('setup.add')}
                </button>
              )}
            </div>
            {config.civs[openCiv] && (
              <CivEditor
                civ={config.civs[openCiv]}
                onChange={(c) => updateCiv(openCiv, c)}
                onRemove={() => removeCiv(openCiv)}
                onRandomize={() => randomizeCiv(openCiv)}
              />
            )}
          </div>
        )}

        {section === 'rules' && (
          <div className="panel setup-panel-wide">
            <p className="hint">{t('setup.rulesHint')}</p>
            <RuleBuilder rules={config.rules} civs={config.civs} onChange={(rules) => patch({ rules })} />
          </div>
        )}
      </main>
    </div>
  );
}
