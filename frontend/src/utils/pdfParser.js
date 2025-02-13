import * as pdfjsLib from 'pdfjs-dist/build/pdf'

// Fix worker import for Vite
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

// Set the worker source dynamically
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

/**
 * Extracts text from a PDF file using `pdf.js`
 * @param {File} file - The selected PDF file
 * @returns {Promise<string>} - Extracted text from the PDF
 */
export async function extractPdfText(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    fileReader.readAsArrayBuffer(file)

    fileReader.onload = async (event) => {
      try {
        const pdfData = new Uint8Array(event.target.result)
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise

        let extractedText = ''
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const textContent = await page.getTextContent()
          extractedText += textContent.items.map((item) => item.str).join(' ') + '\n'
        }
        resolve(extractedText)
      } catch (error) {
        reject(error)
      }
    }

    fileReader.onerror = (error) => {
      reject(error)
    }
  })
}
