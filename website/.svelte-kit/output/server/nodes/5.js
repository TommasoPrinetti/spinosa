import * as server from '../entries/pages/docs/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/docs/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/docs/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.DF1rv9xI.js","_app/immutable/chunks/BdrQAJEj.js","_app/immutable/chunks/CwF_PFZf.js","_app/immutable/chunks/CymRgjIC.js","_app/immutable/chunks/B0JiTRQd.js","_app/immutable/chunks/DK3Fl9T5.js","_app/immutable/chunks/xihTtKlq.js","_app/immutable/chunks/CneMPOx_.js"];
export const stylesheets = [];
export const fonts = [];
