const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const DOWNLOAD_FOLDER = path.join(require("os").homedir(), "Downloads", "Sonix Movies");

// Ensure the download folder exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

// Store active downloads
const downloads = {};

// Route to start or resume a download
app.post("/start_download", async (req, res) => {
    const { movieUrl, fileName } = req.body;

    if (!movieUrl || !fileName) {
        return res.status(400).json({ error: "Missing movie URL or file name" });
    }

    const filePath = path.join(DOWNLOAD_FOLDER, fileName);
    const tempFilePath = `${filePath}.part`;

    let startByte = 0;

    if (fs.existsSync(tempFilePath)) {
        startByte = fs.statSync(tempFilePath).size;
    }

    downloads[fileName] = {
        progress: startByte,
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
            headers: { Range: `bytes=${startByte}-` },
        });

        const totalSize = parseInt(response.headers["content-length"], 10) + startByte;
        let downloadedSize = startByte;

        const file = fs.createWriteStream(tempFilePath, { flags: "a" });
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

        response.data.pipe(file);

        file.on("finish", () => {
            fs.renameSync(tempFilePath, filePath);
            downloads[fileName].status = "Completed";
        });

        file.on("error", (err) => {
            downloads[fileName].status = "Failed";
            res.status(500).json({ error: "Download failed", details: err.message });
        });

        res.json({ message: "Download started", fileName });
    } catch (error) {
        downloads[fileName].status = "Failed";
        res.status(500).json({ error: "Download failed", details: error.message });
    }
});

// Route to pause a download
app.post("/pause_download", (req, res) => {
    const { fileName } = req.body;

    if (!fileName || !downloads[fileName]) {
        return res.status(404).json({ error: "Download not found" });
    }

    downloads[fileName].status = "Paused";
    res.json({ message: "Download paused", fileName });
});

// Route to cancel a download
app.post("/cancel_download", (req, res) => {
    const { fileName } = req.body;

    if (!fileName || !downloads[fileName]) {
        return res.status(404).json({ error: "Download not found" });
    }

    const filePath = path.join(DOWNLOAD_FOLDER, fileName);
    const tempFilePath = `${filePath}.part`;

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    delete downloads[fileName];

    res.json({ message: "Download canceled", fileName });
});

// Route to check download progress
app.get("/download_progress", (req, res) => {
    const { fileName } = req.query;

    if (!fileName || !downloads[fileName]) {
        return res.status(404).json({ error: "Download not found" });
    }

    res.json(downloads[fileName]);
});

// Start the server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://127.0.0.1:${PORT}`);
});
