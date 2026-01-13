import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Document from '../models/Document.js';
import { authenticateUser } from '../controllers/authController.js';

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../public/uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadsDir);
  } else {
    console.log('✅ Uploads directory exists:', uploadsDir);
  }
} catch (err) {
  console.error('❌ Error creating uploads directory:', err);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Ensure directory exists before saving
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (err) {
      console.error('❌ Error in multer destination:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `${unique}-${file.originalname}`;
      console.log('Generated filename:', filename);
      cb(null, filename);
    } catch (err) {
      console.error('❌ Error in multer filename:', err);
      cb(err);
    }
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Filen är för stor. Max storlek är 10MB.' });
    }
    return res.status(400).json({ message: 'Filuppladdningsfel', error: err.message });
  }
  if (err) {
    return res.status(500).json({ message: 'Fel vid filuppladdning', error: err.message });
  }
  next();
};

router.post('/documents/upload', authenticateUser, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is missing in the request' });
    }
    
    console.log('File details:', req.file);
    console.log('Request body:', req.body);
    console.log('User from token:', req.user);

    const { studentId, teacherId, type, enrollmentId } = req.body;
    const user = req.user;
    
    if (!user || !user.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';

    // Determine if this is for a student or teacher
    if (studentId) {
      // Student document upload
      // Validate that studentId is provided
      if (!studentId || studentId.trim() === '') {
        return res.status(400).json({ message: 'studentId is required' });
      }
      
      // Permission check: students can upload for themselves, admins/systemadmins can upload for any student
      const userIdStr = String(user.userId);
      const studentIdStr = String(studentId);
      
      if (!isAdmin && userIdStr !== studentIdStr) {
        return res.status(403).json({ message: 'Du har inte behörighet att ladda upp dokument för denna elev' });
      }
      
      const doc = await Document.create({
        student: studentId,
        uploadedBy: user.userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        type: type || 'GENERAL',
        enrollmentId: enrollmentId || null,
      });
      return res.status(201).json(doc);
    } else if (teacherId) {
      // Teacher document upload
      // Check permissions: teacher can upload for themselves, admins can upload for any teacher
      const userIdStr = String(user.userId);
      const teacherIdStr = String(teacherId);
      
      console.log('Permission check - userId:', userIdStr, 'teacherId:', teacherIdStr, 'isAdmin:', isAdmin);
      
      if (!isAdmin && userIdStr !== teacherIdStr) {
        return res.status(403).json({ message: 'Du har inte behörighet att ladda upp dokument för denna lärare' });
      }

      // Validate that teacherId is provided
      if (!teacherId || teacherId.trim() === '') {
        return res.status(400).json({ message: 'teacherId is required' });
      }

      console.log('Creating teacher document with:', {
        teacher: teacherId,
        uploadedBy: user.userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        type: type || 'TEACHER_DOCUMENT'
      });

      const doc = await Document.create({
        teacher: teacherId,
        uploadedBy: user.userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        type: type || 'TEACHER_DOCUMENT',
        enrollmentId: null,
      });
      
      console.log('Document created successfully:', doc._id);
      return res.status(201).json(doc);
    } else {
      return res.status(400).json({ message: 'Either studentId or teacherId must be provided' });
    }
    
    // Additional validation: ensure at least one of student or teacher is set
    // (This should never happen due to the checks above, but adding as a safety measure)
    if (!studentId && !teacherId) {
      return res.status(400).json({ message: 'Either studentId or teacherId must be provided' });
    }
  } catch (error) {
    console.error('Error during upload:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError' || error instanceof mongoose.Error.ValidationError || error.message?.includes('must be specified')) {
      const errorMessages = error.errors ? Object.values(error.errors).map(e => e.message || e).join(', ') : error.message;
      return res.status(400).json({ 
        message: 'Valideringsfel', 
        error: errorMessages,
        details: error.errors || { message: error.message }
      });
    }
    
    // Handle other mongoose errors
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Ogiltigt ID-format', 
        error: error.message
      });
    }
    
    res.status(500).json({ 
      message: 'Kunde inte ladda upp dokumentet', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/documents/:id', async (req, res) => {
  const { type, enrollmentId, entityType } = req.query;
  const id = req.params.id;

  let filter = {};

  // Determine if this is for a student or teacher
  if (entityType === 'teacher' || entityType === 'Lärare') {
    filter.teacher = id;
  } else {
    // Default to student for backward compatibility
    filter.student = id;
  }

  if (type) {
    filter.type = type;
  }

  if (enrollmentId) {
    filter.enrollmentId = enrollmentId;
  }

  const docs = await Document.find(filter).sort({ createdAt: -1 });
  res.json(docs);
});

router.delete('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Dokument hittades inte' });
    }

    const user = req.user;
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';

    // Check permissions: user can delete their own uploads, admins can delete any
    if (!isAdmin && doc.uploadedBy?.toString() !== user.userId) {
      return res.status(403).json({ message: 'Du har inte behörighet att radera detta dokument' });
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Raderad' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Kunde inte radera dokumentet', error: error.message });
  }
});

export default router;
