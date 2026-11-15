const rawNotes = import.meta.glob('../notes-develop/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const DEVELOP_SEED_NOTES = Object.entries(rawNotes)
  .map(([path, raw]) => {
    const filename = path.split('/').pop() || '';
    const slug = filename.replace(/\.md$/i, '');
    return { slug, raw };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
