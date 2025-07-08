import dotenv from 'dotenv';
import { URL } from 'url';
import readline from 'readline';
import { exchangeCodeForToken, exchangeCodeFor3LeggedToken, fetchOrcidRecord } from './orcid-api.js';

// Load environment variables from .env file
dotenv.config({ debug: false, quiet: true });

/**
 * Prompts the user for input in the console.
 * @param {string} query - The question to ask the user.
 * @returns {Promise<string>} The user's trimmed input.
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

/**
 * Retrieves the ORCID iD from command-line arguments.
 * @returns {string | null} The ORCID iD or null if not provided.
 */
function getOrcidIdFromCli() {
  return process.argv[2] || null;
}

/**
 * Initiates the 3-legged OAuth flow to get an authorization code from the user.
 * @returns {Promise<string>} The authorization code.
 */
async function getAuthorizationCode() {
  const { ORCID_CLIENT_ID, ORCID_REDIRECT_URI, ORCID_AUTH_SITE } = process.env;

  if (!ORCID_CLIENT_ID || !ORCID_REDIRECT_URI || !ORCID_AUTH_SITE) {
    throw new Error('ORCID_CLIENT_ID, ORCID_REDIRECT_URI, and ORCID_AUTH_SITE must be set in .env');
  }

  const authUrl = new URL(`${ORCID_AUTH_SITE}/oauth/authorize`);
  authUrl.searchParams.append('client_id', ORCID_CLIENT_ID);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', '/authenticate');
  authUrl.searchParams.append('redirect_uri', ORCID_REDIRECT_URI);

  console.log('Please go to the following URL in your browser to authorize this application:');
  console.log(`\n${authUrl.href}\n`);
  console.log('After authorizing, you will be redirected. Copy the `code` from the URL and paste it here.');

  const code = await askQuestion('Authorization code: ');
  if (!code) {
    throw new Error('Authorization code is required to proceed.');
  }
  return code;
}

/**
 * Fetches an ORCID profile using a pre-configured access token from .env.
 * This function is designed to be called from other modules.
 * @param {string} orcidId - The ORCID iD of the profile to fetch.
 * @returns {Promise<object>} The ORCID profile record data as a JSON object.
 * @throws {Error} If ORCID_ACCESS_TOKEN is not found in .env, if no orcidId is provided, or if the fetch fails.
 */
export async function getOrcidProfileWithToken(orcidId) {
  const { ORCID_ACCESS_TOKEN } = process.env;

  if (!orcidId) {
    throw new Error('An ORCID iD must be provided to fetch the profile.');
  }

  if (!ORCID_ACCESS_TOKEN) {
    throw new Error('ORCID_ACCESS_TOKEN is not configured in your .env file. Cannot fetch profile.');
  }

  try {
    // The console.log is helpful for debugging when this module is used elsewhere.
    console.log(`Fetching ORCID record for iD: ${orcidId} using pre-configured token...`);
    const recordData = await fetchOrcidRecord(orcidId, ORCID_ACCESS_TOKEN, 'record');
    return recordData;
  } catch (error) {
    // Log the error and re-throw it to be handled by the calling module.
    console.error(`Failed to fetch ORCID profile for ${orcidId}:`, error.message);
    throw error;
  }
}

/**
 * Main function to execute the CLI tool.
 */
async function main() {
  try {
    const { ORCID_ACCESS_TOKEN } = process.env;
    let accessToken = ORCID_ACCESS_TOKEN || null;
    let orcidId = getOrcidIdFromCli();

    if (accessToken) {
      console.log('Found existing ORCID access token in .env file.');
      if (!orcidId) {
        console.error('Error: An ORCID_ACCESS_TOKEN is present in your .env file.');
        console.error('Please provide an ORCID iD as a command-line argument to use this token.');
        console.error('Usage: node orcid-client.js <orcid-id>');
        process.exit(1);
      }
    } else {
      console.log('No access token found. Starting ORCID OAuth flow...');
      const code = await getAuthorizationCode();
      console.error('Received authorization code. Exchanging for access token...');

      //const tokenData = await exchangeCodeForToken(code);
      const tokenData = await exchangeCodeFor3LeggedToken(code);

      console.error('Successfully obtained access token.');
      console.log('\n--- Token Data ---');
      console.log(tokenData);
      console.log('------------------\n');

      accessToken = tokenData.access_token;
      // The ORCID iD returned from the token exchange is the one for the user who just logged in.
      orcidId = tokenData.orcid;
    }

    if (orcidId && accessToken) {
      console.error(`Fetching ORCID record for iD: ${orcidId}...`);
      const recordData = await fetchOrcidRecord(orcidId, accessToken, 'record');
      console.log(JSON.stringify(recordData, null, 2));
    } else {
      if (!accessToken) console.error('Could not obtain access token.');
      if (!orcidId) console.error('Could not determine ORCID iD. Please provide one as an argument if using a token from .env, or complete the login flow.');
    }
  } catch (error) {
    console.error(`\nAn error occurred: ${error.message}`);
    process.exit(1);
  }
}

// This structure ensures that main() is only called when the script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}