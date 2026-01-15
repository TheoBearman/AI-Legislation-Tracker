
// Import the Genkit core libraries and plugins.
// Import the Genkit core libraries and plugins.
import { genkit, z } from "genkit";
import { openAICompatible, defineCompatOpenAIModel } from "@genkit-ai/compat-oai";
import OpenAI from "openai";

// Cloud Functions for Firebase supports Genkit natively.
// The onCallGenkit function creates a callable function from a Genkit action.
// It automatically implements streaming if your flow does. The https library
// also has other utility methods such as hasClaim, which verifies that a
// caller's token has a specific claim (optionally matching a specific value)
import {
  onCallGenkit,
  // hasClaim, // Removed as it was unused
} from "firebase-functions/https";

// Genkit models generally depend on an API key. APIs should be stored in Cloud
// Secret Manager so that access to these sensitive values can be controlled.
// defineSecret does this for you automatically.
// For OpenRouter, use OPENROUTER_API_KEY and OPENROUTER_MODEL
import { defineSecret, defineString } from "firebase-functions/params";
const apiKey = defineSecret("OPENROUTER_API_KEY");
const modelName = defineString("OPENROUTER_MODEL", { default: "google/gemini-2.0-flash-001" });

// The Firebase telemetry plugin exports a combination of metrics, traces, and
// logs to Google Cloud Observability. See
// https://firebase.google.com/docs/genkit/observability/telemetry-collection.
import { enableFirebaseTelemetry } from "@genkit-ai/firebase";
enableFirebaseTelemetry();

const openRouterClient = new OpenAI({
  apiKey: apiKey.value(),
  baseURL: 'https://openrouter.ai/api/v1',
});

// Define a configurable OpenRouter model
const openRouterModel = defineCompatOpenAIModel({
  name: 'openrouter/configurable',
  client: openRouterClient as any,
  requestBuilder: (request, body) => {
    body.model = modelName.value();
  },
});

const ai = genkit({
  plugins: [
    openAICompatible({
      name: 'openrouter',
      apiKey: apiKey.value(),
      baseURL: 'https://openrouter.ai/api/v1',
    }),
  ],
});

// Define a simple flow that prompts an LLM to generate menu suggestions.
const menuSuggestionFlow = ai.defineFlow({
  name: "menuSuggestionFlow",
  inputSchema: z.string().describe("A restaurant theme").default("seafood"),
  outputSchema: z.string(),
  streamSchema: z.string(),
}, async (subject, { sendChunk }) => {
  // Construct a request and send it to the model API.
  const prompt =
    `Suggest an item for the menu of a ${subject} themed restaurant`;
  const { response, stream } = ai.generateStream({
    model: openRouterModel,
    prompt: prompt,
    config: {
      temperature: 1,
    },
  });

  for await (const chunk of stream) {
    sendChunk(chunk.text);
  }

  // Handle the response from the model API. In this sample, we just
  // convert it to a string, but more complicated flows might coerce the
  // response into structured output or chain the response into another
  // LLM call, etc.
  return (await response).text;
});

export const menuSuggestion = onCallGenkit({
  // Uncomment to enable AppCheck. This can reduce costs by ensuring only your
  // Verified app users can use your API. Read more at
  // https://firebase.google.com/docs/app-check/cloud-functions
  // enforceAppCheck: true,

  // authPolicy can be any callback that accepts an AuthData (a uid and tokens
  // dictionary) and the request data. The isSignedIn() and hasClaim() helpers
  // can be used to simplify. The following will require the user to have the
  // email_verified claim, for example.
  // authPolicy: hasClaim("email_verified"),

  // Grant access to the API key to this function:
  secrets: [apiKey],
}, menuSuggestionFlow);
