// Visual IF/THEN rule builder — no code required.
import { useState } from 'react';
import { Plus, Trash2, Copy, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Rule, RuleCondition, WorldConfig } from '../simulation/types';
import { RULE_ACTIONS, RULE_METRICS, makeRule } from '../simulation/Rules';
import { RULE_TEMPLATES } from '../simulation/presets';
import { useT } from '../i18n';

interface Props {
  rules: Rule[];
  civs: WorldConfig['civs'];
  civIds?: { id: string; name: string }[]; // live civ ids when in simulator
  onChange: (rules: Rule[]) => void;
}

const OPS = ['<', '>', '<=', '>=', '='] as const;

export function RuleBuilder({ rules, civIds, onChange }: Props): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const t = useT();

  const update = (id: string, patch: Partial<Rule>): void => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateCondition = (rule: Rule, idx: number, patch: Partial<RuleCondition>): void => {
    const conditions = rule.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    update(rule.id, { conditions });
  };

  const addRule = (): void => {
    const rule = makeRule({
      name: t('rules.newRule', { n: rules.length + 1 }),
      conditions: [{ metric: 'foodPerCapita', op: '<', value: 0.5 }],
      action: { type: 'increaseMigration', amount: 20 },
    });
    onChange([...rules, rule]);
    setExpanded(rule.id);
  };

  const duplicate = (rule: Rule): void => {
    const copy = makeRule({ ...rule, id: undefined, name: `${rule.name} (copy)` });
    onChange([...rules, copy]);
  };

  const loadTemplate = (templateId: string): void => {
    const tpl = RULE_TEMPLATES.find((x) => x.id === templateId);
    if (tpl) onChange(tpl.rules());
  };

  return (
    <div className="rule-builder">
      <div className="rule-templates">
        <span className="muted small">{t('rules.templates')}</span>
        {RULE_TEMPLATES.map((tpl) => (
          <button key={tpl.id} className="chip" onClick={() => loadTemplate(tpl.id)} title={t(`tpl.${tpl.id}.desc`)}>
            {t(`tpl.${tpl.id}.name`)}
          </button>
        ))}
        <button className="chip chip-warn" onClick={() => onChange([])} title={t('rules.resetTitle')}>
          <RotateCcw size={11} /> {t('rules.reset')}
        </button>
      </div>

      {rules.length === 0 && <div className="empty-note">{t('rules.empty')}</div>}

      {rules.map((rule) => (
        <div key={rule.id} className={`rule-card ${rule.enabled ? '' : 'rule-disabled'}`}>
          <div className="rule-head">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update(rule.id, { enabled: e.target.checked })}
              title={t('rules.enable')}
            />
            <input
              className="input rule-name"
              value={rule.name}
              maxLength={60}
              onChange={(e) => update(rule.id, { name: e.target.value })}
            />
            <button className="icon-btn" onClick={() => duplicate(rule)} title={t('rules.duplicate')}>
              <Copy size={13} />
            </button>
            <button className="icon-btn" onClick={() => onChange(rules.filter((r) => r.id !== rule.id))} title={t('rules.delete')}>
              <Trash2 size={13} />
            </button>
            <button className="icon-btn" onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}>
              {expanded === rule.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          <div className="rule-summary">
            IF{' '}
            {rule.conditions.map((c, i) => (
              <span key={i}>
                {i > 0 && <b> {rule.logic.toUpperCase()} </b>}
                <code>
                  {t(`metric.${c.metric}`)} {c.op} {c.value}
                </code>
              </span>
            ))}{' '}
            THEN <code>{t(`action.${rule.action.type}`)} {rule.action.amount >= 0 ? '+' : ''}{rule.action.amount}</code>
          </div>

          {expanded === rule.id && (
            <div className="rule-edit">
              {rule.conditions.map((c, i) => (
                <div className="rule-cond-row" key={i}>
                  {i > 0 ? (
                    <select
                      className="input input-sm"
                      value={rule.logic}
                      onChange={(e) => update(rule.id, { logic: e.target.value as Rule['logic'] })}
                    >
                      <option value="and">AND</option>
                      <option value="or">OR</option>
                    </select>
                  ) : (
                    <span className="rule-if">IF</span>
                  )}
                  <select
                    className="input input-sm"
                    value={c.metric}
                    onChange={(e) => updateCondition(rule, i, { metric: e.target.value as RuleCondition['metric'] })}
                  >
                    {RULE_METRICS.map((m) => (
                      <option key={m.id} value={m.id}>{t(`metric.${m.id}`)}</option>
                    ))}
                  </select>
                  <select
                    className="input input-sm input-op"
                    value={c.op}
                    onChange={(e) => updateCondition(rule, i, { op: e.target.value as RuleCondition['op'] })}
                  >
                    {OPS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <input
                    className="input input-sm input-num"
                    type="number"
                    step="any"
                    value={c.value}
                    onChange={(e) => updateCondition(rule, i, { value: Number(e.target.value) || 0 })}
                  />
                  {rule.conditions.length > 1 && (
                    <button
                      className="icon-btn"
                      onClick={() => update(rule.id, { conditions: rule.conditions.filter((_, j) => j !== i) })}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  update(rule.id, { conditions: [...rule.conditions, { metric: 'population', op: '>', value: 1000 }] })
                }
              >
                <Plus size={12} /> {t('rules.addCondition')}
              </button>

              <div className="rule-cond-row rule-then">
                <span className="rule-if">THEN</span>
                <select
                  className="input input-sm"
                  value={rule.action.type}
                  onChange={(e) => update(rule.id, { action: { ...rule.action, type: e.target.value as Rule['action']['type'] } })}
                >
                  {RULE_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>{t(`action.${a.id}`)}</option>
                  ))}
                </select>
                <input
                  className="input input-sm input-num"
                  type="number"
                  value={rule.action.amount}
                  min={-100}
                  max={100}
                  onChange={(e) =>
                    update(rule.id, { action: { ...rule.action, amount: Math.max(-100, Math.min(100, Number(e.target.value) || 0)) } })
                  }
                />
              </div>

              <div className="rule-cond-row">
                <span className="rule-if">FOR</span>
                <select
                  className="input input-sm"
                  value={rule.appliesTo}
                  onChange={(e) => update(rule.id, { appliesTo: e.target.value })}
                >
                  <option value="all">{t('rules.allCivs')}</option>
                  {(civIds ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ))}

      <button className="btn btn-ghost btn-sm" onClick={addRule}>
        <Plus size={13} /> {t('rules.addRule')}
      </button>
    </div>
  );
}
