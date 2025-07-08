import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { URLSearchParams } from 'url';

// Load environment variables from .env file
dotenv.config({ debug: false, quiet: true });

/**
 * Exchanges an authorization code for an access token (3-legged OAuth).
 * This is typically used in an interactive flow where a user grants permission.
 * @param {string} code - The authorization code from the user.
 * @returns {Promise<object>} The full token response from ORCID, including access_token, orcid, etc.
 */
export async function exchangeCodeForToken(code) {
  const { ORCID_CLIENT_ID, ORCID_CLIENT_SECRET, ORCID_TOKEN_PATH, ORCID_REDIRECT_URI } = process.env;

  if (!ORCID_CLIENT_ID || !ORCID_CLIENT_SECRET || !ORCID_TOKEN_PATH || !ORCID_REDIRECT_URI) {
    throw new Error('ORCID credentials and redirect URI must be set in .env for authorization code flow.');
  }

  const params = new URLSearchParams();
  params.append('client_id', ORCID_CLIENT_ID);
  params.append('client_secret', ORCID_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', '/read-public');
  params.append('code', code);
  params.append('redirect_uri', ORCID_REDIRECT_URI);

  const response = await fetch(ORCID_TOKEN_PATH, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

export async function exchangeCodeFor3LeggedToken(code) {
  const { ORCID_CLIENT_ID, ORCID_CLIENT_SECRET, ORCID_TOKEN_PATH, ORCID_REDIRECT_URI } = process.env;

  if (!ORCID_CLIENT_ID || !ORCID_CLIENT_SECRET || !ORCID_TOKEN_PATH || !ORCID_REDIRECT_URI) {
    throw new Error('ORCID credentials and redirect URI must be set in .env for authorization code flow.');
  }

  const params = new URLSearchParams();
  params.append('client_id', ORCID_CLIENT_ID);
  params.append('client_secret', ORCID_CLIENT_SECRET);
  params.append('grant_type', '/authorization_code');
  params.append('scope', '/read-public');
  params.append('code', code);
  params.append('redirect_uri', ORCID_REDIRECT_URI);

  const response = await fetch(ORCID_TOKEN_PATH, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Fetches a record from the ORCID API.
 * @param {string} orcidId - The ORCID iD of the person.
 * @param {string} accessToken - The ORCID API access token.
 * @param {string} [endpoint='record'] - The API endpoint (e.g., 'record', 'person', 'works').
 * @returns {Promise<object>} The record data.
 */
export async function fetchOrcidRecord(orcidId, accessToken, endpoint = 'record') {
  const { ORCID_AUTH_SITE } = process.env;

  // Use the public API for reading public data.
  const apiBaseUrl = 'https://pub.orcid.org/v3.0';

  const apiUrl = `${apiBaseUrl}/${orcidId}/${endpoint}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch ORCID record for endpoint '${endpoint}': ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}