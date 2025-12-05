// backend/src/routes/upload.js
const express = require('express');
const router = express.Router();

// Multer instance (file field is 'file')
const { upload } = require('../services/multer'); 
const { uploadHandler } = require('../controllers/uploadController'); 

// Middleware validate
const { validateUpload } = require('../middleware/validate');

router.post(
  '/',                      
  upload.single('file'),     
  validateUpload,
  uploadHandler
);

module.exports = router;
