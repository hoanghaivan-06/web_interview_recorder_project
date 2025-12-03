// backend/src/routes/upload.js

const express = require('express');
const router = express.Router();
// Giả định bạn đã thiết lập multer để xử lý file và lưu tạm thời vào req.file
const { upload } = require('../services/multer'); 
const { uploadController } = require('../controllers/uploadController'); 

// 🚨 IMPORT MIDDLEWARE VỪA VIẾT
const { validateUpload } = require('../middleware/validate'); 

// Định nghĩa Route POST /api/upload
// Thứ tự: Multer (xử lý file) -> Validate (kiểm tra điều kiện) -> Controller (xử lý logic)
router.post('/upload', 
    upload.single('recording'), // Giả định tên trường là 'recording'
    validateUpload,             // <-- MIDDLEWARE KIỂM TRA CỦA BẠN
    uploadController.handleUpload
);

module.exports = router;