<script setup>
  import { ref } from 'vue'
  import { extractPdfText } from '../../utils/pdfParser.js'

  const selectedFile = ref(null)
  const extractedData = ref([])
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
      const text = await extractPdfText(selectedFile.value)
      extractedData.value = text.split('\n').map((snippet, index) => ({
        id: index + 1,
        content: snippet,
      }))
    } catch (error) {
      console.error('Error extracting PDF text:', error)
      alert('Failed to extract text from PDF.')
    }
  }

  const updateText = (id, newText) => {
    const textItem = extractedData.value.find((item) => item.id === id)
    if (textItem) {
      textItem.content = newText
    }
  }

  const handleSubmit = async () => {
    if (!extractedData.value.length) {
      alert('No text extracted!')
      return
    }

    try {
      const response = await fetch('http://localhost:5001/util/pdfupload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.value.name,
          extractedData: extractedData.value.map((item) => item.content),
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
    <h1>Upload and Edit PDF Text</h1>

    <!-- File Upload -->
    <input type="file" accept="application/pdf" @change="handleFileChange" />
    <button @click="handleExtractText">Extract Text</button>

    <!-- Display editable fields -->
    <div v-if="extractedData.length > 0" class="parsed-text-container">
      <h2>Edit Extracted Text</h2>
      <form @submit.prevent="handleSubmit">
        <div v-for="textItem in extractedData" :key="textItem.id" class="text-box">
          <label :for="'text-' + textItem.id">Snippet {{ textItem.id }}:</label>
          <textarea
            :id="'text-' + textItem.id"
            v-model="textItem.content"
            @input="updateText(textItem.id, $event.target.value)"
          ></textarea>
        </div>
        <button type="submit">Submit Edited Text</button>
      </form>
    </div>

    <p v-if="uploadStatus">{{ uploadStatus }}</p>
  </div>
</template>

<style scoped>
  .parsed-text-container {
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
  }

  .text-box {
    margin-bottom: 15px;
  }

  textarea {
    width: 100%;
    height: 80px;
    padding: 8px;
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
</style>
