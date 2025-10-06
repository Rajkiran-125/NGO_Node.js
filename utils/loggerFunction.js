"use strict";
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;
require("winston-daily-rotate-file");
const { winstonAzureBlob } = require("winston-azure-blob");

const logConfig = require("../loggerConfig.json");
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
      const log3 = logger(`${level}`, level);
      log3.warn(message);
      log3.close();
      log3.end();
    } else if (level === "admin" && logConfig.adminDisable === false) {
      const log7 = logger(`${level}`, level);
      log7.info(message);
      log7.close();
      log7.end();
    }
    //  else if (level === "socket" && logConfig.socketDisable === false) {
    //   const log4 = logger(`${level}`, level);
    //   log4.info(message);
    //   log4.close();
    //   log4.end();
    // } else if (level === "cache" && logConfig.cacheDisable === false) {
    //   const log5 = logger(`${level}`, level);
    //   log5.info(message);
    //   log5.close();
    //   log5.end();
    // } else if (level === "redis" && logConfig.redisDisable === false) {
    //   const log6 = logger(`${level}`, level);
    //   log6.info(message);
    //   log6.close();
    //   log6.end();
    // }
  } catch (error) {
    console.log(`loggerFunction Error : {error.message}`);
  }
};

const dailyRotateFileTransportinfo = (filename, level) =>
  new transports.DailyRotateFile({
    level: "debug",
    filename: `${filepath}/%DATE%/${filename}/${level}.log`,
    maxSize: logConfig.maxsize,
    maxDays: logConfig.maxdays,
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

      transports: [
        process.env.Azure.toLowerCase() === "true"
          ? winstonAzureBlob({
              account: {
                connectionString:
                  "DefaultEndpointsProtocol=https;AccountName=csg10032001356a724d;AccountKey=juWpX5ki/YKH8hhAXjZLZqWTTW8eiNqUTD2naCKunkZHq2LTZH/En6Nj+keZ8qhnrLuU+ZNAC4Dd9OWcQxAARA==;EndpointSuffix=core.windows.net"
              },
              blobName: logConfig.AppName,
              bufferLogSize: 1,
              containerName: logConfig.containerName,
              eol: "\n",
              extension: ".log",
              level: "info",
              rotatePeriod: logConfig.rotatePeriod,
              syncTimeout: 10
            })
          : dailyRotateFileTransportinfo(filename, level)
      ]
    });
  } catch (err) {
    console.log(`Logger Error : {err}`);
  }
};

module.exports = loggerFunction; // is now a function
