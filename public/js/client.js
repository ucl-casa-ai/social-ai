document.addEventListener('DOMContentLoaded', async () => {
  // Get all DOM elements
  // Note: form and userIdInput may be null on profile.html
  const mainElement = document.querySelector('main');
  const messageArea = document.getElementById('message-area');
  const profileNameHeader = document.getElementById('profile-name-header');
  const summaryContainer = document.getElementById('summary-container');
  const publicationsContainer = document.getElementById('publications-container');
  const grantsContainer = document.getElementById('grants-container');
  const teachingContainer = document.getElementById('teaching-container');
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
  let allTeaching = [];
  let systemPrompts = {};

  // Fetch system prompts on page load to be used by the "Open in Playground" button
  try {
    const response = await fetch('/api/prompts');
    if (response.ok) {
      systemPrompts = await response.json();
    } else {
      console.error('Failed to fetch system prompts.');
    }
  } catch (error) {
    console.error('Could not fetch system prompts:', error);
  }

  // Get the max records value from the data attribute, with a fallback
  const MAX_RECORDS_TO_SHOW = mainElement ? parseInt(mainElement.dataset.maxRecords, 10) : 5;

  // Helper to get hostname from a URL, with a fallback.
  const getHostname = (url) => {
    try {
      const hostname = new URL(url).hostname;
      // Make it a bit cleaner, remove 'www.'
      return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    } catch (e) {
      return 'Link'; // Fallback for invalid URLs
    }
  };

  // Helper to get an ordinal suffix for a day number
  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Helper to format a date with an ordinal suffix
  const formatDateWithOrdinal = (dateObj) => {
    if (!dateObj || !dateObj.year) return 'N/A';
    const date = new Date(dateObj.dateTime);
    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'long' });
    const year = date.getFullYear();
    return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
  };

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
      [summaryContainer, publicationsContainer, grantsContainer, teachingContainer, resultsContainer].forEach(container => {
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
      [summaryContainer, publicationsContainer, grantsContainer, teachingContainer, resultsContainer].forEach(container => {
        // Only toggle if the container is actually visible on the page
        if (container && !container.classList.contains('d-none')) {
          container.classList.add('collapsed');
        }
      });
    });
  }

  // Toggle visibility of the summary body and handle stat links
  if (summaryContainer) {
    summaryContainer.addEventListener('click', (e) => {
      // Use event delegation since elements are dynamically created

      // Handle collapsible header
      const header = e.target.closest('.summary-card-header');
      if (header) {
        summaryContainer.classList.toggle('collapsed');
        return; // Prevent other handlers from firing
      }

      // Handle stat links to scroll to sections
      const statLink = e.target.closest('.summary-stat-link');
      if (statLink) {
        e.preventDefault();
        const targetId = statLink.dataset.targetId;
        const targetContainer = document.getElementById(targetId);
        if (targetContainer) {
          // Expand the container if it's collapsed
          targetContainer.classList.remove('collapsed');
          // Scroll to the container
          targetContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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

      // Handle copy prompt button
      const copyBtn = e.target.closest('.copy-prompt-btn');
      if (copyBtn) {
        const pubIndex = copyBtn.dataset.pubIndex;
        const promptContent = document.querySelector(`#ai-output-container-${pubIndex} .ai-prompt-content`);
        if (promptContent && navigator.clipboard) {
          navigator.clipboard.writeText(promptContent.textContent).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="bi bi-check-lg"></i> Copied!`;
            copyBtn.classList.replace('btn-light', 'btn-success');
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.classList.replace('btn-success', 'btn-light');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy prompt:', err);
          });
        }
        return;
      }

      // Handle open in playground button
      const openPlaygroundBtn = e.target.closest('.open-in-playground-btn');
      if (openPlaygroundBtn) {
        const pubIndex = openPlaygroundBtn.dataset.pubIndex;
        const publication = allPublications[pubIndex];
        if (publication) {
          const promptData = JSON.stringify(publication, null, 2);
          sessionStorage.setItem('playgroundPrompt', promptData);
          window.open('/playground', '_blank');
        } else {
          console.error('Could not find publication data for index:', pubIndex);
          alert('Could not retrieve the data for this publication.');
        }
        return;
      }

      // Handle show prompt link
      const showPromptLink = e.target.closest('.show-prompt-link');
      if (showPromptLink) {
        e.preventDefault();
        const pubIndex = showPromptLink.dataset.pubIndex;
        const promptWrapper = document.querySelector(`#ai-output-container-${pubIndex} .ai-prompt-wrapper`);
        if (promptWrapper) {
          const isVisible = promptWrapper.style.display !== 'none';
          promptWrapper.style.display = isVisible ? 'none' : 'block';
          showPromptLink.textContent = isVisible ? 'Show Prompt Data' : 'Hide Prompt Data';
        }
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
          if (contentDiv) {
            // Remove TinyMCE instance if it exists
            const editor = tinymce.get(contentDiv.id);
            if (editor) {
              editor.remove();
            }
            contentDiv.innerHTML = '';
          }
          // Reset prompt view
          const promptWrapper = outputContainer.querySelector('.ai-prompt-wrapper');
          if (promptWrapper) {
            promptWrapper.style.display = 'none';
            const promptContent = promptWrapper.querySelector('.ai-prompt-content');
            if (promptContent) promptContent.textContent = '';
          }
          const promptLink = outputContainer.querySelector('.show-prompt-link');
          if (promptLink) promptLink.textContent = 'Show Prompt Data';
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

      // Handle open in playground button
      const openPlaygroundBtn = e.target.closest('.open-in-playground-btn');
      if (openPlaygroundBtn) {
        const grantIndex = openPlaygroundBtn.dataset.grantIndex;
        const grant = allGrants[grantIndex];
        if (grant) {
          const promptData = JSON.stringify(grant, null, 2);
          sessionStorage.setItem('playgroundPrompt', promptData);
          window.open('/playground', '_blank');
        } else {
          console.error('Could not find grant data for index:', grantIndex);
          alert('Could not retrieve the data for this grant.');
        }
        return;
      }

      // Handle copy prompt button
      const copyBtn = e.target.closest('.copy-prompt-btn');
      if (copyBtn) {
        const grantIndex = copyBtn.dataset.grantIndex;
        const promptContent = document.querySelector(`#ai-output-container-grant-${grantIndex} .ai-prompt-content`);
        if (promptContent && navigator.clipboard) {
          navigator.clipboard.writeText(promptContent.textContent).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="bi bi-check-lg"></i> Copied!`;
            copyBtn.classList.replace('btn-light', 'btn-success');
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.classList.replace('btn-success', 'btn-light');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy prompt:', err);
          });
        }
        return;
      }

      // Handle show prompt link
      const showPromptLink = e.target.closest('.show-prompt-link');
      if (showPromptLink) {
        e.preventDefault();
        const grantIndex = showPromptLink.dataset.grantIndex;
        const promptWrapper = document.querySelector(`#ai-output-container-grant-${grantIndex} .ai-prompt-wrapper`);
        if (promptWrapper) {
          const isVisible = promptWrapper.style.display !== 'none';
          promptWrapper.style.display = isVisible ? 'none' : 'block';
          showPromptLink.textContent = isVisible ? 'Show Prompt Data' : 'Hide Prompt Data';
        }
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
          if (contentDiv) {
            const editor = tinymce.get(contentDiv.id);
            if (editor) {
              editor.remove();
            }
            contentDiv.innerHTML = '';
          }
          // Reset prompt view
          const promptWrapper = outputContainer.querySelector('.ai-prompt-wrapper');
          if (promptWrapper) {
            promptWrapper.style.display = 'none';
            const promptContent = promptWrapper.querySelector('.ai-prompt-content');
            if (promptContent) promptContent.textContent = '';
          }
          const promptLink = outputContainer.querySelector('.show-prompt-link');
          if (promptLink) promptLink.textContent = 'Show Prompt Data';
        }
      }
    });
  }

  // Handle teaching container interactions (collapse and buttons)
  if (teachingContainer) {
    teachingContainer.addEventListener('click', (e) => {
      // Handle collapsible header
      const header = e.target.closest('.teaching-card-header');
      if (header) {
        teachingContainer.classList.toggle('collapsed');
        return;
      }

      // Handle AI post generation
      const generateBtn = e.target.closest('.generate-post-btn');
      if (generateBtn) {
        const teachingIndex = generateBtn.dataset.teachingIndex;
        const type = generateBtn.dataset.type;
        const activity = allTeaching[teachingIndex];
        const outputContainer = document.getElementById(`ai-output-container-teaching-${teachingIndex}`);
        const outputDiv = outputContainer.querySelector('.ai-output-content');
        const buttons = generateBtn.closest('.d-grid').querySelectorAll('button');
        generatePost(activity, type, outputDiv, buttons);
        return;
      }

      // Handle open in playground button
      const openPlaygroundBtn = e.target.closest('.open-in-playground-btn');
      if (openPlaygroundBtn) {
        const teachingIndex = openPlaygroundBtn.dataset.teachingIndex;
        const activity = allTeaching[teachingIndex];
        if (activity) {
          const promptData = JSON.stringify(activity, null, 2);
          sessionStorage.setItem('playgroundPrompt', promptData);
          window.open('/playground', '_blank');
        } else {
          console.error('Could not find teaching data for index:', teachingIndex);
          alert('Could not retrieve the data for this teaching activity.');
        }
        return;
      }

      // Handle copy prompt button
      const copyBtn = e.target.closest('.copy-prompt-btn');
      if (copyBtn) {
        const teachingIndex = copyBtn.dataset.teachingIndex;
        const promptContent = document.querySelector(`#ai-output-container-teaching-${teachingIndex} .ai-prompt-content`);
        if (promptContent && navigator.clipboard) {
          navigator.clipboard.writeText(promptContent.textContent).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="bi bi-check-lg"></i> Copied!`;
            copyBtn.classList.replace('btn-light', 'btn-success');
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              copyBtn.classList.replace('btn-success', 'btn-light');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy prompt:', err);
          });
        }
        return;
      }

      // Handle show prompt link
      const showPromptLink = e.target.closest('.show-prompt-link');
      if (showPromptLink) {
        e.preventDefault();
        const teachingIndex = showPromptLink.dataset.teachingIndex;
        const promptWrapper = document.querySelector(`#ai-output-container-teaching-${teachingIndex} .ai-prompt-wrapper`);
        if (promptWrapper) {
          const isVisible = promptWrapper.style.display !== 'none';
          promptWrapper.style.display = isVisible ? 'none' : 'block';
          showPromptLink.textContent = isVisible ? 'Show Prompt Data' : 'Hide Prompt Data';
        }
        return;
      }

      // Handle close button
      const closeBtn = e.target.closest('.close-ai-output-btn');
      if (closeBtn) {
        const teachingIndex = closeBtn.dataset.teachingIndex;
        const outputContainer = document.getElementById(`ai-output-container-teaching-${teachingIndex}`);
        if (outputContainer) {
          outputContainer.style.display = 'none';
          const contentDiv = outputContainer.querySelector('.ai-output-content');
          if (contentDiv) {
            const editor = tinymce.get(contentDiv.id);
            if (editor) {
              editor.remove();
            }
            contentDiv.innerHTML = '';
          }
          // Reset prompt view
          const promptWrapper = outputContainer.querySelector('.ai-prompt-wrapper');
          if (promptWrapper) {
            promptWrapper.style.display = 'none';
            const promptContent = promptWrapper.querySelector('.ai-prompt-content');
            if (promptContent) promptContent.textContent = '';
          }
          const promptLink = outputContainer.querySelector('.show-prompt-link');
          if (promptLink) promptLink.textContent = 'Show Prompt Data';
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
                <li class="list-group-item d-flex justify-content-between align-items-center summary-stat-link" data-target-id="publications-container">
                  Publications
                  <span class="badge bg-primary rounded-pill">${publications.length}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center summary-stat-link" data-target-id="grants-container">
                  Grants
                  <span class="badge bg-primary rounded-pill">${grants.length}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center summary-stat-link" data-target-id="teaching-container">
                  Teaching Activities
                  <span class="badge bg-primary rounded-pill">${teaching.length}</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                  Research Interests
                  <span class="badge bg-primary rounded-pill">${profile.research_interests?.length || 0}</span>
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
      const pubDate = formatDateWithOrdinal(pub.publicationDate);

      // Create a mutable copy of the URLs to work with.
      let publicUrls = [...(pub.publicUrls || [])];

      // Find the first PDF link and extract it from the array.
      const pdfLinkIndex = publicUrls.findIndex(link => link.toLowerCase().endsWith('.pdf'));
      let pdfLink = null;
      if (pdfLinkIndex > -1) {
        pdfLink = publicUrls.splice(pdfLinkIndex, 1)[0];
      }

      // The primary link for the title is the first one available.
      const primaryLink = publicUrls.shift() || null;

      // Build a list of all other links to display as badges.
      const otherLinksToDisplay = [];

      // Add the repository PDF link first if it exists.
      if (pub.repositoryPdfUrl) {
        // Ensure it's not the same as the primary link or the main PDF button link.
        if (pub.repositoryPdfUrl !== primaryLink && pub.repositoryPdfUrl !== pdfLink) {
          otherLinksToDisplay.push({
            url: pub.repositoryPdfUrl,
            label: 'Repository PDF'
          });
        }
      }

      // Add all other remaining URLs from the main list.
      publicUrls.forEach(url => {
        // Ensure we don't add duplicates of links already handled.
        if (url !== primaryLink && url !== pdfLink && url !== pub.repositoryPdfUrl) {
          otherLinksToDisplay.push({
            url: url,
            label: getHostname(url)
          });
        }
      });

      const otherLinksHtml = otherLinksToDisplay.map(link => {
        return `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="badge rounded-pill bg-light text-dark text-decoration-none fw-normal ms-1" title="${link.url}">
          ${link.label} <i class="bi bi-box-arrow-up-right small"></i>
        </a>
      `;
      }).join('');

      // If a PDF link was found, create a dedicated button for it.
      const pdfButtonHtml = pdfLink ? `
                <a href="${pdfLink}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-danger">
                  <i class="bi bi-file-earmark-pdf"></i> View PDF
                </a>
      ` : '';

      return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8 col-lg-9">
              <h6 class="card-title">
                ${primaryLink ? `<a href="${primaryLink}" target="_blank" rel="noopener noreferrer">${pub.title}</a>` : pub.title}
              </h6>
              <p class="card-text text-muted mb-1 small">
                <strong>Authors:</strong> ${authors}
              </p>
              <p class="card-text text-muted mb-0 small">
                <strong>${pub.journal || pub.parentTitle || 'N/A'}</strong> | <strong>Date:</strong> ${pubDate}
              </p>
              ${otherLinksToDisplay.length > 0 ? `<p class="card-text text-muted mb-0 small mt-1"><strong>Links:</strong>${otherLinksHtml}</p>` : ''}
            </div>
            <div class="col-md-4 col-lg-3 mt-2 mt-md-0">
              <div class="d-grid gap-2">
                ${pdfButtonHtml}
                <button class="btn btn-sm btn-outline-primary generate-post-btn" data-type="linkedin" data-pub-index="${index}">
                  <i class="bi bi-linkedin"></i> Create LinkedIn Post
                </button>
                <button class="btn btn-sm btn-outline-info generate-post-btn" data-type="bluesky" data-pub-index="${index}">
                  <i class="bi bi-cloud"></i> Create Bluesky Posts
                </button>
                <button class="btn btn-sm btn-outline-secondary generate-post-btn" data-type="blog" data-pub-index="${index}">
                  <i class="bi bi-file-post"></i> Create Blog Post
                </button>
              </div>
            </div>
          </div>
          <div class="ai-output-container mt-3" id="ai-output-container-${index}" style="display: none;">
            <div id="ai-output-content-pub-${index}" class="ai-output-content"></div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <button class="btn btn-sm btn-secondary close-ai-output-btn" data-pub-index="${index}">Close & Clear</button>
              <a href="#" class="small text-muted show-prompt-link" data-pub-index="${index}">Show Prompt Data</a>
            </div>
            <div class="ai-prompt-wrapper mt-2" style="display: none;">
              <div class="position-relative">
                <div class="ai-prompt-content p-3 bg-dark text-light rounded" style="font-family: monospace; font-size: 0.8rem; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
                </div>
                <div class="position-absolute d-flex" style="top: 0.5rem; right: 2.0rem; z-index: 10;">
                  <button class="btn btn-sm btn-light copy-prompt-btn" data-pub-index="${index}" title="Copy user data prompt to clipboard"><i class="bi bi-clipboard"></i> </button>
                  <button class="btn btn-sm btn-light open-in-playground-btn ms-2" data-pub-index="${index}" title="Open Prompt Data in Playground">
                    <i class="bi bi-journal-code"></i>
                  </button>
                </div>
              </div>
            </div>
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

      const publicUrls = [...(grant.publicUrls || [])];
      const grantLink = publicUrls.shift() || null;
      const otherLinks = publicUrls;

      const otherLinksHtml = otherLinks.map(link => `
        <a href="${link}" target="_blank" rel="noopener noreferrer" class="badge rounded-pill bg-light text-dark text-decoration-none fw-normal ms-1" title="${link}">
          ${getHostname(link)} <i class="bi bi-box-arrow-up-right small"></i>
        </a>
      `).join('');

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
              ${otherLinks.length > 0 ? `<p class="card-text text-muted mb-0 small mt-1"><strong>Links:</strong>${otherLinksHtml}</p>` : ''}
            </div>
            <div class="col-md-4 col-lg-3 mt-2 mt-md-0">
              <div class="d-grid gap-2">
                <button class="btn btn-sm btn-outline-primary generate-post-btn" data-type="linkedin" data-grant-index="${index}">
                  <i class="bi bi-linkedin"></i> Create LinkedIn Post
                </button>
                <button class="btn btn-sm btn-outline-info generate-post-btn" data-type="bluesky" data-grant-index="${index}">
                  <i class="bi bi-cloud"></i> Create Bluesky Posts
                </button>
                <button class="btn btn-sm btn-outline-secondary generate-post-btn" data-type="blog" data-grant-index="${index}">
                  <i class="bi bi-file-post"></i> Create Blog Post
                </button>
              </div>
            </div>
          </div>
          <div class="ai-output-container mt-3" id="ai-output-container-grant-${index}" style="display: none;">
            <div id="ai-output-content-grant-${index}" class="ai-output-content"></div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <button class="btn btn-sm btn-secondary close-ai-output-btn" data-grant-index="${index}">Close & Clear</button>
              <a href="#" class="small text-muted show-prompt-link" data-grant-index="${index}">Show Prompt Data</a>
            </div>
            <div class="ai-prompt-wrapper mt-2" style="display: none;">
              <div class="position-relative">
                <div class="ai-prompt-content p-3 bg-dark text-light rounded" style="font-family: monospace; font-size: 0.8rem; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
                </div>
                <div class="position-absolute d-flex" style="top: 0.5rem; right: 0.5rem; z-index: 10;">
                  <button class="btn btn-sm btn-light copy-prompt-btn" data-grant-index="${index}" title="Copy user data prompt to clipboard"><i class="bi bi-clipboard"></i> </button>
                  <button class="btn btn-sm btn-light open-in-playground-btn ms-2" data-grant-index="${index}" title="Open Prompt Data in Playground">
                    <i class="bi bi-journal-code"></i>
                  </button>
                </div>
              </div>
            </div>
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

  function displayTeaching(teaching) {
    if (!teaching || teaching.length === 0) {
      teachingContainer.classList.add('d-none');
      return;
    }

    const recentTeaching = teaching.slice(0, MAX_RECORDS_TO_SHOW);

    const teachingCards = recentTeaching.map((activity, index) => {
      const title = activity.title || 'No Title Available';
      const role = activity.objectTypeDisplayName || 'N/A';
      const dateString = formatDateWithOrdinal(activity.date1);
      const additionalInfo = activity.additionalInformation;
      const keyUrl = activity.keyUrl;

      const additionalInfoHtml = additionalInfo ? `
              <p class="card-text text-muted mt-1 small">${additionalInfo}</p>
      ` : '';

      return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8 col-lg-9">
              <h6 class="card-title">${keyUrl ? `<a href="${keyUrl}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</h6>
              <p class="card-text text-muted mb-1 small">
                <strong>Role:</strong> ${role}
              </p>
              <p class="card-text text-muted mb-0 small">
                <strong>Date:</strong> ${dateString}
              </p>
              ${additionalInfoHtml}
            </div>
            <div class="col-md-4 col-lg-3 mt-2 mt-md-0">
              <div class="d-grid gap-2">
                <button class="btn btn-sm btn-outline-primary generate-post-btn" data-type="linkedin" data-teaching-index="${index}">
                  <i class="bi bi-linkedin"></i> Create LinkedIn Post
                </button>
                <button class="btn btn-sm btn-outline-info generate-post-btn" data-type="bluesky" data-teaching-index="${index}">
                  <i class="bi bi-cloud"></i> Create Bluesky Posts
                </button>
                <button class="btn btn-sm btn-outline-secondary generate-post-btn" data-type="blog" data-teaching-index="${index}">
                  <i class="bi bi-file-post"></i> Create Blog Post
                </button>
              </div>
            </div>
          </div>
          <div class="ai-output-container mt-3" id="ai-output-container-teaching-${index}" style="display: none;">
            <div id="ai-output-content-teaching-${index}" class="ai-output-content"></div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <button class="btn btn-sm btn-secondary close-ai-output-btn" data-teaching-index="${index}">Close & Clear</button>
              <a href="#" class="small text-muted show-prompt-link" data-teaching-index="${index}">Show Prompt Data</a>
            </div>
            <div class="ai-prompt-wrapper mt-2" style="display: none;">
              <div class="position-relative">
                <div class="ai-prompt-content p-3 bg-dark text-light rounded" style="font-family: monospace; font-size: 0.8rem; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
                </div>
                <div class="position-absolute d-flex" style="top: 0.5rem; right: 0.5rem; z-index: 10;">
                  <button class="btn btn-sm btn-light copy-prompt-btn" data-teaching-index="${index}" title="Copy user data prompt to clipboard"><i class="bi bi-clipboard"></i> </button>
                  <button class="btn btn-sm btn-light open-in-playground-btn ms-2" data-teaching-index="${index}" title="Open Prompt Data in Playground">
                    <i class="bi bi-journal-code"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      `;
    }).join('');

    const teachingHtml = `
      <div class="card">
        <div class="card-header teaching-card-header d-flex justify-content-between align-items-center" style="cursor: pointer;">
          <h5 class="mb-0">Recent Teaching Activities (${recentTeaching.length})</h5>
          <i class="bi bi-chevron-down" id="teaching-toggle-icon"></i>
        </div>
        <div class="card-body">
          ${teachingCards}
        </div>
      </div>
    `;

    teachingContainer.innerHTML = teachingHtml;
    teachingContainer.classList.remove('d-none', 'collapsed');
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
    // Show the output container
    outputElement.parentElement.style.display = 'block';
    // Store the prompt type on the container for other buttons to use
    outputElement.parentElement.dataset.promptType = type;

    // Before doing anything else, check for and remove any existing TinyMCE instance.
    // This ensures the old editor is gone before we show the loading spinner.
    if (tinymce.get(outputElement.id)) {
      tinymce.remove(`#${outputElement.id}`);
    }

    const promptWrapper = outputElement.parentElement.querySelector('.ai-prompt-wrapper');
    const promptContainer = promptWrapper ? promptWrapper.querySelector('.ai-prompt-content') : null;
    if (promptContainer) {
      try {
        // The user data is the itemData object, formatted as a JSON string.
        const userDataString = JSON.stringify(itemData, null, 2);
        promptContainer.textContent = userDataString;
        promptWrapper.style.display = 'none';
      } catch (e) {
        promptContainer.textContent = 'Error formatting prompt data.';
        promptWrapper.style.display = 'block';
      }
    }

    // Set loading state in the main output element
    outputElement.classList.add('d-flex', 'justify-content-center', 'align-items-center', 'card-body', 'bg-light', 'border', 'rounded');
    outputElement.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="ms-2 text-muted">Generating content...</span>
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
      const dirtyHtml = marked.parse(result.content || '');
      const cleanHtml = DOMPurify.sanitize(dirtyHtml);

      // Clear loading spinner and prepare for editor
      outputElement.innerHTML = '';
      outputElement.classList.remove('d-flex', 'justify-content-center', 'align-items-center');

      // The div needs the content *before* TinyMCE initializes on it.
      outputElement.innerHTML = cleanHtml;

      // Initialize TinyMCE
      tinymce.init({
        selector: `#${outputElement.id}`,
        height: 350,
        menubar: 'file edit insert view format table tools help',
        license_key: 'gpl',
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
          'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
          'fullscreen', 'insertdatetime', 'media', 'table', 'help', 'wordcount', 'contextmenu'
        ],
        toolbar: 'undo redo | blocks | ' +
          'bold italic forecolor | alignleft aligncenter ' +
          'alignright alignjustify | bullist numlist outdent indent | link image' +
          'removeformat | help',
        content_style: 'body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; font-size:16px }',
        contextmenu: 'copy paste | customItem1',
        setup: function (editor) {
          // Use editor.ui.registry.addMenuItem for TinyMCE 5+
          editor.ui.registry.addMenuItem('customItem1', {
              text: 'Generate Image',
              icon: 'image', // Added an icon for better UX
              onAction: async function () {
                const selectedText = editor.selection.getContent({ format: 'text' }).trim();
                if (!selectedText) {
                  editor.notificationManager.open({
                    text: 'Please select text to use as a prompt for the image.',
                    type: 'warning',
                    timeout: 5000
                  });
                  return;
                }

                // Collapse the selection to the end, so we insert *after* it.
                editor.selection.collapse(false);

                // Show a loading indicator in the editor
                editor.setProgressState(true, 'Generating image...');

                try {
                  const response = await fetch('/api/generate/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: { positive: selectedText } })
                  });

                  const result = await response.json();
                  if (!response.ok) {
                    throw new Error(result.error || 'Server returned an error.');
                  }

                  if (result.imageUrl) {
                    const imageHtml = `
                      <p style="text-align: left;">
                        <img src="${result.imageUrl}" alt="${selectedText}" style="max-width: 25%; height: auto; border: 1px solid #ddd; border-radius: 4px; padding: 5px;" />
                        <br />
                        <em><a href="${result.imageUrl}" target="_blank">View Image</a></em>
                      </p>
                    `;
                    // Insert the generated image HTML at the cursor position (which is now after the selection).
                    editor.execCommand('mceInsertContent', false, imageHtml);
                  } else {
                    throw new Error('Image URL was not returned from the server.');
                  }
                } catch (error) {
                  console.error('Image generation failed:', error);
                  editor.notificationManager.open({
                    text: `Error: ${error.message}`,
                    type: 'error',
                    timeout: 7000
                  });
                } finally {
                  // Hide the loading indicator
                  editor.setProgressState(false);
                }
              }
          });
        }
      });
    } catch (error) {
      // If an error occurs, make sure to clean up the loading spinner before showing the error.
      outputElement.classList.remove('d-flex', 'justify-content-center', 'align-items-center');
      outputElement.innerHTML = `<div class="alert alert-danger m-0"><strong>Error:</strong> ${error.message}</div>`;
    } finally {
      // Re-enable buttons
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
      allTeaching = data.teaching;

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
      displayTeaching(allTeaching);
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
      teachingContainer.classList.add('d-none');
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
    const blogBtn = document.getElementById('blog-btn');

    // Check for a prompt passed from another page via sessionStorage
    const storedPrompt = sessionStorage.getItem('playgroundPrompt');
    if (storedPrompt) {
      promptInput.value = storedPrompt;
      // Clean up so it doesn't reappear on refresh
      sessionStorage.removeItem('playgroundPrompt');
    }

    const handlePlaygroundRequest = async (endpoint, button) => {
      const prompt = promptInput.value.trim();
      if (!prompt) {
        promptInput.focus();
        return;
      }

      // If an editor instance exists, remove it before generating new content.
      if (tinymce.get(resultsDiv.id)) {
        tinymce.remove(`#${resultsDiv.id}`);
      }

      const originalButtonHTML = button.innerHTML;
      // Disable all buttons to prevent multiple requests
      [linkedinBtn, blueskyBtn, blogBtn].forEach(btn => { if(btn) btn.disabled = true; });
      button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;
      resultsContainer.classList.remove('d-none');
      // Clear the results div and show a loading spinner
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
        const dirtyHtml = marked.parse(result.content || '');
        const cleanHtml = DOMPurify.sanitize(dirtyHtml);

        // Clear loading spinner and prepare for editor
        resultsDiv.innerHTML = '';
        resultsDiv.innerHTML = cleanHtml;

        // Initialize TinyMCE, reusing the config from the profile page
        tinymce.init({
          selector: `#${resultsDiv.id}`,
          height: 800,
          menubar: 'file edit insert view format table tools help',
          license_key: 'gpl',
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
            'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
            'fullscreen', 'insertdatetime', 'media', 'table', 'help', 'wordcount', 'contextmenu'
          ],
          toolbar: 'undo redo | blocks | ' +
            'bold italic forecolor | alignleft aligncenter ' +
            'alignright alignjustify | bullist numlist outdent indent | link image' +
            'removeformat | help',
          content_style: 'body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; font-size:16px }',
          contextmenu: 'copy paste | customItem1',
          setup: function (editor) {
            editor.ui.registry.addMenuItem('customItem1', {
              text: 'Generate Image',
              icon: 'image',
              onAction: async function () {
                const selectedText = editor.selection.getContent({ format: 'text' }).trim();
                if (!selectedText) {
                  editor.notificationManager.open({
                    text: 'Please select text to use as a prompt for the image.',
                    type: 'warning',
                    timeout: 5000
                  });
                  return;
                }
                editor.selection.collapse(false);
                editor.setProgressState(true, 'Generating image...');
                try {
                  const response = await fetch('/api/generate/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: { positive: selectedText } })
                  });
                  const result = await response.json();
                  if (!response.ok) {
                    throw new Error(result.error || 'Server returned an error.');
                  }
                  if (result.imageUrl) {
                    const imageHtml = `
                      <p style="text-align: left;">
                        <img src="${result.imageUrl}" alt="${selectedText}" style="max-width: 25%; height: auto; border: 1px solid #ddd; border-radius: 4px; padding: 5px;" />
                        <br />
                        <em><a href="${result.imageUrl}" target="_blank">View Image</a></em>
                      </p>
                    `;
                    editor.execCommand('mceInsertContent', false, imageHtml);
                  } else {
                    throw new Error('Image URL was not returned from the server.');
                  }
                } catch (error) {
                  console.error('Image generation failed:', error);
                  editor.notificationManager.open({
                    text: `Error: ${error.message}`,
                    type: 'error',
                    timeout: 7000
                  });
                } finally {
                  editor.setProgressState(false);
                }
              }
            });
          }
        });
      } catch (error) {
        // If an editor was being created, it won't be, so just show the error.
        resultsDiv.innerHTML = `<div class="alert alert-danger m-0"><strong>Error:</strong> ${error.message}</div>`;
      } finally {
        // Re-enable all buttons
        [linkedinBtn, blueskyBtn, blogBtn].forEach(btn => { if(btn) btn.disabled = false; });
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

    if (blogBtn) {
      blogBtn.addEventListener('click', () => handlePlaygroundRequest('/api/generate/blog', blogBtn));
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