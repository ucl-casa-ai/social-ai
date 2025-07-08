document.addEventListener('DOMContentLoaded', () => {
  // Get all DOM elements
  // Note: form and userIdInput may be null on profile.html
  const mainElement = document.querySelector('main');
  const messageArea = document.getElementById('message-area');
  const profileNameHeader = document.getElementById('profile-name-header');
  const summaryContainer = document.getElementById('summary-container');
  const publicationsContainer = document.getElementById('publications-container');
  const grantsContainer = document.getElementById('grants-container');
  const resultsContainer = document.getElementById('results-container');
  const resultsHeader = document.getElementById('results-header');
  const resultsBody = document.getElementById('results-body');
  const resultsArea = document.getElementById('results-area');
  const viewControls = document.getElementById('view-controls');
  const expandAllBtn = document.getElementById('expand-all-btn');
  const collapseAllBtn = document.getElementById('collapse-all-btn');

  // Store the full data to be accessed by button clicks
  let allPublications = [];
  let allGrants = [];

  // Get the max records value from the data attribute, with a fallback
  const MAX_RECORDS_TO_SHOW = mainElement ? parseInt(mainElement.dataset.maxRecords, 10) : 5;
  // Toggle visibility of the results body
  if (resultsHeader) {
    resultsHeader.addEventListener('click', () => {
      resultsContainer.classList.toggle('collapsed');
    });
  }

  // Add event listeners for new controls
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      [summaryContainer, publicationsContainer, grantsContainer, resultsContainer].forEach(container => {
        // Only toggle if the container is actually visible on the page
        if (container && !container.classList.contains('d-none')) {
          container.classList.remove('collapsed');
        }
      });
    });
  }

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      [summaryContainer, publicationsContainer, grantsContainer, resultsContainer].forEach(container => {
        // Only toggle if the container is actually visible on the page
        if (container && !container.classList.contains('d-none')) {
          container.classList.add('collapsed');
        }
      });
    });
  }

  // Toggle visibility of the summary body
  if (summaryContainer) {
    summaryContainer.addEventListener('click', (e) => {
      // Use event delegation since the header is dynamically created
      const header = e.target.closest('.summary-card-header');
      if (header) {
        summaryContainer.classList.toggle('collapsed');
      }
    });
  }

  // Handle publications container interactions (collapse and buttons)
  if (publicationsContainer) {
    publicationsContainer.addEventListener('click', (e) => {
      // Handle collapsible header
      const header = e.target.closest('.publications-card-header');
      if (header) {
        publicationsContainer.classList.toggle('collapsed');
        return; // Prevent other handlers from firing
      }

      // Handle AI post generation
      const generateBtn = e.target.closest('.generate-post-btn');
      if (generateBtn) {
        const pubIndex = generateBtn.dataset.pubIndex;
        const type = generateBtn.dataset.type;
        const publication = allPublications[pubIndex];
        const outputContainer = document.getElementById(`ai-output-container-${pubIndex}`);
        const outputDiv = outputContainer.querySelector('.ai-output-content');
        const buttons = generateBtn.closest('.d-grid').querySelectorAll('button');

        generatePost(publication, type, outputDiv, buttons);
        return;
      }

      // Handle close button
      const closeBtn = e.target.closest('.close-ai-output-btn');
      if (closeBtn) {
        const pubIndex = closeBtn.dataset.pubIndex;
        const outputContainer = document.getElementById(`ai-output-container-${pubIndex}`);
        if (outputContainer) {
          outputContainer.style.display = 'none';
          const contentDiv = outputContainer.querySelector('.ai-output-content');
          if (contentDiv) contentDiv.innerHTML = '';
        }
      }
    });
  }

  // Handle grants container interactions (collapse and buttons)
  if (grantsContainer) {
    grantsContainer.addEventListener('click', (e) => {
      // Handle collapsible header
      const header = e.target.closest('.grants-card-header');
      if (header) {
        grantsContainer.classList.toggle('collapsed');
        return; // Prevent other handlers from firing
      }

      // Handle AI post generation
      const generateBtn = e.target.closest('.generate-post-btn');
      if (generateBtn) {
        const grantIndex = generateBtn.dataset.grantIndex;
        const type = generateBtn.dataset.type;
        const grant = allGrants[grantIndex];
        const outputContainer = document.getElementById(`ai-output-container-grant-${grantIndex}`);
        const outputDiv = outputContainer.querySelector('.ai-output-content');
        const buttons = generateBtn.closest('.d-grid').querySelectorAll('button');

        generatePost(grant, type, outputDiv, buttons);
        return;
      }

      // Handle close button
      const closeBtn = e.target.closest('.close-ai-output-btn');
      if (closeBtn) {
        const grantIndex = closeBtn.dataset.grantIndex;
        const outputContainer = document.getElementById(`ai-output-container-grant-${grantIndex}`);
        if (outputContainer) {
          outputContainer.style.display = 'none';
          const contentDiv = outputContainer.querySelector('.ai-output-content');
          if (contentDiv) contentDiv.innerHTML = '';
        }
      }
    });
  }

  function displayError(message) {
    messageArea.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <strong>Error:</strong> ${message}
      </div>
    `;
  }

  function displaySummary(data) {
    const { profile, publications, teaching, grants } = data;
    const meta = profile.meta || {};

    console.log(profile);

    const links = [
      { label: 'UCL Profile', url: meta.profileURL, icon: 'bi-person-badge' },
      { label: 'ORCID', url: meta.orcid_uri, icon: 'bi-person-vcard' },
      { label: 'LinkedIn', url: meta.linked_in, icon: 'bi-linkedin' },
      { label: 'Twitter', url: meta.twitter, icon: 'bi-twitter-x' }
    ]
    .filter(link => link.url)
    .map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
        <div class="link-content">
          <i class="bi ${link.icon} me-2"></i><strong>${link.label}:</strong> <span class="link-url text-muted ms-1">${link.url}</span>
        </div>
        <i class="bi bi-box-arrow-up-right text-secondary"></i>
      </a>
    `).join('');

    const summaryHtml = `
      <div class="card">
        <div class="card-header summary-card-header d-flex justify-content-between align-items-center" style="cursor: pointer;">
          <h5 class="mb-0">Summary for ${profile.prefix + "." || ''} ${profile.name || 'User'}</h5>
          <i class="bi bi-chevron-down" id="summary-toggle-icon"></i>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-4">
              <h6 class="card-title">Statistics</h6>
              <ul class="list-group">
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  Publications
                  <span class="badge bg-primary rounded-pill">${publications.length}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  Teaching Activities
                  <span class="badge bg-primary rounded-pill">${teaching.length}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  Research Interests
                  <span class="badge bg-primary rounded-pill">${profile.research_interests?.length || 0}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  Grants
                  <span class="badge bg-primary rounded-pill">${grants.length}</span>
                </li>
              </ul>
            </div>
            <div class="col-md-8 mt-3 mt-md-0">
              <h6 class="card-title">Links</h6>
              ${links ? `<div class="list-group">${links}</div>` : '<p class="text-muted">No external links found.</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    summaryContainer.innerHTML = summaryHtml;
    summaryContainer.classList.remove('d-none', 'collapsed');
  }

  function displayPublications(publications) {
    if (!publications || publications.length === 0) {
      publicationsContainer.classList.add('d-none');
      return;
    }

    const recentPublications = publications.slice(0, MAX_RECORDS_TO_SHOW);

    const publicationCards = recentPublications.map((pub, index) => {
      const authors = pub.authors.map(a => a.nameShortFormat).join(', ');
      const pubDate = pub.publicationDate?.year ? new Date(pub.publicationDate.dateTime).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      const pubLink = pub.doi ? `https://doi.org/${pub.doi}` : pub.publicUrl;

      return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8 col-lg-9">
              <h6 class="card-title">
                ${pubLink ? `<a href="${pubLink}" target="_blank" rel="noopener noreferrer">${pub.title}</a>` : pub.title}
              </h6>
              <p class="card-text text-muted mb-1 small">
                <strong>Authors:</strong> ${authors}
              </p>
              <p class="card-text text-muted mb-0 small">
                <strong>${pub.journal || pub.parentTitle || 'N/A'}</strong> | <strong>Date:</strong> ${pubDate}
              </p>
            </div>
            <div class="col-md-4 col-lg-3 mt-2 mt-md-0">
              <div class="d-grid gap-2">
                <button class="btn btn-sm btn-outline-primary generate-post-btn" data-type="linkedin" data-pub-index="${index}">
                  <i class="bi bi-linkedin"></i> Create LinkedIn Post
                </button>
                <button class="btn btn-sm btn-outline-info generate-post-btn" data-type="bluesky" data-pub-index="${index}">
                  <i class="bi bi-cloud"></i> Create Bluesky Posts
                </button>
              </div>
            </div>
          </div>
          <div class="ai-output-container mt-3" id="ai-output-container-${index}" style="display: none;">
            <div class="ai-output-content card-body bg-light border rounded" style="min-height: 200px;"></div>
            <button class="btn btn-sm btn-secondary mt-2 close-ai-output-btn" data-pub-index="${index}">Close & Clear</button>
          </div>
        </div>
      </div>
      `;
    }).join('');

    const publicationsHtml = `
      <div class="card">
        <div class="card-header publications-card-header d-flex justify-content-between align-items-center" style="cursor: pointer;">
          <h5 class="mb-0">Recent Publications (${recentPublications.length})</h5>
          <i class="bi bi-chevron-down" id="publications-toggle-icon"></i>
        </div>
        <div class="card-body">
          ${publicationCards}
        </div>
      </div>
    `;

    publicationsContainer.innerHTML = publicationsHtml;
    publicationsContainer.classList.remove('d-none', 'collapsed');
  }

  function displayGrants(grants) {
    if (!grants || grants.length === 0) {
      grantsContainer.classList.add('d-none');
      return;
    }

    const recentGrants = grants.slice(0, MAX_RECORDS_TO_SHOW);
    
    const grantCards = recentGrants.map((grant, index) => {
      const title = grant.title || 'No Title Available';
      const funder = grant.fundingBody || 'Funder Not Available';
      const startDate = grant.startDate?.year ? new Date(grant.startDate.dateTime).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : 'N/A';
      const endDate = grant.endDate?.year ? new Date(grant.endDate.dateTime).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : 'N/A';
      const grantLink = grant.publicUrl;

      return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8 col-lg-9">
              <h6 class="card-title">
                ${grantLink ? `<a href="${grantLink}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}
              </h6>
              <p class="card-text text-muted mb-1 small">
                <strong>Funder:</strong> ${funder}
              </p>
              <p class="card-text text-muted mb-0 small">
                <strong>Dates:</strong> ${startDate} - ${endDate}
              </p>
            </div>
            <div class="col-md-4 col-lg-3 mt-2 mt-md-0">
              <div class="d-grid gap-2">
                <button class="btn btn-sm btn-outline-primary generate-post-btn" data-type="linkedin" data-grant-index="${index}">
                  <i class="bi bi-linkedin"></i> Create LinkedIn Post
                </button>
                <button class="btn btn-sm btn-outline-info generate-post-btn" data-type="bluesky" data-grant-index="${index}">
                  <i class="bi bi-cloud"></i> Create Bluesky Posts
                </button>
              </div>
            </div>
          </div>
          <div class="ai-output-container mt-3" id="ai-output-container-grant-${index}" style="display: none;">
            <div class="ai-output-content card-body bg-light border rounded" style="min-height: 200px;"></div>
            <button class="btn btn-sm btn-secondary mt-2 close-ai-output-btn" data-grant-index="${index}">Close & Clear</button>
          </div>
        </div>
      </div>
      `;
    }).join('');

    const grantsHtml = `
      <div class="card">
        <div class="card-header grants-card-header d-flex justify-content-between align-items-center" style="cursor: pointer;">
          <h5 class="mb-0">Recent Grants (${recentGrants.length})</h5>
          <i class="bi bi-chevron-down" id="grants-toggle-icon"></i>
        </div>
        <div class="card-body">
          ${grantCards}
        </div>
      </div>
    `;

    grantsContainer.innerHTML = grantsHtml;
    grantsContainer.classList.remove('d-none', 'collapsed');
  }

  function displayFullJson(data) {
    const resultsHeaderH5 = document.querySelector('#results-header h5');
    if (resultsHeaderH5 && data.profile && data.profile.name) {
      resultsHeaderH5.textContent = `${data.profile.prefix}. ${data.profile.name} - UCL Profile JSON Object`;
    }

    resultsArea.innerHTML = prettyPrintJson.toHtml(data);
    resultsContainer.classList.remove('d-none');
  }

  /**
   * Generates a social media post by calling the server-side AI endpoint.
   * @param {object} itemData - The data for the publication or grant.
   * @param {string} type - The type of post to generate ('linkedin' or 'bluesky').
   * @param {HTMLElement} outputElement - The element to display the output in.
   * @param {NodeListOf<HTMLButtonElement>} buttons - The buttons to disable during the request.
   */
  async function generatePost(itemData, type, outputElement, buttons) {
    // Show the output container and set loading state
    outputElement.parentElement.style.display = 'block';
    outputElement.innerHTML = `
      <div class="d-flex justify-content-center align-items-center h-100">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <span class="ms-2 text-muted">Generating content...</span>
      </div>
    `;

    // Disable all buttons for this card and show a spinner on the clicked one
    const clickedButton = Array.from(buttons).find(b => b.dataset.type === type);
    const originalButtonContent = clickedButton.innerHTML;
    buttons.forEach(btn => btn.disabled = true);
    clickedButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...`;

    try {
      const endpoint = `/api/generate/${type}`;
      // The AI function expects a string context. Stringify the JSON object.
      const context = JSON.stringify(itemData, null, 2);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate content from the server.');
      }
      // Use marked to parse the markdown content into HTML, then sanitize it with DOMPurify
      // to prevent XSS attacks from the LLM's output.
      const dirtyHtml = marked.parse(result.content);
      outputElement.innerHTML = DOMPurify.sanitize(dirtyHtml);
    } catch (error) {
      outputElement.innerHTML = `<div class="alert alert-danger m-0"><strong>Error:</strong> ${error.message}</div>`;
    } finally {
      buttons.forEach(btn => btn.disabled = false);
      clickedButton.innerHTML = originalButtonContent;
    }
  }

  /**
   * Fetches and displays a profile based on the provided user ID.
   * @param {string} userId The user ID to fetch.
   */
  async function loadProfile(userId) {
    if (!userId || userId === 'profile') {
      displayError('No User ID provided in the URL. Please go to the search page or use a URL like `/profile/&lt;id&gt;` to view a profile.');
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch(`/api/profile/${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An unknown error occurred.');
      }

      // Success: display data
      allPublications = data.publications;
      allGrants = data.grants;

      // Update the main page header and title with the person's name
      if (data.profile && data.profile.name) {
        if (profileNameHeader) {
          profileNameHeader.textContent = data.profile.prefix + '. ' + data.profile.name;
        }
        document.title = `${data.profile.name} | Social AI`;
      }

      displaySummary(data);
      displayPublications(allPublications);
      displayGrants(allGrants);
      displayFullJson(data);
      viewControls.classList.remove('d-none'); // Make controls visible

    } catch (error) {
      displayError(error.message);
    } finally {
      setLoadingState(false);
    }
  }

  /**
   * Manages the UI loading state for both the search page and the profile page.
   * @param {boolean} isLoading - Whether the application is in a loading state.
   */
  function setLoadingState(isLoading) {
    // This function now only manages the state for the profile page.
    if (isLoading) {
      messageArea.innerHTML = '';
      viewControls.classList.add('d-none');
      summaryContainer.classList.add('d-none');
      publicationsContainer.classList.add('d-none');
      grantsContainer.classList.add('d-none');
      resultsContainer.classList.add('d-none', 'collapsed');
      const resultsHeaderH5 = document.querySelector('#results-header h5');
      if (resultsHeaderH5) {
        resultsHeaderH5.textContent = 'Profile JSON Object';
      }
    }
    
    if (isLoading) {
      messageArea.innerHTML = `
        <div class="d-flex justify-content-center align-items-center p-5">
          <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span class="ms-3 h4 text-muted">Fetching Profile...</span>
        </div>
      `;
    } else {
      // Clear the main loading spinner if it exists
      const loadingSpinner = messageArea.querySelector('.d-flex.justify-content-center');
      if (loadingSpinner) {
        messageArea.innerHTML = '';
      }
    }
  }

  // --- Main execution ---
  const profileForm = document.getElementById('profile-form');
  const playgroundForm = document.getElementById('playground-form');
  const copyCodeBtn = document.getElementById('copy-code-btn');

  if (profileForm) {
    // We are on the search page (index.ejs), set up the form listener to redirect.
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const userId = document.getElementById('user-id-input').value.trim();
      if (userId) {
        window.location.href = `/profile/${encodeURIComponent(userId)}`;
      }
    });
  } else if (playgroundForm) {
    // We are on the playground page
    const promptInput = document.getElementById('prompt-input');
    const resultsContainer = document.getElementById('playground-results-container');
    const resultsDiv = document.getElementById('playground-results');
    const submitBtn = playgroundForm.querySelector('button[type="submit"]');
    const linkedinBtn = document.getElementById('linkedin-btn');
    const blueskyBtn = document.getElementById('bluesky-btn');

    const handlePlaygroundRequest = async (endpoint, button) => {
      const prompt = promptInput.value.trim();
      if (!prompt) {
        promptInput.focus();
        return;
      }

      const originalButtonHTML = button.innerHTML;
      // Disable all buttons to prevent multiple requests
      [submitBtn, linkedinBtn, blueskyBtn].forEach(btn => { if(btn) btn.disabled = true; });
      button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;
      resultsContainer.classList.remove('d-none');
      resultsDiv.innerHTML = `
        <div class="d-flex justify-content-center align-items-center p-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span class="ms-2 text-muted">Generating response...</span>
        </div>
      `;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: prompt }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to get a valid response from the server.');
        // Sanitize the HTML output from the LLM to prevent XSS
        const dirtyHtml = marked.parse(result.content);
        resultsDiv.innerHTML = DOMPurify.sanitize(dirtyHtml);
      } catch (error) {
        resultsDiv.innerHTML = `<div class="alert alert-danger m-0"><strong>Error:</strong> ${error.message}</div>`;
      } finally {
        // Re-enable all buttons
        [submitBtn, linkedinBtn, blueskyBtn].forEach(btn => { if(btn) btn.disabled = false; });
        button.innerHTML = originalButtonHTML;
      }
    };

    playgroundForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePlaygroundRequest('/api/generate/prompt', submitBtn);
    });

    if (linkedinBtn) {
      linkedinBtn.addEventListener('click', () => handlePlaygroundRequest('/api/generate/linkedin', linkedinBtn));
    }

    if (blueskyBtn) {
      blueskyBtn.addEventListener('click', () => handlePlaygroundRequest('/api/generate/bluesky', blueskyBtn));
    }
  } else if (copyCodeBtn) {
    // We are on the oauth-callback page, handle success or error.
    const successView = document.getElementById('success-view');
    const errorView = document.getElementById('error-view');
    const errorMessageEl = document.getElementById('error-message');
    const authCodeInput = document.getElementById('auth-code');

    // Check for errors in the URL hash (e.g., #error=access_denied)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorDescription = hashParams.get('error_description');

    if (error) {
      // An error occurred, show the error view
      if (successView) successView.classList.add('d-none');
      if (errorView) errorView.classList.remove('d-none');
      if (errorMessageEl) {
        // Replace underscores with spaces for readability and capitalize first letter
        const formattedError = error.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
        errorMessageEl.innerHTML = `<strong>${formattedError}</strong>: ${errorDescription || 'Please return to the command line and try again.'}`;
      }
    } else {
      // Success path, set up the copy button
      copyCodeBtn.addEventListener('click', () => {
        if (navigator.clipboard && authCodeInput.value) {
          navigator.clipboard.writeText(authCodeInput.value).then(() => {
            const originalContent = copyCodeBtn.innerHTML;
            copyCodeBtn.innerHTML = `<i class="bi bi-check-lg"></i> Copied!`;
            copyCodeBtn.classList.replace('btn-primary', 'btn-success');
            setTimeout(() => {
              copyCodeBtn.innerHTML = originalContent;
              copyCodeBtn.classList.replace('btn-success', 'btn-primary');
            }, 2000);
          }).catch(err => console.error('Failed to copy text: ', err));
        }
      });
    }
  } else if (document.getElementById('profile-name-header')) {
    // We are on the profile page (profile.ejs)
    const pathParts = window.location.pathname.split('/');
    const userId = pathParts.pop() || pathParts.pop(); // Handles trailing slash
    loadProfile(userId);
  }
});