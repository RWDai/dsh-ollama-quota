/**
 * Ollama Cloud 的供应商预设——**由 tools/generate-preset.mjs 生成，别手改**。
 *
 * 数据来源：POST /api/show 的 capabilities、thinking.values、model_info.*.context_length。
 * 重新生成：`OLLAMA_API_KEY=... node tools/generate-preset.mjs deepseek-v4.1-flash deepseek-v4.1-flash:1017 deepseek-v4-pro:0813 kimi-k3 kimi-k2.7-code kimi-k2.6 glm-5.3 glm-5.3-flash glm-5.2 minimax-m3.1-flash minimax-m3 minimax-m2.7 mistral-large-3:675b mistral-large-4 gemma4:31b muse-spark-open gpt-oss:20b gpt-oss:120b beam nemotron-3-ultra nemotron-3-super nemotron-3-nano:30b`
 */

/** 供应商路由 id（也是凭据引用的词干：OLLAMA_API_KEY）。 */
export const OLLAMA_PROVIDER_ID = "ollama";

/** 装到 llm-pi-ai 里的完整供应商 profile。 */
export const OLLAMA_PROVIDER_PRESET = {
  "displayName": "Ollama Cloud",
  "baseURL": "https://ollama.com/v1",
  "api": "openai-responses",
  "apiKeyEnv": "OLLAMA_API_KEY",
  "models": [
    {
      "id": "deepseek-v4.1-flash",
      "name": "deepseek-v4.1-flash",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ],
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "deepseek-v4.1-flash:1017",
      "name": "deepseek-v4.1-flash:1017",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ],
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "deepseek-v4-pro:0813",
      "name": "deepseek-v4-pro:0813",
      "contextWindow": 1048576,
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "kimi-k3",
      "name": "kimi-k3",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ],
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "kimi-k2.7-code",
      "name": "kimi-k2.7-code",
      "contextWindow": 262144,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "kimi-k2.6",
      "name": "kimi-k2.6",
      "contextWindow": 262144,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "glm-5.3",
      "name": "glm-5.3",
      "contextWindow": 1048576,
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "glm-5.3-flash",
      "name": "glm-5.3-flash",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ],
      "reasoningEfforts": {
        "low": "low",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "glm-5.2",
      "name": "glm-5.2",
      "contextWindow": 1048576,
      "reasoningEfforts": {
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "minimax-m3.1-flash",
      "name": "minimax-m3.1-flash",
      "contextWindow": 1000000,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "minimax-m3",
      "name": "minimax-m3",
      "contextWindow": 512000
    },
    {
      "id": "minimax-m2.7",
      "name": "minimax-m2.7",
      "contextWindow": 196608
    },
    {
      "id": "mistral-large-3:675b",
      "name": "mistral-large-3:675b",
      "contextWindow": 262144,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "mistral-large-4",
      "name": "mistral-large-4",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "gemma4:31b",
      "name": "gemma4:31b",
      "contextWindow": 262144,
      "input": [
        "text",
        "image"
      ]
    },
    {
      "id": "muse-spark-open",
      "name": "muse-spark-open",
      "contextWindow": 1048576,
      "input": [
        "text",
        "image"
      ],
      "reasoningEfforts": {
        "low": "low",
        "medium": "medium",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "gpt-oss:20b",
      "name": "gpt-oss:20b",
      "contextWindow": 131072,
      "reasoningEfforts": {
        "low": "low",
        "medium": "medium",
        "high": "high"
      }
    },
    {
      "id": "gpt-oss:120b",
      "name": "gpt-oss:120b",
      "contextWindow": 131072,
      "reasoningEfforts": {
        "low": "low",
        "medium": "medium",
        "high": "high"
      }
    },
    {
      "id": "beam",
      "name": "beam",
      "contextWindow": 1048576,
      "reasoningEfforts": {
        "low": "low",
        "medium": "medium",
        "high": "high",
        "max": "max"
      }
    },
    {
      "id": "nemotron-3-ultra",
      "name": "nemotron-3-ultra",
      "contextWindow": 262144
    },
    {
      "id": "nemotron-3-super",
      "name": "nemotron-3-super",
      "contextWindow": 262144
    },
    {
      "id": "nemotron-3-nano:30b",
      "name": "nemotron-3-nano:30b",
      "contextWindow": 262144
    }
  ]
};
