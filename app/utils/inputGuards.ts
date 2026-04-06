export const MAX_CHAT_PROMPT_LENGTH = 600
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2000
export const MAX_PROJECT_NAME_LENGTH = 120
export const MAX_TASK_TITLE_LENGTH = 120
export const MAX_LONG_TEXT_LENGTH = 400
export const MAX_IMPORT_ENTRIES = 20
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024

export function normalizeUserText(value: string, maxLength: number) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function normalizeMultilineUserText(value: string, maxLength: number) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

export function normalizeOptionalUserText(value: string | undefined, maxLength: number) {
  const normalized = normalizeMultilineUserText(value || '', maxLength)
  return normalized || undefined
}

export function clampCount(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function shortenForFeedback(value: string, maxLength = 80) {
  const normalized = normalizeUserText(value, maxLength)
  if (value.trim().length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}
