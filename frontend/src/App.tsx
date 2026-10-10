import { useState } from "react";
import { useAnalysis } from "./capabilities/analysis/useAnalysis";
import { AppLayout, type Tab } from "./views/AppLayout";
import { ArgumentMapView } from "./views/ArgumentMapView";
import { DisagreementsView } from "./views/DisagreementsView";
import { LogicLabView, type LabSeed } from "./views/LogicLabView";
import { useI18n } from "./i18n/I18nProvider";

const TABS: Tab[] = ["map", "dis", "lab"];
const TAB_KEY = "argmap.tab";

function initialTab(): Tab {
  try {
    const value = sessionStorage.getItem(TAB_KEY);
    if (value && TABS.includes(value as Tab)) return value as Tab;
  } catch {
    // Session storage may be blocked; start on the default view.
  }
  return "map";
}

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [labSeed, setLabSeed] = useState<LabSeed>();
  const { lang } = useI18n();
  const analysis = useAnalysis(lang);

  function selectTab(next: Tab) {
    setTab(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {
      // The selected view remains active for this session.
    }
  }

  return (
    <AppLayout activeTab={tab} onTabChange={selectTab} disagreementCount={analysis.conflictCount}>
      <section role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={tab !== "map"}>
        <ArgumentMapView
          {...analysis}
          onOpenLab={(premises, conclusion, inferenceId, source) => {
            setLabSeed({
              premises,
              conclusion,
              inferenceId,
              source,
              analysisId: analysis.analysis?.id,
              nonce: Date.now(),
            });
            selectTab("lab");
          }}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      </section>
      <section role="tabpanel" id="panel-dis" aria-labelledby="tab-dis" hidden={tab !== "dis"}>
        <DisagreementsView
          analysis={analysis.analysis}
          onShowNode={(id) => {
            setSelectedNode(id);
            selectTab("map");
          }}
        />
      </section>
      <section role="tabpanel" id="panel-lab" aria-labelledby="tab-lab" hidden={tab !== "lab"}>
        <LogicLabView seed={labSeed} analysis={analysis.analysis} />
      </section>
    </AppLayout>
  );
}
