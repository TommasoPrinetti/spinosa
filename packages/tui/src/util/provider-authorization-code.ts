import type { ProviderAuthAuthorization } from "@spinosa/sdk/v2"

export async function copyProviderAuthorizationCode(
  authorization: Pick<ProviderAuthAuthorization, "instructions" | "url">,
  write: ((text: string) => Promise<void>) | undefined,
): Promise<boolean> {
  if (!write) return false
  const code = authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? authorization.url
  await write(code)
  return true
}
