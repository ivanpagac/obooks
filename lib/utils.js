const rp = require("request-promise");
const download = require("image-downloader");
const { writeFileSync } = require("fs");

const MAX_RETRY_COUNT = 15;
const RETRY_DELAY_MS = 2000;

const req = async (method, url, cookie, body) => {
  const options = {
    uri: url,
    method: method,
    followAllRedirects: true,
    resolveWithFullResponse: true,
    headers: {
      Accept: "*/*",
      "Cache-Control": "no-cache",
      Cookie: cookie,
      Connection: "keep-alive",
    },
    body: body,
    json: true,
  };

  return rp(options);
};

const downloadIMG = async (options) => {
  try {
    return download.image(options);
  } catch (e) {
    log(
      `[Obook::downloadIMG] there was an error downloading the image ${options.url} e: ${e}`
    );
  }
};

const isUrl = (str) =>
  /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/.test(
    str
  );

const write = (to, from, isJson) => {
  if (isJson === null || !isJson) {
    writeFileSync(to, from);
  } else {
    writeFileSync(to, JSON.stringify(from, undefined, 2), "utf8");
  }
};

const log = (str, obj) => {
  return console.log(
    `\x1b[1m\x1b[33m+:++:++:++:+      ${str}      +:++:++:++:+\x1b[0m`,
    obj !== undefined ? obj : ""
  );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retry = async (fnToRetry) => {
  let loopCount = 0;
  while (loopCount < MAX_RETRY_COUNT) {
    try {
      const response = await fnToRetry;
      return response;
    } catch (error) {
      console.log("error in retry")
      loopCount++;
      await delay(RETRY_DELAY_MS);
      if (loopCount >= MAX_RETRY_COUNT) {
        throw error;
      }
    }
  }
};

module.exports = { req, write, isUrl, log, downloadIMG, retry, delay };
