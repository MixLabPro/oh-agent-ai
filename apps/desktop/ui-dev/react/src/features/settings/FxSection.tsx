import { useEffect, useState, type FormEvent } from "react";
import { message, useLanguage, type MessageKey } from "../../lib/i18n";
import { stable } from "../../lib/stable";
import { onFxChanged, readFxStatus, removeFxManualRate, safeUiError, saveFxManualRate, saveReportingCurrency, type FxStatus } from "../../lib/tauri";

const DEFAULT_OPTION = "default";

/**
 * 报告币种与汇率（汇率 V2）。账单始终按原币种记账；报告币种只用来显示「≈ 约数」合计，
 * 每个折算值都保留原币种金额并写明用了哪个汇率。手动汇率是用户自己的假设，优先于参考汇率。
 */
export function FxSection() {
  const language = useLanguage();
  const tr = (key: MessageKey, parameters: Record<string, string | number> = {}) => message(key, language, parameters);
  const [status, setStatus] = useState<FxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => readFxStatus()
      .then((next) => { if (active) { setStatus((previous) => stable(previous, next)); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(safeUiError(reason, tr("fx.loadFailed"))); });
    void load();
    const off = onFxChanged(() => { void load(); });
    return () => { active = false; off(); };
  }, []);

  const run = async (action: () => Promise<void>, done: MessageKey) => {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); setNotice(tr(done)); }
    catch (reason: unknown) { setError(safeUiError(reason, tr("fx.saveFailed"))); }
    finally { setBusy(false); }
  };

  const onCurrency = (value: string) => void run(() => saveReportingCurrency(value), "fx.saved");
  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError(tr("fx.rateInvalid")); return; }
    if (from === to) { setError(tr("fx.pairInvalid")); return; }
    void run(async () => { await saveFxManualRate(from, to, parsed, asOf.trim() || null); setRate(""); setAsOf(""); }, "fx.saved");
  };

  if (!status) return <section className="settings-section" id="settings-fx" aria-labelledby="settings-fx-title">
    <div className="settings-section-heading"><div><p className="eyebrow">{tr("fx.eyebrow")}</p><h3 id="settings-fx-title">{tr("fx.title")}</h3></div></div>
    {error ? <div className="error-banner" role="alert">{error}</div> : <p className="settings-data-help">{tr("fx.unavailableBrowser")}</p>}
  </section>;

  const currencies = status.supported_currencies;
  return <section className="settings-section" id="settings-fx" aria-labelledby="settings-fx-title">
    <div className="settings-section-heading"><div><p className="eyebrow">{tr("fx.eyebrow")}</p><h3 id="settings-fx-title">{tr("fx.title")}</h3><p>{tr("fx.intro")}</p></div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {notice && <p className="settings-custom-message" role="status" aria-live="polite">{notice}</p>}
    <div className="settings-data-grid">
      <div className="settings-data-card">
        <label><span>{tr("fx.currency")}</span>
          <select value={status.reporting_currency_is_default ? DEFAULT_OPTION : status.reporting_currency} disabled={busy} onChange={(event) => onCurrency(event.target.value)}>
            <option value={DEFAULT_OPTION}>{tr("fx.defaultOption", { currency: status.reporting_currency_is_default ? status.reporting_currency : "…" })}</option>
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <p className="settings-data-help">{tr("fx.currencyHelp")}</p>
      </div>
      <div className="settings-data-card">
        <p className="eyebrow">{tr("fx.refRates")}</p>
        <strong>{tr("fx.refValue", { date: status.rate_date, age: status.rate_age_days ?? "—" })}</strong>
        <p className="settings-data-help">{tr("fx.refNote")}</p>
        {status.rate_stale && <p className="settings-budget-warning" role="status">{tr("fx.stale", { days: status.rate_age_days ?? "—" })}</p>}
      </div>
    </div>
    <div className="settings-data-card">
      <p className="eyebrow">{tr("fx.manualTitle")}</p>
      <p className="settings-data-help">{tr("fx.manualNote")}</p>
      {status.manual_rates.length === 0 ? <p className="settings-custom-empty">{tr("fx.manualNone")}</p>
        : <ul className="settings-custom-list">{status.manual_rates.map((row) => <li className="settings-custom-row" key={`${row.from}-${row.to}`}>
          <div><strong>1 {row.from} = {row.rate} {row.to}</strong><span>{row.as_of ? tr("fx.asOf", { date: row.as_of }) : tr("fx.noDate")}</span></div>
          <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => void run(() => removeFxManualRate(row.from, row.to), "fx.removed")}>{tr("fx.remove")}</button>
        </li>)}</ul>}
      <form className="settings-custom-form" onSubmit={onAdd}>
        <label><span>{tr("fx.from")}</span><select value={from} onChange={(event) => setFrom(event.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label><span>{tr("fx.to")}</span><select value={to} onChange={(event) => setTo(event.target.value)}>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label><span>{tr("fx.rate", { from, to })}</span><input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="6.8" autoComplete="off" /></label>
        <label><span>{tr("fx.asOfOptional")}</span><input value={asOf} onChange={(event) => setAsOf(event.target.value)} placeholder="2026-09-30" autoComplete="off" /></label>
        <button className="button button-secondary" type="submit" disabled={busy || !rate.trim()}>{tr("fx.add")}</button>
      </form>
    </div>
  </section>;
}
