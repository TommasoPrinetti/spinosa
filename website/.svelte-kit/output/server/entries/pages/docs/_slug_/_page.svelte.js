import { d as unsubscribe_stores, l as store_get } from "../../../../chunks/dev.js";
import { t as page } from "../../../../chunks/stores.js";
import { t as DocArticle } from "../../../../chunks/DocArticle.js";
//#region src/routes/docs/[slug]/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		DocArticle($$renderer, { doc: store_get($$store_subs ??= {}, "$page", page).data.doc });
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
//#endregion
export { _page as default };
