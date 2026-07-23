export interface ProviderDeviceAuthDetails {
  verificationUri?: string
  userCode?: string
  requiresCodeInput?: boolean
  inputPrompt?: string
}

function stripAnsi(value: string): string {
  const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g")
  return value.replace(ansiEscapePattern, "")
}

export function hasCompleteDeviceAuthDetails(details: ProviderDeviceAuthDetails): boolean {
  return Boolean((details.verificationUri && details.userCode) || details.requiresCodeInput)
}

export function extractDeviceAuthDetails(output: string): ProviderDeviceAuthDetails {
  const clean = stripAnsi(output)
  const verificationUri = clean.match(/https?:\/\/[^\s<>"')]+/i)?.[0]?.replace(/[.,;:]+$/, "")
  const codeShape = /^[A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4}$/i
  const normalizeCode = (value: string): string | undefined => {
    const candidate = value.trim().replace(/\s+/g, "-").toUpperCase()
    const compact = candidate.replace(/-/g, "")
    const blocked = new Set([
      "AUTHORIZATION",
      "AUTHORISATION",
      "AUTHENTICATION",
      "DEVICE",
      "LOGIN",
      "OPENAI",
      "CODE",
      "BROWSER",
      "THIS",
      "ONE",
      "TIME",
      "COMMAND",
      "LINE",
    ])
    if (blocked.has(compact)) return undefined
    const parts = candidate.split("-").filter(Boolean)
    const blockedParts = parts.filter((part) => blocked.has(part)).length
    if (parts.length > 1 && blockedParts >= 2) return undefined
    if (parts.length > 1 && blockedParts === parts.length) return undefined
    const hasDigit = /[0-9]/.test(compact)
    const uniformPartLengths = parts.length > 1 && parts.every((part) => part.length === parts[0]!.length)
    if (!hasDigit && !uniformPartLengths && compact.length > 6) return undefined
    if (!codeShape.test(candidate)) return undefined
    return candidate
  }

  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index += 1) {
    if (!/enter\s+this\s+one-time\s+code/i.test(lines[index] ?? "")) continue
    const nextLine = lines[index + 1]
    if (!nextLine) continue
    const normalized = normalizeCode(nextLine)
    if (normalized) return { verificationUri, userCode: normalized }
  }

  const codePatterns = [
    /(?:user\s*)?code(?:\s+is)?\s*[:=]?\s*([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){0,4})/i,
    /enter\s+(?:the\s+)?(?:code\s+)?([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4})/i,
    /copy\s+(?:the\s+)?(?:code\s+)?([A-Z0-9]{4,}(?:[- ][A-Z0-9]{3,}){1,4})/i,
    /\b([A-Z0-9]{4,}(?:[- ][A-Z0-9]{4,}){1,4})\b/,
  ]
  let userCode: string | undefined
  for (const pattern of codePatterns) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
    for (const match of clean.matchAll(globalPattern)) {
      const raw = match[1]?.trim()
      if (!raw || /^HTTPS?$/i.test(raw)) continue
      const normalized = normalizeCode(raw)
      if (normalized) {
        userCode = normalized
        break
      }
    }
    if (userCode) break
  }

  let requiresCodeInput: boolean | undefined
  let inputPrompt: string | undefined
  if (!userCode) {
    const inputRequestPatterns = [
      /enter\s+(?:the\s+)?authorization\s+code/i,
      /paste\s+(?:the\s+)?(?:authorization\s+|auth\s+)?code/i,
      /enter\s+(?:the\s+)?code\s+(?:from|shown|displayed)/i,
      /code\s+from\s+(?:your\s+)?browser/i,
      /authorization\s+code\s*:/i,
    ]
    for (const line of lines) {
      for (const pattern of inputRequestPatterns) {
        if (pattern.test(line)) {
          requiresCodeInput = true
          inputPrompt = line.replace(/[:\s]+$/, "").trim()
          break
        }
      }
      if (requiresCodeInput) break
    }
  }

  return { verificationUri, userCode, requiresCodeInput, inputPrompt }
}
