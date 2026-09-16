import { useEffect, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { NetworkConnection, NetworkPerson } from '../../types';

// The virtual coordinate space the simulation runs in -- deliberately much
// larger than any one screen, since pan/zoom (not viewport size) is what
// lets the web actually grow. The root ("Me") is pinned at its center so
// the whole map visibly radiates outward from Brent as connections deepen.
const SPACE_W = 1600;
const SPACE_H = 1100;
const ROOT_RADIUS = 30;
const NODE_RADIUS = 22;

interface GraphNode extends SimulationNodeDatum {
  id: string;
  person: NetworkPerson;
}
interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
}

function nodeRadius(person: NetworkPerson) {
  return person.is_root ? ROOT_RADIUS : NODE_RADIUS;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

interface Props {
  people: NetworkPerson[];
  connections: NetworkConnection[];
  onNodeClick: (person: NetworkPerson) => void;
  onAddClick: (person: NetworkPerson) => void;
}

export function NetworkGraph({ people, connections, onNodeClick, onAddClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const [, setTick] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragRef = useRef<{ node: GraphNode; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const hasAutoFittedRef = useRef(false);

  // Frames the view around whatever's actually in the web right now --
  // used both for the very first render (once the initial layout settles)
  // and for "Reset view", so "reset" keeps meaning "show me everything"
  // instead of snapping back to an arbitrary fixed zoom that stops making
  // sense once the web has grown past a couple of people.
  function fitToContent() {
    const liveNodes = nodesRef.current;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of liveNodes) {
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
      const pad = nodeRadius(n.person) + 40; // room for the "+" button and name label
      minX = Math.min(minX, n.x - pad);
      maxX = Math.max(maxX, n.x + pad);
      minY = Math.min(minY, n.y - pad);
      maxY = Math.max(maxY, n.y + pad);
    }
    if (!isFinite(minX)) return;
    const boxW = Math.max(maxX - minX, 1);
    const boxH = Math.max(maxY - minY, 1);
    const scale = clamp(Math.min(SPACE_W / boxW, SPACE_H / boxH), 0.25, 2.2);
    const cx = SPACE_W / 2;
    const cy = SPACE_H / 2;
    const boxCx = (minX + maxX) / 2;
    const boxCy = (minY + maxY) / 2;
    setZoom(scale);
    setPan({ x: -scale * (boxCx - cx), y: -scale * (boxCy - cy) });
  }

  // Rebuild the simulation's node/link arrays whenever the underlying data
  // changes, but carry over x/y/vx/vy from whatever node object already
  // existed for that id -- otherwise every edit (even just adding one new
  // person) would reset the whole web back to its starting layout instead
  // of settling the new node into the existing one.
  useEffect(() => {
    const prevById = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodes: GraphNode[] = people.map((person) => {
      const prev = prevById.get(person.id);
      if (prev) return { ...prev, person };
      // A brand-new node starts near its first connection's source (if any)
      // instead of the dead center of the space, so it visibly springs out
      // from the person who introduced it rather than appearing at random.
      const seedEdge = connections.find((c) => c.to_person_id === person.id);
      const seedFrom = seedEdge ? prevById.get(seedEdge.from_person_id) : null;
      const baseX = seedFrom?.x ?? SPACE_W / 2;
      const baseY = seedFrom?.y ?? SPACE_H / 2;
      return {
        id: person.id,
        person,
        x: baseX + (Math.random() - 0.5) * 60,
        y: baseY + (Math.random() - 0.5) * 60,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: GraphLink[] = connections
      .filter((c) => byId.has(c.from_person_id) && byId.has(c.to_person_id))
      .map((c) => ({ id: c.id, source: c.from_person_id, target: c.to_person_id }));

    nodesRef.current = nodes;

    const root = nodes.find((n) => n.person.is_root);
    if (root) {
      root.fx = SPACE_W / 2;
      root.fy = SPACE_H / 2;
    }

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation<GraphNode>(nodes)
        // No forceCenter -- the root is already pinned exactly at the
        // space's center via fx/fy below, so a separate recentering force
        // would fight the link force trying to push everyone else away
        // from it (this collapsed the whole web onto the root in testing:
        // forceCenter reacts to a free node's own distance from center by
        // nudging the pair back together, directly canceling the link
        // force's outward pull).
        .force('charge', forceManyBody().strength(-320))
        .force('collide', forceCollide<GraphNode>().radius((d) => nodeRadius(d.person) + 26))
        .alphaDecay(0.025)
        .on('tick', () => setTick((t) => t + 1))
        .on('end', () => {
          // Fires every time the sim cools down (including after adding
          // someone later), but only the very first settle -- right after
          // initial load -- should auto-frame the view; refitting on every
          // later edit would yank the view out from under someone who'd
          // deliberately panned/zoomed elsewhere.
          if (!hasAutoFittedRef.current) {
            hasAutoFittedRef.current = true;
            fitToContent();
          }
        });
    } else {
      simulationRef.current.nodes(nodes);
    }
    simulationRef.current.force(
      'link',
      forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance(130)
        .strength(0.55)
    );
    simulationRef.current.alpha(0.7).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, connections]);

  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
    };
  }, []);

  // Inverts the <g> transform below (zoom anchored at the space's center,
  // pan applied on top) to turn a screen click back into the same
  // coordinate space the simulation's node.x/y already live in.
  function screenToGraph(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * SPACE_W;
    const svgY = ((clientY - rect.top) / rect.height) * SPACE_H;
    const cx = SPACE_W / 2;
    const cy = SPACE_H / 2;
    return { x: cx + (svgX - cx - pan.x) / zoom, y: cy + (svgY - cy - pan.y) / zoom };
  }

  function onNodePointerDown(e: React.PointerEvent, node: GraphNode) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { node, moved: false };
    simulationRef.current?.alphaTarget(0.3).restart();
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const { node } = dragRef.current;
      dragRef.current.moved = true;
      const { x, y } = screenToGraph(e.clientX, e.clientY);
      if (!node.person.is_root) {
        node.fx = x;
        node.fy = y;
      }
      setTick((t) => t + 1);
    } else if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setPan({ x: panRef.current.panX + dx, y: panRef.current.panY + dy });
    }
  }

  function onSvgPointerUp() {
    if (dragRef.current) {
      const { node } = dragRef.current;
      if (!node.person.is_root) {
        node.fx = null;
        node.fy = null;
      }
      dragRef.current = null;
      simulationRef.current?.alphaTarget(0);
    }
    panRef.current = null;
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  // A trackpad pinch is reported to the browser as a wheel event with
  // ctrlKey set (that's how Chrome/Firefox/Edge represent it -- there's no
  // separate "pinch" event outside Safari's own non-standard gesture API).
  // Registered as a native, non-passive listener below rather than React's
  // onWheel: React's synthetic wheel handler doesn't reliably let
  // preventDefault() block the browser's OWN page-zoom on a pinch in every
  // browser, which is exactly the bug this is fixing -- pinching over the
  // graph was zooming the whole page instead of just the web.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      // Exponential, not linear -- a linear `zoom * (1 + delta)` can swing
      // delta past -1 on a single large-deltaY event (a real trackpad pinch
      // can report a deltaY in the hundreds) and flip zoom negative before
      // it's even clamped. exp() stays positive and smooth no matter how
      // big deltaY gets. Pinch (ctrlKey) uses a steeper rate since its
      // deltas tend to run smaller per-event than a mouse wheel notch.
      const rate = e.ctrlKey ? 0.008 : 0.0015;
      const factor = Math.exp(-e.deltaY * rate);
      setZoom((z) => clamp(z * factor, 0.25, 2.2));
    }
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, []);

  const nodes = nodesRef.current;
  // Deliberately NOT memoized on [nodes] -- the simulation mutates node.x/y
  // in place every tick without ever changing the array's own identity, so
  // a reference-keyed memo would freeze the lines in their starting
  // position instead of following the bubbles as they settle.
  const linkForce = simulationRef.current?.force('link') as ReturnType<typeof forceLink<GraphNode, GraphLink>> | undefined;
  const linkPositions = linkForce ? linkForce.links() : [];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 230px)', minHeight: 480, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, display: 'flex', gap: 6 }}>
        <button className="btn btn-sm" onClick={() => setZoom((z) => clamp(z * 1.2, 0.25, 2.2))}>
          +
        </button>
        <button className="btn btn-sm" onClick={() => setZoom((z) => clamp(z / 1.2, 0.25, 2.2))}>
          −
        </button>
        <button className="btn btn-sm" onClick={fitToContent}>
          Reset view
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SPACE_W} ${SPACE_H}`}
        style={{ width: '100%', height: '100%', display: 'block', cursor: panRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerDown={onBackgroundPointerDown}
      >
        {/* Zoom is anchored at the space's center, not the SVG origin --
            baked directly into the matrix (SVG's `transform` attribute, as
            opposed to a CSS `transform`, ignores `transform-origin`) so
            scaling up doesn't also drag the whole web toward a corner. */}
        <g
          transform={`translate(${pan.x},${pan.y}) translate(${SPACE_W / 2},${SPACE_H / 2}) scale(${zoom}) translate(${-SPACE_W / 2},${-SPACE_H / 2})`}
        >
          {linkPositions.map((l) => {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            if (typeof s.x !== 'number' || typeof t.x !== 'number') return null;
            return (
              <line
                key={l.id}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="var(--border-md)"
                strokeWidth={1.5}
              />
            );
          })}

          {nodes.map((n) => {
            if (typeof n.x !== 'number' || typeof n.y !== 'number') return null;
            const r = nodeRadius(n.person);
            const isHover = hoverId === n.id;
            const addAngle = Math.PI / 4; // bottom-right of the bubble
            const addX = n.x + Math.cos(addAngle) * (r + 8);
            const addY = n.y + Math.sin(addAngle) * (r + 8);
            return (
              <g
                key={n.id}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={(e) => {
                  if (!dragRef.current?.moved) {
                    e.stopPropagation();
                    onNodeClick(n.person);
                  }
                }}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={n.person.is_root ? 'var(--brand-brown)' : 'var(--brand-cream)'}
                  stroke={n.person.is_root ? 'var(--brand-brown)' : 'var(--brand-tan)'}
                  strokeWidth={isHover ? 2.5 : 1.5}
                />
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={n.person.is_root ? 12 : 10.5}
                  fontWeight={600}
                  fill={n.person.is_root ? '#fff' : 'var(--text)'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {n.person.name.length > 14 ? `${n.person.name.slice(0, 13)}…` : n.person.name}
                </text>

                {/* The "+" that grows the web -- click to add someone this
                    person connects Brent to. Always visible (not just on
                    hover) so it's discoverable on touch devices too. */}
                <g
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    onAddClick(n.person);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={addX} cy={addY} r={9} fill="var(--accent)" opacity={isHover ? 1 : 0.75} />
                  <text
                    x={addX}
                    y={addY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={13}
                    fontWeight={700}
                    fill="#fff"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    +
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
