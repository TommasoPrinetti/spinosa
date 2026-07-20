/** User-facing install commands. Stable = production; dev = beta prereleases. */

const STABLE_URL = 'https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh';
const DEV_URL = 'https://github.com/TommasoPrinetti/spinosa/releases/download/dev/install.sh';

export const STABLE_INSTALL_CMD = `curl -fsSL ${STABLE_URL} | bash`;

export function stableInstallCmd(): string {
	return STABLE_INSTALL_CMD;
}

export const DEV_INSTALL_CMD = `curl -fsSL ${DEV_URL} | bash`;

export function devInstallCmd(): string {
	return DEV_INSTALL_CMD;
}
