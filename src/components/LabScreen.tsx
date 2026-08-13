// The Research Lab: Monte Carlo batches and parameter sweeps.
// One run is an anecdote; a hundred runs are data.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FlaskConical, Play, Square } from 'lucide-react';
import { useSimulatorStore } from '../state/simulatorStore';
import { WorldConfig } from '../simulation/types';
import { computeStats, resultsToCsv, RunResult, RUN_METRIC_KEYS, RunMetricKey } from '../simulation/metrics';
import { estimateSeconds, planBatch, planSweep, PlannedJob, SWEEP_PARAMS, workerCount } from '../utils/experiment';
import { WORLD_PRESETS } from '../simulation/presets';
import { useT } from '../i18n';
import { fmtNum } from '../utils/format';
import { LineChart } from './LineChart';
import type { BatchIn, BatchOut } from '../worker/batch.worker';

type Mode = 'batch' | 'sweep';

interface ExperimentState {
  jobs: PlannedJob[];
  results: (RunResult | null)[];
  done: number;
  running: boolean;
  mode: Mode;
  paramId: string | null;
}

export function LabScreen(): JSX.Element {
  const t = useT();
  const setScreen = useSimulatorStore((s) => s.setScreen);
  const universes = useSimulatorStore((s) => s.universes);
  const activeUniverseId = useSimulatorStore((s) => s.activeUniverseId);
  const showToast = useSimulatorStore((s) => s.showToast);

  const activeConfig = universes.find((u) => u.id === activeUniverseId)?.config ?? null;
  const [presetId, setPresetId] = useState<string>(activeConfig ? 'active' : 'example');
  const [mode, setMode] = useState<Mode>('batch');
  const [runs, setRuns] = useState(24);
  const [years, setYears] = useState(2000);
  const [paramId, setParamId] = useState('trait.aggression');
  const [steps, setSteps] = useState(6);
  const [runsPerStep, setRunsPerStep] = useState(8);
  const [outcome, setOutcome] = useState<RunMetricKey>('totalWars');
  const [exp, setExp] = useState<ExperimentState | null>(null);
  const workersRef = useRef<Worker[]>([]);

  const baseConfig = useMemo((): WorldConfig => {
    if (presetId === 'active' && activeConfig) return structuredClone(activeConfig);
    const preset = WORLD_PRESETS.find((p) => p.id === presetId) ?? WORLD_PRESETS[0];
    return preset.config();
  }, [presetId, activeConfig]);

  const plannedJobs = useMemo(() => {
    if (mode === 'batch') return planBatch(baseConfig, runs, years);
    const param = SWEEP_PARAMS.find((p) => p.id === paramId) ?? SWEEP_PARAMS[0];
    return planSweep(baseConfig, param, steps, runsPerStep, years);
  }, [baseConfig, mode, runs, years, paramId, steps, runsPerStep]);

  const eta = estimateSeconds(plannedJobs, workerCount());

  const stopWorkers = (): void => {
    for (const w of workersRef.current) w.terminate();
    workersRef.current = [];
  };
  useEffect(() => stopWorkers, []);

  const start = (): void => {
    stopWorkers();
    const jobs = plannedJobs;
    if (jobs.length === 0) return;
    if (jobs.length > 400) {
      showToast(t('lab.tooMany'));
      return;
    }
    const state: ExperimentState = {
      jobs,
      results: new Array(jobs.length).fill(null),
      done: 0,
      running: true,
      mode,
      paramId: mode === 'sweep' ? paramId : null,
    };
    setExp({ ...state });

    const n = Math.min(workerCount(), jobs.length);
    const buckets: PlannedJob[][] = Array.from({ length: n }, () => []);
    jobs.forEach((job, i) => buckets[i % n].push(job));

    let finishedWorkers = 0;
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL('../worker/batch.worker.ts', import.meta.url), { type: 'module' });
      workersRef.current.push(worker);
      worker.onmessage = (e: MessageEvent<BatchOut>) => {
        const msg = e.data;
        if (msg.type === 'result') {
          state.results[msg.index] = msg.result;
          state.done++;
          setExp({ ...state });
        } else if (msg.type === 'error') {
          state.done++;
          setExp({ ...state });
        } else if (msg.type === 'done') {
          finishedWorkers++;
          if (finishedWorkers === n) {
            state.running = false;
            setExp({ ...state });
            stopWorkers();
          }
        }
      };
      worker.postMessage({ type: 'run', jobs: buckets[w] } satisfies BatchIn);
    }
  };

  const cancel = (): void => {
    stopWorkers();
    setExp((prev) => (prev ? { ...prev, running: false } : prev));
  };

  const finished = (exp?.results.filter((r): r is RunResult => r !== null) ?? []) as RunResult[];

  const download = (content: string, name: string, type: string): void => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lab">
      <header className="setup-header">
        <button className="btn btn-ghost btn-sm" onClick={() => setScreen(activeConfig ? 'simulator' : 'landing')}>
          <ArrowLeft size={14} /> {t('setup.back')}
        </button>
        <h1>
          <FlaskConical size={17} className="inline-icon" /> {t('lab.title')}
        </h1>
        <span className="muted small">{t('lab.subtitle')}</span>
      </header>

      <div className="lab-main">
        <aside className="lab-setup panel">
          <div className="field-row">
            <label>{t('lab.baseConfig')}</label>
            <select className="input" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {activeConfig && <option value="active">{t('lab.currentWorld')}</option>}
              {WORLD_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{t(`preset.${p.id}.name`)}</option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <label>{t('lab.mode')}</label>
            <div className="size-btns">
              <button className={`chip ${mode === 'batch' ? 'chip-active' : ''}`} onClick={() => setMode('batch')}>
                {t('lab.modeBatch')}
              </button>
              <button className={`chip ${mode === 'sweep' ? 'chip-active' : ''}`} onClick={() => setMode('sweep')}>
                {t('lab.modeSweep')}
              </button>
            </div>
            <p className="hint">{mode === 'batch' ? t('lab.batchHint') : t('lab.sweepHint')}</p>
          </div>

          <div className="field-row">
            <label>{t('lab.years')} — {years.toLocaleString('en-US')}</label>
            <input type="range" min={500} max={10000} step={500} value={years} onChange={(e) => setYears(Number(e.target.value))} />
          </div>

          {mode === 'batch' ? (
            <div className="field-row">
              <label>{t('lab.runs')} — {runs}</label>
              <input type="range" min={4} max={100} step={4} value={runs} onChange={(e) => setRuns(Number(e.target.value))} />
            </div>
          ) : (
            <>
              <div className="field-row">
                <label>{t('lab.param')}</label>
                <select className="input" value={paramId} onChange={(e) => setParamId(e.target.value)}>
                  {SWEEP_PARAMS.map((p) => (
                    <option key={p.id} value={p.id}>{t(`lab.p.${p.id}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label>{t('lab.steps')} — {steps}</label>
                <input type="range" min={3} max={11} value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
              </div>
              <div className="field-row">
                <label>{t('lab.runsPerStep')} — {runsPerStep}</label>
                <input type="range" min={3} max={20} value={runsPerStep} onChange={(e) => setRunsPerStep(Number(e.target.value))} />
              </div>
            </>
          )}

          <p className="hint">
            {t('lab.plan', { jobs: plannedJobs.length, workers: workerCount(), eta: eta < 60 ? `${eta}s` : `${Math.round(eta / 60)}min` })}
          </p>

          {exp?.running ? (
            <button className="btn btn-ghost" onClick={cancel}>
              <Square size={14} /> {t('lab.cancel')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start}>
              <Play size={15} /> {t('lab.run')}
            </button>
          )}

          {exp && (
            <div className="lab-progress">
              <div className="lab-progress-track">
                <div className="lab-progress-fill" style={{ width: `${(exp.done / exp.jobs.length) * 100}%` }} />
              </div>
              <span className="muted small">
                {exp.done}/{exp.jobs.length} {exp.running ? '' : `· ${t('lab.finished')}`}
              </span>
            </div>
          )}
        </aside>

        <main className="lab-results">
          {!exp && <div className="empty-note">{t('lab.empty')}</div>}

          {exp && finished.length > 1 && exp.mode === 'batch' && (
            <BatchResults results={finished} onExport={download} />
          )}
          {exp && finished.length > 1 && exp.mode === 'sweep' && (
            <SweepResults
              exp={exp}
              results={finished}
              outcome={outcome}
              setOutcome={setOutcome}
              onExport={download}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function BatchResults({ results, onExport }: { results: RunResult[]; onExport: (c: string, n: string, t: string) => void }): JSX.Element {
  const t = useT();
  // Mean ± std population trajectory across runs.
  const band = useMemo(() => {
    const base = results.reduce((a, b) => (a.popSeriesYears.length >= b.popSeriesYears.length ? a : b));
    const xs = base.popSeriesYears;
    const lo: number[] = [];
    const hi: number[] = [];
    const mean: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const vals = results
        .map((r) => {
          const idx = Math.min(r.popSeries.length - 1, Math.round((i / xs.length) * r.popSeries.length));
          return r.popSeries[idx] ?? 0;
        })
        .filter((v) => Number.isFinite(v));
      const st = computeStats(vals);
      mean.push(st.mean);
      lo.push(Math.max(0, st.mean - st.std));
      hi.push(st.mean + st.std);
    }
    return { xs, lo, hi, mean };
  }, [results]);

  return (
    <>
      <div className="lab-block-head">
        <div className="section-title">{t('lab.batchResults', { n: results.length })}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => onExport(resultsToCsv(results), 'experiment.csv', 'text/csv')}>
          <Download size={13} /> CSV
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onExport(JSON.stringify(results, null, 2), 'experiment.json', 'application/json')}
        >
          <Download size={13} /> JSON
        </button>
      </div>

      <LineChart
        title={t('lab.popBand', { n: results.length })}
        series={[{ label: 'mean', color: '#f5a524', xs: band.xs, ys: band.mean }]}
        band={{ xs: band.xs, lo: band.lo, hi: band.hi, color: '#f5a524' }}
        height={180}
      />

      <table className="lab-table">
        <thead>
          <tr>
            <th>{t('lab.metric')}</th>
            <th>{t('lab.mean')}</th>
            <th>±σ</th>
            <th>{t('lab.median')}</th>
            <th>min</th>
            <th>max</th>
          </tr>
        </thead>
        <tbody>
          {RUN_METRIC_KEYS.map((key) => {
            const st = computeStats(results.map((r) => r[key]));
            return (
              <tr key={key}>
                <td>{t(`lab.m.${key}`)}</td>
                <td>{fmtNum(st.mean)}</td>
                <td>{fmtNum(st.std)}</td>
                <td>{fmtNum(st.median)}</td>
                <td>{fmtNum(st.min)}</td>
                <td>{fmtNum(st.max)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function SweepResults({
  exp,
  results,
  outcome,
  setOutcome,
  onExport,
}: {
  exp: { jobs: PlannedJob[]; paramId: string | null };
  results: RunResult[];
  outcome: RunMetricKey;
  setOutcome: (m: RunMetricKey) => void;
  onExport: (c: string, n: string, t: string) => void;
}): JSX.Element {
  const t = useT();
  const curve = useMemo(() => {
    const byStep = new Map<number, { value: number; vals: number[] }>();
    for (const job of exp.jobs) {
      if (job.sweepStep < 0 || job.sweepValue === null) continue;
      const r = results.find((res) => res.seed === job.seed);
      if (!r) continue;
      const entry = byStep.get(job.sweepStep) ?? { value: job.sweepValue, vals: [] };
      entry.vals.push(r[outcome]);
      byStep.set(job.sweepStep, entry);
    }
    const stepsSorted = [...byStep.entries()].sort((a, b) => a[0] - b[0]);
    const xs = stepsSorted.map(([, e]) => e.value);
    const mean: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    for (const [, e] of stepsSorted) {
      const st = computeStats(e.vals);
      mean.push(st.mean);
      lo.push(Math.max(0, st.mean - st.std));
      hi.push(st.mean + st.std);
    }
    return { xs, mean, lo, hi };
  }, [exp.jobs, results, outcome]);

  return (
    <>
      <div className="lab-block-head">
        <div className="section-title">
          {t('lab.sweepResults', { param: t(`lab.p.${exp.paramId ?? ''}`), n: results.length })}
        </div>
        <select className="input input-sm" value={outcome} onChange={(e) => setOutcome(e.target.value as RunMetricKey)}>
          {RUN_METRIC_KEYS.map((k) => (
            <option key={k} value={k}>{t(`lab.m.${k}`)}</option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => onExport(resultsToCsv(results), 'sweep.csv', 'text/csv')}>
          <Download size={13} /> CSV
        </button>
      </div>

      <LineChart
        title={`${t(`lab.m.${outcome}`)} vs ${t(`lab.p.${exp.paramId ?? ''}`)}`}
        series={[{ label: t(`lab.m.${outcome}`), color: '#3b82f6', xs: curve.xs, ys: curve.mean }]}
        band={{ xs: curve.xs, lo: curve.lo, hi: curve.hi, color: '#3b82f6' }}
        height={200}
        xLabel=""
      />
      <p className="hint">{t('lab.sweepReadme')}</p>
    </>
  );
}
