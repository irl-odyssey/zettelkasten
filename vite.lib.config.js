import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/lib/index.js'),
      name: 'ZettelkastenGraph',
      formats: ['es'],
      fileName: () => 'zettelkasten.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'zettelkasten.css';
          }
          return '[name][extname]';
        },
      },
    },
  },
});
