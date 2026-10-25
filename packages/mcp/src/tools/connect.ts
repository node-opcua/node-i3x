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
    .describe('Optional Bearer authentication token for secured endpoints'),
  verifyConnection: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to immediately verify connectivity by querying server /v1/info'),
});

export async function handleConnect(
  args: z.infer<typeof connectSchema>,
  onBindingSwitch: (newBinding: I3XClientBinding) => void,
) {
  const { serverUrl, authToken, verifyConnection } = args;

  const newBinding = new RestClientBinding(serverUrl, authToken);

  let serverInfo: unknown;
  if (verifyConnection) {
    try {
      serverInfo = await newBinding.getInfo();
    } catch (err) {
      return {
        status: 'connection_failed',
        serverUrl,
        error: (err as Error).message,
        tip: 'Please check that the server URL is reachable and the authentication token (if required) is valid.',
      };
    }
  }

  // Switch the active binding on the MCP server
  onBindingSwitch(newBinding);

  return {
    status: 'connected',
    serverUrl,
    authenticated: Boolean(authToken),
    serverInfo: serverInfo || 'Connection established without verification.',
    message: `Successfully connected to ${serverUrl}. All subsequent i3X tool calls will query this endpoint.`,
  };
}
