import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getProviderEnvKey } from "./model-providers";

export type LLMModel = {
	id: string;
	name: string;
	provider: string;
	providerId: string;
	multiModal?: boolean;
};

export type LLMModelConfig = {
	model?: string;
	apiKey?: string;
	baseURL?: string;
	temperature?: number;
	topP?: number;
	topK?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	maxTokens?: number;
};

export function getModelClient(model: LLMModel, config: LLMModelConfig) {
	const { id: modelNameString, providerId } = model;
	const { apiKey, baseURL } = config;
	const providerApiKey = apiKey || getProviderEnvKey(providerId);

	const providerConfigs = {
		anthropic: () =>
			createAnthropic({ apiKey: providerApiKey, baseURL })(modelNameString),
		openai: () =>
			createOpenAI({ apiKey: providerApiKey, baseURL })(modelNameString),
		google: () =>
			createGoogleGenerativeAI({
				apiKey: providerApiKey,
				baseURL,
			})(modelNameString),
		mistral: () =>
			createMistral({ apiKey: providerApiKey, baseURL })(modelNameString),
		groq: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://api.groq.com/openai/v1",
			})(modelNameString),
		togetherai: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://api.together.xyz/v1",
			})(modelNameString),
		ollama: () =>
			createOpenAICompatible({
				name: "ollama",
				baseURL: baseURL || "http://localhost:11434/v1",
			})(modelNameString),
		fireworks: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://api.fireworks.ai/inference/v1",
			})(modelNameString),
		vertex: () =>
			createVertex({
				googleAuthOptions: {
					credentials: JSON.parse(
						process.env.GOOGLE_VERTEX_CREDENTIALS || "{}",
					),
				},
			})(modelNameString),
		xai: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://api.x.ai/v1",
			})(modelNameString),
		deepseek: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://api.deepseek.com/v1",
			})(modelNameString),
		openrouter: () =>
			createOpenAI({
				apiKey: providerApiKey,
				baseURL: baseURL || "https://openrouter.ai/api/v1",
			})(modelNameString),
	};

	const createClient =
		providerConfigs[providerId as keyof typeof providerConfigs];

	if (!createClient) {
		throw new Error(`Unsupported provider: ${providerId}`);
	}

	return createClient();
}
