import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { getProfile } from './ucl-api.js';
import { getOrcidProfileWithToken } from './orcid-client.js';
import { generateBlueskyPosts, generateLinkedInPost, generateCompletion, generateBlogPost, SYSTEM_PROMPTS } from './open-webui-api.js';

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});