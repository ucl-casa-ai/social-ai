import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { fileURLToPath } from "url";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getProfile, searchProfiles } from './ucl-api.js';
import { getOrcidProfileWithToken } from './orcid-client.js';

function createServer() {
  // Define the server
  const server = new Server(
    {
      name: "ucl-casa-ai-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_ucl_profile",
          description: "Fetches and transforms all data (profile, publications, teaching, grants) for a given UCL user ID.",
          inputSchema: {
            type: "object",
            properties: {
              userId: {
                type: "string",
                description: "The UCL user ID to fetch the profile for."
              }
            },
            required: ["userId"]
          }
        },
        {
          name: "get_orcid_profile",
          description: "Fetches an ORCID profile using a pre-configured access token from .env.",
          inputSchema: {
            type: "object",
            properties: {
              orcidId: {
                type: "string",
                description: "The ORCID iD of the profile to fetch."
              }
            },
            required: ["orcidId"]
          }
        },
        {
          name: "search_ucl_profiles",
          description: "Searches UCL profiles based on a query text and an optional department.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search term (e.g., 'geoAI')."
              },
              department: {
                type: "string",
                description: "Optional department to filter the search by (e.g., 'Geography')."
              }
            },
            required: ["query"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_ucl_profile") {
      const userId = request.params.arguments.userId;
      try {
        const data = await getProfile(userId);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching UCL profile: ${error.message}` }],
        };
      }
    }

    if (request.params.name === "get_orcid_profile") {
      const orcidId = request.params.arguments.orcidId;
      try {
        const data = await getOrcidProfileWithToken(orcidId);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching ORCID profile: ${error.message}` }],
        };
      }
    }

    if (request.params.name === "search_ucl_profiles") {
      const query = request.params.arguments.query;
      const department = request.params.arguments.department;
      try {
        const data = await searchProfiles(query, department);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error searching UCL profiles: ${error.message}` }],
        };
      }
    }

    throw new Error(`Tool not found: ${request.params.name}`);
  });

  return server;
}

// Run server
export async function startMcpServer() {
  const PORT = process.env.PORT || 3001;

  // 1. Setup Stdio server
  const stdioServer = createServer();
  const stdioTransport = new StdioServerTransport();
  await stdioServer.connect(stdioTransport);
  console.error("UCL SOCIAL-AI MCP server running on stdio");

  // 2. Setup SSE Server
  const app = express();
  const sessions = new Map();

  app.get("/sse", async (req, res) => {
    const sseServer = createServer();
    const transport = new SSEServerTransport("/message", res);
    await sseServer.connect(transport);

    sessions.set(transport.sessionId, transport);

    res.on("close", () => {
      sessions.delete(transport.sessionId);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sessions.get(sessionId);

    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  app.listen(PORT, () => {
    console.error(`UCL SOCIAL-AI MCP server running on SSE port ${PORT}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startMcpServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
  });
}
