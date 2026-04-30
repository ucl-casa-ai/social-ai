import express from 'express';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
} from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import readline from 'readline';

import { getProfile, searchProfiles } from './ucl-api.js';
import { getOrcidProfileWithToken } from './orcid-client.js';

// 1. Define the agent's identity card.
const agentCard = {
  name: 'UCL Social AI Agent',
  description: 'An agent that searches and fetches UCL profiles and ORCID data.',
  protocolVersion: '0.3.0',
  version: '1.0.0',
  url: 'http://localhost:4000/a2a/jsonrpc',
  skills: [
    { 
      id: 'get_ucl_profile', 
      name: 'Get UCL Profile', 
      description: 'Fetches and transforms all data (profile, publications, teaching, grants) for a given UCL user ID.', 
      tags: ['ucl', 'profile'] 
    },
    { 
      id: 'get_orcid_profile', 
      name: 'Get ORCID Profile', 
      description: 'Fetches an ORCID profile using a pre-configured access token from .env.', 
      tags: ['orcid', 'profile'] 
    },
    { 
      id: 'search_ucl_profiles', 
      name: 'Search UCL Profiles', 
      description: 'Searches UCL profiles based on a query text and an optional department.', 
      tags: ['ucl', 'search'] 
    }
  ],
  capabilities: {
    pushNotifications: false,
  },
  defaultInputModes: ['text', 'application/json'],
  defaultOutputModes: ['text', 'application/json'],
  additionalInterfaces: [
    { url: 'http://localhost:4000/a2a/jsonrpc', transport: 'JSONRPC' },
    { url: 'http://localhost:4000/a2a/rest', transport: 'HTTP+JSON' },
  ],
};

// 2. Implement the agent's logic.
class UCLExecutor {
  async execute(requestContext, eventBus) {
    const { contextId, userMessage } = requestContext;
    let responseText = '';
    
    try {
      const text = userMessage.parts.find(p => p.kind === 'text')?.text || '';
      
      let requestData;
      try {
        requestData = JSON.parse(text);
      } catch (e) {
        responseText = "Error: Input must be a valid JSON string containing an 'action' field (e.g., 'get_ucl_profile') and 'args'.";
        this.sendResponse(responseText, contextId, eventBus);
        return;
      }

      if (requestData.action === "get_ucl_profile") {
        if (!requestData.args || !requestData.args.userId) {
          throw new Error("Missing 'userId' in args");
        }
        const data = await getProfile(requestData.args.userId);
        responseText = JSON.stringify(data, null, 2);
      } else if (requestData.action === "get_orcid_profile") {
        if (!requestData.args || !requestData.args.orcidId) {
          throw new Error("Missing 'orcidId' in args");
        }
        const data = await getOrcidProfileWithToken(requestData.args.orcidId);
        responseText = JSON.stringify(data, null, 2);
      } else if (requestData.action === "search_ucl_profiles") {
        if (!requestData.args || !requestData.args.query) {
          throw new Error("Missing 'query' in args");
        }
        const data = await searchProfiles(requestData.args.query, requestData.args.department);
        responseText = JSON.stringify(data, null, 2);
      } else {
        responseText = `Error: Unknown action '${requestData.action}'. Supported actions are get_ucl_profile, get_orcid_profile, search_ucl_profiles.`;
      }
    } catch (error) {
      responseText = `Error executing action: ${error.message}`;
    }

    this.sendResponse(responseText, contextId, eventBus);
  }

  sendResponse(text, contextId, eventBus) {
    const responseMessage = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      parts: [{ kind: 'text', text }],
      contextId: contextId,
    };
    eventBus.publish(responseMessage);
    eventBus.finished();
  }

  cancelTask = async () => {};
}

// 3. Set up and run the server.
export async function startA2aServer() {
  const agentExecutor = new UCLExecutor();
const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  agentExecutor
);

const app = express();

app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
app.use('/a2a/jsonrpc', jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));
app.use('/a2a/rest', restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

const PORT = process.env.A2A_PORT || 4000;
app.listen(PORT, () => {
  console.error(`🚀 UCL Social AI A2A Server started on http://localhost:${PORT}`);
});

// Setup Stdio Server
const jsonRpcStdioHandler = new JsonRpcTransportHandler(requestHandler);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const response = await jsonRpcStdioHandler.handle(request);
    
    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      for await (const chunk of response) {
         console.log(JSON.stringify(chunk));
      }
    } else {
      if (response) console.log(JSON.stringify(response));
    }
  } catch (err) {
    console.error("Failed to parse or handle line", err);
  }
});

  console.error("UCL Social AI A2A Server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startA2aServer().catch(err => {
    console.error("Fatal error starting A2A Server:", err);
    process.exit(1);
  });
}
