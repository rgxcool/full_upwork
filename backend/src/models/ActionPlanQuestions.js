// models/FormQuestion.js
import mongoose from 'mongoose'

const formQuestionSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true, 
    enum: ['ACTION_PLAN'] // kan utökas senare
  },
  questions: [{
    key: String,
    label: String,
    type: { 
      type: String, 
      enum: ['text', 'date', 'textarea', 'checkbox', 'select', 'radio']
    },
    options: [String], // för select och checkbox
    required: Boolean
  }],
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
})

export default mongoose.model('FormQuestion', formQuestionSchema)