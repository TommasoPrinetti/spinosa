import { t as STABLE_INSTALL_REDIRECT } from "../../../chunks/github-releases.js";
import { redirect } from "@sveltejs/kit";
//#region src/routes/install/+page.ts
var prerender = true;
var load = () => redirect(302, STABLE_INSTALL_REDIRECT);
//#endregion
export { load, prerender };
