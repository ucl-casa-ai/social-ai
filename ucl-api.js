import fetch from 'node-fetch';

/**
 * Capitalizes the first letter of each word in a string, including after hyphens.
 * @param {string} str The string to capitalize.
 * @returns {string} The capitalized string.
 */
const capitalizeWords = (str) => {
  if (!str) return '';
  // This regex finds the first letter of a word at the start of the string, or after a space or a hyphen, and capitalizes it.
  return str.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
};

/**
 * Fetches the main profile data.
 * @param {string} userId - The user's ID.
 * @returns {Promise<object>} The profile data.
 */
async function fetchProfileData(userId) {
  const url = `https://profiles.ucl.ac.uk/api/users/${userId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch profile data for user ${userId}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetches the user's publications.
 * @param {string} userId - The user's ID.
 * @returns {Promise<object>} The publications data.
 */
async function fetchPublications(userId) {
  const url = 'https://profiles.ucl.ac.uk/api/publications/linkedTo';
  const options = {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      objectId: userId,
      objectType: 'user',
      category:"user",
      pagination: { perPage: 100, startFrom: 0 },
      sort: 'dateDesc',
      favouritesFirst: false,
    }),
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch publications: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetches the user's teaching activities.
 * @param {string} userId - The user's ID.
 * @returns {Promise<object>} The teaching activities data.
 */
async function fetchTeaching(userId) {
  const url = 'https://profiles.ucl.ac.uk/api/teachingActivities/linkedTo';
  const options = {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      objectId: userId,
      objectType: 'user',
      category:"user",
      pagination: { perPage: 100, startFrom: 0 },
      sort: 'dateDesc',
      favouritesFirst: true,
    }),
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch teaching activities: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetches the user's grants from the UCL Profiles API.
 * @param {string} userId - The user's ID.
 * @returns {Promise<object>} The grants data.
 */
async function fetchGrantsFromUcl(userId) {
  const url = 'https://profiles.ucl.ac.uk/api/grants/linkedTo';
  const options = {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      objectId: userId,
      objectType: 'user',
      pagination: { perPage: 100, startFrom: 0 },
      sort: 'dateDesc',
      favouritesFirst: true,
    }),
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch grants: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Transforms funding data from an ORCID profile to match the structure of UCL grants data.
 * @param {Array} orcidFundingArray - The array of funding summaries from an ORCID record.
 * @returns {Array} An array of grant objects in the UCL format.
 */
function transformOrcidFundingToUclGrants(orcidFundingArray) {
  if (!orcidFundingArray || !Array.isArray(orcidFundingArray)) {
    return [];
  }

  return orcidFundingArray.map(funding => {
    const startDate = funding['start-date'];
    const endDate = funding['end-date'];

    // Helper to construct a date object similar to UCL's, which is used by the frontend.
    const constructDate = (dateObj) => {
      if (!dateObj || !dateObj.year?.value) return null;
      const year = dateObj.year.value;
      const month = dateObj.month ? String(dateObj.month.value).padStart(2, '0') : '01';
      const day = dateObj.day ? String(dateObj.day.value).padStart(2, '0') : '01';
      return {
        dateTime: new Date(`${year}-${month}-${day}`).toISOString(),
        year: parseInt(year, 10),
      };
    };

    // Collect all available URLs from the funding record.
    const urls = [];
    if (funding.url?.value) {
      urls.push(funding.url.value);
    }
    const externalIds = funding['external-ids']?.['external-id'] || [];
    externalIds.forEach(id => {
      if (id['external-id-url']?.value) {
        urls.push(id['external-id-url'].value);
      }
    });

    // Use a Set to ensure all URLs are unique.
    const uniqueUrls = [...new Set(urls)];
    return {
      title: funding.title?.title?.value || 'No Title Available',
      fundingBody: funding.organization?.name || 'Funder Not Available',
      startDate: constructDate(startDate),
      endDate: constructDate(endDate),
      publicUrls: uniqueUrls,
    };
  });
}

/**
 * Fetches grant information from a user's ORCID profile.
 * @param {string} orcidId - The user's ORCID iD.
 * @returns {Promise<object>} A grants object structured like the UCL API response.
 */
async function fetchGrantsFromOrcid(orcidId) {
  // This function calls the server's own caching endpoint for ORCID profiles.
  // This allows it to benefit from the caching logic implemented in server.js
  // without duplicating the caching logic here.
  const baseUrl = process.env.INTERNAL_API_BASE_URL;
  const url = `${baseUrl}/api/orcid/${orcidId}`;

  console.log(`Fetching ORCID profile via internal endpoint: ${url}`);
  const response = await fetch(url);

  if (!response.ok) {
    // If the internal endpoint fails, we can't proceed with ORCID data.
    // The calling function `fetchGrants` will catch this and fall back to the UCL API.
    throw new Error(`Failed to fetch ORCID profile from internal endpoint: ${response.statusText}`);
  }

  const orcidProfile = await response.json();
  // The funding data from ORCID is nested inside groups. We need to extract all funding summaries.
  const fundingGroups = orcidProfile?.['activities-summary']?.fundings?.group || [];

  // Each group can have multiple funding summaries (e.g., for the same grant number from different sources),
  // so we use flatMap to create a single, flat array of all funding summary objects.
  const allFundingSummaries = fundingGroups.flatMap(group => group['funding-summary']);

  // Transform the ORCID funding data into the same format as the UCL grants data.
  const transformedGrants = transformOrcidFundingToUclGrants(allFundingSummaries);
  return { resource: transformedGrants };
}

/**
 * Fetches grants for a user. Prefers fetching from ORCID if an iD and token are available,
 * otherwise falls back to the UCL Profiles API.
 * @param {string} userId - The user's UCL ID.
 * @param {string|null} orcidId - The user's ORCID iD, if available.
 * @returns {Promise<object>} The grants data.
 */
async function fetchGrants(userId, orcidId = null) {
  if (orcidId && process.env.ORCID_ACCESS_TOKEN) {
    try {
      console.log(`ORCID iD ${orcidId} found. Fetching grants from ORCID.`);
      return await fetchGrantsFromOrcid(orcidId);
    } catch (error) {
      console.error(`Failed to fetch grants from ORCID for ${orcidId}. Falling back to UCL Profiles API. Error: ${error.message}`);
      return fetchGrantsFromUcl(userId);
    }
  }
  return fetchGrantsFromUcl(userId);
}

/**
 * Transforms raw API data into the final structured format.
 * @param {object} profileApiData - Raw data from the profile API.
 * @param {object} pubsApiData - Raw data from the publications API.
 * @param {object} teachingApiData - Raw data from the teaching API.
 * @param {object} grantsApiData - Raw data from the grants API.
 * @returns {object} The final, structured JSON object.
 */
function transformApiData(profileApiData, pubsApiData, teachingApiData, grantsApiData) {
  const personalWebsites = profileApiData.personalWebsites || [];
  const linkedInUrl = personalWebsites.find(site => site.typeDisplayName === 'LinkedIn')?.url || null;
  const twitterUrl = personalWebsites.find(site => site.typeDisplayName === 'X (Twitter)')?.url || null;

  const profile = {
    name: capitalizeWords(profileApiData.firstNameLastName) || '',
    prefix:  profileApiData.title || '',
    title: profileApiData.positions?.[0]?.position || '',
    affiliation: profileApiData.positions?.[0]?.department || '',
    education_info: profileApiData.tabSummaryTeachingActivities?.htmlStripped || '',
    research_interests: profileApiData.tags?.explicit || [],
    research_info: profileApiData.tabSummaryGrants?.htmlStripped || '',
    meta: {
      "discoveryUrlId": profileApiData.discoveryUrlId,
      "profileURL": profileApiData.elementsUserProfileUrl,
      "orcid": profileApiData.orcid?.value || null,
      "orcid_uri": profileApiData.orcid?.uri || null,
      "linked_in": linkedInUrl,
      "twitter": twitterUrl
    },
  };

  const publications = (pubsApiData.resource || []).map(pub => {
    const urls = [];

    // The primary link is often the public one on the UCL profile system.
    if (pub.publicUrl) {
      urls.push(pub.publicUrl);
    }

    // Add the DOI link.
    if (pub.doi) {
      urls.push(`https://doi.org/${pub.doi}`);
    }

    // Add links from the 'files' array, which often contain PDFs.
    if (Array.isArray(pub.files)) {
      pub.files.forEach(file => {
        if (file.url) {
          urls.push(file.url);
        }
      });
    }

    // Add any other links provided in the 'links' array.
    if (Array.isArray(pub.links)) {
      pub.links.forEach(link => {
        if (link.url) {
          urls.push(link.url);
        }
      });
    }

    pub.publicUrls = [...new Set(urls)];
    return pub;
  });

  const grants = (grantsApiData.resource || []).map(grant => {
    // Normalize grant object to always have a publicUrls array for consistent handling on the frontend.
    if (grant.publicUrl && !grant.publicUrls) {
      // If from UCL API, it will have publicUrl. Convert to publicUrls.
      grant.publicUrls = [grant.publicUrl];
    } else if (!grant.publicUrls) {
      // Ensure the property exists even if empty.
      grant.publicUrls = [];
    }
    return grant;
  });

  // Sort grants by end date in descending order.
  // Grants without an end date are sorted to the end.
  grants.sort((a, b) => {
    const dateA = a.endDate?.dateTime ? new Date(a.endDate.dateTime) : null;
    const dateB = b.endDate?.dateTime ? new Date(b.endDate.dateTime) : null;

    if (dateA === null && dateB === null) return 0; // both are null, keep original order
    if (dateA === null) return 1;  // a is null, should come after b
    if (dateB === null) return -1; // b is null, should come after a

    return dateB - dateA; // For descending order
  });

  const teaching = teachingApiData.resource || [];

  return {
    profile,
    publications, // This is now the transformed array with publicUrls
    grants,
    teaching,
  };
}

/**
 * Fetches and transforms all data for a given user ID.
 * @param {string} userId - The user's ID.
 * @returns {Promise<object>} The complete, structured profile data.
 */
export async function getProfile(userId) {
  // Fetch the main profile first to determine if an ORCID iD is available.
  const profileData = await fetchProfileData(userId);
  const orcidId = profileData.orcid?.value || null;

  // Fetch the remaining data in parallel, passing the ORCID iD to the grants fetcher.
  const [publicationsData, teachingData, grantsData] = await Promise.all([
    fetchPublications(userId),
    fetchTeaching(userId),
    fetchGrants(userId, orcidId)
  ]);

  return transformApiData(profileData, publicationsData, teachingData, grantsData);
}