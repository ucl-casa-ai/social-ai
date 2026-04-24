import { processDocument } from './ingest.js';
import fs from 'fs';

async function test() {
  const publicUrl = 'https://doi.org/10.5258/SOTON/WP00723'\;
  const safeUserId = '98496';
  try {
      console.log('Testing processDocument at', new Date().toISOString());
      await processDocument(publicUrl, safeUserId);
      console.log('Success');
  } catch(e) {
      console.error('Ingestion error message:', e.message);
  }
}
test().then(() => console.log('Finished')).catch(e => console.error('Fatal:', e));
