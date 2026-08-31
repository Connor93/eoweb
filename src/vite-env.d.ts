/// <reference types="vite/client" />

/** Build identifier, injected by vite.config.ts. Used to cache-bust the GFX
 *  URLs, whose filenames are stable but whose contents can change. */
declare const __BUILD_ID__: string;
