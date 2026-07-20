import { H as attr, s as head } from "../../chunks/dev.js";
//#region src/lib/assets/favicon.png
var favicon_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAASCAYAAAC9+TVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAElJREFUeAHVkjsKADAIQ03p/a/cz9LN1mIEzSQIkheDsSRONSGIcqRrCwBnfhEXwPl5WowTLdBb0ImDtSLQncT2ZMvalTw4lCMTeJAZITBdn/oAAAAASUVORK5CYII=";
//#endregion
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	let { children } = $$props;
	head("12qhfyh", $$renderer, ($$renderer) => {
		$$renderer.push(`<link rel="icon"${attr("href", favicon_default)} sizes="any"/>`);
	});
	children($$renderer);
	$$renderer.push(`<!---->`);
}
//#endregion
export { _layout as default };
