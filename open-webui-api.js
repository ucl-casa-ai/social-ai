import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { URL } from 'url';

// Load environment variables from .env file
dotenv.config({ debug: false, quiet: true });

/**
 * Generates a completion from the OpenWebUI API.
 * @param {string} model - The model to use (e.g., 'gemma3').
 * @param {Array<object>} messages - The array of messages for the chat completion, following the OpenAI format.
 * @returns {Promise<string>} The generated content from the LLM.
 * @throws {Error} If the API request fails or the environment variable is not set.
 */
export async function generateCompletion(model, messages, systemPrompt) {
  const { OPENWEBUI_API_URL, OPENWEBUI_API_KEY } = process.env;

  if (!OPENWEBUI_API_URL) {
    throw new Error('OPENWEBUI_API_URL must be set in your .env file.');
  }

  // The API endpoint for chat completions, compliant with OpenAI's API
  const apiUrl = new URL('/api/chat/completions', OPENWEBUI_API_URL).href;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (OPENWEBUI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENWEBUI_API_KEY}`;
  }

  // Prepend the system/instructional message to the conversation.

  const fullMessages = [
    {
      "role": "system",
      "content": systemPrompt
    },
    ...messages
  ];

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: false, // We want the full response, not a stream.
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();

    // According to OpenAI spec, the response contains a `choices` array.
    if (data && data.choices && data.choices[0] && data.choices[0].message && typeof data.choices[0].message.content === 'string') {
        return data.choices[0].message.content.trim();
    } else {
        throw new Error('Invalid response format from OpenWebUI API.');
    }

  } catch (error) {
    console.error(`Error calling OpenWebUI API: ${error.message}`);
    // Re-throw the error to be handled by the caller
    throw error;
  }
}

/**
 * Generates a series of Bluesky posts for an academic article.
 * @param {string} model - The model to use.
 * @param {string} articleContext - The full text or summary of the academic article.
 * @returns {Promise<string>} The generated Bluesky posts.
 */
export async function generateBlueskyPosts(model, articleContext) {
  const systemPrompt = `
    You are an expert academic social media manager. Your task is to generate a series of five (5) engaging posts for the social media platform Bluesky. I will provide the full context of a new academic article below.

    Your primary goal is to write a series of posts that would encourage other academics to read the full article.

    **Audience:** The target audience is other academics and researchers. This includes specialists in the article's immediate field as well as those in related disciplines who may find the work relevant.

    **Instructions:**

    1.  **Create a Series of Five Posts:** Generate five distinct but connected posts. You can number them (1/5, 2/5, etc.) to indicate they are part of a series.
    2.  **Highlight, Don't Just Summarize:** Do not simply summarize the article's abstract. Instead, each post must strategically highlight a different, compelling feature of the work that would be particularly interesting to a fellow academic. Focus on what makes this research novel, significant, or exciting.
    3.  **Focus on Academic "Hooks":** When creating the posts, consider highlighting one of the following aspects in each post:
        * **A Provocative Question or a Challenged Assumption:** Does the research challenge a long-held belief in the field?
        * **Novel Methodology:** Does the paper use a cutting-edge technique, a unique dataset, or an innovative interdisciplinary approach?
        * **A Surprising or Counter-Intuitive Finding:** What is the most unexpected result from the research?
        * **The Broader Implication:** Why does this research matter? What new questions does it open up for the field? What are the "so what" factors?
        * **A Specific, Intriguing Detail:** Mention a specific data point, a compelling quote from the discussion, or a fascinating piece of evidence that teases the richness of the full article.
    4.  **Use Relevant Hashtags:** Include 2-4 relevant hashtags in each post. These should be a mix of broad academic hashtags and more specific, field-related tags that you can infer from the article's content.
        * **Broad examples:** '#AcademicSky', '#NewResearch', '#Science', '#Academia', '#Research'
        * **Field-specific examples:** '#CognitiveScience', '#LiteraryStudies', '#ClimateChange', '#EconomicHistory' (You will determine the best ones from the article).
    5.  **Call to Action:** The final post in the series should include a clear and compelling call to action, encouraging users to read the full paper. Use a placeholder like [LINK TO ARTICLE] for the URL.
  `;
  const messages = [{ role: 'user', content: articleContext }];
  console.error(`Sending prompt to model "${model}" via OpenWebUI to generate Bluesky posts...`);

  return generateCompletion(model, messages, systemPrompt);
}

/**
 * Generates a LinkedIn post for an academic article.
 * @param {string} model - The model to use.
 * @param {string} articleContext - The full text or summary of the academic article.
 * @returns {Promise<string>} The generated LinkedIn post.
 */
export async function generateLinkedInPost(model, articleContext) {
  const systemPrompt = `
    You are a strategic communications expert specializing in bridging the gap between academia and industry. Your task is to write a single, compelling LinkedIn post to promote a new academic article. I will provide the full context of the article below.

    The goal is to generate interest and demonstrate the value of this research to a professional, non-academic audience.

    Audience: The target audience consists of professionals in industry, government, and the third sector (non-profits, charities). They are not academics and will be most interested in the practical applications, real-world relevance, and potential impact of the research.

    Instructions:

    Word Count: The post must be concise and impactful, not exceeding 500 words.

    Accessible Tone: Avoid academic jargon. The tone should be professional, clear, and accessible. Frame the research in terms of problems, solutions, and opportunities that a professional audience can understand and relate to.

    Focus on Wider Applications: This is the most critical part. Do not simply summarize the research findings. Instead, translate the academic work into its practical implications. Answer the "Why should I care?" question for someone outside of academia. Explicitly signal the relevance of the work for professionals in one or more of the following sectors:

    Industry: How could this research inform business strategy, product development, or operational efficiency?

    Government: What are the policy implications? How could this work help shape public services or address societal challenges?

    Third Sector: How can NGOs, charities, or non-profits leverage these findings to advance their mission?

    Highlight Collaboration: The article involved a collaboration between multiple academics from the Centre for Advanced Spatial Analysis (CASA). You must prominently feature this collaborative aspect. Frame it as a strength, showcasing a multi-disciplinary approach to solving complex problems. You can phrase this by mentioning "A collaborative effort from our team at UCL CASA" or similar.

    Structure of the Post:

    Strong Hook: Start with a compelling question, a surprising statistic, or a relatable problem that the research addresses.

    Bridge to Research: Briefly introduce the research as a response to this problem. Mention the collaborative nature of the work here.

    Key Takeaways (The "So What?"): Dedicate the main body of the post to 2-3 key takeaways that are relevant to your professional audience. Use bullet points or numbered lists for readability.

    Call to Engagement: End the post by encouraging discussion. Ask a question to the audience (e.g., "How could you see this applying in your sector?") and invite them to read the full article for a deeper dive. Use a placeholder like [LINK TO ARTICLE].

    Use Relevant Hashtags: Include 4-6 relevant hashtags to increase visibility. Focus on professional and industry-specific tags rather than purely academic ones.

    Examples: #Innovation, #DataScience, #UrbanPlanning, #Policy, #TechForGood, #FutureOfWork, #UCLCASA, #[YourSpecificIndustry]
  `;

  const messages = [{ role: 'user', content: articleContext }];
  
  console.error(`Sending prompt to model "${model}" via OpenWebUI to generate Linked-In post...`);

  return generateCompletion(model, messages, systemPrompt);
}

/**
 * Main function to execute the CLI tool for testing the API connection.
 */
async function main() {
  const prompt = process.argv[2];

  if (!prompt) {
    console.error('Error: Please provide a prompt as a command-line argument.');
    console.error('Usage: node open-webui-api.js "<your prompt>"');
    process.exit(1);
  }

  // Use a default model or one from environment variables
  const model = process.env.OPENWEBUI_MODEL || 'llama3';
  
  try {
    // The prompt from the CLI is treated as the article context.
    //const generatedContent = await generateBlueskyPosts(model, prompt);
    const generatedContent = await generateLinkedInPost(model, prompt);
    
    console.log('\n--- Generated Content ---\n');
    console.log(generatedContent);
    console.log('\n-------------------------\n');
  } catch (error) {
    // The error is already logged in generateCompletion, so just exit.
    process.exit(1);
  }
}

// This structure ensures that main() is only called when the script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}