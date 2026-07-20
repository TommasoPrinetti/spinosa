
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const NODE_ENV: string;
	export const COLORTERM: string;
	export const OPENCODE: string;
	export const GREP_MAX_CHARS: string;
	export const SPINOSA_BIN_DIR: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const AGENT: string;
	export const OSLogRateLimit: string;
	export const SED_MAX_LINES: string;
	export const HOMEBREW_CELLAR: string;
	export const INFOPATH: string;
	export const npm_config_user_agent: string;
	export const BUN_INSTALL: string;
	export const npm_config_local_prefix: string;
	export const LOGNAME: string;
	export const TEXT_MAX_CHARS: string;
	export const RG_MAX_TOKENS: string;
	export const TERM_PROGRAM: string;
	export const NVM_INC: string;
	export const RG_MAX_LINES: string;
	export const HOME: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_command: string;
	export const XPC_FLAGS: string;
	export const npm_lifecycle_event: string;
	export const npm_lifecycle_script: string;
	export const USER: string;
	export const SED_MAX_TOKENS: string;
	export const __CFBundleIdentifier: string;
	export const SVELTEKIT_FORK: string;
	export const npm_node_execpath: string;
	export const _: string;
	export const npm_package_json: string;
	export const SED_MAX_CHARS: string;
	export const LC_CTYPE: string;
	export const TERM_SESSION_ID: string;
	export const PATH: string;
	export const GLOB_MAX_RESULTS: string;
	export const GREP_MAX_TOKENS: string;
	export const GLOB_MAX_CHARS: string;
	export const TERM_PROGRAM_VERSION: string;
	export const TEXT_MAX_TOKENS: string;
	export const SSH_AUTH_SOCK: string;
	export const NVM_DIR: string;
	export const TEXT_MAX_LINES: string;
	export const NVM_BIN: string;
	export const HOMEBREW_REPOSITORY: string;
	export const HOMEBREW_PREFIX: string;
	export const SHLVL: string;
	export const TERM: string;
	export const TMPDIR: string;
	export const LANG: string;
	export const GREP_MAX_LINES: string;
	export const SHELL: string;
	export const GLOB_MAX_TOKENS: string;
	export const RG_MAX_CHARS: string;
	export const SPINOSA_BUN: string;
	export const PWD: string;
	export const NVM_CD_FLAGS: string;
	export const NODE: string;
	export const OPENCODE_PID: string;
	export const npm_execpath: string;
	export const FPATH: string;
	export const npm_package_version: string;
	export const npm_package_name: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		NODE_ENV: string;
		COLORTERM: string;
		OPENCODE: string;
		GREP_MAX_CHARS: string;
		SPINOSA_BIN_DIR: string;
		__CF_USER_TEXT_ENCODING: string;
		AGENT: string;
		OSLogRateLimit: string;
		SED_MAX_LINES: string;
		HOMEBREW_CELLAR: string;
		INFOPATH: string;
		npm_config_user_agent: string;
		BUN_INSTALL: string;
		npm_config_local_prefix: string;
		LOGNAME: string;
		TEXT_MAX_CHARS: string;
		RG_MAX_TOKENS: string;
		TERM_PROGRAM: string;
		NVM_INC: string;
		RG_MAX_LINES: string;
		HOME: string;
		XPC_SERVICE_NAME: string;
		npm_command: string;
		XPC_FLAGS: string;
		npm_lifecycle_event: string;
		npm_lifecycle_script: string;
		USER: string;
		SED_MAX_TOKENS: string;
		__CFBundleIdentifier: string;
		SVELTEKIT_FORK: string;
		npm_node_execpath: string;
		_: string;
		npm_package_json: string;
		SED_MAX_CHARS: string;
		LC_CTYPE: string;
		TERM_SESSION_ID: string;
		PATH: string;
		GLOB_MAX_RESULTS: string;
		GREP_MAX_TOKENS: string;
		GLOB_MAX_CHARS: string;
		TERM_PROGRAM_VERSION: string;
		TEXT_MAX_TOKENS: string;
		SSH_AUTH_SOCK: string;
		NVM_DIR: string;
		TEXT_MAX_LINES: string;
		NVM_BIN: string;
		HOMEBREW_REPOSITORY: string;
		HOMEBREW_PREFIX: string;
		SHLVL: string;
		TERM: string;
		TMPDIR: string;
		LANG: string;
		GREP_MAX_LINES: string;
		SHELL: string;
		GLOB_MAX_TOKENS: string;
		RG_MAX_CHARS: string;
		SPINOSA_BUN: string;
		PWD: string;
		NVM_CD_FLAGS: string;
		NODE: string;
		OPENCODE_PID: string;
		npm_execpath: string;
		FPATH: string;
		npm_package_version: string;
		npm_package_name: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
