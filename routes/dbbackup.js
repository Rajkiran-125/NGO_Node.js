const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();

const { auth } = require("../middleware/auth");
const loggerFunction = require("../utils/loggerFunction");

// Folder to store backups
const BACKUP_DIR = path.join(__dirname, "../backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// Multer config for upload
const upload = multer({
  dest: BACKUP_DIR,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500 MB
});

// Helper: ensure admin
function ensureAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admins only" });
  }
  next();
}

/**
 * ============================
 * 1️⃣ EXPORT ENTIRE DATABASE
 * ============================
 * GET /dbbackup/export
 */
router.get("/export", async (req, res) => {
  const route = "GET /dbbackup/export";
  try {
    loggerFunction("info", `${route} - Backup started`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

    const mongoUri = process.env.MONGODB_URI;

    const command = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        loggerFunction("error", `${route} - mongodump failed: ${stderr}`);
        return res
          .status(500)
          .json({ message: "Backup failed", error: stderr });
      }

      loggerFunction("info", `${route} - Backup completed at ${backupPath}`);

      // Zip the backup folder
      const zipFile = `${backupPath}.zip`;
      const zipCommand = `cd "${BACKUP_DIR}" && zip -r "${zipFile}" "${path.basename(
        backupPath
      )}"`;

      exec(zipCommand, (zipErr) => {
        if (zipErr) {
          loggerFunction("error", `${route} - Zip failed: ${zipErr.message}`);
          return res
            .status(500)
            .json({ message: "Zip failed", error: zipErr.message });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${path.basename(zipFile)}"`
        );

        // Send file for download
        res.download(zipFile, (err) => {
          if (err) {
            loggerFunction(
              "error",
              `${route} - Download error: ${err.message}`
            );
          }

          // Optional: cleanup
          fs.rmSync(backupPath, { recursive: true, force: true });
          // fs.unlinkSync(zipFile);
        });
      });
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * ============================
 * 2️⃣ UPLOAD & RESTORE DATABASE
 * ============================
 * POST /dbbackup/restore
 * Form-data: file = backup.zip
 */
router.post(
  "/restore",

  upload.single("file"),
  async (req, res) => {
    const route = "POST /dbbackup/restore";
    try {
      loggerFunction("info", `${route} - Restore started`);

      if (!req.file) {
        return res.status(400).json({ message: "Backup zip file is required" });
      }

      const zipPath = req.file.path;
      const extractPath = zipPath + "_extracted";

      fs.mkdirSync(extractPath);

      // Unzip
      const unzipCommand = `unzip "${zipPath}" -d "${extractPath}"`;

      exec(unzipCommand, (unzipErr) => {
        if (unzipErr) {
          loggerFunction(
            "error",
            `${route} - Unzip failed: ${unzipErr.message}`
          );
          return res
            .status(500)
            .json({ message: "Unzip failed", error: unzipErr.message });
        }

        // Find dumped folder (first subfolder)
        const folders = fs.readdirSync(extractPath);
        const dumpFolder = path.join(extractPath, folders[0]);

        const mongoUri = process.env.MONGODB_URI;

        const restoreCommand = `mongorestore --uri="${mongoUri}" --drop "${dumpFolder}"`;

        exec(restoreCommand, (restoreErr, stdout, stderr) => {
          if (restoreErr) {
            loggerFunction("error", `${route} - Restore failed: ${stderr}`);
            return res
              .status(500)
              .json({ message: "Restore failed", error: stderr });
          }

          loggerFunction("info", `${route} - Restore completed successfully`);

          res.json({ message: "Database restored successfully" });
        });
      });
    } catch (error) {
      loggerFunction("error", `${route} - Error: ${error.message}`);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

/**
 * ============================
 * 3️⃣ DELETE ENTIRE DATABASE
 * ============================
 * DELETE /dbbackup/delete
 */
router.delete("/delete", async (req, res) => {
  const route = "DELETE /dbbackup/delete";
  try {
    loggerFunction("warn", `${route} - FULL DATABASE DELETE INITIATED`);

    const mongoUri = process.env.MONGODB_URI;

    // Extract DB name from URI
    const dbName = new URL(mongoUri).pathname.replace("/", "");

    const command = `mongo "${mongoUri}" --eval "db.dropDatabase()"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        loggerFunction("error", `${route} - Drop failed: ${stderr}`);
        return res
          .status(500)
          .json({ message: "Database delete failed", error: stderr });
      }

      loggerFunction("warn", `${route} - Database deleted successfully`);

      res.json({ message: "Entire database deleted successfully" });
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.message}`);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
