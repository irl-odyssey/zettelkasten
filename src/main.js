import { mountZettelkasten } from './lib/index.js';
import { ADMINISTRATION_SEED_NOTES } from './seed-administration-vault.js';
import { DEVELOP_SEED_NOTES } from './seed-develop-vault.js';
import { EXTENDED_SEED_NOTES } from './seed-extended-vault.js';
import { INTRODUCTION_SEED_NOTES } from './seed-introduction-vault.js';
import { PLAN_SEED_NOTES } from './seed-plan-vault.js';
import { REVIEW_SEED_NOTES } from './seed-review-vault.js';
import { SEED_NOTES } from './seed-vault.js';

const container = document.getElementById('app');
const params = new URLSearchParams(window.location.search);
const requestedVault = params.get('vault');
const validVaults = new Set([
  'introduction',
  'plan',
  'develop',
  'review',
  'security',
  'administration',
  'extended',
]);
const initialVault = validVaults.has(requestedVault) ? requestedVault : 'introduction';

mountZettelkasten(container, {
  initialVault,
  vaults: [
    {
      id: 'introduction',
      label: 'Introduction',
      title: 'GitHub Introduction Zettelkasten',
      seedNotes: INTRODUCTION_SEED_NOTES,
      apiBaseUrl: '/api/notes-introduction',
      storageKey: 'zettelkasten-github-introduction-v1',
      diskLabel: 'notes-introduction/*.md',
      zipFilename: 'zettelkasten-introduction.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'plan',
      label: 'Plan',
      title: 'GitHub Plan Zettelkasten',
      seedNotes: PLAN_SEED_NOTES,
      apiBaseUrl: '/api/notes-plan',
      storageKey: 'zettelkasten-github-plan-v1',
      diskLabel: 'notes-plan/*.md',
      zipFilename: 'zettelkasten-plan.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'develop',
      label: 'Develop',
      title: 'GitHub Develop Zettelkasten',
      seedNotes: DEVELOP_SEED_NOTES,
      apiBaseUrl: '/api/notes-develop',
      storageKey: 'zettelkasten-github-develop-v1',
      diskLabel: 'notes-develop/*.md',
      zipFilename: 'zettelkasten-develop.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'review',
      label: 'Review',
      title: 'GitHub Review Zettelkasten',
      seedNotes: REVIEW_SEED_NOTES,
      apiBaseUrl: '/api/notes-review',
      storageKey: 'zettelkasten-github-review-v1',
      diskLabel: 'notes-review/*.md',
      zipFilename: 'zettelkasten-review.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'security',
      label: 'Test & Secure',
      title: 'GitHub Security Zettelkasten',
      seedNotes: SEED_NOTES,
      apiBaseUrl: '/api/notes',
      storageKey: 'zettelkasten-github-security-v1',
      diskLabel: 'notes/*.md',
      zipFilename: 'zettelkasten-test-and-secure.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'administration',
      label: 'Administration',
      title: 'GitHub Administration Zettelkasten',
      seedNotes: ADMINISTRATION_SEED_NOTES,
      apiBaseUrl: '/api/notes-administration',
      storageKey: 'zettelkasten-github-administration-v1',
      diskLabel: 'notes-administration/*.md',
      zipFilename: 'zettelkasten-administration.zip',
      initialNote: 'GitHub',
    },
    {
      id: 'extended',
      label: 'Overall Extended',
      title: 'GitHub Overall Extended Zettelkasten',
      seedNotes: EXTENDED_SEED_NOTES,
      apiBaseUrl: '/api/notes-extended',
      storageKey: 'zettelkasten-github-extended-v1',
      diskLabel: 'notes-extended/*.md',
      zipFilename: 'zettelkasten-overall-extended.zip',
      initialNote: 'GitHub',
    },
  ],
  onVaultChange(vaultId) {
    const url = new URL(window.location.href);
    url.searchParams.set('vault', vaultId);
    window.history.replaceState({}, '', url);
  },
});

