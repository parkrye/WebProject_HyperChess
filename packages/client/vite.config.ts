import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_URL = process.env.HYPERCHESS_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 개발 중에는 게임 서버(Socket.IO)로 프록시
    proxy: { '/socket.io': { target: SERVER_URL, ws: true } },
  },
});
