import { ClientFactory } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

async function testA2A() {
  console.log("Creating A2A client...");
  
  // Create a client factory
  const factory = new ClientFactory();
  
  // The URL should point to your local A2A server's agent card or base URL
  const agentUrl = 'http://localhost:4000';
  
  try {
    const client = await factory.createFromUrl(agentUrl);
    console.log("✅ Client created successfully. Connected to Agent:", client.agentCard.name);
    
    // Create a user message to trigger search_ucl_profiles
    const message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            action: 'search_ucl_profiles',
            args: { query: 'geoAI' }
          })
        }
      ]
    };

    console.log("Sending task to agent...");
    const iterator = await client.sendMessageStream({ message });
    
    for await (const response of iterator) {
      if (response.kind === 'message') {
        const textPart = response.parts.find(p => p.kind === 'text');
        console.log("\n🤖 Agent Response:");
        console.log(textPart.text);
      }
    }
    
    console.log("\n✅ Task completed successfully.");
    
  } catch (error) {
    console.error("❌ Error testing A2A server:", error);
  }
}

testA2A();
