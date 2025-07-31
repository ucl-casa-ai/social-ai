import express from 'express';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { getProfile } from './ucl-api.js';
import { getOrcidProfileWithToken } from './orcid-client.js';
import { generateBlueskyPosts, generateLinkedInPost, generateCompletion, generateBlogPost, SYSTEM_PROMPTS } from './open-webui-api.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Set up __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Create cache directory on startup ---
const cacheDir = path.join(__dirname, 'cache');
try {
  await fs.mkdir(cacheDir, { recursive: true });
} catch (error) {
  console.error('Could not create cache directory.', error);
}

// --- Load ComfyUI workflow on startup ---
let comfyWorkflow = null;
let comfyWorkflowFile = process.env.COMFYUI_WORKFLOW_FILE || 'comfyui-workflow.json';
const comfyWorkflowPath = path.join(__dirname, 'data', comfyWorkflowFile);
try {
  const comfyWorkflowData = await fs.readFile(comfyWorkflowPath, 'utf-8');
  comfyWorkflow = JSON.parse(comfyWorkflowData);
  console.log(`ComfyUI workflow "${comfyWorkflowFile}" loaded successfully.`);
} catch (error) {
  console.error(`Could not load ComfyUI workflow file "${comfyWorkflowFile}". The /api/generate/image endpoint will not work.`, error);
  comfyWorkflowFile = null; // To indicate failure
}

// --- View Engine Setup ---
// Use EJS as the templating engine to allow for dynamic partials.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Security Middleware ---
//app.use(helmet());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Middleware to parse JSON bodies

// --- Middleware to add app version to all responses ---
const appVersion = process.env.APP_VERSION || 'dev';
app.use((req, res, next) => {
  res.locals.appVersion = appVersion;
  next();
});

// --- Page Routes ---
app.get('/', (req, res) => {
  res.render('index', { title: 'UCL Profile Fetcher', page: 'search' });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About',
    page: 'about'
  });
});

app.get('/profile/:userId', (req, res) => {
  const maxRecords = process.env.APP_MAX_RECORDS || 5;
  res.render('profile', {
    title: 'Social AI',
    page: 'profile',
    maxRecords: maxRecords
  });
});

app.get('/playground', (req, res) => {
  res.render('playground', { title: 'AI Playground', page: 'playground' });
});

app.get('/oauth/callback', (req, res) => {
  const { code } = req.query;
  res.render('oauth-callback', {
    title: 'OAuth Authorization Code',
    // This page isn't in the main nav, but this prevents errors
    page: 'oauth-callback',
    code: code || 'No code provided in the URL.'
  });
});

app.get('/staff', async (req, res) => {
  try {
    const staffDataPath = path.join(__dirname, 'data', 'staff.json');
    const staffData = await fs.readFile(staffDataPath, 'utf-8');
    const staff = JSON.parse(staffData);
    res.render('staff', { title: 'CASA Staff List', page: 'staff', staff });
  } catch (error) {
    console.error('Failed to load staff data:', error);
    res.status(500).send('Error loading staff page.');
  }
});

// API endpoint to fetch profile data
app.get('/api/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`Received request for user ID: ${userId}`);

  try {
    const profileData = await getProfile(userId);
    res.json(profileData);
  } catch (error) {
    console.log(error);
    console.error(`Error fetching data for user ${userId}:`, error.message);
    res.status(500).json({ error: `An error occurred while fetching data. ${error.message}` });
  }
});

// API endpoint to get all system prompts
app.get('/api/prompts', (req, res) => {
  res.json(SYSTEM_PROMPTS);
});

// API endpoint to fetch ORCID profile data with caching
app.get('/api/orcid/:orcidId', async (req, res) => {
  const { orcidId } = req.params;
  // A simple regex to ensure it looks like an ORCID iD.
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    return res.status(400).json({ error: 'Invalid ORCID iD format.' });
  }

  const cacheFilePath = path.join(cacheDir, `${orcidId}.json`);

  // 1. Check cache first
  try {
    const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
    console.log(`Serving ORCID profile for ${orcidId} from cache.`);
    // It's already a JSON string, so we can send it directly.
    res.setHeader('Content-Type', 'application/json');
    res.send(cachedData);
    return;
  } catch (error) {
    // ENOENT means file not found, which is a normal cache miss.
    if (error.code !== 'ENOENT') {
      console.error(`Error reading cache file for ${orcidId}:`, error);
    }
    console.log(`Cache miss for ${orcidId}. Fetching from ORCID API.`);
  }

  // 2. If cache miss, fetch from the ORCID API
  try {
    // This function requires ORCID_ACCESS_TOKEN to be set in the .env file.
    const orcidProfile = await getOrcidProfileWithToken(orcidId);

    // 3. Save to cache for future requests
    await fs.writeFile(cacheFilePath, JSON.stringify(orcidProfile, null, 2), 'utf-8');
    console.log(`Successfully cached ORCID profile for ${orcidId}.`);

    res.json(orcidProfile);
  } catch (error) {
    console.error(`Error fetching ORCID profile for ${orcidId}:`, error.message);
    res.status(500).json({ error: `Failed to fetch ORCID profile. ${error.message}` });
  }
});

// API endpoint to generate Bluesky posts
app.post('/api/generate/bluesky', async (req, res) => {
  const { context } = req.body;
  const model = process.env.OPENWEBUI_MODEL || 'llama3';

  if (!context) {
    return res.status(400).json({ error: 'Context is required in the request body.' });
  }

  try {
    console.log(`Generating Bluesky posts for model: ${model}`);
    const result = await generateBlueskyPosts(model, context);
    res.json(result);
  } catch (error) {
    console.error('Error generating Bluesky posts:', error.message);
    res.status(500).json({ error: 'Failed to generate Bluesky posts.' });
  }
});

// API endpoint to generate a LinkedIn post
app.post('/api/generate/linkedin', async (req, res) => {
  const { context } = req.body;
  const model = process.env.OPENWEBUI_MODEL || 'llama3';

  if (!context) {
    return res.status(400).json({ error: 'Context is required in the request body.' });
  }

  try {
    console.log(`Generating LinkedIn post for model: ${model}`);
    const result = await generateLinkedInPost(model, context);
    res.json(result);
  } catch (error) {
    console.error('Error generating LinkedIn post:', error.message);
    res.status(500).json({ error: 'Failed to generate LinkedIn post.' });
  }
});

// API endpoint to generate a Blog post
app.post('/api/generate/blog', async (req, res) => {
  const { context } = req.body;
  const model = process.env.OPENWEBUI_MODEL || 'llama3';

  if (!context) {
    return res.status(400).json({ error: 'Context is required in the request body.' });
  }

  try {
    console.log(`Generating blog post for model: ${model}`);
    const result = await generateBlogPost(model, context);
    res.json(result);
  } catch (error) {
    console.error('Error generating blog post:', error.message);
    res.status(500).json({ error: 'Failed to generate blog post.' });
  }
});

// API endpoint for the AI playground
app.post('/api/generate/prompt', async (req, res) => {
  const { context } = req.body;
  const model = process.env.OPENWEBUI_MODEL || 'llama3';

  if (!context) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }

  try {
    console.log(`Generating completion for model: ${model}`);
    // A generic system prompt for the playground
    const systemPrompt = "You are a helpful assistant. Please respond to the user's query accurately and concisely.";
    const messages = [{ role: 'user', content: context }];
    const result = await generateCompletion(model, messages, systemPrompt);
    res.json(result);
  } catch (error) {
    console.error('Error in playground generation:', error.message);
    res.status(500).json({ error: 'Failed to generate completion from the AI model.' });
  }
});

// API endpoint to generate an image via ComfyUI
app.post('/api/generate/image', async (req, res) => {
  const { prompt } = req.body; // e.g., { "positive": "a cat", "negative": "ugly" }
  const comfyUiUrl = process.env.COMFYUI_URL;

  if (!comfyUiUrl) {
    return res.status(500).json({ error: 'The ComfyUI URL is not configured on the server. Please set COMFYUI_URL in the .env file.' });
  }

  // The prompt should be a JSON object with at least a 'positive' key.
  if (!prompt || typeof prompt !== 'object' || !prompt.positive) {
    return res.status(400).json({ error: 'A `prompt` object with a `positive` key is required in the request body.' });
  }

  if (!comfyWorkflow) {
    return res.status(500).json({ error: 'ComfyUI workflow not loaded on server. Check server logs.' });
  }

  // --- 1. Prepare the prompt for ComfyUI ---
  // Deep copy the workflow to avoid modifying the loaded object during concurrent requests
  const workflow = JSON.parse(JSON.stringify(comfyWorkflow));

  // --- Define Node IDs based on the loaded workflow ---
  let positivePromptNodeId;
  let negativePromptNodeId;
  let outputNodeId;
  let seedNodeId;
  let seedPropertyName;

  if (comfyWorkflowFile === 'comfyui-fluxdev.json') {
    positivePromptNodeId = '43';
    negativePromptNodeId = null; // This workflow doesn't have a separate negative prompt node.
    outputNodeId = '39';
    seedNodeId = '45';
    seedPropertyName = 'noise_seed';
    console.log('Using node IDs for comfyui-fluxdev.json');
  } else { // Default to comfyui-workflow.json
    positivePromptNodeId = '6';
    negativePromptNodeId = '7';
    outputNodeId = '9';
    seedNodeId = '3';
    seedPropertyName = 'seed';
    console.log('Using node IDs for comfyui-workflow.json');
  }

  // --- Randomize the seed to generate a different image each time ---
  if (workflow[seedNodeId]) {
    const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    workflow[seedNodeId].inputs[seedPropertyName] = randomSeed;
    console.log(`Randomized seed for node ${seedNodeId} to ${randomSeed}`);
  } else {
    // This case should ideally not happen if workflows are correct.
    console.warn(`Seed node ID "${seedNodeId}" not found in workflow. Using default seed.`);
  }

  if (workflow[positivePromptNodeId]) {
    workflow[positivePromptNodeId].inputs.text = prompt.positive;
  } else {
    return res.status(500).json({ error: `Positive prompt node ID "${positivePromptNodeId}" not found in workflow.` });
  }

  // Optionally, update the negative prompt text if provided
  if (prompt.negative && negativePromptNodeId && workflow[negativePromptNodeId]) {
    workflow[negativePromptNodeId].inputs.text = prompt.negative;
  } else if (prompt.negative && !negativePromptNodeId) {
    console.warn(`Workflow "${comfyWorkflowFile}" does not support a separate negative prompt. It was ignored.`);
  }

  // Assign a client ID for the ComfyUI queue
  const clientId = uuidv4();
  const promptData = {
    prompt: workflow,
    client_id: clientId,
  };

  try {
    // --- 2. Queue the prompt ---
    console.log('Sending prompt to ComfyUI...');
    const queueResponse = await fetch(`${comfyUiUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptData),
    });

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text();
      throw new Error(`ComfyUI queue request failed with status ${queueResponse.status}: ${errorText}`);
    }

    const queueResult = await queueResponse.json();
    if (queueResult.error) {
      throw new Error(`ComfyUI error: ${queueResult.error.type} - ${queueResult.error.message}`);
    }
    const promptId = queueResult.prompt_id;
    console.log(`Prompt queued with ID: ${promptId}`);

    // --- 3. Poll for the result ---
    // This is a simplified polling mechanism. For a production app, WebSockets are recommended.
    let imageUrl = null;
    const maxAttempts = 120; // Poll for 120 seconds max (SDXL can be slow)
    const pollInterval = 1000; // 1 second

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      console.log(`Polling for prompt ${promptId}, attempt ${i + 1}`);

      const historyResponse = await fetch(`${comfyUiUrl}/history/${promptId}`);
      if (!historyResponse.ok) {
        console.error(`Failed to fetch history for prompt ${promptId}: ${historyResponse.statusText}`);
        continue; // Don't throw, just log and continue polling
      }

      const history = await historyResponse.json();
      if (history[promptId]) {
        // The output is from the 'SaveImage' node (ID '9' in our template)
        const outputs = history[promptId].outputs[outputNodeId];

        if (outputs && outputs.images && outputs.images.length > 0) {
          const { filename, subfolder, type } = outputs.images[0];
          imageUrl = `${comfyUiUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
          break; // Exit loop, we found the image
        }
      }
    }

    if (imageUrl) {
      res.json({ imageUrl });
    } else {
      res.status(504).json({ error: 'Image generation timed out.' });
    }
  } catch (error) {
    console.error('Error generating image with ComfyUI:', error.message);
    res.status(500).json({ error: `Failed to generate image. ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});