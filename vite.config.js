import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';

// Read the manifest at build time so we never depend on JSON import-assertion
// syntax (which varies between Node versions).
const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'));

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // Chrome Web Store rejects sourcemaps that reference missing files; keep the
    // build self-contained and easy to review.
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true
  }
});
