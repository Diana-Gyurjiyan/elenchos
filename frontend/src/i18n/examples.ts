import raw from "./examples.json";
import type { Lang } from "./translate";

export interface LabExample {
  id: string;
  prem: string[];
  concl: string;
}
export interface MapExample {
  id: string;
  title: Record<Lang, string>;
  text: Record<Lang, string>;
}

export const LAB_EXAMPLES: LabExample[] = raw.lab;
export const MAP_EXAMPLES: MapExample[] = raw.map;
