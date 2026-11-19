// AQUORA ERP — Centralized Frontend Environment Configuration

interface FrontendEnvConfig {
  apiUrl: string
  isProduction: boolean
  isDevelopment: boolean
  appName: string
}

const getEnvVar = (key: string): string | undefined => {
  return import.meta.env[key] as string | undefined
}

const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production'
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

const rawApiUrl = getEnvVar('VITE_API_URL')

// Validation in Production Environment
if (isProduction && !rawApiUrl) {
  console.error(
    '[CRITICAL CONFIGURATION ERROR]: Production build detected without a valid VITE_API_URL environment variable! ' +
    'API requests will fail or attempt to connect to localhost.'
  )
}

const defaultLocalUrl = 'http://localhost:5000'

const finalUrl = rawApiUrl || (isDevelopment ? defaultLocalUrl : '')

const getSanitizedBaseUrl = (url: string): string => {
  if (!url) return ''
  let cleaned = url.trim()

  // 1. Ensure scheme (http:// or https://)
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    if (cleaned.includes('localhost') || cleaned.includes('127.0.0.1')) {
      cleaned = `http://${cleaned}`
    } else {
      cleaned = `https://${cleaned}`
    }
  }

  // 2. Strip trailing slashes or accidental /api or /api/v1 suffix
  try {
    const parsedUrl = new URL(cleaned)
    return parsedUrl.origin
  } catch (e) {
    return cleaned.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '').replace(/\/$/, '')
  }
}

export const envConfig: FrontendEnvConfig = {
  apiUrl: getSanitizedBaseUrl(finalUrl),
  isProduction,
  isDevelopment,
  appName: getEnvVar('VITE_APP_NAME') || 'AQUZIO ERP'
}

export default envConfig
