import { drag } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

export const GROUP_COLORS = {
  root: '#c084fc',
  intro: '#60a5fa',
  suite: '#a78bfa',
  product: '#38bdf8',
  actions: '#fb923c',
  secret: '#2dd4bf',
  scanning: '#60a5fa',
  code: '#60a5fa',
  dependabot: '#fbbf24',
  supply: '#fbbf24',
  quality: '#34d399',
  bridge: '#f472b6',
  plan: '#34d399',
  develop: '#f472b6',
  review: '#fbbf24',
  secure: '#38bdf8',
  operate: '#2dd4bf',
  admin: '#a78bfa',
  collaboration: '#38bdf8',
  harness: '#fb923c',
  instructions: '#34d399',
  skills: '#fbbf24',
  plugins: '#e879f9',
  mcp: '#2dd4bf',
  agents: '#f472b6',
  hooks: '#f87171',
  context: '#60a5fa',
  governance: '#a78bfa',
  vscode: '#38bdf8',
  cli: '#34d399',
  'cloud-agent': '#fb923c',
  'copilot-app': '#f472b6',
  'models-partners': '#fbbf24',
  environments: '#2dd4bf',
  'pr-workflow': '#38bdf8',
  'human-review': '#34d399',
  stacking: '#e879f9',
  'copilot-review': '#fbbf24',
  'pr-rulesets': '#a78bfa',
  'pr-checks': '#2dd4bf',
  deployment: '#38bdf8',
  iam: '#2dd4bf',
  licensing: '#34d399',
  billing: '#fbbf24',
  migrations: '#fb923c',
  platform: '#38bdf8',
  sdlc: '#34d399',
  pillars: '#e879f9',
  copilot: '#60a5fa',
  fusion: '#fbbf24',
  'trust-arch': '#2dd4bf',
  concept: '#b4b4c0',
  unresolved: '#5c5c6b',
};

const OBSIDIAN_PALETTE = {
  bg: '#141417',
  nodeDefault: '#a8a8b3',
  nodeHub: '#c4c4cf',
  nodeUnresolved: '#525260',
  nodeDimmed: '#2b2b33',
  nodeHover: '#8b5cf6',
  nodeHoverGlow: 'rgba(139, 92, 246, 0.36)',
  nodeSecondaryHover: '#38bdf8',
  nodeSecondaryGlow: 'rgba(56, 189, 248, 0.38)',
  nodeSecondaryNeighbor: '#bae6fd',
  nodeSharedNeighbor: '#eef8ff',
  nodeNeighbor: '#dfdfe8',
  edgeDefault: 'rgba(255, 255, 255, 0.13)',
  edgeUnresolved: 'rgba(255, 255, 255, 0.07)',
  edgeDimmed: 'rgba(255, 255, 255, 0.026)',
  edgeHighlight: 'rgba(147, 102, 255, 0.92)',
  edgeSecondary: 'rgba(56, 189, 248, 0.94)',
  labelDefault: 'rgba(226, 226, 234, 0.86)',
  labelDimmed: 'rgba(180, 180, 192, 0.13)',
  labelHighlight: '#ffffff',
  labelNeighbor: 'rgba(244, 244, 250, 0.96)',
  activeRing: '#8b5cf6',
  searchMatch: '#a855f7',
};

export function computeNodeRadius(
  degree,
  { minDegree = 0, maxDegree = 16, exists = true } = {}
) {
  if (!exists) return 3.4;
  const d = Math.max(0, Number(degree) || 0);
  if (d === 0) return 3.8;
  const span = Math.max(8, maxDegree - minDegree);
  const norm = Math.max(0, Math.min(1, (d - minDegree) / span));
  const extra = d > maxDegree ? Math.min(2.6, Math.sqrt(d - maxDegree) * 0.38) : 0;
  return Math.min(
    26,
    4.2 + Math.pow(norm, 1.15) * 15.2 + Math.sqrt(Math.min(d, maxDegree)) * 0.45 + extra
  );
}

export class GraphView {
  constructor(canvas, { onSelectNode, onHoverNode } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelectNode = onSelectNode || (() => {});
    this.onHoverNode = onHoverNode || (() => {});

    this.width = 800;
    this.height = 600;
    this.rightInset = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.transform = zoomIdentity;

    this.allNodes = [];
    this.allLinks = [];
    this.nodes = [];
    this.links = [];
    this.nodePositions = new Map();
    this.adjacency = new Map();

    this.activeSlug = null;
    this.selectedSlug = null;
    this.hoveredNode = null;
    this.draggedNode = null;
    this.searchQuery = '';
    this.localDepth = 0; // 0 = global graph, 1 = 1-hop local, 2 = 2-hop local
    this.colorByGroup = false;

    this.selectBlend = 0;
    this.displaySelectedId = null;
    this.hoverBlend = 0;
    this.displayFocusId = null;
    this.rafId = null;

    this.simulation = forceSimulation()
      .alphaDecay(0.024)
      .velocityDecay(0.36)
      .on('tick', () => this.scheduleRender());

    this.setupInteractions();
    this.setupResizeObserver();
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (rect.width > 0 && rect.height > 0) {
          this.resize(rect.width, rect.height);
        }
      }
    });
    if (this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  resize(width, height) {
    const prevW = this.width;
    const prevH = this.height;
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    if (!this.hasInitialTransform) {
      this.hasInitialTransform = true;
      const scale = this.allNodes.length > 140 ? 0.38 : this.allNodes.length > 48 ? 0.78 : 0.84;
      const visibleCenterX = (width - this.rightInset) / 2;
      const initialTransform = zoomIdentity.translate(visibleCenterX, height / 2).scale(scale);
      select(this.canvas).call(this.zoomBehavior.transform, initialTransform);
    } else if (prevW > 0 && prevH > 0) {
      const dx = (width - prevW) / 2;
      const dy = (height - prevH) / 2;
      const shifted = zoomIdentity
        .translate(this.transform.x + dx, this.transform.y + dy)
        .scale(this.transform.k);
      select(this.canvas).call(this.zoomBehavior.transform, shifted);
    }

    this.scheduleRender();
  }

  setupInteractions() {
    const sel = select(this.canvas);

    this.zoomBehavior = zoom()
      .scaleExtent([0.22, 4.5])
      .filter((event) => {
        if (event.type === 'mousedown' || event.type === 'pointerdown' || event.type === 'touchstart') {
          const hit = this.findNodeAtEvent(event);
          return !hit;
        }
        return !event.ctrlKey || event.type === 'wheel';
      })
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.scheduleRender();
      });

    let pointerStartX = 0;
    let pointerStartY = 0;
    let movedDistance = 0;

    const dragBehavior = drag()
      .subject((event) => {
        const hit = this.findNodeAtScreen(event.x, event.y);
        return hit || undefined;
      })
      .on('start', (event) => {
        pointerStartX = event.x;
        pointerStartY = event.y;
        movedDistance = 0;
        this.draggedNode = event.subject;
        if (!event.active) this.simulation.alphaTarget(0.25).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
        this.canvas.style.cursor = 'grabbing';
        this.scheduleRender();
      })
      .on('drag', (event) => {
        const dx = event.x - pointerStartX;
        const dy = event.y - pointerStartY;
        movedDistance = Math.hypot(dx, dy);
        const [wx, wy] = this.screenToWorld(event.x, event.y);
        event.subject.fx = wx;
        event.subject.fy = wy;
        this.scheduleRender();
      })
      .on('end', (event) => {
        if (!event.active) this.simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
        const clickedNode = event.subject;
        this.draggedNode = null;
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';

        if (movedDistance < 5 && clickedNode) {
          this.setSelectedSlug(clickedNode.id);
          this.onSelectNode(clickedNode);
        }
        this.scheduleRender();
      });

    sel.call(dragBehavior).call(this.zoomBehavior).on('dblclick.zoom', null);

    let bgDownX = 0;
    let bgDownY = 0;
    let bgDownEmpty = false;

    this.handlePointerDown = (event) => {
      if (event.button !== 0) return;
      const hit = this.findNodeAtEvent(event);
      bgDownEmpty = !hit;
      bgDownX = event.clientX;
      bgDownY = event.clientY;
    };

    this.handlePointerUp = (event) => {
      if (event.button !== 0 || !bgDownEmpty) return;
      bgDownEmpty = false;
      const dist = Math.hypot(event.clientX - bgDownX, event.clientY - bgDownY);
      if (dist < 5 && this.selectedSlug) {
        this.setSelectedSlug(null);
      }
    };

    this.handlePointerMove = (event) => {
      if (this.draggedNode) return;
      const hit = this.findNodeAtEvent(event);
      if (hit !== this.hoveredNode) {
        this.hoveredNode = hit;
        if (hit) {
          this.displayFocusId = hit.id;
        }
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.onHoverNode(hit);
        this.scheduleRender();
      }
    };

    this.handlePointerLeave = () => {
      if (this.hoveredNode) {
        this.hoveredNode = null;
        this.canvas.style.cursor = 'grab';
        this.onHoverNode(null);
        this.scheduleRender();
      }
    };

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('mousemove', this.handlePointerMove);
    this.canvas.addEventListener('mouseleave', this.handlePointerLeave);
  }

  screenToWorld(sx, sy) {
    return [
      (sx - this.transform.x) / this.transform.k,
      (sy - this.transform.y) / this.transform.k,
    ];
  }

  findNodeAtEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return this.findNodeAtScreen(sx, sy);
  }

  findNodeAtScreen(sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    const hitPadding = 5 / this.transform.k;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const r = node.radius + hitPadding;
      const dx = wx - (node.x || 0);
      const dy = wy - (node.y || 0);
      if (dx * dx + dy * dy <= r * r) {
        return node;
      }
    }
    return null;
  }

  setData({ nodes, links }, { resetLayout = false } = {}) {
    if (resetLayout) {
      this.nodePositions.clear();
      this.nodes = [];
      this.hoveredNode = null;
      this.selectedSlug = null;
      this.displaySelectedId = null;
      this.selectBlend = 0;
      this.displayFocusId = null;
      this.hoverBlend = 0;
      if (this.hasInitialTransform) {
        const scale = nodes.length > 140 ? 0.38 : nodes.length > 48 ? 0.78 : 0.84;
        const visibleCenterX = (this.width - this.rightInset) / 2;
        select(this.canvas).call(
          this.zoomBehavior.transform,
          zoomIdentity.translate(visibleCenterX, this.height / 2).scale(scale)
        );
      }
    } else {
      // Save current positions so editing a note updates links smoothly without exploding layout
      for (const existing of this.nodes) {
        if (Number.isFinite(existing.x) && Number.isFinite(existing.y)) {
          this.nodePositions.set(existing.id, {
            x: existing.x,
            y: existing.y,
            vx: existing.vx || 0,
            vy: existing.vy || 0,
          });
        }
      }
    }

    this.allNodes = nodes.map((n) => ({ ...n }));
    this.allLinks = links.map((l) => ({
      id: l.id,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      unresolved: Boolean(l.unresolved),
    }));

    this.applySubgraphAndRestart();
  }

  applySubgraphAndRestart() {
    // Build full adjacency for local-depth filtering
    const fullAdj = new Map();
    for (const n of this.allNodes) fullAdj.set(n.id, new Set());
    for (const l of this.allLinks) {
      fullAdj.get(l.source)?.add(l.target);
      fullAdj.get(l.target)?.add(l.source);
    }

    let allowedIds = null;
    if (this.localDepth > 0 && this.activeSlug && fullAdj.has(this.activeSlug)) {
      allowedIds = new Set([this.activeSlug]);
      let frontier = [this.activeSlug];
      for (let hop = 0; hop < this.localDepth; hop++) {
        const nextFrontier = [];
        for (const id of frontier) {
          for (const nb of fullAdj.get(id) || []) {
            if (!allowedIds.has(nb)) {
              allowedIds.add(nb);
              nextFrontier.push(nb);
            }
          }
        }
        frontier = nextFrontier;
      }
    }

    const filteredNodes = allowedIds
      ? this.allNodes.filter((n) => allowedIds.has(n.id))
      : this.allNodes;

    const nodeSet = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = this.allLinks.filter(
      (l) => nodeSet.has(l.source) && nodeSet.has(l.target)
    );

    const existingDegrees = this.allNodes
      .filter((n) => n.exists)
      .map((n) => n.degree || 0)
      .sort((a, b) => b - a);
    const minDegree = existingDegrees.length ? existingDegrees[existingDegrees.length - 1] : 0;
    const maxDegree = existingDegrees.length
      ? existingDegrees.length > 80
        ? Math.max(16, (existingDegrees[1] || existingDegrees[0]) + 2)
        : existingDegrees[0]
      : 16;

    const hadSavedPositions = this.nodePositions.size > 0;
    const isLargeGraph = filteredNodes.length > 140;

    this.nodes = filteredNodes.map((n, idx) => {
      const saved = this.nodePositions.get(n.id);
      const angle = isLargeGraph
        ? idx * 2.399963229728653
        : (idx / Math.max(1, filteredNodes.length)) * Math.PI * 2;
      const ring =
        n.id === 'github'
          ? 0
          : isLargeGraph
            ? 95 + Math.sqrt(idx) * 38
            : 70 + (idx % 5) * 45;
      return {
        ...n,
        radius: computeNodeRadius(n.degree, { minDegree, maxDegree, exists: n.exists }),
        x: saved ? saved.x : Math.cos(angle) * ring,
        y: saved ? saved.y : Math.sin(angle) * ring,
        vx: saved ? saved.vx : 0,
        vy: saved ? saved.vy : 0,
      };
    });

    this.links = filteredLinks.map((l) => ({ ...l }));

    this.adjacency.clear();
    for (const n of this.nodes) {
      this.adjacency.set(n.id, new Set([n.id]));
    }
    for (const l of this.links) {
      this.adjacency.get(l.source)?.add(l.target);
      this.adjacency.get(l.target)?.add(l.source);
    }

    // Draw smaller nodes first and hub nodes on top
    this.nodes.sort((a, b) => a.radius - b.radius);

    this.simulation.nodes(this.nodes);
    this.simulation
      .force(
        'link',
        forceLink(this.links)
          .id((d) => d.id)
          .distance((l) => {
            const degA = Math.min(36, l.source.degree || 1);
            const degB = Math.min(36, l.target.degree || 1);
            return 74 + Math.sqrt(degA + degB) * 16;
          })
          .strength((l) => {
            const minDeg = Math.min(l.source.degree || 1, l.target.degree || 1);
            return minDeg <= 2 ? 0.68 : isLargeGraph ? 0.3 : 0.36;
          })
      )
      .force(
        'charge',
        forceManyBody()
          .strength((d) => -360 - Math.min(d.degree || 0, 34) * 52)
          .distanceMax(isLargeGraph ? 1380 : 860)
      )
      .force('center', forceCenter(0, 0).strength(0.05))
      .force(
        'x',
        forceX(0).strength((d) => (d.id === 'github' ? 0.32 : isLargeGraph ? 0.028 : 0.038))
      )
      .force(
        'y',
        forceY(0).strength((d) => (d.id === 'github' ? 0.32 : isLargeGraph ? 0.03 : 0.042))
      )
      .force(
        'collide',
        forceCollide()
          .radius((d) => d.radius + 26)
          .iterations(3)
      );

    this.simulation.alpha(hadSavedPositions ? 0.35 : 0.95).restart();

    if (this.hoveredNode) {
      this.hoveredNode = this.nodes.find((n) => n.id === this.hoveredNode.id) || null;
    }
    if (this.selectedSlug && !this.nodes.some((n) => n.id === this.selectedSlug)) {
      this.selectedSlug = null;
    }

    this.scheduleRender();
  }

  setActiveSlug(slug, { center = false, pin = false } = {}) {
    const prev = this.activeSlug;
    this.activeSlug = slug;
    if (pin && slug) {
      this.setSelectedSlug(slug);
    }
    if (this.localDepth > 0 && prev !== slug) {
      this.applySubgraphAndRestart();
    }
    if (center && slug) {
      this.focusOnNode(slug);
    } else {
      this.scheduleRender();
    }
  }

  setSelectedSlug(slug) {
    const next = slug && this.allNodes.some((n) => n.id === slug) ? slug : null;
    if (next) {
      this.displaySelectedId = next;
    }
    if (this.selectedSlug !== next) {
      this.selectedSlug = next;
      this.scheduleRender();
    }
  }

  setSearchQuery(query) {
    this.searchQuery = String(query || '').trim().toLowerCase();
    this.scheduleRender();
  }

  setLocalDepth(depth) {
    const next = Number(depth) || 0;
    if (this.localDepth !== next) {
      this.localDepth = next;
      this.applySubgraphAndRestart();
    }
  }

  setColorByGroup(enabled) {
    this.colorByGroup = Boolean(enabled);
    this.scheduleRender();
  }

  setRightInset(px) {
    const next = Math.max(0, Number(px) || 0);
    const prev = this.rightInset;
    this.rightInset = next;
    if (this.hasInitialTransform && prev !== next) {
      const shiftX = (prev - next) / 2;
      const nextTransform = zoomIdentity
        .translate(this.transform.x + shiftX, this.transform.y)
        .scale(this.transform.k);
      select(this.canvas).call(this.zoomBehavior.transform, nextTransform);
    }
  }

  focusOnNode(slug, targetScale = null) {
    const node = this.nodes.find((n) => n.id === slug);
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const k = targetScale || Math.max(this.transform.k, 1.02);
    const visibleCenterX = (this.width - this.rightInset) / 2;
    const nextTransform = zoomIdentity
      .translate(visibleCenterX - node.x * k, this.height / 2 - node.y * k)
      .scale(k);
    select(this.canvas).call(this.zoomBehavior.transform, nextTransform);
  }

  fitView(padding = 72) {
    if (this.nodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of this.nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      minX = Math.min(minX, n.x - n.radius - 28);
      maxX = Math.max(maxX, n.x + n.radius + 28);
      minY = Math.min(minY, n.y - n.radius - 24);
      maxY = Math.max(maxY, n.y + n.radius + 32);
    }

    if (!Number.isFinite(minX)) return;
    const availW = Math.max(240, this.width - this.rightInset);
    const boxW = Math.max(120, maxX - minX);
    const boxH = Math.max(120, maxY - minY);
    const k = Math.max(
      0.3,
      Math.min(1.35, Math.min((availW - padding * 2) / boxW, (this.height - padding * 2) / boxH))
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const nextTransform = zoomIdentity
      .translate(availW / 2 - cx * k, this.height / 2 - cy * k)
      .scale(k);
    select(this.canvas).call(this.zoomBehavior.transform, nextTransform);
  }

  zoomBy(factor) {
    const nextK = Math.max(0.22, Math.min(4.5, this.transform.k * factor));
    const cx = this.width / 2;
    const cy = this.height / 2;
    const wx = (cx - this.transform.x) / this.transform.k;
    const wy = (cy - this.transform.y) / this.transform.k;
    const nextTransform = zoomIdentity.translate(cx - wx * nextK, cy - wy * nextK).scale(nextK);
    select(this.canvas).call(this.zoomBehavior.transform, nextTransform);
  }

  scheduleRender() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    const { width, height, dpr, transform } = this;

    // Smooth pinned-selection transition blend (purple)
    const targetSelectBlend = this.selectedSlug && this.adjacency.has(this.selectedSlug) ? 1 : 0;
    const selectDiff = targetSelectBlend - this.selectBlend;
    if (Math.abs(selectDiff) > 0.015) {
      this.selectBlend += selectDiff * 0.28;
      this.scheduleRender();
    } else {
      this.selectBlend = targetSelectBlend;
      if (targetSelectBlend === 0) {
        this.displaySelectedId = null;
      }
    }

    // Smooth hover transition blend
    const targetHoverBlend = this.hoveredNode ? 1 : 0;
    const hoverDiff = targetHoverBlend - this.hoverBlend;
    if (Math.abs(hoverDiff) > 0.015) {
      this.hoverBlend += hoverDiff * 0.28;
      this.scheduleRender();
    } else {
      this.hoverBlend = targetHoverBlend;
      if (targetHoverBlend === 0) {
        this.displayFocusId = null;
      }
    }

    const selId = this.selectedSlug
      ? this.selectedSlug
      : this.selectBlend > 0.01
        ? this.displaySelectedId
        : null;
    const selNeighbors = selId ? this.adjacency.get(selId) : null;
    const hasSelection = Boolean(selId && this.selectBlend > 0.01);

    const hovId = this.hoveredNode
      ? this.hoveredNode.id
      : this.hoverBlend > 0.01
        ? this.displayFocusId
        : null;
    const hovNeighbors = hovId ? this.adjacency.get(hovId) : null;
    const hasHover = Boolean(hovId && this.hoverBlend > 0.01);

    // When a node is selected (purple), hovering a DIFFERENT node illuminates its network in BLUE
    const isSecondaryHover = Boolean(hasHover && this.selectedSlug && hovId !== this.selectedSlug);
    const isPrimaryHover = Boolean(hasHover && !this.selectedSlug);
    const dimStrength = Math.max(
      hasSelection ? this.selectBlend : 0,
      isPrimaryHover ? this.hoverBlend : 0
    );
    const isDimmingBg = dimStrength > 0.01;
    const hasSearch = this.searchQuery.length > 0;

    const matchesSearch = (node) => {
      if (!hasSearch) return false;
      if (node.title.toLowerCase().includes(this.searchQuery)) return true;
      if (node.group && node.group.toLowerCase().includes(this.searchQuery)) return true;
      return Array.isArray(node.tags) && node.tags.some((t) => t.toLowerCase().includes(this.searchQuery));
    };

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear canvas with Obsidian dark charcoal background
    ctx.fillStyle = OBSIDIAN_PALETTE.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const invK = 1 / Math.max(0.45, Math.min(2.2, transform.k));

    // Pass 1: Non-highlighted background edges
    for (const link of this.links) {
      const s = link.source;
      const t = link.target;
      if (!Number.isFinite(s.x) || !Number.isFinite(t.x)) continue;

      const touchesSelected = hasSelection && (s.id === selId || t.id === selId);
      const touchesHover =
        (isPrimaryHover || isSecondaryHover) && (s.id === hovId || t.id === hovId);
      if (touchesSelected || touchesHover) continue;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);

      if (isDimmingBg) {
        const alpha = 0.13 * (1 - dimStrength) + 0.025 * dimStrength;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      } else if (hasSearch) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      } else {
        ctx.strokeStyle = link.unresolved
          ? OBSIDIAN_PALETTE.edgeUnresolved
          : OBSIDIAN_PALETTE.edgeDefault;
      }

      if (link.unresolved) {
        ctx.setLineDash([4 * invK, 4 * invK]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 0.95 * invK;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Pass 2a: Purple edges for selected node (or primary hover when nothing is selected)
    const purpleId = hasSelection ? selId : isPrimaryHover ? hovId : null;
    const purpleStrength = hasSelection ? this.selectBlend : isPrimaryHover ? this.hoverBlend : 0;
    if (purpleId && purpleStrength > 0.01) {
      for (const link of this.links) {
        const s = link.source;
        const t = link.target;
        if (!Number.isFinite(s.x) || !Number.isFinite(t.x)) continue;
        if (s.id !== purpleId && t.id !== purpleId) continue;

        // Direct edge between selected (purple) and hovered (blue) is drawn in Pass 2b as a gradient
        if (
          isSecondaryHover &&
          ((s.id === purpleId && t.id === hovId) || (s.id === hovId && t.id === purpleId))
        ) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        const alpha = 0.18 + 0.74 * purpleStrength;
        ctx.strokeStyle = `rgba(147, 102, 255, ${alpha.toFixed(3)})`;
        ctx.lineWidth = (1.05 + 0.65 * purpleStrength) * invK;
        ctx.stroke();
      }
    }

    // Pass 2b: Blue edges for hovered node when another node is already selected
    if (isSecondaryHover) {
      for (const link of this.links) {
        const s = link.source;
        const t = link.target;
        if (!Number.isFinite(s.x) || !Number.isFinite(t.x)) continue;
        if (s.id !== hovId && t.id !== hovId) continue;

        const isBridgeToSelected =
          hasSelection && ((s.id === selId && t.id === hovId) || (s.id === hovId && t.id === selId));

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);

        if (isBridgeToSelected && Math.hypot(t.x - s.x, t.y - s.y) > 0.5) {
          const selEnd = s.id === selId ? s : t;
          const hovEnd = s.id === hovId ? s : t;
          const grad = ctx.createLinearGradient(selEnd.x, selEnd.y, hovEnd.x, hovEnd.y);
          grad.addColorStop(0, 'rgba(147, 102, 255, 0.96)');
          grad.addColorStop(1, `rgba(56, 189, 248, ${(0.25 + 0.73 * this.hoverBlend).toFixed(3)})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = (1.55 + 0.65 * this.hoverBlend) * invK;
        } else {
          const alpha = 0.18 + 0.78 * this.hoverBlend;
          ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
          ctx.lineWidth = (1.05 + 0.72 * this.hoverBlend) * invK;
        }
        ctx.stroke();
      }
    }

    // Pass 3: Nodes
    for (const node of this.nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;

      const isSelected = hasSelection && node.id === selId;
      const isSelectedNeighbor =
        hasSelection && selNeighbors && selNeighbors.has(node.id) && !isSelected;
      const isPrimaryFocus = isPrimaryHover && node.id === hovId;
      const isPrimaryNeighbor =
        isPrimaryHover && hovNeighbors && hovNeighbors.has(node.id) && !isPrimaryFocus;
      const isSecFocus = isSecondaryHover && node.id === hovId;
      const isSecNeighbor =
        isSecondaryHover && hovNeighbors && hovNeighbors.has(node.id) && !isSecFocus && !isSelected;
      const isSharedNeighbor = isSelectedNeighbor && isSecNeighbor;
      const isActive = node.id === this.activeSlug;
      const isSearchHit = matchesSearch(node);

      let drawRadius = node.radius;
      if (isSelected) {
        const selfHoverBoost = hasHover && hovId === selId ? 1.1 * this.hoverBlend : 0;
        drawRadius += 1.6 * this.selectBlend + selfHoverBoost;
      } else if (isPrimaryFocus || isSecFocus) {
        drawRadius += 1.8 * this.hoverBlend;
      }

      // Outer purple glow (selected node, primary hover, or search hit)
      if (isSelected || isPrimaryFocus || isSearchHit) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius + 5.4 * invK, 0, Math.PI * 2);
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeHoverGlow;
        ctx.fill();
      }

      // Outer blue glow (secondary hovered node when a selection is locked)
      if (isSecFocus) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius + 5.4 * invK, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${(0.38 * this.hoverBlend).toFixed(3)})`;
        ctx.fill();
      }

      // Subtle active-drawer ring when no graph node is pinned on it
      if (isActive && !isSelected && !isPrimaryFocus && !isSecFocus) {
        const dimFactor = isDimmingBg && !isSelectedNeighbor && !isPrimaryNeighbor && !isSecNeighbor ? 0.25 : 0.9;
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius + 3.2 * invK, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139, 92, 246, ${dimFactor})`;
        ctx.lineWidth = 1.6 * invK;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2);

      if (isSelected || isPrimaryFocus) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeHover;
      } else if (isSecFocus) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeSecondaryHover;
      } else if (isSharedNeighbor) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeSharedNeighbor;
      } else if (isSecNeighbor) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeSecondaryNeighbor;
      } else if (isSelectedNeighbor || isPrimaryNeighbor) {
        ctx.fillStyle = this.colorByGroup
          ? GROUP_COLORS[node.group] || '#d8d8e4'
          : '#d6d6e2';
      } else if (isDimmingBg) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeDimmed;
      } else if (hasSearch) {
        ctx.fillStyle = isSearchHit ? OBSIDIAN_PALETTE.searchMatch : OBSIDIAN_PALETTE.nodeDimmed;
      } else if (!node.exists) {
        ctx.fillStyle = OBSIDIAN_PALETTE.nodeUnresolved;
      } else if (this.colorByGroup) {
        ctx.fillStyle = GROUP_COLORS[node.group] || OBSIDIAN_PALETTE.nodeDefault;
      } else {
        ctx.fillStyle =
          node.degree >= 6 ? OBSIDIAN_PALETTE.nodeHub : OBSIDIAN_PALETTE.nodeDefault;
      }

      ctx.fill();

      // Crisp selection ring on the locked purple node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius + 2.2 * invK, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(216, 180, 254, ${(0.88 * this.selectBlend).toFixed(3)})`;
        ctx.lineWidth = 1.5 * invK;
        ctx.stroke();
      } else if (isSharedNeighbor) {
        // Ring on shared neighbors connected to BOTH selected (purple) and hovered (blue)
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius + 2.0 * invK, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${(0.82 * this.hoverBlend).toFixed(3)})`;
        ctx.lineWidth = 1.4 * invK;
        ctx.stroke();
      } else if (!node.exists && (!isDimmingBg || isSelectedNeighbor || isPrimaryNeighbor || isSecNeighbor)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1 * invK;
        ctx.stroke();
      }
    }

    // Pass 4: Crisp labels underneath nodes (Obsidian zoom-threshold behavior)
    const baseFontPx = Math.max(9.5, Math.min(13.5, 11.5 / Math.pow(transform.k, 0.35)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const node of this.nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;

      const isSelected = hasSelection && node.id === selId;
      const isSelectedNeighbor =
        hasSelection && selNeighbors && selNeighbors.has(node.id) && !isSelected;
      const isPrimaryFocus = isPrimaryHover && node.id === hovId;
      const isPrimaryNeighbor =
        isPrimaryHover && hovNeighbors && hovNeighbors.has(node.id) && !isPrimaryFocus;
      const isSecFocus = isSecondaryHover && node.id === hovId;
      const isSecNeighbor =
        isSecondaryHover && hovNeighbors && hovNeighbors.has(node.id) && !isSecFocus && !isSelected;
      const isLit =
        isSelected ||
        isSelectedNeighbor ||
        isPrimaryFocus ||
        isPrimaryNeighbor ||
        isSecFocus ||
        isSecNeighbor;
      const isActive = node.id === this.activeSlug;
      const isSearchHit = matchesSearch(node);

      // Zoom visibility threshold: major hubs always visible; leaf labels fade smoothly on zoom-out
      let zoomAlpha = 1;
      if (!isLit && !isActive && !isSearchHit) {
        const isLarge = this.nodes.length > 140;
        const minK = isLarge
          ? node.degree >= 16
            ? 0.24
            : node.degree >= 10
              ? 0.42
              : node.degree >= 6
                ? 0.58
                : 0.76
          : node.degree >= 8
            ? 0.25
            : node.degree >= 4
              ? 0.38
              : 0.52;
        if (transform.k < minK) {
          zoomAlpha = Math.max(0, (transform.k - (minK - 0.14)) / 0.14);
        }
      }
      if (zoomAlpha <= 0.02) continue;

      let textAlpha = 0.85 * zoomAlpha;
      let colorRgb = '226, 226, 235';
      let fontWeight = node.degree >= 8 ? '600' : '400';

      if (isSelected || isPrimaryFocus) {
        textAlpha = 1;
        colorRgb = '255, 255, 255';
        fontWeight = '600';
      } else if (isSecFocus) {
        textAlpha = 1;
        colorRgb = '224, 242, 254';
        fontWeight = '600';
      } else if (isSelectedNeighbor && isSecNeighbor) {
        textAlpha = 1;
        colorRgb = '255, 255, 255';
        fontWeight = '600';
      } else if (isSecNeighbor) {
        textAlpha = 0.96;
        colorRgb = '186, 230, 253';
        fontWeight = node.degree >= 6 ? '500' : '400';
      } else if (isSelectedNeighbor || isPrimaryNeighbor) {
        textAlpha = 0.95;
        colorRgb = '244, 244, 250';
        fontWeight = node.degree >= 6 ? '500' : '400';
      } else if (isDimmingBg) {
        textAlpha = (0.85 * (1 - dimStrength) + 0.13 * dimStrength) * zoomAlpha;
        colorRgb = '180, 180, 192';
      } else if (hasSearch) {
        if (isSearchHit) {
          textAlpha = 1;
          colorRgb = '255, 255, 255';
          fontWeight = '600';
        } else {
          textAlpha = 0.14 * zoomAlpha;
        }
      }

      const fontSize = isSelected || isPrimaryFocus || isSecFocus ? baseFontPx * 1.06 : baseFontPx;
      ctx.font = `${fontWeight} ${fontSize.toFixed(1)}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = `rgba(${colorRgb}, ${textAlpha.toFixed(3)})`;

      const labelY = node.y + node.radius + 5 * invK;
      ctx.fillText(node.title, node.x, labelY);
    }

    ctx.restore();
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.simulation.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('mousemove', this.handlePointerMove);
    this.canvas.removeEventListener('mouseleave', this.handlePointerLeave);
  }
}
