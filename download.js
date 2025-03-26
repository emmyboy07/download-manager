const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Enable CORS to allow browser requests
const corsOptions = {
    origin: "*",
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ Define local storage folder for downloads
const DOWNLOAD_FOLDER = path.join(require("os").homedir(), "Downloads", "Sonix Movies");

// ✅ Ensure download folder exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// ✅ Track active downloads
const downloads = {};

// ✅ Route to start or resume a download
app.post("/start_download", async (req, res) => {
    const { movieUrl, fileName } = req.body;

    if (!movieUrl || !fileName) {
        return res.status(400).json({ error: "Missing movie URL or file name" });
    }

    const filePath = path.join(DOWNLOAD_FOLDER, fileName);

    // ✅ Check if file already exists (Avoid duplicate downloads)
    if (fs.existsSync(filePath)) {
        return res.status(200).json({ message: "File already downloaded", filePath });
    }

    downloads[fileName] = {
        progress: 0,
        status: "Downloading",
        startTime: Date.now(),
        speed: 0,
        eta: "Calculating...",
    };

    try {
        const response = await axios({
            method: "GET",
            url: movieUrl,
            responseType: "stream",
        });

        const totalSize = parseInt(response.headers["content-length"], 10);
        let downloadedSize = 0;

        const fileStream = fs.createWriteStream(filePath);

        response.data.on("data", (chunk) => {
            downloadedSize += chunk.length;
            const elapsedTime = (Date.now() - downloads[fileName].startTime) / 1000;
            const speed = downloadedSize / elapsedTime;
            const remainingBytes = totalSize - downloadedSize;
            const eta = remainingBytes / speed;

            downloads[fileName].progress = ((downloadedSize / totalSize) * 100).toFixed(2);
            downloads[fileName].speed = (speed / 1024).toFixed(2) + " KB/s";
            downloads[fileName].eta = eta > 0 ? `${Math.round(eta)} sec` : "Almost done";
        });

        response.data.pipe(fileStream);

        fileStream.on("finish", () => {
            downloads[fileName].status = "Completed";
            console.log(`✅ Download completed: ${filePath}`);
        });

        fileStream.on("error", (err) => {
            downloads[fileName].status = "Failed";
            res.status(500).json({ error: "Download failed", details: err.message });
        });

        res.json({ message: "Download started", fileName, filePath });
    } catch (error) {
        downloads[fileName].status = "Failed";
        res.status(500).json({ error: "Download failed", details: error.message });
    }
});

// ✅ Route to check download progress
app.get("/download_progress", (req, res) => {
    const { fileName } = req.query;

    if (!fileName || !downloads[fileName]) {
        return res.status(404).json({ error: "Download not found" });
    }

    res.json(downloads[fileName]);
});

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://127.0.0.1:${PORT}`);
});
