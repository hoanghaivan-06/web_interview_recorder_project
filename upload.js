const danhSachVideo = [
    "intro_gioi_thieu.mp3",
    "cau_hoi_2.mp3",
    "cau_hoi_3.mp3",
    "cau_hoi_4.mp3",
    "cau_hoi_5.mp3"
];

const choDoi = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function uploadVideo(tenVideo) {
    console.log(`\n[INFO] Đang chuẩn bị tải lên: ${tenVideo}...`);
    
    let tienDo = 0;
    const tocDo = Math.floor(Math.random() * 15) + 5; 

    while (tienDo < 100) {
        await choDoi(150);
        tienDo += tocDo;
        
        if (tienDo > 100) tienDo = 100;

        const doDaiThanh = 20;
        const doDaiDaChay = Math.round((tienDo / 100) * doDaiThanh);
        const thanhBar = '█'.repeat(doDaiDaChay) + '-'.repeat(doDaiThanh - doDaiDaChay);
    
        process.stdout.write(`\r ☁️  Đang tải: [${thanhBar}] ${tienDo}%`);
    }

    console.log(`\n[OK] ✅ Đã tải lên thành công: ${tenVideo}`);
}

async function chayHeThongUpload() {
    console.log("--- 🚀 BẮT ĐẦU TIẾN TRÌNH UPLOAD HÀNG LOẠT ---");

    for (const video of danhSachVideo) {
        await uploadVideo(video);
        await choDoi(500);
    }

    console.log("\n--- ✨ TẤT CẢ VIDEO ĐÃ ĐƯỢC XỬ LÝ XONG ---");
}

chayHeThongUpload();
