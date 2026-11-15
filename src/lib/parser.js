import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function titleToSlug(title) {
  const base = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled-note';
}

export function normalizeKey(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function humanizeSlug(slug) {
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseListValue(rawVal) {
  const trimmed = rawVal.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return trimmed
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function parseFrontmatter(rawText) {
  const text = String(rawText ?? '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) {
    return { meta: {}, body: text };
  }
  const endIdx = text.indexOf('\n---\n', 4);
  const endAtEof = endIdx === -1 && text.endsWith('\n---') ? text.length - 4 : -1;
  const splitIdx = endIdx !== -1 ? endIdx : endAtEof;
  if (splitIdx === -1) {
    return { meta: {}, body: text };
  }

  const yamlBlock = text.slice(4, splitIdx);
  const body = endIdx !== -1 ? text.slice(splitIdx + 5) : '';
  const meta = {};
  let currentArrayKey = null;

  for (const line of yamlBlock.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const listItemMatch = line.match(/^\s*-\s+(.+)$/);
    if (listItemMatch && currentArrayKey) {
      meta[currentArrayKey].push(listItemMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const kvMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (key === 'tags' || key === 'aliases') {
        if (!val) {
          meta[key] = [];
          currentArrayKey = key;
        } else {
          meta[key] = parseListValue(val);
          currentArrayKey = null;
        }
      } else {
        meta[key] = val.replace(/^['"]|['"]$/g, '');
        currentArrayKey = null;
      }
    }
  }

  return { meta, body: body.replace(/^\n+/, '') };
}

export function serializeNote({ title, group = '', tags = [], aliases = [], body = '' }) {
  const lines = ['---'];
  lines.push(`title: "${String(title || 'Untitled').replace(/"/g, '\\"')}"`);
  if (group) {
    lines.push(`group: "${String(group).replace(/"/g, '\\"')}"`);
  }
  if (Array.isArray(tags) && tags.length > 0) {
    lines.push(`tags: [${tags.map((t) => `"${String(t).replace(/"/g, '\\"')}"`).join(', ')}]`);
  }
  if (Array.isArray(aliases) && aliases.length > 0) {
    lines.push(`aliases: [${aliases.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(', ')}]`);
  }
  lines.push('---');
  lines.push('');
  lines.push(String(body ?? '').replace(/^\n+/, '').trimEnd());
  lines.push('');
  return lines.join('\n');
}

export function parseNoteRaw(slug, raw) {
  const { meta, body } = parseFrontmatter(raw);
  let title = meta.title;
  let cleanedBody = body;

  if (!title) {
    const h1Match = body.match(/^#\s+(.+?)\s*(?:\n+|$)/);
    if (h1Match) {
      title = h1Match[1].trim();
      cleanedBody = body.slice(h1Match[0].length);
    } else {
      title = humanizeSlug(slug);
    }
  }

  return {
    slug,
    title,
    group: meta.group || meta.category || 'concept',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
    body: cleanedBody.trim(),
    raw: String(raw ?? ''),
  };
}

function maskCodeSegments(markdown) {
  // Replace fenced code blocks and inline code spans with spaces of equal length
  // so regex indices align with the original string while ignoring code literals.
  return markdown
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
}

function extractContextSnippet(body, matchIndex, matchLength) {
  const lineStart = body.lastIndexOf('\n', matchIndex);
  const lineEnd = body.indexOf('\n', matchIndex + matchLength);
  const rawLine = body
    .slice(lineStart === -1 ? 0 : lineStart + 1, lineEnd === -1 ? body.length : lineEnd)
    .replace(/^\s*[-*+>0-9.)]+\s*/, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
    .replace(/[*_~`]/g, '')
    .trim();

  if (rawLine.length <= 140) return rawLine;
  return `${rawLine.slice(0, 137)}...`;
}

export function extractWikilinks(body) {
  const text = String(body ?? '');
  const masked = maskCodeSegments(text);
  const regex = /\[\[([^\]|#\n]+)(?:#[^\]|\n]+)?(?:\|([^\]\n]+))?\]\]/g;
  const results = [];
  let match;

  while ((match = regex.exec(masked)) !== null) {
    const originalSlice = text.slice(match.index, match.index + match[0].length);
    const innerMatch = originalSlice.match(/^\[\[([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]$/);
    if (!innerMatch) continue;
    const target = innerMatch[1].trim();
    const heading = innerMatch[2] ? innerMatch[2].trim() : '';
    const label = innerMatch[3] ? innerMatch[3].trim() : target;
    if (!target) continue;

    results.push({
      target,
      heading,
      label,
      snippet: extractContextSnippet(text, match.index, match[0].length),
    });
  }

  return results;
}

export function buildVaultGraph(rawNotes) {
  const notes = rawNotes.map((item) => {
    if (item.raw !== undefined) {
      return parseNoteRaw(item.slug || titleToSlug(item.title), item.raw);
    }
    const slug = item.slug || titleToSlug(item.title);
    const raw = serializeNote({
      title: item.title,
      group: item.group || 'concept',
      tags: item.tags || [],
      aliases: item.aliases || [],
      body: item.body || item.content || '',
    });
    return parseNoteRaw(slug, raw);
  });

  const notesBySlug = new Map();
  const lookup = new Map();

  for (const note of notes) {
    notesBySlug.set(note.slug, {
      ...note,
      exists: true,
      outgoing: [],
      backlinks: [],
    });
    lookup.set(normalizeKey(note.slug), note.slug);
    lookup.set(normalizeKey(note.title), note.slug);
    for (const alias of note.aliases) {
      lookup.set(normalizeKey(alias), note.slug);
    }
  }

  const resolveTargetSlug = (targetName) => {
    const byKey = lookup.get(normalizeKey(targetName));
    if (byKey) return { slug: byKey, exists: true };
    const bySlug = lookup.get(normalizeKey(titleToSlug(targetName)));
    if (bySlug) return { slug: bySlug, exists: true };
    return { slug: `ghost:${titleToSlug(targetName)}`, exists: false };
  };

  const ghostNodes = new Map();
  const edgePairSet = new Set();
  const links = [];

  for (const note of notesBySlug.values()) {
    const rawLinks = extractWikilinks(note.body);
    const seenTargetsInNote = new Set();

    for (const link of rawLinks) {
      const resolved = resolveTargetSlug(link.target);
      if (resolved.slug === note.slug) continue;

      if (!resolved.exists && !ghostNodes.has(resolved.slug)) {
        ghostNodes.set(resolved.slug, {
          slug: resolved.slug,
          title: link.target,
          group: 'unresolved',
          tags: [],
          aliases: [],
          body: '',
          raw: '',
          exists: false,
          outgoing: [],
          backlinks: [],
        });
      }

      if (!seenTargetsInNote.has(resolved.slug)) {
        seenTargetsInNote.add(resolved.slug);
        note.outgoing.push({
          targetSlug: resolved.slug,
          targetTitle: resolved.exists ? notesBySlug.get(resolved.slug).title : link.target,
          exists: resolved.exists,
          snippet: link.snippet,
        });

        const targetNode = resolved.exists
          ? notesBySlug.get(resolved.slug)
          : ghostNodes.get(resolved.slug);

        targetNode.backlinks.push({
          sourceSlug: note.slug,
          sourceTitle: note.title,
          sourceGroup: note.group,
          snippet: link.snippet,
        });
      }

      // Undirected canonical pair key for clean graph rendering (with direction preserved on link)
      const pairKey =
        note.slug < resolved.slug
          ? `${note.slug}:::${resolved.slug}`
          : `${resolved.slug}:::${note.slug}`;

      if (!edgePairSet.has(pairKey)) {
        edgePairSet.add(pairKey);
        links.push({
          id: pairKey,
          source: note.slug,
          target: resolved.slug,
          unresolved: !resolved.exists,
        });
      }
    }
  }

  const neighborCount = new Map();
  for (const slug of notesBySlug.keys()) neighborCount.set(slug, 0);
  for (const slug of ghostNodes.keys()) neighborCount.set(slug, 0);

  for (const link of links) {
    neighborCount.set(link.source, (neighborCount.get(link.source) || 0) + 1);
    neighborCount.set(link.target, (neighborCount.get(link.target) || 0) + 1);
  }

  const nodes = [
    ...Array.from(notesBySlug.values()).map((n) => ({
      id: n.slug,
      slug: n.slug,
      title: n.title,
      group: n.group,
      tags: n.tags,
      exists: true,
      degree: neighborCount.get(n.slug) || 0,
      inCount: n.backlinks.length,
      outCount: n.outgoing.length,
    })),
    ...Array.from(ghostNodes.values()).map((g) => ({
      id: g.slug,
      slug: g.slug,
      title: g.title,
      group: 'unresolved',
      tags: [],
      exists: false,
      degree: neighborCount.get(g.slug) || 0,
      inCount: g.backlinks.length,
      outCount: 0,
    })),
  ];

  return {
    notesBySlug,
    ghostNodes,
    nodes,
    links,
    resolveTargetSlug,
  };
}

export function refactorWikilinksOnRename(rawNotes, oldTitle, newTitle) {
  const oldNorm = normalizeKey(oldTitle);
  if (!oldNorm || oldNorm === normalizeKey(newTitle)) return [];

  const updated = [];
  for (const item of rawNotes) {
    const parsed = parseNoteRaw(item.slug, item.raw);
    const masked = maskCodeSegments(parsed.body);
    const regex = /\[\[([^\]|#\n]+)(#[^\]|\n]+)?(\|[^\]\n]+)?\]\]/g;
    let changed = false;
    let cursor = 0;
    let rebuilt = '';
    let match;

    while ((match = regex.exec(masked)) !== null) {
      const orig = parsed.body.slice(match.index, match.index + match[0].length);
      const inner = orig.match(/^\[\[([^\]|#\n]+)(#[^\]|\n]+)?(\|[^\]\n]+)?\]\]$/);
      if (inner && normalizeKey(inner[1]) === oldNorm) {
        rebuilt += parsed.body.slice(cursor, match.index);
        rebuilt += `[[${newTitle}${inner[2] || ''}${inner[3] || ''}]]`;
        cursor = match.index + match[0].length;
        changed = true;
      }
    }

    if (changed) {
      rebuilt += parsed.body.slice(cursor);
      updated.push({
        slug: item.slug,
        raw: serializeNote({
          title: parsed.title,
          group: parsed.group,
          tags: parsed.tags,
          aliases: parsed.aliases,
          body: rebuilt,
        }),
      });
    }
  }

  return updated;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeRenderedHtml(html) {
  // Strip script/iframe/object tags and inline event handlers from user-edited Markdown
  return html
    .replace(/<(script|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|form)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function renderMarkdownWithWikilinks(body, resolveTargetSlug) {
  const text = String(body ?? '');
  const masked = maskCodeSegments(text);
  const tokens = [];
  const regex = /\[\[([^\]|#\n]+)(?:#[^\]|\n]+)?(?:\|([^\]\n]+))?\]\]/g;
  let cursor = 0;
  let prepared = '';
  let match;

  while ((match = regex.exec(masked)) !== null) {
    const orig = text.slice(match.index, match.index + match[0].length);
    const inner = orig.match(/^\[\[([^\]|#\n]+)(?:#[^\]|\n]+)?(?:\|([^\]\n]+))?\]\]$/);
    if (!inner) continue;

    const target = inner[1].trim();
    const label = (inner[2] || target).trim();
    const resolved = resolveTargetSlug ? resolveTargetSlug(target) : { slug: titleToSlug(target), exists: true };
    const tokenKey = `@@ZK_WIKILINK_${tokens.length}@@`;

    tokens.push(
      `<button type="button" class="zk-wikilink ${resolved.exists ? 'is-resolved' : 'is-unresolved'}" data-zk-slug="${escapeHtml(resolved.slug)}" data-zk-target="${escapeHtml(target)}" data-zk-exists="${resolved.exists ? 'true' : 'false'}">${escapeHtml(label)}</button>`
    );

    prepared += text.slice(cursor, match.index) + tokenKey;
    cursor = match.index + match[0].length;
  }
  prepared += text.slice(cursor);

  let html = sanitizeRenderedHtml(marked.parse(prepared));
  tokens.forEach((replacement, idx) => {
    html = html.replace(`@@ZK_WIKILINK_${idx}@@`, replacement);
  });

  return html;
}
