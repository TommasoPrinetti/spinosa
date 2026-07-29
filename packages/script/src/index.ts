import semver from "semver"
import path from "path"
import { npmTagForVersion } from "../../../script/npm-release-config"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  SPINOSA_CHANNEL: process.env["SPINOSA_CHANNEL"],
  SPINOSA_VERSION: process.env["SPINOSA_VERSION"],
  SPINOSA_RELEASE: process.env["SPINOSA_RELEASE"],
}
const VERSION = rootPkg.version
if (env.SPINOSA_VERSION && env.SPINOSA_VERSION !== VERSION) {
  throw new Error(`SPINOSA_VERSION ${env.SPINOSA_VERSION} does not match canonical product version ${VERSION}`)
}

const CHANNEL = env.SPINOSA_CHANNEL ?? npmTagForVersion(VERSION)
const IS_PREVIEW = CHANNEL !== "latest"

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const members = (await Bun.file(teamPath).exists())
  ? await Bun.file(teamPath)
      .text()
      .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
      .then((x) => x.filter((x) => x && !x.startsWith("#")))
  : []
const team = [
  ...members,
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.SPINOSA_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`spinosa script`, JSON.stringify(Script, null, 2))
