/* Load the vendored SheetJS build (the same one the pages ship with) inside Node,
   without an npm install. The repo is "type": "module", so a plain require() would
   treat the UMD file as ESM; run it through a CommonJS wrapper instead. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const code = fs.readFileSync(path.join(ROOT, "src/vendor/xlsx.full.min.js"), "utf8");
const mod = { exports: {} };
vm.runInThisContext("(function(module, exports){" + code + "\n})")(mod, mod.exports);
export default mod.exports;
