import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import svgLoader from 'vite-svg-loader';
import path from 'node:path';

const server = 'http://localhost:3000';

export default defineConfig({
  build: { assetsInlineLimit: 32 * 1024 },
  plugins: [
    vue(),
    svgLoader({
      svgoConfig: {
        plugins: [
          // 1) Базовый серый #808080 → currentColor
          {
            name: 'convertColors',
            params: {
              // regex → конвертируем ТОЛЬКО этот оттенок
              currentColor: /^#808080$/i,
            },
          },
          // 2) Уникальные id в пределах файла
          {
            name: 'prefixIds',
            params: {
              prefix: (node, info) =>
                  path.basename(info.path?.basename, '.svg'),
              delim: '-',
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // доступ из локальной сети
    proxy: {
      '/api': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
