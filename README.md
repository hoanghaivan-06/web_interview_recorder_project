This project is a web-based online interview system developed for the Computer Networks (CNM) course.
It allows candidates to record video responses for each question individually and upload them to the server using the Per-Question Upload model.

The system applies key networking concepts such as HTTP communication, client–server architecture, multipart/form-data handling, retry and exponential backoff mechanisms, validation, session management, and secure camera access policies.

1. Architecture & Workflow

The system follows a decoupled Client–Server architecture consisting of:

Frontend (Client)

Built with HTML5, CSS, and Vanilla JavaScript

Uses the MediaRecorder API for in-browser video recording

Manages interview state through state.js:

sessionId

currentQuestion

answered status

Uploads each question separately (Per-Question Upload)

Implements a retry mechanism using exponential backoff:

Attempt 1: wait 2 seconds

Attempt 2: wait 4 seconds

Attempt 3: wait 8 seconds

Uses fetch() + FormData for video upload (.webm format)

Backend (Server)

Built with Node.js + Express

Uses Multer to process multipart/form-data video uploads

Stores uploaded videos inside a uniquely named user folder

Saves metadata (sessions and uploads) in recordings.json

Main server functions include:

Creating a session

Retrieving session information

Uploading a video per question

Ending the interview session

User Flow

Client requests Start Session → server generates and returns a sessionId

For each question:

Display question

Record video

Upload video to server

After all questions, client sends End Session

Server writes session completion metadata

2. Directory Structure & Naming Convention

Uploaded videos are stored on the server as follows:

uploads/
└── DD MM YYYY HH mm_UserName/
    ├── sess_xxx_q1_1699000000000.webm
    ├── sess_xxx_q2_1699000005000.webm
    ├── sess_xxx_q3_...
    ├── sess_xxx_q4_...
recordings.json


Folder naming convention:

DD MM YYYY HH mm UserName


Video naming convention:

sess_<sessionId>_q<question>_<timestamp>.webm

3. API Contract

Default server URL:

http://localhost:3000

3.1 Health Check

GET /health

3.2 Start Session

POST /api/session/start

Body:

{
  "candidate": "Chu Duc Duy"
}


Response:

{
  "ok": true,
  "sessionId": "sess_abcd1234"
}

3.3 Get Session Status

GET /api/session/:id

3.4 End Session

POST /api/session/end

Body:

{
  "sessionId": "sess_abcd1234"
}

3.5 Upload Video (Per-Question)

POST /api/upload

Form-Data Fields:

Field	Type	Description
file	File	Video .webm
sessionId	String	Session identifier
question	Number	Question index (1–4)

Example Response:

{
  "ok": true,
  "filename": "sess_abcd1234_q1_1699000000000.webm",
  "sessionId": "sess_abcd1234",
  "question": 1,
  "size": 123456,
  "uploadedAt": "2025-12-10T10:03:00.000Z"
}

4. HTTPS & Camera Requirements

Modern browsers enforce strict security policies:

Camera and microphone access require HTTPS unless running on localhost

If accessed through a LAN IP (e.g., http://192.168.1.x:3000), browsers may block camera usage

Solutions:

Use Ngrok or Cloudflare Tunnel for a temporary HTTPS domain

Or configure SSL using Nginx/Caddy on a hosted server

5. File Policy & Retry Mechanism

Video format:

.webm (recommended for MediaRecorder API)

Recommended file size:

Under 100MB per question

Retry mechanism:

Maximum 3 retries

Delay increases exponentially: 2s → 4s → 8s

If all retries fail, the UI displays a “Retry now” option

6. Installation & Run
Requirements

Node.js 18+

npm

Installation
git clone https://github.com/hoanghaivan-06/web_interview_recorder_project.git
cd web_interview_recorder_project
npm install

Start the Server
npm start


or

npm run dev

Usage

Open the browser at http://localhost:3000

Start a session

Record and upload answers per question

End the session

Videos are stored in the uploads/ folder

7. Future Improvements

Add authentication (JWT)

Integrate AI Speech-to-Text (Whisper/Gemini)

Improve UI/UX

Replace JSON storage with a real database (MongoDB/PostgreSQL)

Build an admin dashboard to review sessions

8. Notes

This project is developed for the Computer Networks course and highlights:

Client–Server architecture

HTTP upload

Multipart/form-data handling

Network reliability

Exponential backoff strategies

Session management
