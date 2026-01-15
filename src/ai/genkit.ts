import { genkit } from 'genkit';
import { openAICompatible, defineCompatOpenAIModel } from '@genkit-ai/compat-oai';
import OpenAI from 'openai';

const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Define a configurable OpenRouter model that maps to the env var
const openRouterModel = defineCompatOpenAIModel({
  name: 'openrouter/configurable',
  client: openRouterClient as any,
  requestBuilder: (request, body) => {
    // Override the model ID with the one from environment
    body.model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  },
});

export const ai = genkit({
  plugins: [
    openAICompatible({
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    }),
  ],
  model: openRouterModel,
});
