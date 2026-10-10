import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CapabilityProvider } from "./capabilities/CapabilityProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import { ModelSettingsProvider } from "./capabilities/settings/ModelSettings";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ModelSettingsProvider>
        <CapabilityProvider>
          <App />
        </CapabilityProvider>
      </ModelSettingsProvider>
    </I18nProvider>
  </StrictMode>,
);
