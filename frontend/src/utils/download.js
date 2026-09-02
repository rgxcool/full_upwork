// Trigger a browser download from an axios Blob response, honoring the
// Content-Disposition filename when present.
export function triggerBlobDownload(blob, fallbackName = 'download.pdf') {
  const disposition = blob?.disposition || ''
  let filename = fallbackName

  // Parse filename*=UTF-8''... first, then fall back to filename="..."
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (star) {
    filename = decodeURIComponent(star[1].trim())
  } else {
    const plain = disposition.match(/filename="?([^";]+)"?/i)
    if (plain) filename = plain[1].trim()
  }

  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
