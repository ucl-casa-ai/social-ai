import pkg from 'pg';
const { Pool } = pkg;
import pgvector from 'pgvector/pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Construct __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ debug: false, quiet: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('connect', async (client) => {
  try {
    await pgvector.registerType(client);
  } catch (e) {
    // Ignore error if extension not created yet
  }
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    // Now that the extension is created, register it on this client
    await pgvector.registerType(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        document_url TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding vector(768)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS model_logs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        model_name VARCHAR(255) NOT NULL,
        prompt JSONB NOT NULL,
        response_content TEXT NOT NULL
      );
    `);
    
    // Optional: create index (useful for large scale, but fine to just have for now)
    await client.query(`
      CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
    `);
    console.log("Database initialized and document_chunks table verified.");
  } catch (err) {
    console.error("Failed to initialize database", err);
  } finally {
    client.release();
  }
}

export async function insertChunk(userId, documentUrl, chunkText, embedding) {
  const query = `
    INSERT INTO document_chunks (user_id, document_url, chunk_text, embedding)
    VALUES ($1, $2, $3, $4)
  `;
  const values = [userId, documentUrl, chunkText, pgvector.toSql(embedding)];
  await pool.query(query, values);
}

export async function searchChunks(userId, documentUrl, embedding, limit = 5) {
  const query = `
    SELECT document_url, chunk_text, 1 - (embedding <=> $1) AS cosine_similarity
    FROM document_chunks
    WHERE user_id = $2 AND document_url = $3
    ORDER BY embedding <=> $1
    LIMIT $4
  `;
  const values = [pgvector.toSql(embedding), userId, documentUrl, limit];
  const res = await pool.query(query, values);
  return res.rows;
}

export async function logModelQuery(modelName, prompt, responseContent) {
  const query = `
    INSERT INTO model_logs (model_name, prompt, response_content)
    VALUES ($1, $2, $3)
    RETURNING id
  `;
  const values = [modelName, JSON.stringify(prompt), responseContent];
  try {
    const res = await pool.query(query, values);
    return res.rows[0].id;
  } catch (err) {
    console.error("Failed to log model query:", err);
    return null;
  }
}

export async function updateModelRating(logId, rating) {
  const query = `
    UPDATE model_logs 
    SET user_rating = $1 
    WHERE id = $2
  `;
  const values = [rating, logId];
  try {
    await pool.query(query, values);
  } catch (err) {
    console.error("Failed to update model rating:", err);
    throw err;
  }
}

