<script setup>
  import { ref } from 'vue'
  import { extractPdfText, parseCourseStudentPdf } from '../../utils/pdfParser.js'

  const selectedFiles = ref([])
  const extractedDataList = ref([])

  const handleFileChange = (event) => {
    selectedFiles.value = Array.from(event.target.files)

    selectedFiles.value.forEach((file) => {
      console.log('Filename:', file.name)
    })
  }

  const handleExtractText = async () => {
    if (!selectedFiles.value.length) {
      alert('pdfView: Please select at least one PDF file!')
      return
    }

    try {
      extractedDataList.value = await Promise.all(
        selectedFiles.value.map(async (file) => {
          const extractedText = await extractPdfText(file)
          console.log('pdfView: Extracted text length:', extractedText.length)
          console.log('pdfView: Extracted text:', extractedText)

          // Parse the extracted text
          const parsedData = parseCourseStudentPdf(extractedText)
          console.log('pdfView: Parsed data:', parsedData)

          return parsedData
        })
      )

      console.log('pdfView: Extracted data:', extractedDataList.value)
    } catch (error) {
      console.error('pdfView: Error extracting PDF text:', error)
      alert('pdfView: Failed to extract text from PDF.')
    }
  }

  const copyToClipboard = (text, event) => {
    navigator.clipboard.writeText(text).then(() => {
      event.target.classList.add('copied')
      setTimeout(() => event.target.classList.remove('copied'), 200)
    })
  }
</script>

<template>
  <div>
    <h1>Upload and Extract PDF Data</h1>

    <!-- File Upload -->
    <input type="file" accept="application/pdf" multiple @change="handleFileChange" />
    <button @click="handleExtractText">Extract Text</button>

    <!-- Display extracted data -->
    <div class="content-wrapper" v-if="extractedDataList.length">
      <div v-for="(data, fileIndex) in extractedDataList" :key="fileIndex" class="file-container">
        <h3>PDF {{ fileIndex + 1 }}: {{ data.filename }}</h3>
        <div class="row">
          <!-- Contact Information -->
          <div class="box">
            <h3>Uppgifter</h3>
            <label>Personnummer:</label>
            <input
              type="text"
              :value="data.personnummer"
              readonly
              @click="copyToClipboard(data.personnummer, $event)"
            />

            <label>Namn:</label>
            <input
              type="text"
              :value="data.name"
              readonly
              @click="copyToClipboard(data.name, $event)"
            />

            <label>Adress:</label>
            <input
              type="text"
              :value="data.address"
              readonly
              @click="copyToClipboard(data.address, $event)"
            />

            <label>E-postadress:</label>
            <input
              type="email"
              :value="data.email"
              readonly
              @click="copyToClipboard(data.email, $event)"
            />

            <label>Telefonnummer:</label>
            <input
              type="tel"
              :value="data.phone"
              readonly
              @click="copyToClipboard(data.phone, $event)"
            />

            <label>Föredragna kontaktsätt:</label>
            <div v-for="(contact, index) in data.contacts" :key="index">
              <input
                type="text"
                :value="contact"
                readonly
                @click="copyToClipboard(contact, $event)"
              />
            </div>
            <br />
            <label>Totala poäng:</label>
            <input
              type="text"
              :value="data.total"
              readonly
              @click="copyToClipboard(data.total, $event)"
            />
          </div>

          <!-- Course Information -->
          <div v-for="(course, index) in data.courses" :key="index" class="box">
            <h3>Kurs {{ index + 1 }}</h3>
            <label>Kursnamn:</label>
            <input
              type="text"
              :value="course.courseName"
              readonly
              @click="copyToClipboard(course.courseName, $event)"
            />

            <label>Poäng:</label>
            <input
              type="text"
              :value="course.coursePoints"
              readonly
              @click="copyToClipboard(course.coursePoints, $event)"
            />

            <label>Startdatum:</label>
            <input
              type="text"
              :value="course.startDate"
              readonly
              @click="copyToClipboard(course.startDate, $event)"
            />

            <label>Slutdatum:</label>
            <input
              type="text"
              :value="course.endDate"
              readonly
              @click="copyToClipboard(course.endDate, $event)"
            />

            <label>Antal veckor:</label>
            <input
              type="text"
              :value="course.weeks"
              readonly
              @click="copyToClipboard(course.weeks, $event)"
            />

            <label>Skola:</label>
            <input
              type="text"
              :value="course.school"
              readonly
              @click="copyToClipboard(course.school, $event)"
            />

            <label>Studieform:</label>
            <input
              type="text"
              :value="course.courseType"
              readonly
              @click="copyToClipboard(course.courseType, $event)"
            />

            <label>Kod:</label>
            <input
              type="text"
              :value="course.courseCode"
              readonly
              @click="copyToClipboard(course.courseCode, $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .content-wrapper {
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
  }

  .file-container {
    margin-bottom: 20px;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #ffffff;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }

  .box {
    flex: 1;
    min-width: 300px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f5f5f5;
  }

  .box input {
    cursor: pointer;
  }

  label {
    display: block;
    margin-top: 10px;
    font-weight: bold;
  }

  input {
    width: 100%;
    padding: 8px;
    margin-top: 5px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 14px;
  }

  button {
    margin-top: 10px;
    padding: 10px 15px;
    border: none;
    border-radius: 5px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
  }

  button:hover {
    background-color: #0056b3;
  }

  .copied {
    background-color: lightgreen;
  }
</style>
