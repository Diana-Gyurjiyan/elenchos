import { useEffect, useState } from "react";
import { useModelSettings } from "./ModelSettings";
import type { ProviderInfo, ProvidersResponse } from "../../types";
import { useI18n } from "../../i18n/I18nProvider";

/** Pick an installed model and provider. OpenAI is shown as a future provider placeholder. */
export function ModelPicker() {
  const { t } = useI18n();
  const { choice, setChoice } = useModelSettings();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    fetch("/api/providers", { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ProvidersResponse>) : Promise.reject(r.status)))
      .then((r) => setProviders(r.providers))
      .catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, [nonce]);

  const current = providers.find((p) => p.id === choice.provider);

  return (
    <section className="panel" aria-labelledby="model-h">
      <h2 id="model-h">{t("model.title")}</h2>
      <p className="lead">{t("model.intro")}</p>

      {failed && <p className="muted">{t("model.providersFailed")}</p>}

      <div className="row">
        <div>
          <label className="f" htmlFor="provider">{t("model.provider")}</label>
          <select
            id="provider"
            value={choice.provider}
            onChange={(e) => setChoice({ provider: e.target.value, model: "" })}
          >
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
            <option value="openai" disabled>{t("model.openaiPlaceholder")}</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label className="f" htmlFor="model">{t("model.model")}</label>
          <input
            id="model"
            type="text"
            list={"models-" + choice.provider}
            value={choice.model}
            placeholder={current ? t("model.default", { model: current.default_model }) : ""}
            onChange={(e) => setChoice({ model: e.target.value.trim() })}
          />
          <datalist id={"models-" + choice.provider}>
            {current?.models.map((model) => <option key={model} value={model} />)}
          </datalist>
        </div>
      </div>

      {current?.needs_key && (
        <div>
          <label className="f" htmlFor="apikey">{t("model.apiKey")}</label>
          <div className="row">
            <input
              id="apikey"
              type="password"
              autoComplete="off"
              value={choice.apiKey}
              placeholder={current.has_server_key ? t("model.serverKeyOptional") : t("model.apiKeyPlaceholder")}
              onChange={(e) => setChoice({ apiKey: e.target.value.trim() })}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn ghost small" onClick={() => setChoice({ apiKey: "" })}>
              {t("model.forgetKey")}
            </button>
          </div>
        </div>
      )}

      <div className="sec">
        {current?.id === "ollama" && !current.available && (
          <p className="verdict warn">
            {t("model.ollamaUnavailableStart")} (<span className="mono">ollama serve</span>) {t("model.pullModel")}
            <span className="mono">make ollama-pull</span>.
          </p>
        )}
        {current?.id === "ollama" && current.available && current.models.length === 0 && (
          <p className="verdict warn">
            {t("model.noOllamaModel")} <span className="mono">make ollama-pull</span>.
          </p>
        )}
        <button type="button" className="btn ghost small" onClick={() => setNonce((n) => n + 1)}>
          {t("model.refresh")}
        </button>
      </div>
    </section>
  );
}
