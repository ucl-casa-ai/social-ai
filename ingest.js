import fetch from 'node-fetch';
import { PDFParse } from 'pdf-parse';
const pdfParse = PDFParse;
import { insertChunk, logModelQuery } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

// Call Ollama to complete a prompt
async function callOllama(prompt, model = process.env.OPENWEBUI_MODEL) {
    const url = `${process.env.OLLAMA_API_URL}/api/generate`;
    // We can use the OpenWebUI model config but this expects a pure Ollama endpoint if we use OLLAMA_API_URL.
    // If the user's gemma3 is strictly on OpenWebUI, we can use the OPENWEBUI_API_URL.
    // However, for pure generation without chat formatting, Ollama's /api/generate is standard.
    // Let's use OpenWebUI standard chat API if they use an OpenAI compatible endpoint.
    
    // Based on the prompt: "send the raw HTML payload to a lightweight model via the local Ollama API"
    // Let's use Ollama's native API, or if that fails, use OpenWebUI API from open-webui-api.js.
    // We'll use Ollama's direct endpoints assuming OLLAMA_API_URL points to `http://localhost:11434`
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: false
        })
    });
    
    if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    
    // Log the ingestion model query to the db
    try {
        await logModelQuery(model, prompt, data.response);
    } catch(err) {
        console.error("Failed to log ingest query:", err);
    }
    
    return data.response;
}

// Call Ollama to get embeddings
export async function getEmbedding(text, model = process.env.EMBEDDING_MODEL || 'nomic-embed-text') {
    const url = `${process.env.OLLAMA_API_URL}/api/embeddings`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            prompt: text
        })
    });
    if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    
    // Log the embeddings model query to the db
    try {
        const previewResponse = `[Vector Embedding Generated: ${data.embedding?.length || 0} dimensions]`;
        await logModelQuery(model, text, previewResponse);
    } catch(err) {
        console.error("Failed to log embedding query:", err);
    }
    
    return data.embedding;
}

// Simple chunking based on word boundaries.
// Targets ~1500 tokens (assume 1 word ~= 1.3 tokens -> ~1150 words)
function chunkText(text, targetWords = 1150, overlapWords = 150) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += (targetWords - overlapWords)) {
        const chunk = words.slice(i, i + targetWords).join(' ');
        if (chunk.trim().length > 0) {
            chunks.push(chunk);
        }
    }
    return chunks;
}

export async function processDocument(url, userId) {
    console.log(`Processing document for user ${userId}: ${url}`);
    
    // Fetch the URL
    const response = await fetch(url, {
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    let textContent = '';
    
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
        console.log("PDF detected, parsing...");
        const buffer = Buffer.from(await response.arrayBuffer());
        const parser = new PDFParse({ data: buffer });
        const pdfData = await parser.getText();
        textContent = pdfData.text;
    } else {
        const html = await response.text();
        
        let extractedPdfUrl = null;
        // 1. Quick native Regex check for PDF links in the HTML
        const pdfLinkMatch = html.match(/href="([^"]+\.pdf)"/i);
        if (pdfLinkMatch) {
             const relativeOrAbsoluteUrl = pdfLinkMatch[1];
             // Resolve relative URLs using the final redirect URL as base
             extractedPdfUrl = new URL(relativeOrAbsoluteUrl, response.url).toString();
             console.log(`Natively found PDF link via Regex: ${extractedPdfUrl}`);
        }
        
        if (extractedPdfUrl) {
            console.log(`Fetching natively extracted PDF: ${extractedPdfUrl}`);
            const pdfResponse = await fetch(extractedPdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!pdfResponse.ok) throw new Error(`Failed to fetch extracted PDF link: ${extractedPdfUrl}`);
            const buffer = Buffer.from(await pdfResponse.arrayBuffer());
            const parser = new PDFParse({ data: buffer });
            const pdfData = await parser.getText();
            textContent = pdfData.text;
        } else {
            console.log("No native PDF link found. Sending HTML to Ollama for extraction...");
            
            // Strip out scripts and styles to massively reduce token size and confusion
            const cleanHtml = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
                
            // Truncate HTML if it's too large to prevent overloading local model completely
            const truncatedHtml = cleanHtml.substring(0, 80000); 
            
            const extractPrompt = `
You are an intelligent data extraction assistant.
I will provide you with the raw HTML of an academic publication page.
First, check if there is a direct link to a PDF download (look for <a href="...pdf">). 
If you find a valid absolute URL to a PDF, return ONLY the URL of the PDF, starting with http. Do not include any other text.
If you DO NOT find a PDF link, extract the clean, readable academic text of the article from the HTML. Ignore navbars, footers, and menus. Return strictly the academic text. Do NOT return the URL of the webpage itself unless it is a PDF link.

HTML:
${truncatedHtml}
            `;
            
            let ollamaResponse = await callOllama(extractPrompt);
            ollamaResponse = ollamaResponse.trim();
            
            if (ollamaResponse.startsWith('http') && ollamaResponse.toLowerCase().includes('.pdf')) {
                console.log(`Ollama found a PDF link: ${ollamaResponse}. Fetching PDF...`);
                const pdfResponse = await fetch(ollamaResponse, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!pdfResponse.ok) throw new Error(`Failed to fetch extracted PDF link: ${ollamaResponse}`);
                const buffer = Buffer.from(await pdfResponse.arrayBuffer());
                const parser = new PDFParse({ data: buffer });
                const pdfData = await parser.getText();
                textContent = pdfData.text;
            } else {
                // Guardrail against LLM returning the website link instead of text due to Cloudflare blocks
                if (ollamaResponse.startsWith('http') && !ollamaResponse.toLowerCase().includes('.pdf')) {
                     throw new Error("LLM hallucinated a canonical URL instead of extracting text. The site might employ bot protection.");
                }
                if (ollamaResponse.length < 150) {
                     throw new Error("LLM extracted overly short text. The site might employ bot protection or lack content.");
                }
                console.log("Ollama extracted pure text based on HTML content.");
                textContent = ollamaResponse;
            }
        }
    }
    
    if (!textContent || textContent.trim().length === 0) {
        throw new Error("No text content could be extracted.");
    }
    
    // Chunk the text
    const chunks = chunkText(textContent);
    console.log(`Document split into ${chunks.length} chunks. Generating embeddings...`);
    
    // Generate embeddings and insert into DB
    let chunksInserted = 0;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
            const embedding = await getEmbedding(chunk);
            await insertChunk(userId, url, chunk, embedding);
            chunksInserted++;
            console.log(`Inserted chunk ${i + 1}/${chunks.length}`);
        } catch (err) {
            console.error(`Error processing chunk ${i + 1}:`, err.message);
        }
    }
    
    console.log(`Finished processing document ${url}. ${chunksInserted} chunks inserted.`);
}
