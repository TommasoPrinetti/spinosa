/** User-facing install commands. Stable = production; beta = prereleases (dev alias). */

const STABLE_URL = 'https://github.com/medialab/spinosa/releases/download/stable/install.sh';
const DEV_URL = 'https://github.com/medialab/spinosa/releases/download/beta/install.sh';

export const STABLE_INSTALL_CMD = `curl -fsSL ${STABLE_URL} | bash`;

export function stableInstallCmd(): string {
	return STABLE_INSTALL_CMD;
}

export const DEV_INSTALL_CMD = `curl -fsSL ${DEV_URL} | bash`;

export function devInstallCmd(): string {
	return DEV_INSTALL_CMD;
}
