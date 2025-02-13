<script setup>
  import { ref } from 'vue'
  import { extractPdfText } from '../utils/pdfParser.js'

  const selectedFile = ref(null)
  const extractedText = ref('')
  const uploadStatus = ref('')

  const handleFileChange = (event) => {
    if (event.target.files.length > 0) {
      selectedFile.value = event.target.files[0]
    }
  }

  const handleExtractText = async () => {
    if (!selectedFile.value) {
      alert('Please select a PDF file first!')
      return
    }

    try {
      extractedText.value = await extractPdfText(selectedFile.value)
    } catch (error) {
      console.error('Error extracting PDF text:', error)
      alert('Failed to extract text from PDF.')
    }
  }

  const handleUploadToServer = async () => {
    if (!extractedText.value) {
      alert('No extracted text to upload!')
      return
    }

    try {
      const response = await fetch('http://localhost:5001/util/pdfupload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedFile.value.name,
          extractedData: extractedText.value,
        }),
      })

      if (response.ok) {
        uploadStatus.value = 'Upload successful!'
      } else {
        uploadStatus.value = 'Upload failed.'
      }
    } catch (error) {
      console.error('Error uploading extracted text:', error)
      uploadStatus.value = 'Upload failed.'
    }
  }
</script>

<template>
  <div>
    <h2>Upload and Extract PDF</h2>
    <input type="file" accept="application/pdf" @change="handleFileChange" />
    <button @click="handleExtractText">Extract Text</button>
    <button @click="handleUploadToServer" :disabled="!extractedText">Upload to Server</button>

    <div v-if="extractedText">
      <h3>Extracted Text:</h3>
      <textarea rows="10" cols="50" v-model="extractedText" readonly></textarea>
    </div>

    <p v-if="uploadStatus">{{ uploadStatus }}</p>
  </div>
</template>
