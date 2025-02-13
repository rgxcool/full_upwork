import * as pdfjsLib from 'pdfjs-dist/build/pdf'

// Configure worker for performance (optional, but recommended)
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

// Set the worker source dynamically
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

/**
 * Extracts text from a PDF file using pdf.js
 * @param {File} file - The PDF file selected in the browser
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

export function stdParser(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line)

  return lines
}

export function parseCourseStudentPdf(text) {
  console.log('pdfParser: Text at start of formatting', text)
  const lines = text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove Zero-width spaces
    .replace(/\s{2,}/g, ' ') // Replace multiple spaces with a single space
    .split(/\n|_{3,}/) // Split by newlines or separator lines
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && // Remove empty lines
        !line.startsWith('_____') // Remove separator lines
    )

  console.log('pdfParser: Text after splitting lines', lines)

  let result = {
    filename: '',
    personnummer: '',
    namn: '',
    adress: '',
    email: '',
    telefon: '',
    föredragna_kontaktsätt: [],
    kurser: [],
    totalt_poäng: '',
  }

  const keywords = [
    'Personnummer',
    'Namn',
    'Adress',
    'E-postadress',
    'Telefonnummer',
    'Föredragna kontaktsätt',
    'Sökta kurser',
    'Totalt antal sökta poäng',
  ]

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    while (line) {
      // Check if the line contains any of the keywords
      const keyword = keywords.find((kw) => line.includes(kw))
      if (keyword) {
        // Find the index of the keyword in the line
        const keywordIndex = line.indexOf(keyword)
        // Extract the substring starting from the keyword
        line = line.substring(keywordIndex)

        // Extract the information after the keyword
        const info = line.replace(keyword, '').trim()

        // Find the next keyword in the remaining line
        const nextKeyword = keywords.find(
          (kw) => line.includes(kw) && line.indexOf(kw) > keywordIndex
        )
        let nextKeywordIndex = nextKeyword ? line.indexOf(nextKeyword) : line.length

        // Extract the information between the current and next keyword
        const extractedInfo = line.substring(keyword.length, nextKeywordIndex).trim()

        if (extractedInfo) {
          switch (keyword) {
            case 'Personnummer':
              result['personnummer'] = extractedInfo
              break
            case 'Namn':
              result['namn'] = extractedInfo
              break
            case 'Adress':
              result['adress'] = extractedInfo
              break
            case 'E-postadress':
              result['email'] = extractedInfo
              break
            case 'Telefonnummer':
              result['telefon'] = extractedInfo
              break
            case 'Föredragna kontaktsätt':
              result['föredragna_kontaktsätt'].push(extractedInfo)
              break
            case 'Sökta kurser':
              let courseMatch = extractedInfo.match(/^\d+\.\s(.+),\s(\d+)\spoäng/)
              if (courseMatch) {
                let courseName = courseMatch[1].trim()
                let coursePoints = courseMatch[2].trim()

                let nextLine = lines[i + 1]?.trim()
                if (nextLine && nextLine.match(/^\d+\./)) {
                  let details = nextLine.split(',').map((d) => d.trim())
                  let dateMatch = details[0].match(
                    /(\d{4}-\d{2}-\d{2}) till (\d{4}-\d{2}-\d{2})/
                  )
                  let startDate = dateMatch ? dateMatch[1] : ''
                  let endDate = dateMatch ? dateMatch[2] : ''

                  if (details.length >= 5) {
                    let courseObj = {
                      namn: courseName,
                      poäng: coursePoints,
                      start: startDate || '',
                      slut: endDate || '',
                      veckor: details[1] || '',
                      skola: details[2] || '',
                      studieform: details[3] || '',
                      kod: details[4] || '',
                    }
                    result['kurser'].push(courseObj)
                    i++ // Move past course details
                  }
                }
              }
              break
            case 'Totalt antal sökta poäng':
              result['totalt_poäng'] = extractedInfo.replace('poäng', '').trim()
              break
          }
        }

        // Remove the processed part of the line
        line = line.substring(nextKeywordIndex).trim()
      } else {
        // If no more keywords are found, break the loop
        break
      }
    }
  }

  console.log('Parsed JSON:', JSON.stringify(result, null, 2))
  return result
}
