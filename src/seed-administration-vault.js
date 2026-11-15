const rawNotes = import.meta.glob('../notes-administration/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const ADMINISTRATION_SEED_NOTES = Object.entries(rawNotes)
  .map(([path, raw]) => {
    const filename = path.split('/').pop() || '';
    const slug = filename.replace(/\.md$/i, '');
    return { slug, raw };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
