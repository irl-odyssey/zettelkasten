const rawFiles = import.meta.glob('../notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const SEED_NOTES = Object.entries(rawFiles)
  .map(([filePath, raw]) => {
    const filename = filePath.split('/').pop() || '';
    const slug = filename.replace(/\.md$/i, '');
    return { slug, raw: String(raw) };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
