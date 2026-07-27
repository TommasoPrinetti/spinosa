import type { IntegrationDraft, IntegrationMethodRegistration } from "../effect/integration.js"
import type { ConnectionInfo, CredentialValue } from "@spinosa/sdk/v2/types"
import type { Hooks } from "./registration.js"

export type { IntegrationDraft, IntegrationMethodRegistration }

export interface IntegrationHooks extends Hooks<{ transform: IntegrationDraft }> {
  readonly connection: {
    readonly active: (integrationID: string) => Promise<ConnectionInfo | undefined>
    readonly resolve: (
      connection: ConnectionInfo,
    ) => Promise<CredentialValue | undefined>
  }
}
