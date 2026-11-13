// Codemod: <TextField type="date"> -> <DateField> (DatePicker MUI X, contrato yyyy-MM-dd).
// Uso: node scripts/mui-dates.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(import.meta.url), "..", "..", "src");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".tsx")) yield p;
  }
}

function findTagEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    else if (src[i] === ">" && depth === 0) return i;
  }
  return -1;
}

function parseAttrs(attrSrc) {
  const attrs = [];
  let i = 0;
  const n = attrSrc.length;
  const skipWs = () => { while (i < n && /\s/.test(attrSrc[i])) i++; };
  while (i < n) {
    skipWs();
    if (i >= n) break;
    const nameStart = i;
    while (i < n && /[\w.-]/.test(attrSrc[i])) i++;
    const name = attrSrc.slice(nameStart, i);
    if (!name) { i++; continue; }
    skipWs();
    let value;
    if (attrSrc[i] === "=") {
      i++;
      skipWs();
      const vStart = i;
      if (attrSrc[i] === "{") {
        let depth = 0;
        while (i < n) {
          if (attrSrc[i] === "{") depth++;
          else if (attrSrc[i] === "}") { depth--; i++; if (!depth) break; continue; }
          i++;
        }
      } else if (attrSrc[i] === '"' || attrSrc[i] === "'") {
        const q = attrSrc[i++];
        while (i < n && attrSrc[i] !== q) i++;
        i++;
      } else {
        while (i < n && !/[\s>]/.test(attrSrc[i])) i++;
      }
      value = attrSrc.slice(vStart, i);
    }
    attrs.push({ name, value });
  }
  return attrs;
}

const KEEP = ["value", "onChange", "disabled", "required", "autoFocus"];
let count = 0;

for (const path of walk(SRC)) {
  let src = readFileSync(path, "utf8");
  if (!src.includes('type="date"')) continue;
  const orig = src;

  const hits = [];
  let p = 0;
  while ((p = src.indexOf("<TextField", p)) !== -1) {
    const tagEnd = findTagEnd(src, p + 10);
    if (tagEnd === -1) break;
    const selfClose = src[tagEnd - 1] === "/";
    const attrSrc = src.slice(p + 10, tagEnd).replace(/\/$/, "");
    let end = tagEnd + 1;
    if (!selfClose) {
      const ci = src.indexOf("</TextField>", tagEnd);
      if (ci === -1) { p = tagEnd + 1; continue; }
      end = ci + 12;
    }
    if (attrSrc.includes('type="date"')) hits.push({ start: p, end, attrSrc });
    p = end;
  }

  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    const attrs = parseAttrs(h.attrSrc);
    const out = [];
    for (const a of attrs) {
      if (!KEEP.includes(a.name)) continue;
      let v = a.value;
      if (a.name === "onChange" && v) {
        const body = v.slice(1, -1); // remove { }
        const pm = body.match(/\(\s*(\w+)\s*\)\s*=>/);
        if (pm) {
          const param = pm[1];
          const newBody = body.replace(/\(\s*\w+\s*\)\s*=>/, "(v) =>")
            .replaceAll(`${param}.target.value`, "v");
          v = `{${newBody}}`;
        }
      }
      out.push(v === undefined ? a.name : `${a.name}=${v}`);
    }
    src = src.slice(0, h.start) + `<DateField ${out.join(" ")} />` + src.slice(h.end);
    count++;
  }

  if (src !== orig) {
    if (!src.includes("ui-kit/DateField")) {
      const imports = [...src.matchAll(/^import .*;$/gm)];
      const last = imports.at(-1);
      src = src.slice(0, last.index + last[0].length) +
        '\nimport { DateField } from "@/components/ui-kit/DateField";' +
        src.slice(last.index + last[0].length);
    }
    src = src.replace('label="Validade (AAAA-MM-DD)"', 'label="Validade"');
    writeFileSync(path, src);
    console.log(path.slice(SRC.length + 1));
  }
}
console.log(`\n${count} campos de data convertidos`);
