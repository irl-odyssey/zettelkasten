# Zettelkasten Neural Graph

Interactive Obsidian-style neural **Graph View** + **Markdown Zettelkasten editor** built in vanilla ES modules (`d3-force` + HTML5 HiDPI Canvas), shipping with seven switchable knowledge vaults aligned with the GitHub Playbook:

- **Introduction (`notes-introduction/*.md`, 29 notes)**: Platform overview graph covering **GitHub Platform Evolution** (2008 Pull Requests to 2026 Projects & Agent Groups), **Octoverse & Agent Era Metrics** (`225M+` devs, `>40%` agent-started PRs, `220M` merged PRs/mo), **Git Infrastructure & Scale** (`+4M` cores, `7,200` writes/s), **Analyst Recognition**, the 5-stage **AI Developer Platform** (`Plan`, `Code`, `Review`, `Test & Secure`, `Operate`), **Universe 2026 Pillars** (`Innovate`, `Scale`, `Trust`), **GitHub Copilot** (modes, surfaces, multi-model & BYOK, Partner Agents, SDK, Agent HQ & Agent Teams, Automations), **Copilot Fusion** (`Standard`/`High`/`Max` effort, `Single`/`Cascade`/`Critique` patterns, benchmarks, pricing), and **Copilot Proxy & Trust** (PII/IP filters, US/EU data residency, FedRAMP).
- **Plan (`notes-plan/*.md`, 41 notes)**: GitHub-focused deep-dive graph covering **GitHub Discussions**, **Issues & Sub-issues**, **GitHub Projects**, **Custom Instructions** (`.instructions.md`, `AGENTS.md`), **Agent Skills** (`SKILL.md`, `gh skills install`, Agent Finder), **Agent Plugins** (`plugin.json`, marketplaces), **MCP Servers & Copilot Connectors**, **Custom Agents & Subagents** (`.agent.md`, model selection), **Hooks** (`preToolUse`, audit hooks, cloud/CLI/VS Code surfaces), **Copilot Spaces**, **Copilot Memory & Dreaming**, and **Copilot Managed Settings** (`managed-settings.json`, sandbox, `.github-private`).
- **Develop (`notes-develop/*.md`, 41 notes)**: Deep-dive graph covering **Copilot in VS Code** & **VS Code Agents Window** (5 panels, worktrees, remote control), **Copilot CLI** (`/fleet`, built-in subagents, Rubber Duck Review, credit limits, local/cloud sandboxes, programmatic mode), **Copilot Cloud Agent** (`copilot-setup-steps.yml`, MCP, validation tools), **GitHub Copilot App** (Projects, Connectors, Native Office Canvases, Image Generation, Computer Use, Connected Cloud Continuity), **Partner Agents** (Claude Code, OpenAI Codex, 3-tier governance), **Copilot Fusion & Proxy**, **GitHub Codespaces**, and **Copilot Spaces**.
- **Review (`notes-review/*.md`, 36 notes)**: Deep-dive graph covering **Pull Requests** (GitHub Flow, Git Flow, templates, diffs, merge methods, merge queue, auto-merge, Agent Merge), **Human Review** (`CODEOWNERS`, review states, inline threads, suggested changes), **Stacked Pull Requests** (`gh-stack`), **Copilot Code Review** (effort levels `Lite`/`Balanced`/`Max`, Copilot approvals, auto-review, Cloud Agent handoff), **PR Rulesets**, and **PR Checks** (status checks, CodeQL merge protection, Copilot Autofix, Code Quality findings).
- **Test & Secure (`notes/*.md`, 45 notes)**: Deep-dive graph covering **GitHub**, **GitHub Actions**, **GHAS**, **Code Security**, **Secret Protection**, **Code Scanning**, **Dependabot**, and **Code Quality**.
- **Administration (`notes-administration/*.md`, 42 notes)**: Deep-dive graph covering **GHEC / EMU / Data Residency (`GHE.com`) / GHES**, **Enterprise Setup & IAM** (30-day trial, OIDC vs SAML SSO, Entra ID apps, SCIM provisioning, IdP team sync), **Enterprise Governance** (org topologies, enterprise vs org teams, admin/repo roles, policies, rulesets, `managed-settings.json`), **GHE & Copilot Licensing** (Enterprise vs Org assignment, multi-org deduplication, outside/guest collaborators, VS bundles), **Usage-Based Billing & FinOps** (AI credits, shared pool, cost centers, 4-level budget hierarchy), and **Migrations** (`GEI` vs `ELM`, mannequins).
- **Overall Extended (`notes-extended/*.md`, 223 notes, 1,098 links)**: Full-resolution unified Zettelkasten merging every atomic concept across **Introduction**, **Plan**, **Develop**, **Review**, **Test & Secure**, **Operate**, and **Administration** with deduplicated canonical hubs and cross-domain neural bridges.

Switch vaults live from the top-left HUD bar or open `?vault=introduction`, `?vault=plan`, `?vault=develop`, `?vault=review`, `?vault=security`, `?vault=administration`, or `?vault=extended` directly.

## Run Locally

```bash
npm install
npm run dev
```

In local dev/preview mode (`vite.config.js`), creating, editing, renaming, or deleting notes in the browser writes directly to `notes-introduction/*.md`, `notes-plan/*.md`, `notes-develop/*.md`, `notes-review/*.md`, `notes/*.md`, `notes-administration/*.md`, or `notes-extended/*.md` on disk.

## Build Standalone App or Embeddable Library

```bash
# Static web app -> dist/
npm run build

# Reusable ES module + scoped CSS -> dist-lib/zettelkasten.js & dist-lib/zettelkasten.css
npm run build:lib
```

## Embed in Another Website (Astro, React, Vanilla JS)

Copy `src/lib/` (or import `dist-lib/zettelkasten.js` + `dist-lib/zettelkasten.css`) into your host site. Every style is scoped under `.zk-root` so it will not collide with Tailwind or host CSS. You can mount a single vault (`seedNotes`) or multiple switchable vaults (`vaults`):

```js
import { mountZettelkasten } from './zettelkasten.js';
import './zettelkasten.css';

const instance = await mountZettelkasten(document.getElementById('graph-mount'), {
  seedNotes,              // Record<slug, rawMarkdown> (or pass `vaults: [...]` for multi-vault mode)
  apiBaseUrl: null,       // Uses seedNotes + localStorage on static hosts (GitHub Pages / Astro)
  initialNote: 'github',  // Initial active node
  readOnly: false,        // Set true for a read-only interactive public graph
});
```
