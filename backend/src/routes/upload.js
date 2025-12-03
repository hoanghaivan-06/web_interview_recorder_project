const express = require('express');
const router = express.Router();
const upload = require('../services/storageService');
const uploadController = require('../controllers/uploadController');

router.post('/', upload.single('file'), uploadController.handleUpload);

module.exports = router;
