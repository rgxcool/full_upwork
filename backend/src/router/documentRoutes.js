import express from 'express';
import multer from 'multer';
import Document from '../models/Document.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${unique}-${file.originalname}`);
  }
});

const upload = multer({ storage });

router.post('/documents/upload', upload.single('file'), async (req, res) => {
  const { studentId } = req.body;
  const doc = await Document.create({
    student: studentId,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
  res.status(201).json(doc);
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
