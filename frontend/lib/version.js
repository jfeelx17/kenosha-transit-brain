// Single source of truth for the version we tell the world (the upstream User-Agent, mainly).
// Kept as a module rather than importing package.json so the server lib runs under plain Node;
// scripts/check-transit.mjs fails if this and package.json ever drift apart.
export const APP_VERSION = '0.5.0';
