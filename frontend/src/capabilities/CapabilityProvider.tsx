import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserDownloads } from "./browser/downloads";
import { createHttpSample } from "./sample/api";
import { httpStore } from "./store/api";
import { httpUser } from "./user/api";
import { httpLogic } from "./logic/http";
import { localLogic } from "./logic";
import { useModelSettings } from "./settings/ModelSettings";
import type { Capabilities, CapabilityInfo, CapabilityName } from "../types";

interface State {
  status: "loading" | "ready" | "offline";
  ports: Partial<Capabilities>;
  info: Record<string, CapabilityInfo>;
}

const Ctx = createContext<State>({ status: "loading", ports: {}, info: {} });

/** Asks the backend which capabilities exist, then wires the matching adapters. */
export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", ports: {}, info: {} });
  const { getChoice } = useModelSettings();

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/capabilities", { signal: ctl.signal })
      .then((r) => r.json() as Promise<Record<string, CapabilityInfo>>)
      .then((info) => {
        const ports: Partial<Capabilities> = { downloads: browserDownloads };
        if (info.sample?.available) ports.sample = createHttpSample(getChoice);
        if (info.store?.available) ports.store = httpStore;
        if (info.user?.available) ports.user = httpUser;
        ports.logic = localLogic;
        if (info.logic?.available) ports.logicLab = httpLogic;
        setState({ status: "ready", ports, info });
      })
      .catch(() => {
        if (!ctl.signal.aborted)
          setState({
            status: "offline",
            ports: { downloads: browserDownloads, logic: localLogic },
            info: { logic: { available: false, adapter: null } },
          });
      });
    return () => ctl.abort();
  }, [getChoice]);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the port, or null when the capability is unavailable (UI should degrade gracefully). */
export function useCapability<K extends CapabilityName>(name: K): Capabilities[K] | null {
  return (useContext(Ctx).ports[name] as Capabilities[K] | undefined) ?? null;
}

export function useCapabilityState() {
  const { status, info } = useContext(Ctx);
  return { status, info };
}
