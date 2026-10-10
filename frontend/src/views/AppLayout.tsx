import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { ModelPicker } from "../capabilities/settings/ModelPicker";

export type Tab = "map" | "dis" | "lab";

const TABS: Tab[] = ["map", "dis", "lab"];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
  disagreementCount?: number;
}

export function AppLayout({ activeTab, onTabChange, children, disagreementCount = 0 }: Props) {
  const { t, lang, setLang } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settingsOpen && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [settingsOpen]);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src="/Elenchos.png" alt="" />
          </span>
          <div>
            <h1>Elenchos</h1>
            <p>{t("app.tag")}</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="btn ghost settings-trigger"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <span aria-hidden="true">⚙</span> {t("settings.open")}
          </button>
          <div className="seg" role="group" aria-label={t("app.language")}>
            {(["nl", "en"] as const).map((language) => (
              <button
                key={language}
                type="button"
                aria-pressed={lang === language}
                onClick={() => setLang(language)}
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            className="tab"
            role="tab"
            id={`tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            onClick={() => onTabChange(tab)}
          >
            {t(`tab.${tab}`)}
            {tab === "dis" && disagreementCount > 0 && <span className="cnt">{disagreementCount}</span>}
          </button>
        ))}
      </div>

      <main>{children}</main>
      {settingsOpen && (
        <dialog
          ref={settingsDialog}
          className="settings-dialog"
          aria-labelledby="settings-title"
          onClose={() => setSettingsOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) settingsDialog.current?.close();
          }}
        >
          <div className="settings-heading">
            <h2 id="settings-title">{t("settings.title")}</h2>
            <button
              type="button"
              className="btn ghost small"
              aria-label={t("settings.close")}
              autoFocus
              onClick={() => settingsDialog.current?.close()}
            >
              ×
            </button>
          </div>
          <ModelPicker />
        </dialog>
      )}
    </div>
  );
}
