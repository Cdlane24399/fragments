export type ModelProviderId =
  | 'anthropic'
  | 'deepseek'
  | 'fireworks'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'openai'
  | 'openrouter'
  | 'togetherai'
  | 'xai'

export type ModelProvider = {
  id: ModelProviderId
  name: string
  envVar?: string
  envVars?: string[]
  baseURL?: string
  listModels:
    | 'anthropic'
    | 'google'
    | 'ollama'
    | 'openai-compatible'
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    baseURL: 'https://api.anthropic.com/v1',
    listModels: 'anthropic',
  },
  {
    id: 'google',
    name: 'Google Generative AI',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    envVars: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'],
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    listModels: 'google',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    envVar: 'MISTRAL_API_KEY',
    baseURL: 'https://api.mistral.ai/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'groq',
    name: 'Groq',
    envVar: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    envVar: 'FIREWORKS_API_KEY',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'togetherai',
    name: 'Together AI',
    envVar: 'TOGETHER_API_KEY',
    baseURL: 'https://api.together.xyz/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'xai',
    name: 'xAI',
    envVar: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    listModels: 'openai-compatible',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseURL: 'http://localhost:11434',
    listModels: 'ollama',
  },
]

export function getProvider(providerId: string) {
  return MODEL_PROVIDERS.find((provider) => provider.id === providerId)
}

export function getProviderEnvKey(providerId: string) {
  const provider = getProvider(providerId)
  const envVars = provider?.envVars || (provider?.envVar ? [provider.envVar] : [])

  return envVars.map((envVar) => process.env[envVar]).find(Boolean)
}
