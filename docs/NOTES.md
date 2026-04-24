Antigravity Prompt
*********************************
Project Specification: Node.js Multi-Tenant RAG Pipeline Upgrade for Blog Generator

Context: > I have an existing Node.js web app that processes a JSON file located in the docs folder. This JSON contains a list of publications by an author. The project contains an .env file with the credentials and endpoints for my local OpenWebUI/Ollama setup. Currently, this app sends the title and basic description of a publication directly to the OpenWebUI API (running the Gemma 3 model) to generate a blog post, LinkedIn post, or Bluesky post. This app will be deployed on a shared webserver where multiple users will process their own documents.

Objective: > I want to upgrade this Node.js app to use a fully local Retrieval-Augmented Generation (RAG) architecture using PostgreSQL and pgvector. When the JSON payload is passed to the endpoint, the system must fetch the full content of the publication based on the provided url (examples of this payload are in the docs folder). This URL might be a direct PDF link, a standard HTML webpage, or an HTML webpage that contains a link to download the full PDF. The system must fetch the publication from the provided url, use an appropiate Ollama model to parse the HTML (or a Node library for PDFs), chunk and embed the text into Postgres, and use the extracted context to generate a much richer post via OpenWebUI and Gemma 3.
Step-by-Step Requirements:

1. Infrastructure (Docker & Postgres):

Create a docker-compose.yml file at the root of the project to spin up a PostgreSQL database.

Crucial: Use the official pgvector image (e.g., pgvector/pgvector:pg16). Include standard environment variables and map port 5432 with a persistent volume.

2. Document Ingestion, Routing & LLM Extraction (Node.js): > - Create a Node.js utility (using fetch or axios) to grab the raw content of the provided url.

Crucial Routing & Extraction Logic: >   - If the URL is a direct PDF, route to a layout-aware Node.js PDF parser (e.g., pdf2json or a wrapper around pdf.js) to extract the multi-column text cleanly.

If the URL is an HTML page, do not use standard scrapers like Cheerio. Instead, send the raw HTML payload to a lightweight model via the local Ollama API (referencing the .env file for the endpoint). Prompt the model to: 1. Search for a direct PDF download link (<a href="...pdf">). If found, return ONLY the link. 2. If no PDF link exists, extract and return the clean, readable academic text from the HTML, ignoring navbars and footers.

If the Ollama model returns a PDF link, fetch that PDF and route it to the Node PDF parser.

3. RAG Implementation & Database Schema: > - Database Setup: Use a Node.js Postgres client (like pg or an ORM like Drizzle/Prisma) to connect to the container. Enable the extension (CREATE EXTENSION IF NOT EXISTS vector;) and create a table for the document chunks containing: user_id (for multi-tenant isolation), document_url, the chunk_text, and the embedding (vector type).

Chunking Strategy: Because this runs on high-end GPU hardware (A100/L40), use a generous chunk size (e.g., 1000-2000 tokens) with a 200-token overlap.

Embedding Model: Generate embeddings using a high-parameter local model like bge-m3 or nomic-embed-text via the Ollama API. INSERT these embeddings and text into Postgres.

4. Context Retrieval: > - Use the publication metadata from the JSON payload to query the Postgres database from Node.js.

Multi-Tenant Rule: The vector similarity search MUST be filtered by the user_id to ensure users only retrieve context from their own documents. Retrieve the top 3-5 chunks.

5. OpenWebUI Integration:

Construct a new, unified system prompt in Node.js that injects the retrieved chunks inside explicit <EXTRACTED_CONTEXT> tags, alongside the user's original title and description.

Make an HTTP POST request to the local OpenWebUI API (targeting Gemma 3, using the .env credentials) to generate the final post.

Agent Instructions:

Artifact First: Please generate a detailed Implementation Plan artifact outlining the Node.js packages (pg, axios, etc.), the docker-compose setup, and the database schema before writing code.

Verification: Once the code is written, please instruct me to run docker compose up -d. Then, use your built-in browser capabilities to trigger a test run verifying the LLM-based HTML extraction, Postgres vector insertion, and OpenWebUI generation.