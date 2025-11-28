# 📘 API Contract – Web Interview Recorder
Tài liệu mô tả giao tiếp giữa **Frontend ↔ Backend**.  
Tất cả thành viên phải tuân theo đúng định dạng request/response này.

---

# 1) POST /api/session/start
Tạo một phiên phỏng vấn (session) mới.

## Request
**URL:** `/api/session/start`  
**Method:** `POST`  
**Body (JSON):**
```json
{
  "candidate": "optional-string"
}
```

## Response (200)
```json
{
  "ok": true,
  "sessionId": "sess_abc123",
  "startedAt": "2025-02-02T13:00:00.000Z"
}
```

## Response lỗi
```json
{
  "ok": false,
  "message": "Cannot create session"
}
```

---

# 2) POST /api/upload
Upload video của từng câu hỏi.

## Request
**URL:** `/api/upload`  
**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### FormData FE phải gửi:
| Key        | Type    | Required | Mô tả |
|------------|---------|----------|-------|
| file       | Blob    | YES      | video/webm |
| sessionId  | string  | YES      | ID của phiên phỏng vấn |
| question   | number  | YES      | số câu (1–5) |

### Ví dụ FormData:
```
form.append("file", videoBlob, "q2.webm");
form.append("sessionId", "sess_abc123");
form.append("question", 2);
```

---

## Response (200 – thành công)
```json
{
  "ok": true,
  "filename": "sess_abc123_q2_1738512231.webm",
  "sessionId": "sess_abc123",
  "question": 2,
  "size": 1839212,
  "uploadedAt": "2025-02-02T13:15:00.000Z"
}
```

## Response (400/500 – lỗi)
```json
{
  "ok": false,
  "message": "File quá lớn"
}
```

---

# 3) POST /api/metadata  *(optional)*
Lưu thêm thông tin về video (duration, size…).

## Request
```
POST /api/metadata
Content-Type: application/json
```

### Body:
```json
{
  "sessionId": "sess_abc123",
  "question": 2,
  "duration": 12.5,
  "size": 1839212,
  "extra": {
    "browser": "Chrome",
    "userAgent": "..."
  }
}
```

## Response:
```json
{ "ok": true }
```

---

# 4) POST /api/session/end  *(optional)*
Kết thúc phiên phỏng vấn.

## Request:
```json
{
  "sessionId": "sess_abc123"
}
```

## Response:
```json
{ "ok": true }
```

---

# 🧪 Quy ước chung cho mọi API

## 1) Thành công:
```json
{ "ok": true, ... }
```

## 2) Thất bại:
```json
{ "ok": false, "message": "..." }
```

## 3) Status code chuẩn:
- **200** → thành công  
- **400** → dữ liệu sai  
- **413** → file quá lớn  
- **500** → lỗi server  

---

# 🎯 FE ↔ BE Integration Summary

### Frontend phải gửi:
- Blob video
- sessionId
- question

### Backend phải trả:
- ok: true/false
- filename
- sessionId
- question
- message (nếu lỗi)

---

# 🎉 Lưu ý:
API Contract này là **hợp đồng giao tiếp** giữa Frontend và Backend.  
KHÔNG ai được tự ý thay đổi format khi chưa thống nhất toàn team.

