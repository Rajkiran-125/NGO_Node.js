const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const mongoose = require("mongoose");
const archiver = require("archiver");

const router = express.Router();
const { auth } = require("../middleware/auth");
const loggerFunction = require("../utils/loggerFunction");

// Folder to store temp backups
const BACKUP_DIR = path.join(__dirname, "../backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// Multer config for restore upload
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
 * 1️⃣ EXPORT DATABASE (NODE.JS JSON BACKUP)
 * ============================
 * GET /dbbackup/export
 */
router.get("/export", async (req, res) => {
  const route = "GET /dbbackup/export";
  try {
    loggerFunction("info", `${route} - Node export started`);

    const collections = await mongoose.connection.db.collections();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="node-backup-${Date.now()}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const collection of collections) {
      const name = collection.collectionName;

      loggerFunction("info", `${route} - Exporting collection: ${name}`);

      const docs = [];
      const cursor = collection.find({});

      await cursor.forEach((doc) => {
        docs.push(doc);
      });

      const jsonData = JSON.stringify(docs, null, 2);

      archive.append(jsonData, { name: `${name}.json` });
    }

    await archive.finalize();

    loggerFunction("info", `${route} - Node export completed successfully`);
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.message}`);
    res.status(500).json({
      message: "Node export failed",
      error: error.message,
    });
  }
});

/**
 * ============================
 * 2️⃣ RESTORE DATABASE (APPEND MODE)
 * ============================
 * POST /dbbackup/restore
 * Form-data: file = backup.zip
 *
 * - Keeps existing records
 * - Inserts new records
 * - Skips duplicates by _id
 */
router.post("/restore", upload.single("file"), async (req, res) => {
  const route = "POST /dbbackup/restore";
  try {
    loggerFunction("info", `${route} - Node restore started`);

    if (!req.file) {
      return res.status(400).json({ message: "Backup zip file is required" });
    }

    const zipPath = req.file.path;
    const extractPath = zipPath + "_extracted";

    fs.mkdirSync(extractPath);

    // Unzip uploaded backup
    const unzipCommand = `unzip "${zipPath}" -d "${extractPath}"`;

    require("child_process").exec(unzipCommand, async (unzipErr) => {
      if (unzipErr) {
        loggerFunction("error", `${route} - Unzip failed: ${unzipErr.message}`);
        return res.status(500).json({
          message: "Unzip failed",
          error: unzipErr.message,
        });
      }

      const files = fs.readdirSync(extractPath);

      let totalInserted = 0;
      let totalSkipped = 0;

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const collectionName = file.replace(".json", "");
        const filePath = path.join(extractPath, file);

        loggerFunction(
          "info",
          `${route} - Restoring collection: ${collectionName}`
        );

        const rawData = fs.readFileSync(filePath, "utf-8");
        const documents = JSON.parse(rawData);

        if (!Array.isArray(documents) || documents.length === 0) continue;

        const collection = mongoose.connection.db.collection(collectionName);

        try {
          const result = await collection.insertMany(documents, {
            ordered: false, // continue on duplicate errors
          });

          totalInserted += result.insertedCount || 0;
        } catch (insertErr) {
          // Duplicate key errors are expected
          if (insertErr.writeErrors) {
            totalSkipped += insertErr.writeErrors.length;
            loggerFunction(
              "warn",
              `${route} - Some duplicates skipped in ${collectionName}`
            );
          } else {
            loggerFunction(
              "error",
              `${route} - Insert failed for ${collectionName}: ${insertErr.message}`
            );
            return res.status(500).json({
              message: `Restore failed for collection ${collectionName}`,
              error: insertErr.message,
            });
          }
        }
      }

      // Cleanup temp files
      fs.rmSync(extractPath, { recursive: true, force: true });
      fs.unlinkSync(zipPath);

      loggerFunction("info", `${route} - Restore completed`);

      res.json({
        message: "Restore completed successfully",
        inserted: totalInserted,
        skippedDuplicates: totalSkipped,
      });
    });
  } catch (error) {
    loggerFunction("error", `${route} - Error: ${error.message}`);
    res.status(500).json({
      message: "Node restore failed",
      error: error.message,
    });
  }
});

/**
 * ============================
 * 3️⃣ CLEAR ALL COLLECTIONS (SAFE DELETE)
 * ============================
 * DELETE /dbbackup/delete
 *
 * - Does NOT drop database
 * - Clears all documents from all collections
 */
// router.delete("/delete", async (req, res) => {
//   const route = "DELETE /dbbackup/delete";
//   try {
//     loggerFunction("warn", `${route} - CLEARING ALL COLLECTIONS INITIATED`);

//     // Safety confirmation header (strongly recommended)
//     // const confirm = req.headers["x-confirm-delete"];
//     // if (confirm !== "YES") {
//     //   return res.status(400).json({
//     //     message: "Confirmation required. Send header X-CONFIRM-DELETE: YES",
//     //   });
//     // }

//     const collections = await mongoose.connection.db.collections();

//     let totalDeleted = 0;

//     for (const collection of collections) {
//       const name = collection.collectionName;
//       const result = await collection.deleteMany({});
//       totalDeleted += result.deletedCount || 0;

//       loggerFunction(
//         "warn",
//         `${route} - Cleared ${result.deletedCount} documents from ${name}`
//       );
//     }

//     res.json({
//       message: "All collections cleared successfully",
//       totalDeleted,
//     });
//   } catch (error) {
//     loggerFunction("error", `${route} - Error: ${error.message}`);
//     res.status(500).json({
//       message: "Clear collections failed",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
