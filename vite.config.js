import { defineConfig } from 'vite';
import react from '@vitejs.plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Exposes the app to local network IP addresses (0.0.0.0 listens on all interfaces)
    port: 8090,      // Staff App Port
    strictPort: true,
    cors: true,      // Allow cross-origin requests between apps
    hmr: {
      overlay: true  // Displays overlay on client if HMR/WebSocket errors occur
    }
  }
});
