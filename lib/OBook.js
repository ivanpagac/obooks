const Epub = require("epub-gen");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const os = require("os");

const { req, log, isUrl, downloadIMG } = require("./utils");

const OREILLY_API_URL = "https://learning.oreilly.com/api/v1";
const EBOOK_DEST_PATH = `${os.homedir()}/obooks`;
let DOWNLOAD_DEST_PATH = `/usr/local/share/epub_tmp/`;

class OBook {
  constructor(cookie, bookid) {
    this.cookie = cookie;
    this.bookid = bookid;
    this.bookUrl = `${OREILLY_API_URL}/book/${bookid}`;
    DOWNLOAD_DEST_PATH = `${DOWNLOAD_DEST_PATH}${bookid}`
  }

  async create() {
    if (!existsSync(DOWNLOAD_DEST_PATH)) mkdirSync(DOWNLOAD_DEST_PATH);
    if (!existsSync(EBOOK_DEST_PATH)) mkdirSync(EBOOK_DEST_PATH);
    const meta = await this.fetch(this.bookUrl);

    if (meta.format !== "book") {
      log(`${meta.format} format not supported.`);
      process.exit(1);
    }

    const title = meta.title;
    const author = this.joinNames(meta.authors);
    const publisher = this.joinNames(meta.publishers);
    const cover = await this.fetchCoverImagePath(meta.chapters);

    const epubOpts = { title, author, publisher, cover, content: [] };

    meta.chapters.shift();
    const chapterUrls = meta.chapters;

    log(`Getting:: ${title} ...`);
    log(`${chapterUrls.length} chapters to download, this can take a while...`);


    for (let i = 0; i<chapterUrls.length; i++) {
      const chapterUrl = chapterUrls[i]
      const chapter = await this.fetch(chapterUrl);
      const content = await this.retrieveChapterContent(chapter);
      const imagesPath = await this.downloadChapterImages(chapter);

      const finalContent = content.replace(
        // /(src=")[\S\/:]*\//g,
        // /(src=")[\w\/:]*\//g,
        /(src=")(\S*\/)*(?=\/?.+\..+")/g,
        `src="${imagesPath}/`
        
      );

      const chapterOptions = {
        title: chapter.title,
        author: this.joinNames(chapter.author),
        data: finalContent,
      };

      epubOpts.content.push(chapterOptions);
      log(`${i+1}/${chapterUrls.length} Done downloading chapter: ${chapter.title}`);
    }

    const filename = title.toLowerCase().replace(/\s+/g, "-");
    new Epub(epubOpts, `${EBOOK_DEST_PATH}/${filename}.epub`);
  }

    getChapterHash(chapter){
    const chapterHash = require("crypto")
      .createHash("md5")
      .update(chapter.content)
      .digest("hex");
      return chapterHash
  }

  async retrieveChapterContent(chapter) {
    const chapterHash = this.getChapterHash(chapter)
    const chapterLocation = [DOWNLOAD_DEST_PATH, chapterHash].join("/");

    let content;
    if (existsSync(chapterLocation)) {
      content = readFileSync(chapterLocation).toString();
      console.log(`- CONTENT - Cached ${chapterLocation}`);
    } else {
      content = await this.fetch(chapter.content);
      console.log(`- CONTENT - Downloaded ${chapterLocation}`);

      writeFileSync(chapterLocation, content);
    }
    return content;
  }

  async fetch(url) {
    const res = await req("GET", url, this.cookie, null);
    return res.body;
  }

  async fetchCoverImagePath(chapters) {
    const coverUrl = chapters.filter(
      (c) => c.includes("cover") || c.includes("titlepage")
    )[0];

    if (coverUrl !== undefined) {
      const titlePage = await this.fetch(coverUrl, this.cookie, "GET");
      const coverImage = this.guessCoverImage(titlePage.images);

      const fullPath = titlePage.asset_base_url + coverImage;
      return isUrl(fullPath) ? fullPath : null;
    }

    return null;
  }

  guessCoverImage(images) {
    return images.filter((image) => image === "cover.jpg").length
      ? images[0]
      : null;
  }

  async downloadChapterImages(chapter) {
    const assetBaseUrl = chapter.asset_base_url;
    const images = chapter.images;
    const chapterHash = this.getChapterHash(chapter)
    if (!images.length) return;
    const finalPath = [DOWNLOAD_DEST_PATH,`${chapterHash}_images`].join('/');
    for (const image of images) {
      const imageUrl = assetBaseUrl + image;
      // * chapter.images can contain part of the path -> 'dest/image.jpg'
      const { path, filename } = this.getFragmentedPath(image);
      
      // path.join()
      const dest = [finalPath,filename].join('/');

      if (!existsSync(finalPath)) mkdirSync(finalPath, { recursive: true });

      if (existsSync(dest)) {
        console.log(`- IMG - Cached ${dest}`);
        continue;
      }

      try {
        await downloadIMG({ url: imageUrl, dest, cookie: this.cookie });
        console.log(`- IMG - Downloaded ${dest}`);
      } catch (error) {
        console.log({ error });
      }
    }

    return finalPath
  }

  getFragmentedPath(image) {
    const fullPath = image.split(/(\/)/);
    const filename = fullPath.pop();
    const path = fullPath.join("");

    return { path, filename };
  }

  joinNames(arr) {
    return arr != null && arr.length ? arr.map((a) => a.name).join(", ") : "";
  }

  static async lookupEmail(email) {
    const domain = email.split("@")[1];
    const lookupEmailUrl =
      "https://www.oreilly.com/member/auth/corporate/lookup/";
    const body = { domain };

    try {
      const res = await req("POST", lookupEmailUrl, null, body);
      return res.body;
    } catch (e) {
      console.log(
        "[OBook::lookupEmail] There was an error during email lookup ",
        e
      );
      process.exit(1);
    }
  }
}

module.exports = OBook;
