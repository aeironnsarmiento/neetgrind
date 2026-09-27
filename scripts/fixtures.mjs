// Downloads the live Grind 75 dataset chunk and NeetCode main bundle into test/fixtures/.
import { mkdirSync, writeFileSync } from "node:fs";
import { chunkUrlsFromHtml, GRIND_PAGE } from "../src/data/grindSource.js";
import { mainBundleUrl, NC_ORIGIN } from "../src/data/neetcodeSource.js";

const dir = new URL("../test/fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};

for (const url of chunkUrlsFromHtml(await get(GRIND_PAGE))) {
  const text = await get(url);
  if (text.includes('"slug":"two-sum"')) {
    writeFileSync(new URL("grind-data.js", dir), text);
    console.log("grind-data.js <-", url);
    break;
  }
}

const main = mainBundleUrl(await get(`${NC_ORIGIN}/roadmap`));
writeFileSync(new URL("nc-main.js", dir), await get(main));
console.log("nc-main.js <-", main);
