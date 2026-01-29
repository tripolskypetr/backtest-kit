import { defineConfig } from "vite";
import { barrel } from "vite-plugin-barrel";
import environmentPlugin from "vite-plugin-environment";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import commonjs from "vite-plugin-commonjs";
import react from "@vitejs/plugin-react-swc";
import million from "million/compiler";
import path from "path";

export default defineConfig({
    plugins: [
        commonjs(),
        ...(process.env.NODE_ENV === "development"
            ? [barrel({ packages: ["@mui/material", "@mui/icons-material"] })]
            : []),
        million.vite({
            auto: true,
        }),
        react(),
        nodePolyfills({
            protocolImports: true,
        }),
        environmentPlugin("all", { prefix: "CC_" }),
    ],
    build: {
        target: "chrome87",
        outDir: "build",
        minify: "terser",
        assetsInlineLimit: 0,
    },
    optimizeDeps: {
        include: ["@mui/material/Tooltip", "@emotion/styled"],
        exclude: ["@syntect/wasm"],
    },
    server: {
        hmr: false,
        proxy: {
            '/api/v1': {
                target: 'http://localhost:1337',
                changeOrigin: true,
                secure: false,
            },
            '/api/v2': {
                target: 'http://localhost:1337',
                changeOrigin: true,
                secure: false,
                ws: true,
            }
        }
    },
    resolve: {
        alias: {
            "react/jsx-runtime": path.resolve(
                __dirname,
                "./src/i18n/config/jsx-runtime",
            ),
            "react/jsx-dev-runtime": path.resolve(
                __dirname,
                "./src/i18n/config/jsx-dev-runtime",
            ),
        },
    },
});
