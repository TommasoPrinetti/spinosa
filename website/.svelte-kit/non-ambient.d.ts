
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/casestudies" | "/docs" | "/docs/[slug]" | "/install" | "/install/dev";
		RouteParams(): {
			"/docs/[slug]": { slug: string }
		};
		LayoutParams(): {
			"/": { slug?: string | undefined };
			"/casestudies": Record<string, never>;
			"/docs": { slug?: string | undefined };
			"/docs/[slug]": { slug: string };
			"/install": Record<string, never>;
			"/install/dev": Record<string, never>
		};
		Pathname(): "/" | "/casestudies" | "/docs" | `/docs/${string}` & {} | `/docs/${string}/` & {} | "/install" | "/install/dev";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.ico" | "/og-image.jpg" | "/robots.txt" | string & {};
	}
}