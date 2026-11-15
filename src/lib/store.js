import JSZip from 'jszip';
import {
  parseNoteRaw,
  refactorWikilinksOnRename,
  serializeNote,
  titleToSlug,
} from './parser.js';

function normalizeSeedArray(seedNotes = []) {
  const list = Array.isArray(seedNotes)
    ? seedNotes
    : Object.entries(seedNotes || {}).map(([slug, raw]) =>
        typeof raw === 'string' ? { slug, raw } : { slug, ...raw }
      );
  return list.map((item) => {
    if (item.raw !== undefined) {
      const slug = item.slug || titleToSlug(item.title || 'untitled');
      return { slug, raw: String(item.raw) };
    }
    const title = item.title || 'Untitled';
    const slug = item.slug || titleToSlug(title);
    const raw = serializeNote({
      title,
      group: item.group || 'concept',
      tags: item.tags || [],
      aliases: item.aliases || [],
      body: item.body || item.content || '',
    });
    return { slug, raw };
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class NoteStore {
  constructor({
    seedNotes = [],
    apiBaseUrl = null,
    storageKey = 'zettelkasten-notes-v1',
    persistLocalStorage = true,
  } = {}) {
    this.seedNotes = normalizeSeedArray(seedNotes);
    this.apiBaseUrl = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, '') : null;
    this.storageKey = storageKey;
    this.persistLocalStorage = persistLocalStorage;
    this.mode = 'memory'; // 'disk' | 'local' | 'memory'
    this.notesMap = new Map();
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snapshot = this.getAllRaw();
    for (const fn of this.listeners) {
      fn(snapshot, this.mode);
    }
  }

  getAllRaw() {
    return Array.from(this.notesMap.entries())
      .map(([slug, raw]) => ({ slug, raw }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async init() {
    if (this.apiBaseUrl && typeof fetch === 'function') {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(this.apiBaseUrl, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data && Array.isArray(data.notes)) {
            this.mode = 'disk';
            this.notesMap.clear();
            const sourceList = data.notes.length > 0 ? data.notes : this.seedNotes;
            for (const n of sourceList) {
              this.notesMap.set(n.slug, n.raw);
            }
            if (data.notes.length === 0 && this.seedNotes.length > 0) {
              await this.syncBatchToDisk(this.seedNotes, []);
            }
            this.emit();
            return this;
          }
        }
      } catch {
        // Fallback cleanly to static / localStorage mode when no backend API is running
      }
    }

    if (this.persistLocalStorage && typeof localStorage !== 'undefined') {
      this.mode = 'local';
      try {
        const cached = localStorage.getItem(this.storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.notesMap.clear();
            for (const n of parsed) {
              this.notesMap.set(n.slug, n.raw);
            }
            this.emit();
            return this;
          }
        }
      } catch {
        // Ignore malformed localStorage state and fall back to seedNotes
      }
    } else {
      this.mode = 'memory';
    }

    this.notesMap.clear();
    for (const n of this.seedNotes) {
      this.notesMap.set(n.slug, n.raw);
    }
    this.saveLocalFallback();
    this.emit();
    return this;
  }

  saveLocalFallback() {
    if (this.mode !== 'local' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.getAllRaw()));
    } catch {
      // Storage quota full or unavailable
    }
  }

  async syncBatchToDisk(notes, deleteSlugs = []) {
    if (this.mode !== 'disk' || !this.apiBaseUrl) return;
    const res = await fetch(`${this.apiBaseUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, deleteSlugs }),
    });
    if (!res.ok) {
      throw new Error('Failed to save batch to disk');
    }
  }

  ensureUniqueSlug(desiredSlug, ignoreSlug = null) {
    let candidate = desiredSlug;
    let suffix = 2;
    while (this.notesMap.has(candidate) && candidate !== ignoreSlug) {
      candidate = `${desiredSlug}-${suffix++}`;
    }
    return candidate;
  }

  async saveNote({ previousSlug = null, title, group = 'concept', tags = [], aliases = [], body = '' }) {
    const cleanTitle = String(title || 'Untitled').trim() || 'Untitled';
    const baseSlug = titleToSlug(cleanTitle);
    const nextSlug = previousSlug && baseSlug === previousSlug
      ? previousSlug
      : this.ensureUniqueSlug(baseSlug, previousSlug);

    let oldTitle = null;
    if (previousSlug && this.notesMap.has(previousSlug)) {
      oldTitle = parseNoteRaw(previousSlug, this.notesMap.get(previousSlug)).title;
    }

    const nextRaw = serializeNote({
      title: cleanTitle,
      group,
      tags,
      aliases,
      body,
    });

    const writes = [{ slug: nextSlug, raw: nextRaw }];
    const deletes = [];

    if (previousSlug && previousSlug !== nextSlug) {
      this.notesMap.delete(previousSlug);
      deletes.push(previousSlug);
    }
    this.notesMap.set(nextSlug, nextRaw);

    // Refactor [[Old Title]] across other notes when renaming an existing note
    if (oldTitle && oldTitle !== cleanTitle) {
      const otherNotes = this.getAllRaw().filter((n) => n.slug !== nextSlug);
      const refactored = refactorWikilinksOnRename(otherNotes, oldTitle, cleanTitle);
      for (const refItem of refactored) {
        this.notesMap.set(refItem.slug, refItem.raw);
        writes.push(refItem);
      }
    }

    if (this.mode === 'disk') {
      if (writes.length === 1 && deletes.length <= 1) {
        const res = await fetch(`${this.apiBaseUrl}/${encodeURIComponent(nextSlug)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: nextRaw, previousSlug }),
        });
        if (!res.ok) throw new Error('Failed to save note to disk');
      } else {
        await this.syncBatchToDisk(writes, deletes);
      }
    } else {
      this.saveLocalFallback();
    }

    this.emit();
    return nextSlug;
  }

  async deleteNote(slug) {
    if (!this.notesMap.has(slug)) return;
    this.notesMap.delete(slug);

    if (this.mode === 'disk' && this.apiBaseUrl) {
      await fetch(`${this.apiBaseUrl}/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
    } else {
      this.saveLocalFallback();
    }

    this.emit();
  }

  async resetToSeed() {
    if (this.seedNotes.length === 0) return;
    const currentSlugs = Array.from(this.notesMap.keys());
    const seedSlugSet = new Set(this.seedNotes.map((n) => n.slug));
    const toDelete = currentSlugs.filter((s) => !seedSlugSet.has(s));

    this.notesMap.clear();
    for (const n of this.seedNotes) {
      this.notesMap.set(n.slug, n.raw);
    }

    if (this.mode === 'disk') {
      await this.syncBatchToDisk(this.seedNotes, toDelete);
    } else if (this.mode === 'local' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
      this.saveLocalFallback();
    }

    this.emit();
  }

  exportSingleMarkdown(slug) {
    const raw = this.notesMap.get(slug);
    if (raw === undefined) return;
    const blob = new Blob([raw], { type: 'text/markdown;charset=utf-8' });
    triggerBlobDownload(blob, `${slug}.md`);
  }

  async exportAllZip(zipName = 'zettelkasten-notes.zip') {
    const zip = new JSZip();
    const folder = zip.folder('notes');
    for (const { slug, raw } of this.getAllRaw()) {
      folder.file(`${slug}.md`, raw);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(blob, zipName);
  }

  async importMarkdownFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.name.toLowerCase().endsWith('.md'));
    if (files.length === 0) return [];

    const writes = [];
    const importedSlugs = [];

    for (const file of files) {
      const raw = await file.text();
      const rawBase = file.name.replace(/\.md$/i, '');
      const parsed = parseNoteRaw(titleToSlug(rawBase), raw);
      const slug = titleToSlug(parsed.title || rawBase);
      const normalizedRaw = raw.trim().startsWith('---')
        ? raw
        : serializeNote({
            title: parsed.title,
            group: parsed.group,
            tags: parsed.tags,
            aliases: parsed.aliases,
            body: parsed.body,
          });
      this.notesMap.set(slug, normalizedRaw);
      writes.push({ slug, raw: normalizedRaw });
      importedSlugs.push(slug);
    }

    if (this.mode === 'disk') {
      await this.syncBatchToDisk(writes, []);
    } else {
      this.saveLocalFallback();
    }

    this.emit();
    return importedSlugs;
  }
}
