import express from 'express';
import multer from 'multer';
import Document from '../models/Document.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `${unique}-${file.originalname}`;
    console.log('Generated filename:', filename); // Log the filename
    cb(null, filename); // Use filename in cb
  }
});

const upload = multer({ storage });

router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('File is missing in the request');
    }
    
    console.log('File details:', req.file);

    const { studentId, type } = req.body;
    const doc = await Document.create({
      student: studentId,
      filename: req.file.filename, // Ensure this is populated
      originalName: req.file.originalname,
      type: type || 'GENERAL'
    });
    res.status(201).json(doc);
  } catch (error) {
    console.error('Error during upload:', error.message);
    res.status(500).json({ message: 'Kunde inte ladda upp dokumentet', error });
  }
});

router.get('/documents/:studentId', async (req, res) => {
  const docs = await Document.find({ student: req.params.studentId });
  res.json(docs);
});

router.delete('/documents/:id', async (req, res) => {
  await Document.findByIdAndDelete(req.params.id);
  res.json({ message: 'Raderad' });
});

export default router;
