import { z } from 'zod';
import { RestClientBinding } from '../bindings/rest-binding.js';
import type { I3XClientBinding } from '../bindings/types.js';

export const connectSchema = z.object({
  serverUrl: z
    .string()
    .describe(
      "The base URL of the i3X Gateway (e.g. 'http://192.168.1.50:8000' or 'https://i3x-portal.sterfive.io/instance/SESSION_ID')",
    ),
  authToken: z
    .string()
    .optional()
    .describe(
      'Optional Bearer authentication token. Omitted when re-connecting to the current URL: the current token is kept.',
    ),
  verifyConnection: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to verify connectivity and credentials before switching (reads /v1/info and /v1/namespaces)',
    ),
});

export async function handleConnect(
  args: z.infer<typeof connectSchema>,
  onBindingSwitch: (newBinding: I3XClientBinding) => void,
  current?: I3XClientBinding,
) {
  const { serverUrl, authToken, verifyConnection } = args;

  const newBinding =
    current instanceof RestClientBinding
      ? current.connectTo(serverUrl, authToken)
      : new RestClientBinding(serverUrl, authToken);
  const tokenKept = authToken === undefined && newBinding.hasToken;
  const url = newBinding.getBaseUrl();

  let serverInfo: unknown;
  if (verifyConnection) {
    try {
      serverInfo = await newBinding.getInfo();
    } catch (err) {
      return {
        status: 'connection_failed',
        serverUrl: url,
        error: (err as Error).message,
        tip: 'Please check that the server URL is reachable.',
      };
    }
    // /v1/info is public on secured servers, so it proves nothing about the token:
    // check credentials on an endpoint that requires them.
    try {
      await newBinding.getNamespaces();
    } catch (err) {
      const message = (err as Error).message;
      if (/^HTTP 40[13]\b/.test(message)) {
        return {
          status: 'auth_failed',
          serverUrl: url,
          error: message,
          tip: 'The server rejected the credentials. Pass a valid authToken; the previous connection is still active.',
        };
      }
      return {
        status: 'connection_failed',
        serverUrl: url,
        error: message,
        tip: 'The server answered /v1/info but not /v1/namespaces; the previous connection is still active.',
      };
    }
  }

  // Switch the active binding on the MCP server
  onBindingSwitch(newBinding);

  return {
    status: 'connected',
    serverUrl: url,
    authenticated: newBinding.hasToken,
    ...(tokenKept
      ? { note: 'No authToken given: kept the token already in use for this URL.' }
      : {}),
    serverInfo: serverInfo || 'Connection established without verification.',
    message: `Successfully connected to ${url}. All subsequent i3X tool calls will query this endpoint.`,
  };
}
