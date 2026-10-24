import { useState } from 'react';
import type { ShapDriver } from './types';

export default function ShapContributionChart({drivers, features}: {
  drivers: Pick<ShapDriver, 'feature' | 'shap_value' | 'clinical_explanation'>[];
  features?: Record<string, number>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<'magnitude' | 'direction'>('magnitude');
  const valid = drivers.filter(d => Number.isFinite(d.shap_value));
  const ordered = [...valid].sort((a, b) => sort === 'magnitude'
    ? Math.abs(b.shap_value) - Math.abs(a.shap_value) : b.shap_value - a.shap_value);
  const maximum = Math.max(.001, ...valid.map(d => Math.abs(d.shap_value)));
  const active = valid.find(d => d.feature === selected);
  if (!valid.length) return <p className="caption">No finite SHAP contributions were returned for this prediction.</p>;
  return <div className="shap-explorer">
    <div className="shap-explorer-toolbar"><span>Select a factor to inspect its source value</span><label>Order <select aria-label="Sort SHAP factors" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="magnitude">Largest impact</option><option value="direction">Direction</option></select></label></div>
    <div className="shap-axis"><span>Lowers model score</span><span>0</span><span>Raises model score</span></div>
    <div className="shap-contribution-list">
      {ordered.map(d => <button className="shap-contribution" key={d.feature} aria-pressed={selected === d.feature} onClick={() => setSelected(selected === d.feature ? null : d.feature)}>
        <span className="shap-factor-name">{d.feature.replaceAll('_', ' ')}<small>{features?.[d.feature] !== undefined ? `Input ${features[d.feature]}` : 'Source value unavailable'}</small></span>
        <span className="shap-diverging-track"><i className={d.shap_value >= 0 ? 'positive' : 'negative'} style={{width: `${Math.abs(d.shap_value) / maximum * 48}%`, left: d.shap_value >= 0 ? '50%' : `${50 - Math.abs(d.shap_value) / maximum * 48}%`}} /></span>
        <strong>{d.shap_value >= 0 ? '+' : ''}{d.shap_value.toFixed(3)}</strong>
      </button>)}
    </div>
    {active && <div className="shap-factor-detail" role="status"><b>{active.feature.replaceAll('_', ' ')}</b><p>{active.clinical_explanation}</p><small>Contribution: {active.shap_value.toFixed(4)} raw log-odds. A model association, not a causal treatment effect.</small></div>}
    <p className="caption">Each bar is a signed backend SHAP contribution. Bar length uses the largest displayed magnitude; these are not calibrated risk percentages.</p>
  </div>;
}
