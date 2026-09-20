<template>
  <div class="ct-comment-list">
    <div v-for="comment in comments" :key="comment.id" class="ct-comment">
      <div class="ct-bubble">
        <span class="ct-meta">{{ formatDateTime(comment.at) }}</span>
        <p class="ct-text">{{ comment.text }}</p>
        <button class="ct-reply-btn" @click="openReply(comment)">Svara</button>
      </div>

      <div v-if="replyTarget === comment.id" class="ct-reply-form">
        <input
          ref="replyInput"
          v-model="replyText"
          class="ct-reply-input"
          placeholder="Skriv ett svar..."
          @keyup.enter="submitReply(comment)"
          @keyup.esc="clearReply"
        />
        <button
          class="save-btn save-btn-sm"
          :disabled="!replyText.trim() || saving"
          @click="submitReply(comment)"
        >
          Skicka
        </button>
        <button class="ct-cancel-btn" @click="clearReply">Avbryt</button>
      </div>

      <div v-if="comment.children && comment.children.length" class="ct-children">
        <SubmissionsCommentThread
          :comments="comment.children"
          :saving="saving"
          @reply="forwardReply"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

defineOptions({ name: 'SubmissionsCommentThread' })

const props = defineProps({
  comments: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})
const emit = defineEmits(['reply'])

const replyTarget = ref(null)
const replyText = ref('')
const replyInput = ref(null)

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

const openReply = async (comment) => {
  replyTarget.value = comment.id
  replyText.value = ''
  await nextTick()
  replyInput.value?.focus?.()
}

const clearReply = () => {
  replyTarget.value = null
  replyText.value = ''
}

const submitReply = (comment) => {
  const text = replyText.value.trim()
  if (!text || props.saving) return
  emit('reply', { parentCommentId: comment.id, text })
  clearReply()
}

const forwardReply = (payload) => emit('reply', payload)
</script>

<style scoped>
.ct-comment-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ct-children {
  margin-left: 1.1rem;
  margin-top: 0.4rem;
  border-left: 2px solid #eef2f7;
  padding-left: 0.5rem;
}

.ct-comment {
  padding: 0.35rem 0;
}

.ct-bubble {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.35rem;
  padding: 0.45rem 0.6rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ct-meta {
  font-size: 0.72rem;
  color: #9ca3af;
  white-space: nowrap;
}

.ct-text {
  margin: 0;
  font-size: 0.85rem;
  color: #374151;
  word-break: break-word;
  white-space: pre-wrap;
}

.ct-reply-btn {
  margin-left: auto;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #4338ca;
  cursor: pointer;
}

.ct-reply-form {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.ct-reply-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  font-size: 0.82rem;
  font-family: inherit;
}

.ct-cancel-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  color: #6b7280;
  cursor: pointer;
}

.save-btn-sm {
  padding: 0.32rem 0.7rem;
  font-size: 0.78rem;
}
</style>