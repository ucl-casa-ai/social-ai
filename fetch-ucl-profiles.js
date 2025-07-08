import { getProfile } from './ucl-api.js';

/**
 * Retrieves the User ID from command-line arguments.
 * Exits if the User ID is not provided.
 * @returns {string} The User ID.
 */
function getUserId() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Error: Please provide a UCL Profile ID as a command-line argument.');
    console.error('Usage: node fetch-ucl-profiles.js <profileId>');
    process.exit(1);
  }
  return userId;
}

async function main() {
  const userId = getUserId();
  console.error(`Fetching data for user ID: ${userId}...`);

  try {
    // Reuse the existing API logic from ucl-api.js
    const finalJson = await getProfile(userId);
    console.log(JSON.stringify(finalJson, null, 2));
  } catch (error) {
    console.error(`\nAn error occurred: ${error.message}`);
    process.exit(1);
  }
}

main();