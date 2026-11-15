import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildVaultGraph,
  extractWikilinks,
  normalizeKey,
  parseFrontmatter,
  parseNoteRaw,
  refactorWikilinksOnRename,
  serializeNote,
  titleToSlug,
} from '../src/lib/parser.js';
import { computeNodeRadius } from '../src/lib/graph-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const notesDir = path.resolve(__dirname, '../notes');
const introNotesDir = path.resolve(__dirname, '../notes-introduction');
const planNotesDir = path.resolve(__dirname, '../notes-plan');
const developNotesDir = path.resolve(__dirname, '../notes-develop');
const reviewNotesDir = path.resolve(__dirname, '../notes-review');
const adminNotesDir = path.resolve(__dirname, '../notes-administration');
const extendedNotesDir = path.resolve(__dirname, '../notes-extended');

test('parseFrontmatter and serializeNote round-trip cleanly', () => {
  const raw = serializeNote({
    title: 'Push Protection',
    group: 'secret',
    tags: ['secrets', 'git-push'],
    aliases: ['Git Push Protection'],
    body: 'Blocks `git push` inside [[Secret Protection]].',
  });

  const { meta, body } = parseFrontmatter(raw);
  assert.equal(meta.title, 'Push Protection');
  assert.equal(meta.group, 'secret');
  assert.deepEqual(meta.tags, ['secrets', 'git-push']);
  assert.deepEqual(meta.aliases, ['Git Push Protection']);
  assert.match(body, /\[\[Secret Protection\]\]/);
});

test('extractWikilinks ignores fenced and inline code blocks and supports aliases', () => {
  const md = [
    'Connects [[GHAS]] and [[Code Security|GitHub Code Security]].',
    'Inline `[[Ignored Inline]]` should be skipped.',
    '```md',
    '[[Ignored Fence]]',
    '```',
  ].join('\n');

  const links = extractWikilinks(md);
  assert.deepEqual(
    links.map((l) => ({ target: l.target, label: l.label })),
    [
      { target: 'GHAS', label: 'GHAS' },
      { target: 'Code Security', label: 'GitHub Code Security' },
    ]
  );
});

test('refactorWikilinksOnRename updates matching wikilinks while preserving custom labels', () => {
  const raw = serializeNote({
    title: 'Overview',
    group: 'bridge',
    body: 'See [[GHAS]] and [[GHAS|Advanced Security]] plus `[[GHAS]]`.',
  });
  const updated = refactorWikilinksOnRename([{ slug: 'overview', raw }], 'GHAS', 'GitHub Advanced Security');
  assert.equal(updated.length, 1);
  assert.match(
    updated[0].raw,
    /See \[\[GitHub Advanced Security\]\] and \[\[GitHub Advanced Security\|Advanced Security\]\] plus `\[\[GHAS\]\]`\./
  );
});

test('seed vault notes form a connected neural graph with zero broken links', async () => {
  const entries = await fs.readdir(notesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(notesDir, file), 'utf8');
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in seed vault to resolve to an existing atomic note'
  );
  assert.ok(graph.nodes.length >= 45, `Expected >= 45 notes, got ${graph.nodes.length}`);

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  // Verify user-requested core hierarchy
  assert.ok(hasEdge('GitHub', 'GitHub Actions'));
  assert.ok(hasEdge('GitHub', 'GHAS'));
  assert.ok(hasEdge('GitHub', 'Code Quality'));
  assert.ok(hasEdge('GitHub Actions', 'Workflows & Triggers'));
  assert.ok(hasEdge('GitHub Actions', 'Actions Runners'));
  assert.ok(hasEdge('GitHub Actions', 'Marketplace Actions'));
  assert.ok(hasEdge('GitHub Actions', 'Workflow Lockfiles'));
  assert.ok(hasEdge('GitHub Actions', 'Actions Cache & Artifacts'));
  assert.ok(hasEdge('GitHub Actions', 'Actions Secrets & OIDC'));
  assert.ok(hasEdge('GitHub Actions', 'Actions Compute & Budgets'));
  assert.ok(hasEdge('GitHub Actions', 'DORA Metrics'));
  assert.ok(hasEdge('Workflow Lockfiles', 'Dependabot Alerts & Updates'));
  assert.ok(!hasEdge('GitHub Actions', 'Secret Protection'));
  assert.ok(!hasEdge('Actions Secrets & OIDC', 'Secret Protection'));
  assert.ok(hasEdge('GHAS', 'Code Security'));
  assert.ok(hasEdge('GHAS', 'Secret Protection'));
  assert.ok(hasEdge('Code Security', 'Code Scanning'));
  assert.ok(hasEdge('Code Security', 'Dependabot'));
  assert.ok(hasEdge('Secret Protection', 'Push Protection'));
  assert.ok(hasEdge('Secret Protection', 'Public Monitoring'));
  assert.ok(hasEdge('Secret Protection', 'AI-Detected Secrets'));
  assert.ok(hasEdge('Code Scanning', 'CodeQL'));
  assert.ok(hasEdge('Code Scanning', 'AI Scan'));

  // Verify cross-cutting neural links (e.g. CodeQL shared across Code Scanning, Code Quality, Reachability Analysis)
  assert.ok(hasEdge('Code Quality', 'CodeQL'));
  assert.ok(hasEdge('Reachability Analysis', 'CodeQL'));
});

test('plan vault covers all GitHub Plan & Copilot customization features with zero broken links or generic filler', async () => {
  const entries = await fs.readdir(planNotesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(planNotesDir, file), 'utf8');
    const { meta } = parseFrontmatter(raw);
    assert.equal(
      slug,
      titleToSlug(meta.title),
      `Expected filename slug "${slug}" to match titleToSlug("${meta.title}")`
    );
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in plan vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 41, `Expected 41 GitHub-focused plan notes, got ${graph.nodes.length}`);

  // Ensure non-GitHub general concepts and case studies were removed
  const nodeTitles = new Set(graph.nodes.map((n) => n.title));
  for (const removedTitle of [
    'Ultralight Orchestration',
    'Playbook Site Harness',
    'Multi-Phase Plan & File Ownership',
    'Harness Engineering',
    'Agent Execution Loop',
    'Human Approval Gates',
    'Open Ecosystem Formats',
    'Spec-Driven Development',
    'Collaboration Tools',
    'Context Engineering',
    'Context Rot',
    'Token Billing & Prompt Cache',
    'Context Window Lifecycle',
    'Progressive Disclosure',
  ]) {
    assert.ok(!nodeTitles.has(removedTitle), `Expected "${removedTitle}" to be absent from plan vault`);
  }

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
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
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected group "${expectedGroup}" in plan vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all plan notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  assert.ok(hasEdge('GitHub', 'GitHub Discussions'));
  assert.ok(hasEdge('GitHub', 'Issues & Sub-issues'));
  assert.ok(hasEdge('GitHub', 'GitHub Projects'));
  assert.ok(hasEdge('GitHub', 'Custom Instructions'));
  assert.ok(hasEdge('GitHub', 'Agent Skills'));
  assert.ok(hasEdge('GitHub', 'Agent Plugins'));
  assert.ok(hasEdge('GitHub', 'MCP Servers'));
  assert.ok(hasEdge('GitHub', 'Copilot Connectors'));
  assert.ok(hasEdge('GitHub', 'Custom Agents'));
  assert.ok(hasEdge('GitHub', 'Hooks'));
  assert.ok(hasEdge('GitHub', 'Copilot Spaces'));
  assert.ok(hasEdge('GitHub', 'Copilot Memory'));
  assert.ok(hasEdge('GitHub', 'Copilot Dreaming'));
  assert.ok(hasEdge('Agent Skills', 'SKILL.md Anatomy'));
  assert.ok(hasEdge('Agent Skills', 'Skill Registries & CLI'));
  assert.ok(hasEdge('Agent Skills', 'GitHub Agent Finder'));
  assert.ok(hasEdge('Agent Plugins', 'Plugin Manifest & Namespace'));
  assert.ok(hasEdge('Agent Plugins', 'Plugin Marketplaces & CLI'));
  assert.ok(hasEdge('MCP Servers', 'Copilot Connectors'));
  assert.ok(hasEdge('MCP Servers', 'GitHub MCP Server'));
  assert.ok(hasEdge('MCP Servers', 'MCP Configuration'));
  assert.ok(hasEdge('MCP Servers', 'MCP Allowlist Governance'));
  assert.ok(hasEdge('Custom Agents', 'Agent Markdown Config'));
  assert.ok(hasEdge('Custom Agents', 'Custom Agent Scopes'));
  assert.ok(hasEdge('Custom Agents', 'Subagents'));
  assert.ok(hasEdge('Custom Agents', 'Copilot Model Selection'));
  assert.ok(hasEdge('Hooks', 'PreToolUse Guardrails'));
  assert.ok(hasEdge('Hooks', 'Observation & Audit Hooks'));
  assert.ok(hasEdge('Hooks', 'Hooks Configuration & Surfaces'));
  assert.ok(hasEdge('Copilot Dreaming', 'Copilot Memory'));
  assert.ok(hasEdge('Copilot Dreaming', 'Repository Instructions'));
  assert.ok(hasEdge('Copilot Dreaming', 'Agent Skills'));
  assert.ok(hasEdge('Copilot Managed Settings', '.github-private Repository'));
});

test('develop vault covers all GitHub Develop & Copilot coding surfaces with zero broken links', async () => {
  const entries = await fs.readdir(developNotesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(developNotesDir, file), 'utf8');
    const { meta } = parseFrontmatter(raw);
    assert.equal(
      slug,
      titleToSlug(meta.title),
      `Expected filename slug "${slug}" to match titleToSlug("${meta.title}")`
    );
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in develop vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 41, `Expected 41 GitHub-focused develop notes, got ${graph.nodes.length}`);

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
    'root',
    'vscode',
    'cli',
    'cloud-agent',
    'copilot-app',
    'models-partners',
    'environments',
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected group "${expectedGroup}" in develop vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all develop notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  assert.ok(hasEdge('GitHub', 'Copilot in VS Code'));
  assert.ok(hasEdge('GitHub', 'VS Code Agents Window'));
  assert.ok(hasEdge('GitHub', 'Copilot CLI'));
  assert.ok(hasEdge('GitHub', 'Copilot Cloud Agent'));
  assert.ok(hasEdge('GitHub', 'GitHub Copilot App'));
  assert.ok(hasEdge('GitHub', 'Partner Agents'));
  assert.ok(hasEdge('GitHub', 'Copilot Fusion'));
  assert.ok(hasEdge('GitHub', 'Copilot Proxy'));
  assert.ok(hasEdge('GitHub', 'GitHub Codespaces'));
  assert.ok(hasEdge('GitHub', 'Copilot Spaces'));
  assert.ok(hasEdge('Copilot CLI', 'CLI Slash Commands & Fleet'));
  assert.ok(hasEdge('Copilot CLI', 'Rubber Duck Review'));
  assert.ok(hasEdge('Copilot Cloud Agent', 'copilot-setup-steps.yml'));
  assert.ok(hasEdge('Copilot Cloud Agent', 'Cloud Agent Validation Tools'));
  assert.ok(hasEdge('GitHub Copilot App', 'Native Office Canvases'));
  assert.ok(hasEdge('GitHub Copilot App', 'Connected Cloud Continuity'));
  assert.ok(hasEdge('Partner Agents', 'Claude Code on GitHub'));
  assert.ok(hasEdge('Partner Agents', 'OpenAI Codex on GitHub'));
});

test('review vault covers all GitHub Pull Request, Stacking & Copilot Code Review features with zero broken links', async () => {
  const entries = await fs.readdir(reviewNotesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(reviewNotesDir, file), 'utf8');
    assert.ok(!raw.includes('\u2014') && !raw.includes('\u30fb'), `Unexpected forbidden punctuation in ${file}`);
    const { meta } = parseFrontmatter(raw);
    assert.equal(
      slug,
      titleToSlug(meta.title),
      `Expected filename slug "${slug}" to match titleToSlug("${meta.title}")`
    );
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in review vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 36, `Expected 36 GitHub-focused review notes, got ${graph.nodes.length}`);

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
    'root',
    'pr-workflow',
    'human-review',
    'stacking',
    'copilot-review',
    'pr-rulesets',
    'pr-checks',
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected group "${expectedGroup}" in review vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all review notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  assert.ok(hasEdge('GitHub', 'Pull Requests'));
  assert.ok(hasEdge('GitHub', 'Copilot Code Review'));
  assert.ok(hasEdge('GitHub', 'Stacked Pull Requests'));
  assert.ok(hasEdge('GitHub', 'Merge Queue'));
  assert.ok(hasEdge('GitHub', 'Agent Merge'));
  assert.ok(hasEdge('GitHub', 'PR Rulesets'));
  assert.ok(hasEdge('Pull Requests', 'GitHub Flow'));
  assert.ok(hasEdge('Stacked Pull Requests', 'gh-stack CLI'));
  assert.ok(hasEdge('Copilot Code Review', 'Review Effort Levels'));
  assert.ok(hasEdge('Copilot Code Review', 'Copilot Review Approvals'));
  assert.ok(hasEdge('Copilot Code Review', 'PR Coding Agent Handoff'));
  assert.ok(hasEdge('PR Rulesets', 'Required Pull Request Reviews'));
  assert.ok(hasEdge('PR Rulesets', 'Required Status Checks'));
});

test('administration vault covers all GitHub Enterprise deployment, IAM, governance, licensing, UBB & migration features with zero broken links', async () => {
  const entries = await fs.readdir(adminNotesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(adminNotesDir, file), 'utf8');
    assert.ok(!raw.includes('\u2014') && !raw.includes('\u30fb'), `Unexpected forbidden punctuation in ${file}`);
    const { meta } = parseFrontmatter(raw);
    assert.equal(
      slug,
      titleToSlug(meta.title),
      `Expected filename slug "${slug}" to match titleToSlug("${meta.title}")`
    );
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in administration vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 42, `Expected 42 GitHub-focused administration notes, got ${graph.nodes.length}`);

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
    'root',
    'deployment',
    'iam',
    'governance',
    'licensing',
    'billing',
    'migrations',
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected group "${expectedGroup}" in administration vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all administration notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  assert.ok(hasEdge('GitHub', 'GitHub Enterprise Cloud'));
  assert.ok(hasEdge('GitHub', 'Enterprise Managed Users'));
  assert.ok(hasEdge('GitHub', 'GHE.com Data Residency'));
  assert.ok(hasEdge('GitHub', 'GitHub Enterprise Server'));
  assert.ok(hasEdge('GitHub', 'SAML & OIDC SSO'));
  assert.ok(hasEdge('GitHub', 'Enterprise Governance'));
  assert.ok(hasEdge('GitHub', 'GHE & Copilot Licenses'));
  assert.ok(hasEdge('GitHub', 'Usage-Based Billing'));
  assert.ok(hasEdge('GitHub', 'Cost Centers'));
  assert.ok(hasEdge('GitHub', 'Budgets & Spending Limits'));
  assert.ok(hasEdge('GitHub', 'GitHub Migrations'));
  assert.ok(hasEdge('SAML & OIDC SSO', 'SCIM Provisioning'));
  assert.ok(hasEdge('Enterprise Governance', 'Copilot Managed Settings'));
  assert.ok(hasEdge('Usage-Based Billing', 'Shared AI Credit Pool'));
  assert.ok(hasEdge('GitHub Migrations', 'GitHub Enterprise Importer'));
  assert.ok(hasEdge('GitHub Migrations', 'Enterprise Live Migrator'));
});

test('introduction vault covers GitHub platform evolution, Octoverse, Universe 2026 pillars & Copilot Fusion with zero broken links', async () => {
  const entries = await fs.readdir(introNotesDir);
  const rawList = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(introNotesDir, file), 'utf8');
    assert.ok(!raw.includes('\u2014') && !raw.includes('\u30fb'), `Unexpected forbidden punctuation in ${file}`);
    const { meta } = parseFrontmatter(raw);
    assert.equal(
      slug,
      titleToSlug(meta.title),
      `Expected filename slug "${slug}" to match titleToSlug("${meta.title}")`
    );
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in introduction vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 29, `Expected 29 GitHub-focused introduction notes, got ${graph.nodes.length}`);

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
    'root',
    'platform',
    'sdlc',
    'pillars',
    'copilot',
    'fusion',
    'trust-arch',
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected group "${expectedGroup}" in introduction vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all introduction notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  assert.ok(hasEdge('GitHub', 'GitHub Platform Evolution'));
  assert.ok(hasEdge('GitHub', 'Octoverse & Agent Era Metrics'));
  assert.ok(hasEdge('GitHub', 'Git Infrastructure & Scale'));
  assert.ok(hasEdge('GitHub', 'AI Developer Platform'));
  assert.ok(hasEdge('GitHub', 'Innovate Pillar'));
  assert.ok(hasEdge('GitHub', 'Scale Pillar'));
  assert.ok(hasEdge('GitHub', 'Trust Pillar'));
  assert.ok(hasEdge('GitHub', 'GitHub Copilot'));
  assert.ok(hasEdge('GitHub', 'Agent HQ & Agent Teams'));
  assert.ok(hasEdge('GitHub', 'Copilot Fusion'));
  assert.ok(hasEdge('GitHub', 'Copilot Proxy'));
  assert.ok(hasEdge('Copilot Fusion', 'Fusion Effort Levels'));
  assert.ok(hasEdge('Copilot Fusion', 'Fusion Execution Patterns'));
  assert.ok(hasEdge('Copilot Fusion', 'Fusion Billing & Launch Pricing'));
  assert.ok(hasEdge('Copilot Proxy', 'Copilot Trust & IP Protection'));
  assert.ok(hasEdge('Copilot Proxy', 'Copilot Data Residency & FedRAMP'));
});

test('overall extended vault unifies all subparts cleanly with zero broken links, zero lookup collisions, and rich cross-domain bridges', async () => {
  const entries = await fs.readdir(extendedNotesDir);
  const rawList = [];
  const lookupMap = new Map();

  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = await fs.readFile(path.join(extendedNotesDir, file), 'utf8');
    assert.ok(!raw.includes('\u2014') && !raw.includes('\u30fb'), `Unexpected forbidden punctuation in ${file}`);
    const parsed = parseNoteRaw(slug, raw);
    assert.equal(
      slug,
      titleToSlug(parsed.title),
      `Expected filename slug "${slug}" to match titleToSlug("${parsed.title}")`
    );
    for (const key of [parsed.slug, parsed.title, ...parsed.aliases]) {
      const norm = normalizeKey(key);
      assert.ok(
        !lookupMap.has(norm) || lookupMap.get(norm) === slug,
        `Unexpected lookup collision on "${norm}" between ${lookupMap.get(norm)} and ${slug}`
      );
      lookupMap.set(norm, slug);
    }
    rawList.push({ slug, raw });
  }

  const graph = buildVaultGraph(rawList);
  const unresolved = graph.nodes.filter((n) => !n.exists);
  assert.deepEqual(
    unresolved.map((u) => u.title),
    [],
    'Expected every [[wikilink]] in extended vault to resolve to an existing atomic note'
  );
  assert.equal(graph.nodes.length, 223, `Expected 223 unified extended notes, got ${graph.nodes.length}`);
  assert.ok(graph.links.length >= 1000, `Expected >= 1000 cross-linked edges, got ${graph.links.length}`);

  const presentGroups = new Set(graph.nodes.map((n) => n.group));
  for (const expectedGroup of [
    'root',
    'intro',
    'plan',
    'develop',
    'review',
    'secure',
    'operate',
    'admin',
  ]) {
    assert.ok(presentGroups.has(expectedGroup), `Expected macro group "${expectedGroup}" in extended vault`);
  }

  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const l of graph.links) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  const visited = new Set(['github']);
  const queue = ['github'];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  assert.equal(visited.size, graph.nodes.length, 'Expected all 223 extended notes to be reachable from GitHub');

  const hasEdge = (a, b) => {
    const slugA = titleToSlug(a);
    const slugB = titleToSlug(b);
    return graph.links.some(
      (l) =>
        (l.source === slugA && l.target === slugB) ||
        (l.source === slugB && l.target === slugA)
    );
  };

  // Cross-domain bridges across Intro, Plan, Develop, Review, Secure, Operate & Admin
  assert.ok(hasEdge('SDLC Stage 01 Plan', 'Agent Skills'));
  assert.ok(hasEdge('SDLC Stage 02 Code', 'Copilot in VS Code'));
  assert.ok(hasEdge('SDLC Stage 03 Review', 'Copilot Code Review'));
  assert.ok(hasEdge('SDLC Stage 04 Test & Secure', 'GHAS'));
  assert.ok(hasEdge('SDLC Stage 05 Operate', 'Agentic Workflows'));
  assert.ok(hasEdge('Code Scanning PR Merge Protection', 'CodeQL'));
  assert.ok(hasEdge('Copilot Autofix in PRs', 'Agentic Autofix'));
  assert.ok(hasEdge('Copilot Managed Settings', 'MCP Allowlist Governance'));
  assert.ok(hasEdge('Partner Agents', 'Claude Code on GitHub'));
  assert.ok(hasEdge('Agentic Workflows', 'Workflow Lockfiles'));
  assert.ok(!hasEdge('GitHub Actions', 'Secret Protection'));
});

test('computeNodeRadius grows strictly with link count and separates hubs from leaf notes', () => {
  const bounds = { minDegree: 3, maxDegree: 19, exists: true };
  const samples = [0, 1, 3, 5, 9, 13, 16, 19].map((deg) => ({
    deg,
    r: computeNodeRadius(deg, bounds),
  }));

  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      samples[i].r > samples[i - 1].r,
      `Expected radius(${samples[i].deg})=${samples[i].r} > radius(${samples[i - 1].deg})=${samples[i - 1].r}`
    );
  }

  const leafRadius = computeNodeRadius(3, bounds);
  const hubRadius = computeNodeRadius(19, bounds);
  assert.ok(
    hubRadius / leafRadius >= 4,
    `Expected hub/leaf radius ratio >= 4x, got ${(hubRadius / leafRadius).toFixed(2)}x`
  );
});

