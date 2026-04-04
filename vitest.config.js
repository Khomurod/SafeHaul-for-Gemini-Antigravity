import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/tests/setup.js',
        css: true,
        // Exclude Jest-only backend tests — those run via `cd functions && npm test`
        exclude: [
            '**/node_modules/**',
            'functions/test/bulkActions.test.js',
            'functions/test/integration/**',
            'functions/test/unit/rateLimiter.test.js',
        ],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@features': path.resolve(__dirname, './src/features'),
            '@shared': path.resolve(__dirname, './src/shared'),
            '@lib': path.resolve(__dirname, './src/lib'),
        },
    },
});
