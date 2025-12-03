// backend/src/middleware/validate.js

// Giả định store được import từ nơi nó quản lý trạng thái phiên
// Cần chỉnh lại đường dẫn cho đúng cấu trúc dự án của bạn
const store = require('../store'); 

const validateUpload = (req, res, next) => {
    // 1. Lấy dữ liệu cần thiết
    const file = req.file; 
    // Giả định sessionId có thể nằm trong body hoặc header
    const sessionId = req.body.sessionId || req.headers['x-session-id']; 
    const question = parseInt(req.body.question);
    const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE); // Đọc từ file .env
    const acceptedMimes = ['video/webm', 'video/mp4'];

    // --- KIỂM TRA 1: SessionID và File tồn tại ---
    if (!sessionId) {
        return res.status(400).json({ message: 'Lỗi 400: Không tìm thấy Session ID.' });
    }
    if (!file) {
        return res.status(400).json({ message: 'Lỗi 400: Không tìm thấy file upload.' });
    }
    if (!store.getSession(sessionId)) { 
        return res.status(400).json({ message: 'Lỗi 400: Session không hợp lệ hoặc đã kết thúc.' });
    }
    
    // --- KIỂM TRA 2: Question hợp lệ (1...N) ---
    if (isNaN(question) || question < 1) {
        return res.status(400).json({ message: 'Lỗi 400: Số câu hỏi (question) không hợp lệ.' });
    }

    // --- KIỂM TRA 3: MIME Type ---
    if (!acceptedMimes.includes(file.mimetype)) {
        return res.status(400).json({ message: `Lỗi 400: Định dạng file không được hỗ trợ. Chỉ chấp nhận ${acceptedMimes.join(', ')}.` });
    }

    // --- KIỂM TRA 4: Kích thước File ---
    if (file.size > MAX_SIZE) {
        const maxSizeMB = MAX_SIZE / 1000000;
        return res.status(413).json({ // Trả về 413 Payload Too Large
            message: `Lỗi 413: Kích thước file (${(file.size / 1000000).toFixed(2)}MB) vượt quá giới hạn cho phép (${maxSizeMB}MB).` 
        });
    }

    // --- KIỂM TRA 5: Extract Duration (Nếu cần) ---
    // (Bỏ qua bước này nếu bạn chưa cài đặt thư viện xử lý media như ffmpeg)

    // Nếu mọi thứ hợp lệ, chuyển sang Controller
    next(); 
};

module.exports = { validateUpload };