"use strict";
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;
require("winston-daily-rotate-file");

const logConfig = require("./loggerConfig.json");
// const Datetime = new Date().toLocaleDateString()
const filepath = `${logConfig.filePathDirctory}/${logConfig.AppName}`;

const loggerFunction = (level, message) => {
  try {
    if (level === "info" && logConfig.infoDisable === false) {
      const log1 = logger(`${level}`, level);
      log1.info(message);
      log1.close();
      log1.end();
    } else if (level === "error" && logConfig.errorDisable === false) {
      const log2 = logger(`${level}`, level);
      log2.error(message);
      log2.close();
      log2.end();
    } else if (level === "debug" && logConfig.debugDisable === false) {
      const log3 = logger(`${level}`, level);
      log3.debug(message);
      log3.close();
      log3.end();
    } else if (level === "warn" && logConfig.warnDisable === false) {
      const log4 = logger(`${level}`, level);
      log4.warn(message);
      log4.close();
      log4.end();
    } else if (level === "admin" && logConfig.adminDisable === false) {
      const log5 = logger(`${level}`, level);
      log5.info(message);
      log5.close();
      log5.end();
    }
  } catch (error) {
    console.log(`loggerFunction Error : {error.message}`);
  }
};

const dailyRotateFileTransportinfo = (filename, level) =>
  new transports.DailyRotateFile({
    level: "debug",
    filename: `${filepath}/%DATE%/${filename}/${level}.log`,
    maxSize: logConfig.maxsize,
    zippedArchive: logConfig.zippedArchive,
    datePattern: logConfig.datePattern,
    json: true
  });

const logger = function (filename, level) {
  try {
    return createLogger({
      // change level if in dev environment versus production
      level: logConfig.logLevel,
      silent: logConfig.logDisable,
      maxsize: logConfig.maxsize,
      exitOnError: false,
      format: combine(
        timestamp({
          format: logConfig.logDateTimeFormat,
          tz: logConfig.timeZone
        }),
        // for the log file
        printf(info => `${info.timestamp} : | ${info.level} | ${JSON.stringify(info.message)} |`)
      ),

      transports: [dailyRotateFileTransportinfo(filename, level)]
    });
  } catch (err) {
    console.log(`Logger Error : {err}`);
  }
};

module.exports = loggerFunction; // is now a function
