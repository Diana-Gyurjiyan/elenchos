import type { Analysis, Claim, Inference, MissingClaim } from "./types";

export interface GraphNode {
  id: string;
  kind: "claim" | "hub";
  role?: Claim["role"] | "critic";
  claim?: Claim | MissingClaim;
  inference?: Inference;
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "support" | "attack" | "critic";
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const CLAIM_W = 212;
const CLAIM_H = 96;
const HUB_SIZE = 48;
const GAP_X = 32;
const GAP_Y = 58;
const PAD = 24;

export function layoutArgument(analysis: Analysis, showCritic = true, showAssumptions = true): GraphLayout {
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const add = (node: GraphNode) => {
    nodes.push(node);
    byId.set(node.id, node);
  };

  for (const claim of analysis.claims) {
    if (claim.role === "assumption" && !showAssumptions) continue;
    add({ id: claim.id, kind: "claim", role: claim.role, claim, x: 0, y: 0, width: CLAIM_W, height: CLAIM_H, row: 0 });
  }
  if (showCritic) {
    for (const missing of analysis.critic.missing) {
      add({ id: missing.id, kind: "claim", role: "critic", claim: missing, x: 0, y: 0, width: CLAIM_W, height: CLAIM_H, row: 0 });
    }
  }
  for (const inference of analysis.infs) {
    if (!byId.has(inference.to)) continue;
    add({
      id: inference.id,
      kind: "hub",
      inference,
      x: 0,
      y: 0,
      width: HUB_SIZE,
      height: HUB_SIZE,
      row: 0,
    });
  }
  for (const inference of analysis.infs) {
    if (!byId.has(inference.id)) continue;
    for (const claimId of inference.from) {
      if (byId.has(claimId)) edges.push({ from: claimId, to: inference.id, kind: "support" });
    }
    edges.push({ from: inference.id, to: inference.to, kind: "support" });
  }
  for (const attack of analysis.attacks) {
    if (byId.has(attack.from) && byId.has(attack.to)) edges.push({ from: attack.from, to: attack.to, kind: "attack" });
  }
  if (showCritic) {
    for (const missing of analysis.critic.missing) {
      if (byId.has(missing.id) && byId.has(missing.feeds)) {
        edges.push({ from: missing.id, to: missing.feeds, kind: missing.kind === "counterargument" ? "attack" : "critic" });
      }
    }
  }

  const level = new Map<string, number>();
  for (const node of nodes) if (node.kind === "claim") level.set(node.id, 0);
  for (let pass = 0; pass < 30; pass += 1) {
    let changed = false;
    for (const inference of analysis.infs) {
      const targetLevel = level.get(inference.to);
      if (targetLevel === undefined) continue;
      for (const source of inference.from) {
        const sourceLevel = level.get(source);
        if (sourceLevel !== undefined && sourceLevel < targetLevel + 1) {
          level.set(source, targetLevel + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const node of nodes) {
    const claimLevel = node.kind === "hub" ? (level.get(node.inference!.to) ?? 0) : (level.get(node.id) ?? 0);
    node.row = node.kind === "hub" ? claimLevel * 2 + 1 : claimLevel * 2;
  }

  const rowMap = new Map<number, GraphNode[]>();
  for (const node of nodes) rowMap.set(node.row, [...(rowMap.get(node.row) ?? []), node]);
  const rows = [...rowMap.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    neighbors.set(edge.from, new Set([...(neighbors.get(edge.from) ?? []), edge.to]));
    neighbors.set(edge.to, new Set([...(neighbors.get(edge.to) ?? []), edge.from]));
  }
  const positions = new Map<string, number>();
  for (const row of rows) row.forEach((node, index) => positions.set(node.id, (index + 0.5) / row.length));
  for (let pass = 0; pass < 6; pass += 1) {
    const orderedRows = pass % 2 === 0 ? rows : [...rows].reverse();
    for (const row of orderedRows) {
      row.sort((a, b) => {
        const barycenter = (node: GraphNode) => {
          const linked = [...(neighbors.get(node.id) ?? [])].filter((id) => byId.get(id)?.row !== node.row);
          return linked.length
            ? linked.reduce((sum, id) => sum + (positions.get(id) ?? 0.5), 0) / linked.length
            : (positions.get(node.id) ?? 0.5);
        };
        return barycenter(a) - barycenter(b);
      });
      row.forEach((node, index) => positions.set(node.id, (index + 0.5) / row.length));
    }
  }

  const widest = Math.max(360, ...rows.map((row) =>
    row.reduce((sum, node) => sum + node.width, 0) + GAP_X * Math.max(0, row.length - 1) + 2 * PAD,
  ));
  let y = PAD;
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((node) => node.height));
    const rowWidth = row.reduce((sum, node) => sum + node.width, 0) + GAP_X * Math.max(0, row.length - 1);
    let x = (widest - rowWidth) / 2;
    for (const node of row) {
      node.x = x + node.width / 2;
      node.y = y + rowHeight / 2;
      x += node.width + GAP_X;
    }
    y += rowHeight + GAP_Y;
  }
  return { width: widest, height: Math.max(240, y - GAP_Y + PAD), nodes, edges };
}
