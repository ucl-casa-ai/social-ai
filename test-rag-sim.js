import { searchChunks } from './db.js';
import { getEmbedding } from './ingest.js';
import 'dotenv/config';

async function testRagExtraction() {
  const jsonStr = `{
  "discoveryId": "2228349",
  "title": "Evaluating gendered water, sanitation and hygiene access in Uganda",
  "publicUrls": [
    "https://doi.org/10.5258/SOTON/WP00723"
  ]
}`;
  console.log("Parsing user JSON...");
  const itemData = JSON.parse(jsonStr);
  const publicUrl = itemData.publicUrls[0];
  const safeUserId = '98496';
  
  console.log("Mocking RAG injection process...");
  const titleAndDesc = (itemData.title || "") + " " + (itemData.description || itemData.abstract || "");
  console.log("Title and Description length:", titleAndDesc.length);
  
  try {
      const queryEmbedding = await getEmbedding(titleAndDesc);
      console.log("Embedding generated. Length:", queryEmbedding.length);
      const chunks = await searchChunks(safeUserId, publicUrl, queryEmbedding, 4);
      console.log('Resulting chunks from DB:', chunks.length);
  } catch(e) {
      console.error('RAG Error:', e);
  }
}

testRagExtraction().then(() => console.log('Done')).catch(console.error);
