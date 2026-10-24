import Keycloak from "keycloak-js";
let client: Keycloak | null = null;
export const authEnabled = import.meta.env.VITE_AUTH_MODE === "oidc";
export async function initializeAuthentication() {
  if (!authEnabled) return;
  const url = import.meta.env.VITE_OIDC_URL,
    realm = import.meta.env.VITE_OIDC_REALM,
    clientId = import.meta.env.VITE_OIDC_CLIENT_ID;
  if (!url || !realm || !clientId)
    throw new Error("OIDC is enabled but URL, realm or client ID is missing.");
  client = new Keycloak({ url, realm, clientId });
  const authenticated = await client.init({
    onLoad: "login-required",
    pkceMethod: "S256",
    checkLoginIframe: false,
  });
  if (!authenticated) throw new Error("Authentication did not complete.");
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.origin,
    );
    if (
      url.origin === location.origin &&
      (url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/terminology"))
    ) {
      await client!.updateToken(30);
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      headers.set("Authorization", `Bearer ${client!.token}`);
      return original(input, { ...init, headers });
    }
    return original(input, init);
  };
}
export function currentIdentity() {
  return (
    client?.tokenParsed?.preferred_username ||
    client?.subject ||
    "Synthetic demo"
  );
}
export function signOut() {
  client?.logout({ redirectUri: location.origin });
}

export async function downloadProtectedResource(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
