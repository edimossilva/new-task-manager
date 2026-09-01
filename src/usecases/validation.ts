/** Returns a Portuguese error message, or null when the value is acceptable. */
export function validateRequiredText(value: string, fieldLabel: string): string | null {
  if (value.trim().length === 0) return `${fieldLabel} e obrigatorio.`
  return null
}
