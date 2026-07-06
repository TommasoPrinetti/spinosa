import {
  createContext,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type ParentProps,
  type Setter,
} from "solid-js"
import { useSync } from "../../context/sync"
import { useTuiPaths } from "../../context/runtime"
import { useSpinosaWorkspace } from "../../context/spinosa-workspace"

export type HomeSessionDestination = { type: "directory"; directory: string; subdirectory: boolean } | { type: "new" }

type Context = {
  destination: Accessor<HomeSessionDestination | undefined>
  setDestination: Setter<HomeSessionDestination | undefined>
  clear: () => void
}

const HomeSessionDestinationContext = createContext<Context>()

export function HomeSessionDestinationProvider(props: ParentProps) {
  const sync = useSync()
  const paths = useTuiPaths()
  const spinosa = useSpinosaWorkspace()
  const [selected, setDestination] = createSignal<HomeSessionDestination>()
  const destination = createMemo<HomeSessionDestination>(() => {
    if (selected()) return selected()!
    const workspacePath = spinosa.activePath
    if (workspacePath && !spinosa.genericMode) {
      return { type: "directory", directory: workspacePath, subdirectory: false }
    }
    return { type: "directory", directory: sync.path.directory || paths.cwd, subdirectory: false }
  })
  return (
    <HomeSessionDestinationContext.Provider
      value={{ destination, setDestination, clear: () => setDestination(undefined) }}
    >
      {props.children}
    </HomeSessionDestinationContext.Provider>
  )
}

export function useHomeSessionDestination() {
  return useContext(HomeSessionDestinationContext)
}
