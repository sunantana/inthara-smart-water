import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server: 5173 — proxy /api ไปที่ backend v2 (3001)
// ไม่ชนกับ v1 ที่รันอยู่ (3080) และไม่ต้องตั้ง CORS ใน dev
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // ค่าเริ่มต้นผูกกับ localhost — ตั้ง VITE_DEV_HOST=0.0.0.0 เมื่อต้องเปิดให้เครื่องอื่น/cloud preview
    host: process.env.VITE_DEV_HOST || 'localhost',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
