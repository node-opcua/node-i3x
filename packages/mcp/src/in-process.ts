// @node-i3x/mcp/in-process: needs the optional peer dependency @node-i3x/rest-server.
// Kept out of the root export so the REST-only CLI and library never install Fastify.
export * from './bindings/connector-binding.js';
