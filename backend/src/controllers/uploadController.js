const store = require('../models/store');

exports.handleUpload = (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const { sessionId, question } = req.body;

        console.log(`File uploaded: ${req.file.filename}`);

        
        const metadata = {
            filename: req.file.filename,
            path: req.file.path,
            sessionId: sessionId,
            question: question,
            createdAt: new Date()
        };

        store.saveRecording(metadata);

        
        return res.json({
            success: true,
            message: "File uploaded successfully",
            filePath: req.file.path
        });

    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
