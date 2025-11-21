const videoQueue = [
    "intro_vlog.mp4",
    "gameplay_part1.mkv",
    "tutorial_react.mov",
    "funny_cats.mp4",
    "outro_final.avi"
];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

\async function uploadVideo(videoName) {
    console.log(`\n[START] Preparing to upload: ${videoName}`);
  
    let progress = 0;
    const speed = Math.floor(Math.random() * 20) + 10;

    while (progress < 100) {
        await wait(200);
        progress += speed;
        
        if (progress > 100) progress = 100;

        const barLength = 20;
        const filledLength = Math.round((progress / 100) * barLength);
        const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);
        
        process.stdout.write(`\rUploading: [${bar}] ${progress}%`);
    }

    console.log(`\n[SUCCESS] ${videoName} uploaded successfully! ✅`);
}

async function startUploadQueue() {
    console.log("--- 🚀 BATCH UPLOAD STARTED ---");

    for (const video of videoQueue) {
        await uploadVideo(video);
    }

    console.log("\n--- ✨ ALL UPLOADS FINISHED ---");
}

startUploadQueue();
