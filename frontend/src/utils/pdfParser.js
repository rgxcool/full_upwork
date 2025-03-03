import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/public/pdf.worker.js'

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
    personnummer: '',
    name: '',
    address: '',
    email: '',
    phone: '',
    contacts: [],
    courses: [],
    total: '',
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

  const sanitizeContact = (contact) => {
    return contact.replace(/[^\w\s@.-]/g, '').trim() // Remove unwanted characters and trim spaces
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    //console.log('Checking line:', line);

    while (line) {
      // Check if the line contains any of the keywords
      const keyword = keywords.find((kw) => line.includes(kw))
      console.log('Found keyword:', keyword)

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
        console.log('Extracted Info:', extractedInfo)

        if (extractedInfo) {
          switch (keyword) {
            case 'Personnummer':
              result['personnummer'] = extractedInfo
              break
            case 'Namn':
              result['name'] = extractedInfo
              break
            case 'Adress':
              result['address'] = extractedInfo
              break
            case 'E-postadress':
              result['email'] = extractedInfo
              break
            case 'Telefonnummer':
              result['phone'] = extractedInfo
              break
            case 'Föredragna kontaktsätt':
              console.log('Contacts:', extractedInfo)
              const sanitizedContacts = extractedInfo.split('').map(sanitizeContact).filter(Boolean)
              result['contacts'].push(...sanitizedContacts)
              break
            case 'Sökta kurser':
              console.log('Extracted Info:', extractedInfo)
              // Split the extractedInfo into individual courses
              const courses = extractedInfo.split(/\d+\.\s/).filter((course) => course.trim())
              for (let i = 0; i < courses.length; i++) {
                let courseInfo = courses[i]
                let courseMatch = courseInfo.match(/^(.+),\s(\d+)\spoäng/)
                if (courseMatch) {
                  let courseName = courseMatch[1].trim()
                  let coursePoints = courseMatch[2].trim()
                  console.log('Course Name:', courseName, 'Course Points:', coursePoints)

                  // Check if there are additional details in the same line
                  let detailsMatch = courseInfo.match(
                    /(\d{4}-\d{2}-\d{2}) till (\d{4}-\d{2}-\d{2}),\s(\d+)\sveckor,\s([^,]+),\s([^,]+),\s(.+)$/
                  )
                  if (detailsMatch) {
                    let startDate = detailsMatch[1]
                    let endDate = detailsMatch[2]
                    let weeks = detailsMatch[3]
                    let school = detailsMatch[4]
                    let courseType = detailsMatch[5]
                    let code = detailsMatch[6]
                    console.log(
                      'Start Date:',
                      startDate,
                      'End Date:',
                      endDate,
                      'Weeks:',
                      weeks,
                      'School:',
                      school,
                      'Course Type:',
                      courseType,
                      'Code:',
                      code
                    )

                    let courseObj = {
                      courseName: courseName,
                      coursePoints: coursePoints,
                      startDate: startDate || '',
                      endDate: endDate || '',
                      weeks: weeks || '',
                      school: school || '',
                      courseType: courseType || '',
                      courseCode: code || '',
                    }
                    result['courses'].push(courseObj)
                  } else {
                    // If no additional details are found, create a course object with just the name and points
                    let courseObj = {
                      courseName: courseName,
                      coursePoints: coursePoints,
                      startDate: '',
                      endDate: '',
                      weeks: '',
                      school: '',
                      courseType: '',
                      courseCode: '',
                    }
                    result['courses'].push(courseObj)
                  }

                  // Check if the next line contains additional details for the current course
                  if (i + 1 < courses.length) {
                    let nextCourseInfo = courses[i + 1]
                    let nextDetailsMatch = nextCourseInfo.match(
                      /(\d{4}-\d{2}-\d{2}) till (\d{4}-\d{2}-\d{2}),\s(\d+)\sveckor,\s([^,]+),\s([^,]+),\s(.+)$/
                    )
                    if (nextDetailsMatch) {
                      let startDate = nextDetailsMatch[1]
                      let endDate = nextDetailsMatch[2]
                      let weeks = nextDetailsMatch[3]
                      let school = nextDetailsMatch[4]
                      let courseType = nextDetailsMatch[5]
                      let code = nextDetailsMatch[6]
                      console.log(
                        'Next Start Date:',
                        startDate,
                        'Next End Date:',
                        endDate,
                        'Next Weeks:',
                        weeks,
                        'Next School:',
                        school,
                        'Next Course Type:',
                        courseType,
                        'Next Code:',
                        code
                      )

                      result['courses'][result['courses'].length - 1].startDate = startDate || ''
                      result['courses'][result['courses'].length - 1].endDate = endDate || ''
                      result['courses'][result['courses'].length - 1].weeks = weeks || ''
                      result['courses'][result['courses'].length - 1].school = school || ''
                      result['courses'][result['courses'].length - 1].courseType = courseType || ''
                      result['courses'][result['courses'].length - 1].courseCode = code || ''

                      // Skip the next course info as it is part of the current course details
                      i++
                    }
                  }
                }
              }
              break
            case 'Totalt antal sökta poäng':
              result['total'] = extractedInfo.replace('poäng', '').trim()
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

  //console.log('Parsed JSON:', JSON.stringify(result, null, 2))
  return result
}
