import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ResearchRun, ResearchRunEvent } from "./model"
import { initialEvents } from "./state"

function runDirectory(workspacePath: string, runID: string): string {
  return path.join(workspacePath, ".spinosa", "runs", runID)
}

export class FileResearchRunRepository {
  async create(run: ResearchRun): Promise<void> {
    await this.save(run)
    for (const event of initialEvents(run)) await this.append(run.workspacePath, run.id, event)
  }

  async load(workspacePath: string, runID: string): Promise<ResearchRun | undefined> {
    try {
      return JSON.parse(await readFile(path.join(runDirectory(workspacePath, runID), "run.json"), "utf8")) as ResearchRun
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return
      throw error
    }
  }

  async save(run: ResearchRun): Promise<void> {
    const directory = runDirectory(run.workspacePath, run.id)
    await mkdir(directory, { recursive: true })
    const target = path.join(directory, "run.json")
    const temporary = path.join(directory, ".run-" + process.pid + "-" + crypto.randomUUID())
    await writeFile(temporary, JSON.stringify(run, null, 2) + "\n", "utf8")
    await rename(temporary, target)
  }

  async append(workspacePath: string, runID: string, event: ResearchRunEvent): Promise<void> {
    const directory = runDirectory(workspacePath, runID)
    await mkdir(directory, { recursive: true })
    await appendFile(path.join(directory, "events.jsonl"), JSON.stringify(event) + "\n", "utf8")
  }
}
