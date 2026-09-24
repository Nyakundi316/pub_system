import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Split the heavy vendor code out of the app bundle. Recharts (and the pile of
// d3-* packages it drags in) is by far the biggest thing we ship, so it earns
// its own chunk that only the pages using charts pull down.
function vendorChunk(id) {
    if (!id.includes('node_modules'))
        return;
    if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id))
        return 'charts';
    if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
        return 'react';
    if (id.includes('@tanstack'))
        return 'query';
    if (id.includes('socket.io') || id.includes('engine.io'))
        return 'realtime';
}
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // Dev: talk to the API without CORS. Socket.IO upgrades through here too.
            '/api': { target: 'http://localhost:4000', changeOrigin: true },
            '/socket.io': { target: 'http://localhost:4000', ws: true },
        },
    },
    build: {
        rollupOptions: {
            output: { manualChunks: vendorChunk },
        },
    },
});
