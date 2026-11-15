import './zettelkasten.css';
import { GraphView, GROUP_COLORS } from './graph-view.js';
import { NoteStore } from './store.js';
import {
  buildVaultGraph,
  parseNoteRaw,
  renderMarkdownWithWikilinks,
  titleToSlug,
} from './parser.js';

const GROUP_META = {
  root: ['Root', GROUP_COLORS.root],
  intro: ['Introduction & Platform', GROUP_COLORS.intro],
  platform: ['Platform & Scale', GROUP_COLORS.platform],
  sdlc: ['AI Developer Platform', GROUP_COLORS.sdlc],
  pillars: ['Universe 2026 Pillars', GROUP_COLORS.pillars],
  copilot: ['GitHub Copilot & Teams', GROUP_COLORS.copilot],
  fusion: ['Copilot Fusion', GROUP_COLORS.fusion],
  'trust-arch': ['Proxy, Residency & Trust', GROUP_COLORS['trust-arch']],
  collaboration: ['GitHub Planning', GROUP_COLORS.collaboration],
  instructions: ['Custom Instructions', GROUP_COLORS.instructions],
  skills: ['Agent Skills', GROUP_COLORS.skills],
  plugins: ['Agent Plugins', GROUP_COLORS.plugins],
  mcp: ['MCP & Connectors', GROUP_COLORS.mcp],
  agents: ['Custom Agents & Subagents', GROUP_COLORS.agents],
  hooks: ['Copilot Hooks', GROUP_COLORS.hooks],
  context: ['Copilot Spaces & Memory', GROUP_COLORS.context],
  vscode: ['VS Code & Agents Window', GROUP_COLORS.vscode],
  cli: ['Copilot CLI', GROUP_COLORS.cli],
  'cloud-agent': ['Copilot Cloud Agent', GROUP_COLORS['cloud-agent']],
  'copilot-app': ['GitHub Copilot App', GROUP_COLORS['copilot-app']],
  'models-partners': ['Partner Agents & Fusion', GROUP_COLORS['models-partners']],
  environments: ['Codespaces & Spaces', GROUP_COLORS.environments],
  'pr-workflow': ['Pull Request Workflow', GROUP_COLORS['pr-workflow']],
  'human-review': ['Human Code Review', GROUP_COLORS['human-review']],
  stacking: ['Stacked PRs & Agent Merge', GROUP_COLORS.stacking],
  'copilot-review': ['Copilot Code Review', GROUP_COLORS['copilot-review']],
  'pr-rulesets': ['PR Rulesets & Gates', GROUP_COLORS['pr-rulesets']],
  'pr-checks': ['PR Security & Quality', GROUP_COLORS['pr-checks']],
  deployment: ['Enterprise & Residency', GROUP_COLORS.deployment],
  iam: ['SSO & SCIM Identity', GROUP_COLORS.iam],
  licensing: ['GHE & Copilot Licenses', GROUP_COLORS.licensing],
  billing: ['UBB, Credits & Budgets', GROUP_COLORS.billing],
  governance: ['Governance & Controls', GROUP_COLORS.governance],
  migrations: ['Enterprise Migrations', GROUP_COLORS.migrations],
  plan: ['Plan & Harness', GROUP_COLORS.plan],
  develop: ['Develop & Agents', GROUP_COLORS.develop],
  review: ['Review & PRs', GROUP_COLORS.review],
  secure: ['Test & Secure', GROUP_COLORS.secure],
  operate: ['Operate & Insights', GROUP_COLORS.operate],
  admin: ['Enterprise & FinOps', GROUP_COLORS.admin],
  suite: ['GHAS Suite', GROUP_COLORS.suite],
  product: ['Products', GROUP_COLORS.product],
  actions: ['GitHub Actions', GROUP_COLORS.actions],
  secret: ['Secret Protection', GROUP_COLORS.secret],
  scanning: ['Code Scanning', GROUP_COLORS.scanning],
  dependabot: ['Dependabot', GROUP_COLORS.dependabot],
  quality: ['Code Quality', GROUP_COLORS.quality],
  bridge: ['Cross-Cutting', GROUP_COLORS.bridge],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mount a standalone or embedded Obsidian-inspired Zettelkasten Graph + Note Editor.
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {Array<{slug?: string, raw?: string}>|Record<string, string>} [options.seedNotes]
 * @param {string|null} [options.apiBaseUrl='/api/notes'] - Local disk sync endpoint (null to disable)
 * @param {string} [options.storageKey='zettelkasten-vault-v1'] - localStorage key in static mode
 * @param {string} [options.initialNote='github'] - Initial selected note slug or title
 * @param {boolean} [options.readOnly=false] - Disable editing/creation controls
 * @param {string} [options.title='GitHub Security Zettelkasten'] - Header title
 * @param {boolean} [options.startCollapsed=false] - Start with fullscreen graph & drawer closed
 */
export async function mountZettelkasten(container, options = {}) {
  if (!container) {
    throw new Error('mountZettelkasten requires a valid DOM container element.');
  }

  const {
    seedNotes = [],
    apiBaseUrl = '/api/notes',
    storageKey = 'zettelkasten-vault-v1',
    initialNote = 'github',
    readOnly = false,
    title = 'GitHub Security Zettelkasten',
    startCollapsed = false,
  } = options;

  const vaultList =
    Array.isArray(options.vaults) && options.vaults.length > 0
      ? options.vaults.map((v, idx) => ({
          id: String(v.id || `vault-${idx}`),
          label: String(v.label || v.title || `Vault ${idx + 1}`),
          title: String(v.title || title),
          seedNotes: v.seedNotes || [],
          apiBaseUrl: v.apiBaseUrl === undefined ? '/api/notes' : v.apiBaseUrl,
          storageKey: String(v.storageKey || `${storageKey}-${v.id || idx}`),
          diskLabel: String(v.diskLabel || 'notes/*.md'),
          zipFilename: String(v.zipFilename || `zettelkasten-${v.id || 'notes'}.zip`),
          initialNote: String(v.initialNote || initialNote),
        }))
      : [
          {
            id: 'default',
            label: 'Default',
            title,
            seedNotes,
            apiBaseUrl,
            storageKey,
            diskLabel: String(options.diskLabel || 'notes/*.md'),
            zipFilename: 'zettelkasten-notes.zip',
            initialNote,
          },
        ];

  const storesByVaultId = new Map();
  async function getOrInitStore(vaultDef) {
    if (storesByVaultId.has(vaultDef.id)) {
      return storesByVaultId.get(vaultDef.id);
    }
    const vaultStore = new NoteStore({
      seedNotes: vaultDef.seedNotes,
      apiBaseUrl: vaultDef.apiBaseUrl,
      storageKey: vaultDef.storageKey,
    });
    await vaultStore.init();
    storesByVaultId.set(vaultDef.id, vaultStore);
    return vaultStore;
  }

  let activeVault =
    vaultList.find((v) => v.id === options.initialVault) || vaultList[0];
  let activeStore = await getOrInitStore(activeVault);

  const state = {
    activeSlug: null,
    mode: 'read', // 'read' | 'edit'
    drawerCollapsed: Boolean(startCollapsed),
    localDepth: 0, // 0 = global, 1 = 1-hop, 2 = 2-hop
    colorByGroup: false,
    searchQuery: '',
    graph: {
      notesBySlug: new Map(),
      ghostNodes: new Map(),
      nodes: [],
      links: [],
      resolveTargetSlug: () => ({ slug: '', exists: false }),
    },
    acItems: [],
    acIndex: 0,
    acRange: null,
    saveTimer: null,
  };

  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'zk-root';

  root.innerHTML = `
    <div class="zk-canvas-stage" data-zk="stage">
      <canvas class="zk-canvas" data-zk="canvas"></canvas>
    </div>

    <div class="zk-hud-left">
      <div class="zk-hud-card">
        <div class="zk-brand-row">
          <div class="zk-brand-title">
            <span class="zk-brand-dot"></span>
            <span data-zk="brand-title-text">${escapeHtml(activeVault.title)}</span>
          </div>
          <div class="zk-stats-meta">
            <span data-zk="counts">0 notes</span>
            <span class="zk-storage-pill" data-zk="storage-pill">Vault</span>
          </div>
        </div>

        ${
          vaultList.length > 1
            ? `
              <div class="zk-vault-switcher ${vaultList.length > 3 ? 'is-grid' : ''}" data-zk="vault-switcher" role="tablist" aria-label="Zettelkasten vault">
                ${vaultList
                  .map(
                    (v) => `
                      <button
                        type="button"
                        role="tab"
                        aria-selected="${v.id === activeVault.id ? 'true' : 'false'}"
                        class="zk-vault-tab ${v.id === activeVault.id ? 'is-active' : ''}"
                        data-vault-id="${escapeHtml(v.id)}"
                      >
                        <span>${escapeHtml(v.label)}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        <div class="zk-search-wrap">
          <input
            type="text"
            class="zk-search-input"
            data-zk="search"
            placeholder="Filter graph or jump to note (/)"
            autocomplete="off"
          />
          <button type="button" class="zk-search-clear" data-zk="search-clear" title="Clear search">&times;</button>
        </div>
        <div class="zk-search-results" data-zk="search-results"></div>

        <div class="zk-controls-row">
          <button type="button" class="zk-btn is-active" data-zk="depth-0" title="Show entire neural graph">Global</button>
          <button type="button" class="zk-btn" data-zk="depth-1" title="Show 1-hop neighborhood of active note">1-Hop</button>
          <button type="button" class="zk-btn" data-zk="depth-2" title="Show 2-hop neighborhood of active note">2-Hop</button>
          <button type="button" class="zk-btn" data-zk="toggle-colors" title="Toggle Obsidian monochrome vs category colors">Groups</button>
          ${
            readOnly
              ? ''
              : '<button type="button" class="zk-btn zk-btn-primary" data-zk="new-note" title="Create a new atomic note">+ Note</button>'
          }
        </div>
      </div>
    </div>

    <div class="zk-bottom-left">
      <div class="zk-zoom-dock">
        <button type="button" class="zk-btn" data-zk="zoom-in" title="Zoom in">+</button>
        <button type="button" class="zk-btn" data-zk="zoom-out" title="Zoom out">&minus;</button>
        <button type="button" class="zk-btn" data-zk="zoom-fit" title="Fit graph to view">Fit</button>
      </div>
      <div class="zk-legend" data-zk="legend"></div>
    </div>

    <div class="zk-drawer-reopen" data-zk="reopen-bar">
      <button type="button" class="zk-btn" data-zk="open-drawer">Open Note Panel</button>
    </div>

    <aside class="zk-drawer ${state.drawerCollapsed ? 'is-collapsed' : ''}" data-zk="drawer">
      <div class="zk-drawer-header">
        <div class="zk-drawer-header-left">
          <span class="zk-group-badge" data-zk="note-group">note</span>
          <span class="zk-degree-badge" data-zk="note-degree">0 links</span>
        </div>
        <div class="zk-drawer-header-right">
          ${
            readOnly
              ? ''
              : `
                <button type="button" class="zk-btn is-active" data-zk="mode-read">Read</button>
                <button type="button" class="zk-btn" data-zk="mode-edit">Edit</button>
              `
          }
          <button type="button" class="zk-btn" data-zk="close-drawer" title="Hide panel for fullscreen Graph View">&times;</button>
        </div>
      </div>

      <div class="zk-drawer-scroll" data-zk="drawer-body"></div>

      <div class="zk-drawer-footer">
        <div class="zk-editor-tools">
          <button type="button" class="zk-btn" data-zk="export-md" title="Download current note as .md">.md</button>
          <button type="button" class="zk-btn" data-zk="export-zip" title="Download all vault notes as .zip">Vault .zip</button>
          ${
            readOnly
              ? ''
              : `
                <button type="button" class="zk-btn" data-zk="import-md" title="Import .md files into vault">Import</button>
                <input type="file" class="zk-hidden-file" data-zk="file-input" accept=".md,.markdown,text/markdown" multiple />
              `
          }
        </div>
        <div class="zk-editor-tools">
          ${
            !readOnly
              ? '<button type="button" class="zk-btn" data-zk="reset-vault" title="Restore initial seed notes" style="display:none">Reset</button>'
              : ''
          }
          ${
            readOnly
              ? ''
              : '<button type="button" class="zk-btn zk-btn-danger" data-zk="delete-note" title="Delete this note">Delete</button>'
          }
        </div>
      </div>
    </aside>
  `;

  container.appendChild(root);

  const el = {
    stage: root.querySelector('[data-zk="stage"]'),
    canvas: root.querySelector('[data-zk="canvas"]'),
    brandTitleText: root.querySelector('[data-zk="brand-title-text"]'),
    vaultSwitcher: root.querySelector('[data-zk="vault-switcher"]'),
    counts: root.querySelector('[data-zk="counts"]'),
    storagePill: root.querySelector('[data-zk="storage-pill"]'),
    search: root.querySelector('[data-zk="search"]'),
    searchClear: root.querySelector('[data-zk="search-clear"]'),
    searchResults: root.querySelector('[data-zk="search-results"]'),
    depth0: root.querySelector('[data-zk="depth-0"]'),
    depth1: root.querySelector('[data-zk="depth-1"]'),
    depth2: root.querySelector('[data-zk="depth-2"]'),
    toggleColors: root.querySelector('[data-zk="toggle-colors"]'),
    newNote: root.querySelector('[data-zk="new-note"]'),
    zoomIn: root.querySelector('[data-zk="zoom-in"]'),
    zoomOut: root.querySelector('[data-zk="zoom-out"]'),
    zoomFit: root.querySelector('[data-zk="zoom-fit"]'),
    legend: root.querySelector('[data-zk="legend"]'),
    reopenBar: root.querySelector('[data-zk="reopen-bar"]'),
    openDrawer: root.querySelector('[data-zk="open-drawer"]'),
    drawer: root.querySelector('[data-zk="drawer"]'),
    closeDrawer: root.querySelector('[data-zk="close-drawer"]'),
    noteGroup: root.querySelector('[data-zk="note-group"]'),
    noteDegree: root.querySelector('[data-zk="note-degree"]'),
    modeRead: root.querySelector('[data-zk="mode-read"]'),
    modeEdit: root.querySelector('[data-zk="mode-edit"]'),
    drawerBody: root.querySelector('[data-zk="drawer-body"]'),
    exportMd: root.querySelector('[data-zk="export-md"]'),
    exportZip: root.querySelector('[data-zk="export-zip"]'),
    importMd: root.querySelector('[data-zk="import-md"]'),
    fileInput: root.querySelector('[data-zk="file-input"]'),
    resetVault: root.querySelector('[data-zk="reset-vault"]'),
    deleteNote: root.querySelector('[data-zk="delete-note"]'),
  };

  function syncVaultChrome() {
    if (el.brandTitleText) {
      el.brandTitleText.textContent = activeVault.title;
    }
    el.storagePill.classList.remove('is-disk');
    if (activeStore.mode === 'disk') {
      el.storagePill.textContent = activeVault.diskLabel;
      el.storagePill.classList.add('is-disk');
      el.storagePill.title = `Synced live with local ${activeVault.diskLabel} files on disk`;
    } else if (activeStore.mode === 'local') {
      el.storagePill.textContent = 'Browser';
      el.storagePill.title = 'Saved in browser localStorage (export .md or .zip anytime)';
    } else {
      el.storagePill.textContent = 'Memory';
      el.storagePill.title = 'In-memory vault';
    }
    if (el.resetVault) {
      el.resetVault.style.display = activeStore.mode === 'local' ? '' : 'none';
    }
    if (el.vaultSwitcher) {
      el.vaultSwitcher.querySelectorAll('[data-vault-id]').forEach((btn) => {
        const isCurrent = btn.getAttribute('data-vault-id') === activeVault.id;
        btn.classList.toggle('is-active', isCurrent);
        btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
    }
  }

  function renderLegend() {
    const presentGroups = new Set();
    for (const note of state.graph.notesBySlug.values()) {
      if (note.group) presentGroups.add(note.group);
    }
    const orderedKeys = Object.keys(GROUP_META).filter((k) => presentGroups.has(k));
    for (const g of presentGroups) {
      if (!orderedKeys.includes(g)) orderedKeys.push(g);
    }
    const keysToRender = orderedKeys.length ? orderedKeys : Object.keys(GROUP_META).slice(0, 7);
    el.legend.innerHTML = keysToRender
      .map((key) => {
        const meta = GROUP_META[key];
        const label = meta ? meta[0] : key;
        const color = meta ? meta[1] : GROUP_COLORS[key] || GROUP_COLORS.concept;
        return `
          <span class="zk-legend-item">
            <span class="zk-legend-swatch" style="background:${color}"></span>
            <span>${escapeHtml(label)}</span>
          </span>
        `;
      })
      .join('');
  }

  const graphView = new GraphView(el.canvas, {
    onSelectNode: (node) => {
      if (!node.exists) {
        if (!readOnly) {
          createAndOpenNote(node.title);
        }
        return;
      }
      selectNote(node.slug, { openDrawer: true, switchToRead: false });
    },
  });

  function getActiveNoteRecord(slug = state.activeSlug) {
    if (!slug) return null;
    const note = state.graph.notesBySlug.get(slug);
    if (!note) return null;
    const graphNode = state.graph.nodes.find((n) => n.slug === slug);
    return {
      ...note,
      degree: graphNode ? graphNode.degree : note.outgoing.length + note.backlinks.length,
    };
  }

  function recomputeGraph({ resetLayout = false } = {}) {
    state.graph = buildVaultGraph(activeStore.getAllRaw());
    const realNoteCount = state.graph.notesBySlug.size;
    el.counts.textContent = `${realNoteCount} notes, ${state.graph.links.length} links`;
    renderLegend();
    graphView.setData(state.graph, { resetLayout });
    if (state.activeSlug && state.graph.notesBySlug.has(state.activeSlug)) {
      graphView.setActiveSlug(state.activeSlug);
    }
  }

  function syncDrawerVisibility() {
    el.drawer.classList.toggle('is-collapsed', state.drawerCollapsed);
    el.reopenBar.classList.toggle('is-visible', state.drawerCollapsed);
    const isDesktop = window.innerWidth > 820;
    graphView.setRightInset(!state.drawerCollapsed && isDesktop ? 454 : 0);
  }

  function setMode(nextMode) {
    if (readOnly) nextMode = 'read';
    state.mode = nextMode;
    if (el.modeRead && el.modeEdit) {
      el.modeRead.classList.toggle('is-active', state.mode === 'read');
      el.modeEdit.classList.toggle('is-active', state.mode === 'edit');
    }
    renderDrawerContent();
  }

  function resolveInitialSlug(key) {
    if (!key) return null;
    if (state.graph.notesBySlug.has(key)) return key;
    const resolved = state.graph.resolveTargetSlug(key);
    if (resolved.exists && state.graph.notesBySlug.has(resolved.slug)) {
      return resolved.slug;
    }
    const slugged = titleToSlug(key);
    if (state.graph.notesBySlug.has(slugged)) return slugged;
    return null;
  }

  function selectNote(
    slugOrTitle,
    { openDrawer = true, switchToRead = false, focusGraph = false, pinGraph = true } = {}
  ) {
    let slug = resolveInitialSlug(slugOrTitle);
    if (!slug) {
      const firstKey = state.graph.notesBySlug.keys().next().value;
      if (!firstKey) return;
      slug = firstKey;
    }

    state.activeSlug = slug;
    if (switchToRead) {
      state.mode = 'read';
      if (el.modeRead && el.modeEdit) {
        el.modeRead.classList.add('is-active');
        el.modeEdit.classList.remove('is-active');
      }
    }
    if (openDrawer) {
      state.drawerCollapsed = false;
      syncDrawerVisibility();
    }

    graphView.setActiveSlug(slug, { center: focusGraph, pin: pinGraph });
    renderDrawerContent();
  }

  async function createAndOpenNote(rawTitle, initialBody = '') {
    const cleanTitle = (rawTitle || 'Untitled Note').trim();
    const activeNode = getActiveNoteRecord();
    const defaultBody =
      initialBody ||
      (activeNode
        ? `Connected to [[${activeNode.title}]].\n\nAdd atomic notes and link related concepts with \`[[Concept Name]]\`.`
        : 'Write an atomic concept note and connect it with `[[Wikilinks]]`.');

    const createdSlug = await activeStore.saveNote({
      previousSlug: null,
      title: cleanTitle,
      group: activeNode?.group && activeNode.group !== 'root' ? activeNode.group : 'bridge',
      tags: [],
      aliases: [],
      body: defaultBody,
    });

    recomputeGraph();
    state.mode = 'edit';
    if (el.modeRead && el.modeEdit) {
      el.modeRead.classList.remove('is-active');
      el.modeEdit.classList.add('is-active');
    }
    selectNote(createdSlug, { openDrawer: true, focusGraph: true });
  }

  function renderDrawerContent() {
    const node = getActiveNoteRecord();
    if (!node) {
      el.drawerBody.innerHTML = '<p class="zk-empty-hint">Select or create a note to begin.</p>';
      return;
    }

    el.noteGroup.textContent = node.group || 'note';
    el.noteDegree.textContent = `${node.degree} ${node.degree === 1 ? 'link' : 'links'}`;

    if (state.mode === 'edit' && !readOnly) {
      renderEditor(node);
    } else {
      renderReader(node);
    }
  }

  function renderReader(node) {
    const htmlBody = renderMarkdownWithWikilinks(node.body, state.graph.resolveTargetSlug);

    const tagsHtml = [
      ...(node.aliases || []).map((a) => `<span class="zk-alias-pill">aka ${escapeHtml(a)}</span>`),
      ...(node.tags || []).map((t) => `<span class="zk-tag-pill">#${escapeHtml(t)}</span>`),
    ].join('');

    const backlinksHtml = node.backlinks.length
      ? `<div class="zk-backlink-list">
          ${node.backlinks
            .map(
              (bl) => `
                <button type="button" class="zk-backlink-card" data-target-slug="${escapeHtml(bl.sourceSlug)}">
                  <div class="zk-backlink-title">${escapeHtml(bl.sourceTitle)}</div>
                  <div class="zk-backlink-snippet">${escapeHtml(bl.snippet)}</div>
                </button>
              `
            )
            .join('')}
        </div>`
      : '<p class="zk-empty-hint">No incoming links yet. Reference this note with <code>[[' +
        escapeHtml(node.title) +
        ']]</code>.</p>';

    el.drawerBody.innerHTML = `
      <h1 class="zk-note-title">${escapeHtml(node.title)}</h1>
      ${tagsHtml ? `<div class="zk-meta-pills">${tagsHtml}</div>` : ''}
      <div class="zk-markdown-body" data-zk="md-body">${htmlBody}</div>

      <section class="zk-connections-section">
        <h2 class="zk-section-heading">Linked Mentions (${node.backlinks.length})</h2>
        ${backlinksHtml}
      </section>
    `;

    // Wire [[wikilinks]] inside Markdown body
    el.drawerBody.querySelectorAll('.zk-wikilink').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const slug = btn.getAttribute('data-zk-slug') || '';
        const exists = btn.getAttribute('data-zk-exists') === 'true';
        const rawTarget = btn.getAttribute('data-zk-target') || '';
        if (!exists) {
          if (!readOnly) {
            createAndOpenNote(rawTarget);
          }
          return;
        }
        selectNote(slug, { openDrawer: true, focusGraph: true });
      });
    });

    // Wire backlink cards
    el.drawerBody.querySelectorAll('.zk-backlink-card').forEach((card) => {
      card.addEventListener('click', () => {
        const targetSlug = card.getAttribute('data-target-slug');
        if (targetSlug) {
          selectNote(targetSlug, { openDrawer: true, focusGraph: true });
        }
      });
    });
  }

  function renderEditor(node) {
    const presentGroups = new Set();
    for (const existing of state.graph.notesBySlug.values()) {
      if (existing.group) presentGroups.add(existing.group);
    }
    const VAULT_GROUP_SETS = {
      extended: ['root', 'intro', 'plan', 'develop', 'review', 'secure', 'operate', 'admin'],
      introduction: ['root', 'platform', 'sdlc', 'pillars', 'copilot', 'fusion', 'trust-arch'],
      plan: [
        'root',
        'collaboration',
        'instructions',
        'skills',
        'plugins',
        'mcp',
        'agents',
        'hooks',
        'context',
        'governance',
      ],
      develop: ['root', 'vscode', 'cli', 'cloud-agent', 'copilot-app', 'models-partners', 'environments'],
      review: ['root', 'pr-workflow', 'human-review', 'stacking', 'copilot-review', 'pr-rulesets', 'pr-checks'],
      administration: ['root', 'deployment', 'iam', 'licensing', 'billing', 'governance', 'migrations'],
      security: ['root', 'suite', 'product', 'actions', 'secret', 'scanning', 'dependabot', 'quality', 'bridge'],
    };
    const detectedVaultKey = VAULT_GROUP_SETS[activeVault.id]
      ? activeVault.id
      : presentGroups.has('intro') || presentGroups.has('plan') || presentGroups.has('operate')
        ? 'extended'
        : presentGroups.has('platform') || presentGroups.has('fusion')
        ? 'introduction'
        : presentGroups.has('vscode') || presentGroups.has('copilot-app')
          ? 'develop'
          : presentGroups.has('pr-workflow') || presentGroups.has('copilot-review')
            ? 'review'
            : presentGroups.has('deployment') || presentGroups.has('billing')
              ? 'administration'
              : presentGroups.has('instructions') || presentGroups.has('skills')
                ? 'plan'
                : 'security';
    const baseGroups = VAULT_GROUP_SETS[detectedVaultKey];
    const groupOptions = [...baseGroups];
    for (const g of presentGroups) {
      if (!groupOptions.includes(g)) groupOptions.push(g);
    }
    if (node.group && !groupOptions.includes(node.group)) {
      groupOptions.push(node.group);
    }

    el.drawerBody.innerHTML = `
      <div class="zk-editor-form">
        <div class="zk-field-row">
          <div>
            <label class="zk-label">Title</label>
            <input type="text" class="zk-input" data-zk="edit-title" value="${escapeHtml(node.title)}" />
          </div>
          <div>
            <label class="zk-label">Group</label>
            <select class="zk-select" data-zk="edit-group">
              ${groupOptions
                .map(
                  (g) =>
                    `<option value="${escapeHtml(g)}" ${g === node.group ? 'selected' : ''}>${escapeHtml(g)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        <div>
          <label class="zk-label">Tags (comma-separated)</label>
          <input
            type="text"
            class="zk-input"
            data-zk="edit-tags"
            placeholder="security, ghas, sast"
            value="${escapeHtml((node.tags || []).join(', '))}"
          />
        </div>

        <div class="zk-editor-toolbar">
          <div class="zk-editor-tools">
            <button type="button" class="zk-btn" data-insert="[[|]]" title="Insert [[Wikilink]]">[[Link]]</button>
            <button type="button" class="zk-btn" data-insert="**|**" title="Bold"><strong>B</strong></button>
            <button type="button" class="zk-btn" data-insert="\`|\`" title="Inline code">Code</button>
            <button type="button" class="zk-btn" data-insert="\n## " title="Section heading">H2</button>
          </div>
          <span class="zk-save-status is-saved" data-zk="save-status">Live synced</span>
        </div>

        <div class="zk-textarea-wrap">
          <textarea
            class="zk-textarea"
            data-zk="edit-body"
            spellcheck="false"
            placeholder="Write note in Markdown and connect ideas with [[Note Title]]..."
          ></textarea>
          <div class="zk-autocomplete" data-zk="autocomplete"></div>
        </div>
      </div>
    `;

    const titleInput = el.drawerBody.querySelector('[data-zk="edit-title"]');
    const groupSelect = el.drawerBody.querySelector('[data-zk="edit-group"]');
    const tagsInput = el.drawerBody.querySelector('[data-zk="edit-tags"]');
    const bodyTextarea = el.drawerBody.querySelector('[data-zk="edit-body"]');
    const saveStatus = el.drawerBody.querySelector('[data-zk="save-status"]');
    const acBox = el.drawerBody.querySelector('[data-zk="autocomplete"]');

    bodyTextarea.value = node.body;

    const persistNow = async () => {
      const active = getActiveNoteRecord();
      if (!active) return;

      const nextTitle = titleInput.value.trim() || 'Untitled';
      const nextGroup = groupSelect.value.trim() || 'concept';
      const nextTags = tagsInput.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const nextBody = bodyTextarea.value;

      const nextSlug = await activeStore.saveNote({
        previousSlug: state.activeSlug,
        title: nextTitle,
        group: nextGroup,
        tags: nextTags,
        aliases: active.aliases || [],
        body: nextBody,
      });

      state.activeSlug = nextSlug;
      recomputeGraph();
      const refreshed = getActiveNoteRecord(nextSlug);
      if (refreshed) {
        el.noteGroup.textContent = refreshed.group || 'note';
        el.noteDegree.textContent = `${refreshed.degree} ${refreshed.degree === 1 ? 'link' : 'links'}`;
      }
      const diskFolder = activeVault.diskLabel.replace(/\/\*\.md$/, '');
      saveStatus.textContent = activeStore.mode === 'disk' ? `Saved ${diskFolder}/${nextSlug}.md` : 'Saved';
      saveStatus.classList.add('is-saved');
    };

    const scheduleSave = () => {
      saveStatus.textContent = 'Saving...';
      saveStatus.classList.remove('is-saved');
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(() => {
        persistNow();
      }, 240);
    };

    titleInput.addEventListener('input', scheduleSave);
    groupSelect.addEventListener('change', scheduleSave);
    tagsInput.addEventListener('input', scheduleSave);

    // Quick Markdown insertion buttons
    el.drawerBody.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pattern = btn.getAttribute('data-insert') || '';
        const start = bodyTextarea.selectionStart;
        const end = bodyTextarea.selectionEnd;
        const selected = bodyTextarea.value.slice(start, end);
        let replacement;
        let cursorOffset;
        if (pattern.includes('|')) {
          const [before, after] = pattern.split('|');
          replacement = `${before}${selected}${after}`;
          cursorOffset = selected ? start + replacement.length : start + before.length;
        } else {
          replacement = `${pattern}${selected}`;
          cursorOffset = start + replacement.length;
        }
        bodyTextarea.setRangeText(replacement, start, end, 'end');
        bodyTextarea.focus();
        bodyTextarea.setSelectionRange(cursorOffset, cursorOffset);
        scheduleSave();
        updateAutocomplete();
      });
    });

    // [[ Wikilink autocomplete logic
    const closeAutocomplete = () => {
      state.acItems = [];
      state.acRange = null;
      acBox.classList.remove('is-open');
      acBox.innerHTML = '';
    };

    const applyAutocomplete = (pickedTitle) => {
      if (!state.acRange) return;
      const { start, end } = state.acRange;
      const after = bodyTextarea.value.slice(end, end + 2) === ']]' ? '' : ']]';
      const insertText = `[[${pickedTitle}${after}`;
      bodyTextarea.setRangeText(insertText, start, end, 'end');
      bodyTextarea.focus();
      closeAutocomplete();
      scheduleSave();
    };

    const renderAutocomplete = () => {
      if (!state.acItems.length) {
        closeAutocomplete();
        return;
      }
      acBox.classList.add('is-open');
      acBox.innerHTML = state.acItems
        .map(
          (item, idx) => `
            <button
              type="button"
              class="zk-ac-item ${idx === state.acIndex ? 'is-selected' : ''}"
              data-ac-index="${idx}"
            >
              <span>${escapeHtml(item.title)}</span>
              <span class="zk-search-item-group">${escapeHtml(item.group)}</span>
            </button>
          `
        )
        .join('');

      acBox.querySelectorAll('[data-ac-index]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = Number(btn.getAttribute('data-ac-index'));
          const picked = state.acItems[idx];
          if (picked) applyAutocomplete(picked.title);
        });
      });
    };

    const updateAutocomplete = () => {
      const pos = bodyTextarea.selectionStart;
      const beforeCursor = bodyTextarea.value.slice(0, pos);
      const openIdx = beforeCursor.lastIndexOf('[[');
      if (openIdx === -1) {
        closeAutocomplete();
        return;
      }
      const fragment = beforeCursor.slice(openIdx + 2);
      if (fragment.includes(']]') || fragment.includes('\n')) {
        closeAutocomplete();
        return;
      }

      const query = fragment.split('|')[0].trim().toLowerCase();
      const candidates = Array.from(state.graph.notesBySlug.values())
        .filter((n) => n.slug !== state.activeSlug)
        .filter(
          (n) =>
            !query ||
            n.title.toLowerCase().includes(query) ||
            n.slug.includes(query)
        )
        .slice(0, 8);

      if (!candidates.length && query) {
        candidates.push({ title: fragment.trim(), group: 'new note' });
      }

      state.acItems = candidates;
      state.acIndex = 0;
      state.acRange = { start: openIdx, end: pos };
      renderAutocomplete();
    };

    bodyTextarea.addEventListener('input', () => {
      scheduleSave();
      updateAutocomplete();
    });

    bodyTextarea.addEventListener('keydown', (e) => {
      if (state.acItems.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          state.acIndex = (state.acIndex + 1) % state.acItems.length;
          renderAutocomplete();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          state.acIndex = (state.acIndex - 1 + state.acItems.length) % state.acItems.length;
          renderAutocomplete();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const picked = state.acItems[state.acIndex];
          if (picked) applyAutocomplete(picked.title);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAutocomplete();
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        clearTimeout(state.saveTimer);
        persistNow();
      }
    });

    bodyTextarea.addEventListener('blur', () => {
      setTimeout(closeAutocomplete, 140);
    });
  }

  // Search box & results
  function updateSearch(query) {
    state.searchQuery = query;
    el.searchClear.classList.toggle('is-visible', Boolean(query));
    graphView.setSearchQuery(query);

    const q = query.trim().toLowerCase();
    if (!q) {
      el.searchResults.classList.remove('is-open');
      el.searchResults.innerHTML = '';
      return;
    }

    const matches = Array.from(state.graph.notesBySlug.values())
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          n.aliases.some((a) => String(a).toLowerCase().includes(q)) ||
          n.body.toLowerCase().includes(q)
      )
      .slice(0, 8);

    if (!matches.length) {
      el.searchResults.classList.add('is-open');
      el.searchResults.innerHTML = '<div class="zk-empty-hint" style="padding:4px 8px;">No matching notes</div>';
      return;
    }

    el.searchResults.classList.add('is-open');
    el.searchResults.innerHTML = matches
      .map(
        (m) => `
          <button type="button" class="zk-search-item" data-search-slug="${escapeHtml(m.slug)}">
            <span>${escapeHtml(m.title)}</span>
            <span class="zk-search-item-group">${escapeHtml(m.group)}</span>
          </button>
        `
      )
      .join('');

    el.searchResults.querySelectorAll('[data-search-slug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-search-slug');
        if (slug) {
          selectNote(slug, { openDrawer: true, focusGraph: true });
        }
      });
    });
  }

  el.search.addEventListener('input', () => updateSearch(el.search.value));
  el.searchClear.addEventListener('click', () => {
    el.search.value = '';
    updateSearch('');
  });

  // Depth buttons
  const setDepth = (depth) => {
    state.localDepth = depth;
    el.depth0.classList.toggle('is-active', depth === 0);
    el.depth1.classList.toggle('is-active', depth === 1);
    el.depth2.classList.toggle('is-active', depth === 2);
    graphView.setLocalDepth(depth);
    setTimeout(() => graphView.fitView(80), 120);
  };
  el.depth0.addEventListener('click', () => setDepth(0));
  el.depth1.addEventListener('click', () => setDepth(1));
  el.depth2.addEventListener('click', () => setDepth(2));

  // Color groups toggle
  el.toggleColors.addEventListener('click', () => {
    state.colorByGroup = !state.colorByGroup;
    el.toggleColors.classList.toggle('is-active', state.colorByGroup);
    el.legend.classList.toggle('is-visible', state.colorByGroup);
    graphView.setColorByGroup(state.colorByGroup);
  });

  // Zoom dock
  el.zoomIn.addEventListener('click', () => graphView.zoomBy(1.28));
  el.zoomOut.addEventListener('click', () => graphView.zoomBy(0.78));
  el.zoomFit.addEventListener('click', () => graphView.fitView(80));

  // Drawer open/close & Read/Edit toggles
  el.closeDrawer.addEventListener('click', () => {
    state.drawerCollapsed = true;
    syncDrawerVisibility();
  });
  el.openDrawer.addEventListener('click', () => {
    state.drawerCollapsed = false;
    syncDrawerVisibility();
  });

  if (el.modeRead && el.modeEdit) {
    el.modeRead.addEventListener('click', () => setMode('read'));
    el.modeEdit.addEventListener('click', () => setMode('edit'));
  }

  if (el.newNote) {
    el.newNote.addEventListener('click', () => {
      createAndOpenNote('New Concept');
    });
  }

  async function switchVault(nextVaultId) {
    const targetVault = vaultList.find((v) => v.id === nextVaultId);
    if (!targetVault || targetVault.id === activeVault.id) return;

    clearTimeout(state.saveTimer);
    activeVault = targetVault;
    activeStore = await getOrInitStore(activeVault);

    if (state.localDepth !== 0) {
      state.localDepth = 0;
      el.depth0.classList.add('is-active');
      el.depth1.classList.remove('is-active');
      el.depth2.classList.remove('is-active');
      graphView.localDepth = 0;
    }

    if (state.searchQuery) {
      el.search.value = '';
      state.searchQuery = '';
      el.searchClear.classList.remove('is-visible');
      el.searchResults.classList.remove('is-open');
      el.searchResults.innerHTML = '';
      graphView.setSearchQuery('');
    }

    syncVaultChrome();
    recomputeGraph({ resetLayout: true });
    selectNote(activeVault.initialNote, {
      openDrawer: !state.drawerCollapsed,
      switchToRead: true,
      pinGraph: false,
    });
    options.onVaultChange?.(activeVault.id, activeVault);
  }

  if (el.vaultSwitcher) {
    el.vaultSwitcher.querySelectorAll('[data-vault-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextId = btn.getAttribute('data-vault-id');
        if (nextId) switchVault(nextId);
      });
    });
  }

  // Export & import controls
  el.exportMd.addEventListener('click', () => {
    if (state.activeSlug) {
      activeStore.exportSingleMarkdown(state.activeSlug);
    }
  });

  el.exportZip.addEventListener('click', () => {
    activeStore.exportAllZip(activeVault.zipFilename || 'zettelkasten-notes.zip');
  });

  if (el.importMd && el.fileInput) {
    el.importMd.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', async () => {
      if (!el.fileInput.files?.length) return;
      const imported = await activeStore.importMarkdownFiles(el.fileInput.files);
      el.fileInput.value = '';
      recomputeGraph();
      if (imported[0]) {
        selectNote(imported[0], { openDrawer: true, switchToRead: true, focusGraph: true });
      }
    });
  }

  if (el.resetVault) {
    el.resetVault.addEventListener('click', async () => {
      await activeStore.resetToSeed();
      recomputeGraph({ resetLayout: true });
      selectNote(activeVault.initialNote, { openDrawer: true, switchToRead: true, focusGraph: true });
    });
  }

  if (el.deleteNote) {
    el.deleteNote.addEventListener('click', async () => {
      if (!state.activeSlug) return;
      if (state.graph.notesBySlug.size <= 1) return;
      const deletingSlug = state.activeSlug;
      await activeStore.deleteNote(deletingSlug);
      recomputeGraph();
      const nextSlug = state.graph.notesBySlug.keys().next().value;
      if (nextSlug) {
        selectNote(nextSlug, { openDrawer: true, switchToRead: true });
      }
    });
  }

  // Global keyboard shortcut `/` to focus search and `Escape` to clear graph selection
  const onKeyDown = (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inField = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === '/' && !inField) {
      e.preventDefault();
      el.search.focus();
    } else if (e.key === 'Escape' && document.activeElement === el.search) {
      el.search.blur();
      el.search.value = '';
      updateSearch('');
    } else if (e.key === 'Escape' && !inField) {
      graphView.setSelectedSlug(null);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Initial load (keep graph unpinned until user clicks a node or wikilink)
  syncVaultChrome();
  syncDrawerVisibility();
  recomputeGraph({ resetLayout: true });
  selectNote(activeVault.initialNote, {
    openDrawer: !state.drawerCollapsed,
    switchToRead: true,
    pinGraph: false,
  });

  return {
    get store() {
      return activeStore;
    },
    graphView,
    selectNote: (slug, opts) => selectNote(slug, opts),
    switchVault: (vaultId) => switchVault(vaultId),
    getActiveVault: () => activeVault.id,
    parseNoteRaw,
    destroy() {
      clearTimeout(state.saveTimer);
      window.removeEventListener('keydown', onKeyDown);
      graphView.destroy();
      container.innerHTML = '';
    },
  };
}
