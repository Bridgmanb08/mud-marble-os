import { forceCollide, forceLink, forceManyBody, forceRadial, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';

export const ROOT_RADIUS = 30;
export const NODE_RADIUS = 22;
// Distance between concentric "rings" -- everyone one introduction away from
// Brent sits on ring 1, their introductions on ring 2, and so on.
const RING_GAP = 220;

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
  isRoot: boolean;
  name: string;
}

export function nodeRadius(isRoot: boolean) {
  return isRoot ? ROOT_RADIUS : NODE_RADIUS;
}

// Labels are drawn centered on the bubble but run wider than it, so the space
// a node actually occupies is its label, not its circle -- collision has to
// use this or neighbors sit "apart" as circles while their names overprint.
function footprintRadius(n: LayoutNode) {
  const labelHalfWidth = Math.min(n.name.length, 14) * 3.4;
  return Math.max(nodeRadius(n.isRoot), labelHalfWidth) + 16;
}

interface Tree {
  depth: Map<string, number>;
  parent: Map<string, string>;
  degree: Map<string, number>;
}

// Breadth-first from the root over the (undirected) links: depth is how many
// introductions away someone is, parent is who first reached them. Nodes with
// no path to the root (standalone nodes) get no depth at all.
function buildTree(nodes: LayoutNode[], links: { source: string; target: string }[]): Tree {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);
  }
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const spread = (startId: string, startDepth: number) => {
    depth.set(startId, startDepth);
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of adj.get(id) ?? []) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(id)! + 1);
        parent.set(next, id);
        queue.push(next);
      }
    }
  };
  const root = nodes.find((n) => n.isRoot);
  if (root) spread(root.id, 0);
  // Anyone not reachable from the root (a standalone node, or a whole cluster
  // that isn't linked to Brent yet) still needs a place: each such cluster's
  // best-connected member takes a spot on the first ring and its cluster fans
  // out from there, so nothing is left to drift with no anchor.
  const orphans = nodes.filter((n) => !depth.has(n.id)).sort((a, b) => (adj.get(b.id)?.length ?? 0) - (adj.get(a.id)?.length ?? 0));
  for (const n of orphans) if (!depth.has(n.id)) spread(n.id, 1);
  const degree = new Map(nodes.map((n) => [n.id, adj.get(n.id)?.length ?? 0]));
  return { depth, parent, degree };
}

// Organizes the web instead of letting it clump: concentric rings by
// introduction depth (forceRadial), each branch fanned out on its own side
// of the ring under whoever introduced it, strong mutual repulsion (the
// "negative magnetism", stronger for well-connected people so hubs get room),
// and collision sized to the label rather than the bubble.
export function configureForces<N extends LayoutNode, L extends SimulationLinkDatum<N>>(
  sim: Simulation<N, L>,
  nodes: N[],
  links: { id?: string; source: string; target: string }[],
  cx: number,
  cy: number
) {
  const { depth, parent, degree } = buildTree(nodes, links);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  sim
    .force(
      'charge',
      forceManyBody<N>()
        .strength((d) => -650 - 140 * (degree.get(d.id) ?? 0))
        .distanceMax(700)
    )
    .force('collide', forceCollide<N>().radius(footprintRadius).strength(1).iterations(3))
    .force(
      'radial',
      forceRadial<N>(
        (d) => (depth.get(d.id) ?? 0) * RING_GAP,
        cx,
        cy
      ).strength((d) => (d.isRoot ? 0 : 0.75))
    )
    .force(
      'link',
      forceLink<N, L>(links.map((l) => ({ ...l }) as unknown as L))
        .id((d) => d.id)
        .distance(RING_GAP)
        // Links only keep connected people loosely together -- the rings, not
        // the springs, decide the shape.
        .strength(0.12)
    )
    .force('branch', (alpha: number) => {
      // Pull each node toward the spot on its own ring that lies straight out
      // from whoever introduced it, so a branch grows outward as a fan instead
      // of wrapping around the center and crossing other branches.
      for (const n of nodes) {
        const p = parent.get(n.id) ? byId.get(parent.get(n.id)!) : undefined;
        const d = depth.get(n.id) ?? 0;
        if (!p || d < 2 || p.x == null || p.y == null || n.x == null || n.y == null || n.vx == null || n.vy == null) continue;
        const angle = Math.atan2(p.y - cy, p.x - cx);
        const tx = cx + Math.cos(angle) * d * RING_GAP;
        const ty = cy + Math.sin(angle) * d * RING_GAP;
        n.vx += (tx - n.x) * 0.1 * alpha;
        n.vy += (ty - n.y) * 0.1 * alpha;
      }
    });
}
