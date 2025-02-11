<template>
  <div>
    <!-- File Input & Dropzone Combined -->
    <div class="mt-3 file-dropzone" @dragover.prevent @dragenter.prevent @drop="handleDrop">
      <input type="file" id="fileInput" @change="handleFileUpload" accept="application/pdf" multiple hidden />
      <label for="fileInput">Klicka eller Drag 'n' Droppa PDF här</label>
    </div>

    <div v-if="loading">Loading...</div>

    <div class="content-wrapper" v-else-if="extractedDataList.length">
      <div v-for="(data, fileIndex) in extractedDataList" :key="fileIndex" class="file-container">
        <h3>PDF {{ fileIndex + 1 }}:</h3>
        <div class="row">
          <!-- Kontaktuppgifter box -->
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
            <input type="text" :value="data.namn" readonly @click="copyToClipboard(data.namn, $event)" />

            <label>Adress:</label>
            <input type="text" :value="data.adress" readonly @click="copyToClipboard(data.adress, $event)" />

            <label>E-postadress:</label>
            <input type="email" :value="data.email" readonly @click="copyToClipboard(data.email, $event)" />

            <label>Telefonnummer:</label>
            <input type="tel" :value="data.telefon" readonly @click="copyToClipboard(data.telefon, $event)" />

            <label>Föredragna kontaktsätt:</label>
            <div v-for="(kontakt, index) in data.föredragna_kontaktsätt" :key="index">
              <input type="text" :value="kontakt" readonly @click="copyToClipboard(kontakt, $event)" />
            </div>
            <br />
            <br />
            <label>Totala poäng:</label>
            <input
              type="text"
              :value="data.totalt_poäng"
              readonly
              @click="copyToClipboard(data.totalt_poäng, $event)"
            />
          </div>

          <!-- Kurs boxes -->
          <div v-for="(kurs, index) in data.kurser" :key="index" class="box">
            <h3>Kurs {{ index + 1 }}</h3>
            <label>Kursnamn:</label>
            <input type="text" :value="kurs.namn" readonly @click="copyToClipboard(kurs.namn, $event)" />

            <label>Poäng:</label>
            <input type="text" :value="kurs.poäng" readonly @click="copyToClipboard(kurs.poäng, $event)" />

            <label>Startdatum:</label>
            <input type="text" :value="kurs.start" readonly @click="copyToClipboard(kurs.start, $event)" />

            <label>Slutdatum:</label>
            <input type="text" :value="kurs.slut" readonly @click="copyToClipboard(kurs.slut, $event)" />

            <label>Antal veckor:</label>
            <input type="text" :value="kurs.veckor" readonly @click="copyToClipboard(kurs.veckor, $event)" />

            <label>Skola:</label>
            <input type="text" :value="kurs.skola" readonly @click="copyToClipboard(kurs.skola, $event)" />

            <label>Studieform:</label>
            <input type="text" :value="kurs.studieform" readonly @click="copyToClipboard(kurs.studieform, $event)" />

            <label>Kod:</label>
            <input type="text" :value="kurs.kod" readonly @click="copyToClipboard(kurs.kod, $event)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from "vue";

export default {
  setup() {
    const extractedDataList = ref([]);
    const loading = ref(false);
    const selectedFiles = ref([]);

    const selectedFile = computed(() => selectedFiles.value[0] || null);

    const handleFileUpload = event => {
      const files = Array.from(event.target.files);
      selectedFiles.value = files;
      uploadPdfs(files);
    };

    const handleDrop = event => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files);
      const pdfFiles = files.filter(file => file.type === "application/pdf");

      if (pdfFiles.length > 0) {
        selectedFiles.value.push(...pdfFiles);
        uploadPdfs(pdfFiles);
      }
    };

    const uploadPdfs = async files => {
      loading.value = true;
      extractedDataList.value = [];

      await Promise.all(
        files.map(async file => {
          const formData = new FormData();
          formData.append("pdf", file);

          try {
            const response = await fetch(`${process.env.VUE_APP_API_URL}/api/pdfupload`, {
              method: "POST",
              body: formData,
            });

            if (!response.ok) throw new Error("Upload failed");

            const data = await response.json();
            extractedDataList.value.push(data);
          } catch (error) {
            console.error("❌ Error uploading PDF:", error);
          }
        })
      );

      loading.value = false;
    };

    const copyToClipboard = async (text, event) => {
      try {
        await navigator.clipboard.writeText(text);
        const inputElement = event.target;
        inputElement.classList.add("copied");
        inputElement.setAttribute("data-tooltip", "Copied!");

        setTimeout(() => {
          inputElement.classList.remove("copied");
          inputElement.removeAttribute("data-tooltip");
        }, 200);
      } catch (error) {
        console.error("❌ Error copying text:", error);
      }
    };

    return {
      extractedDataList,
      selectedFiles,
      selectedFile,
      loading,
      handleFileUpload,
      handleDrop,
      copyToClipboard,
    };
  },
};
</script>

<style scoped>
.content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 100%;
  margin: 5px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 20px;
  width: 100%;
  max-width: 1200px;
}

.box {
  background: #f9f9f9;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1);

  /* Prevent shrinking */
  flex: 1 1 calc(33.33% - 20px);
  /* Each box takes 1/3 of the row */
  min-width: 150px;
  /* Ensures it doesn't get too small */
  max-width: 300px;
  /* Optional */
}

.box input {
  font-size: 14px;
  padding: 2px;
  margin: 0px;
  margin-bottom: 3px;
  border: 1px solid #ccc;
  border-radius: 0px;
  width: 100%;
  cursor: default;
  position: relative;
  background: #fff;
}

/* Tooltip effect when copied */
.box input.copied {
  background-color: #d4edda;
  border-color: #c3e6cb;
}

.box input.copied::after {
  content: attr(data-tooltip);
  position: absolute;
  top: -25px;
  left: 50%;
  transform: translateX(-50%);
  background: #28a745;
  color: white;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
}

label {
  text-align: left;
  width: 100%;
  font-size: 14px;
  font-weight: bold;
}

/* File dropzone */
.file-dropzone {
  width: max-content;
  padding: 3px;
  border: 2px dashed #3547b1;
  text-align: center;
  cursor: pointer;
  margin-bottom: 10px;
}

.file-dropzone label {
  display: block;
  /* Makes it cover the whole area */
  width: 100%;
  text-align: center;
  padding: 10px;
  cursor: pointer;
  /* Ensures the entire label is clickable */
}
</style>
