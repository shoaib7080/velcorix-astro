import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.velcorix.com',
  devToolbar: {
    enabled: false
  },
  output: 'static',
  build: {
    format: 'file',
  }
});
