// The browser pieces of the browser platform, kept apart so the platform itself runs in tests.

export function download(name: string, text: string, type: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** The system file picker. Must be called from a click or key handler, as browsers require. */
export function pickFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) void f.text().then((text) => resolve({ name: f.name, text }))
      else resolve(null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
