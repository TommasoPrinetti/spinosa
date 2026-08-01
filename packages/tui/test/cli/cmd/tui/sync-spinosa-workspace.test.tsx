/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../../../src/context/args"
import { ExitProvider } from "../../../../src/context/exit"
import { KVProvider } from "../../../../src/context/kv"
import { PermissionProvider } from "../../../../src/context/permission"
import { ProjectProvider } from "../../../../src/context/project"
import { SDKProvider } from "../../../../src/context/sdk"
import { SyncProvider, useSync } from "../../../../src/context/sync"
import { TestTuiContexts } from "../../../fixture/tui-environment"
import { createEventSource, createFetch, directory } from "../../../fixture/tui-sdk"
import { wait } from "./sync-fixture"

test("refresh scopes sessions to the active Spinosa workspace", async () => {
  const workspaceB = "/tmp/spinosa/workspace-b"
  const calls = createFetch()
  const events = createEventSource()
  let sync!: ReturnType<typeof useSync>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    sync = useSync()
    onMount(done)
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts>
      <ArgsProvider>
        <KVProvider>
          <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
            <PermissionProvider>
              <ProjectProvider>
                <ExitProvider exit={() => {}}>
                  <SyncProvider sessionDirectory={() => workspaceB}>
                    <Probe />
                  </SyncProvider>
                </ExitProvider>
              </ProjectProvider>
            </PermissionProvider>
          </SDKProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  try {
    await ready
    await wait(() => sync.status === "complete")
    await sync.session.refresh()

    expect(calls.session.at(-1)?.searchParams.get("directory")).toBe(workspaceB)
    expect(calls.session.at(-1)?.searchParams.get("scope")).toBeNull()
    expect(calls.session.at(-1)?.searchParams.get("workspace")).toBeNull()
    expect(sync.session.query()).toEqual({ directory: workspaceB })
  } finally {
    app.renderer.destroy()
  }
})
