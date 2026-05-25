import {
  MODEL_PROVIDERS,
  getProviderEnvKey,
} from '@/lib/model-providers'
import type { ModelProvider } from '@/lib/model-providers'
import type { LLMModel } from '@/lib/models'

export const dynamic = 'force-dynamic'

type ModelsRequest = {
  apiKeys?: Record<string, string>
  baseURL?: string
}

type ProviderStatus = {
  providerId: string
  configured: boolean
  error?: string
}

function joinURL(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function modelName(modelId: string, displayName?: string) {
  return displayName || modelId.split('/').pop() || modelId
}

function toModel(
  provider: ModelProvider,
  id: string | undefined,
  displayName?: string,
): LLMModel | undefined {
  if (!id) return undefined

  return {
    id,
    name: modelName(id, displayName),
    provider: provider.name,
    providerId: provider.id,
  }
}

async function fetchJSON(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function listOpenAICompatibleModels(
  provider: ModelProvider,
  apiKey: string,
  baseURL?: string,
) {
  const json = await fetchJSON(joinURL(baseURL || provider.baseURL!, '/models'), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const models = Array.isArray(json) ? json : json.data || json.models || []

  return models
    .map((model: any) =>
      toModel(provider, model.id || model.name, model.display_name || model.name),
    )
    .filter(Boolean) as LLMModel[]
}

async function listAnthropicModels(provider: ModelProvider, apiKey: string) {
  const json = await fetchJSON(joinURL(provider.baseURL!, '/models'), {
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
  })

  return (json.data || [])
    .map((model: any) => toModel(provider, model.id, model.display_name))
    .filter(Boolean) as LLMModel[]
}

async function listGoogleModels(provider: ModelProvider, apiKey: string) {
  const url = new URL(joinURL(provider.baseURL!, '/models'))
  url.searchParams.set('key', apiKey)

  const json = await fetchJSON(url.toString())

  return (json.models || [])
    .filter((model: any) =>
      (model.supportedGenerationMethods || []).includes('generateContent'),
    )
    .map((model: any) => toModel(provider, model.name, model.displayName))
    .filter(Boolean) as LLMModel[]
}

async function listOllamaModels(provider: ModelProvider, baseURL?: string) {
  if (!baseURL) return []

  const json = await fetchJSON(joinURL(baseURL, '/api/tags'))

  return (json.models || [])
    .map((model: any) => toModel(provider, model.name || model.model))
    .filter(Boolean) as LLMModel[]
}

async function listProviderModels(
  provider: ModelProvider,
  apiKey: string | undefined,
  baseURL?: string,
) {
  if (provider.listModels === 'ollama') {
    return listOllamaModels(provider, baseURL)
  }

  if (!apiKey) return []

  if (provider.listModels === 'anthropic') {
    return listAnthropicModels(provider, apiKey)
  }

  if (provider.listModels === 'google') {
    return listGoogleModels(provider, apiKey)
  }

  return listOpenAICompatibleModels(provider, apiKey, baseURL)
}

export async function POST(req: Request) {
  const { apiKeys = {}, baseURL }: ModelsRequest = await req.json()
  const statuses: ProviderStatus[] = []
  const results = await Promise.all(
    MODEL_PROVIDERS.map(async (provider) => {
      const apiKey = apiKeys[provider.id] || getProviderEnvKey(provider.id)
      const providerBaseURL = provider.id === 'ollama' ? baseURL : undefined
      const configured = provider.id === 'ollama' ? Boolean(baseURL) : Boolean(apiKey)

      if (!configured) {
        statuses.push({ providerId: provider.id, configured: false })
        return []
      }

      try {
        const models = await listProviderModels(provider, apiKey, providerBaseURL)
        statuses.push({ providerId: provider.id, configured: true })
        return models
      } catch (error) {
        statuses.push({
          providerId: provider.id,
          configured: true,
          error: error instanceof Error ? error.message : 'Unable to list models',
        })
        return []
      }
    }),
  )

  return Response.json({
    models: results.flat().sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider)
      return providerCompare || a.name.localeCompare(b.name)
    }),
    providers: MODEL_PROVIDERS,
    statuses,
  })
}
