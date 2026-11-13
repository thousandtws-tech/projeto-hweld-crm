// Codemod v3: scanner com profundidade de {} — converte input/textarea/select
// com fieldClass em MUI TextField.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
})(ROOT);

// Retorna índice do '>' que fecha a tag (profundidade 0 de {}), ou -1.
function closeIdx(src, from) {
  let depth = 0,
    inStr = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === inStr && src[i - 1] !== "\\") inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

let total = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  if (!src.includes("fieldClass")) continue;
  let out = "",
    pos = 0,
    n = 0;

  for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
    if (m.index < pos) continue; // já consumido como filho de elemento anterior
    const end = closeIdx(src, m.index + m[0].length);
    if (end < 0) break;
    let attrs = src.slice(m.index + m[0].length, end);
    if (!attrs.includes("fieldClass")) continue;
    // Attrs de input nativo que no TextField pertencem a slotProps.htmlInput.
    const html = [];
    for (const p of ["step", "min", "max", "minLength", "maxLength", "list", "pattern", "inputMode"]) {
      const re = new RegExp(`\\s${p}=(?:"([^"]*)"|\\{([^{}]*)\\})`, "g");
      attrs = attrs.replace(re, (_, lit, expr) => {
        html.push(expr !== undefined ? `${p}: ${expr}` : `${p}: "${lit}"`);
        return "";
      });
    }
    const a = attrs
      .replace(/\s*className=\{`[^`]*fieldClass[^`]*`\}/g, "")
      .replace(/\s*className=\{fieldClass\}/g, "")
      .replace(/\/+\s*$/, "")
      .trimEnd();
    const tag = m[1];
    const selfClose = src[end - 1] === "/";
    let extra =
      tag === "input"
        ? ""
        : tag === "textarea"
          ? " multiline minRows={3}"
          : " select slotProps={{ select: { native: true } }}";
    if (html.length) {
      const hi = `htmlInput: { ${html.join(", ")} }`;
      if (extra.includes("slotProps"))
        extra = extra.replace(
          "{ select: { native: true } }",
          `{ select: { native: true }, ${hi} }`,
        );
      else extra += ` slotProps={{ ${hi} }}`;
    }
    out += src.slice(pos, m.index);
    if (tag === "input" || selfClose) {
      out += `<TextField size="small" fullWidth${extra}${a} />`;
      pos = end + 1;
    } else {
      out += `<TextField size="small" fullWidth${extra}${a}>`;
      pos = end + 1;
      const cm = src.slice(pos).match(new RegExp(`</${tag}>`));
      out += cm ? src.slice(pos, pos + cm.index) : "";
      out += "</TextField>";
      if (cm) pos += cm.index + cm[0].length;
    }
    n++;
  }
  out += src.slice(pos);
  if (!n) continue;
  src = out;

  if (!/from "@mui\/material\/TextField"/.test(src)) {
    const lines = src.split("\n");
    let lastImport = -1;
    lines.forEach((l, i) => {
      if (/^import .*(from|\/)/.test(l)) lastImport = i;
    });
    lines.splice(lastImport + 1, 0, 'import TextField from "@mui/material/TextField";');
    src = lines.join("\n");
  }
  if (!src.includes("fieldClass")) {
    src = src.replace(/,?\s*fieldClass,?\s*/g, " ");
    src = src.replace(/import\s*\{\s*\}\s*from "@\/components\/ui-kit\/FormDialog";\n?/g, "");
  }
  writeFileSync(file, src);
  total += n;
  console.log(`${file.replace(ROOT, "src")}: +${n}`);
}
console.log(`TOTAL: ${total}`);
