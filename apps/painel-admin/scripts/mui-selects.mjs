// Codemod: selects MUI de verdade (menu estilizado) no lugar de <select> nativo.
//
// 1) Remove ` slotProps={{ select: { native: true } }}` dos <TextField select> existentes
//    (o dropdown passa a ser o Select do MUI, não o do browser).
// 2) <option> -> <MenuItem>; value={expr} vira value={String(expr)} para preservar a
//    semântica string que o <select> nativo entregava no onChange.
// 3) <select ...> cru restante -> <TextField size="small" select ...> (dropa className;
//    className={inputClass} => fullWidth; demais classNames => sx minWidth).
// 4) <input/textarea className={inputClass}> -> <TextField> (mesmo formulário, mesma UI).
// 5) Garante `import MenuItem from "@mui/material/MenuItem";` quando necessário.
//
// Uso: node scripts/mui-selects.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(import.meta.url), "..", "..", "src");
const NEEDLE = /native: true|<select|<option|inputClass/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".tsx") && NEEDLE.test(readFileSync(p, "utf8"))) yield p;
  }
}
const files = [...walk(SRC)];

const HTML_ONLY = ["step", "min", "max", "minLength", "maxLength", "list", "pattern", "inputMode"];

function findTagEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

function parseAttrs(attrSrc) {
  // Scanner (regex não lida com { } aninhados): [{name, value}] preservando ordem.
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

function emitTextField(attrs, { fullWidth = false, select = false, multiline = false } = {}) {
  const out = [];
  const htmlInput = {};
  let hasFullWidth = false;
  for (const a of attrs) {
    if (a.name === "className") continue;
    if (a.name === "fullWidth") { hasFullWidth = true; continue; }
    if (HTML_ONLY.includes(a.name) && a.value) {
      const v = a.value.startsWith("{") && a.value.endsWith("}") ? a.value.slice(1, -1) : a.value;
      htmlInput[a.name] = v;
      continue;
    }
    out.push(a.value === undefined ? a.name : `${a.name}=${a.value}`);
  }
  const sp = Object.keys(htmlInput).length
    ? ` slotProps={{ htmlInput: { ${Object.entries(htmlInput).map(([k, v]) => `${k}: ${v}`).join(", ")} } }}`
    : "";
  return `<TextField size="small"${fullWidth && !hasFullWidth ? " fullWidth" : ""}${select ? " select" : ""}${multiline ? " multiline minRows={3}" : ""} ${out.join(" ")}${sp}`;
}

let converted = 0;
for (const path of files) {
  let src = readFileSync(path, "utf8");
  const orig = src;

  // (1) dropdown nativo -> MUI
  src = src.replaceAll(" slotProps={{ select: { native: true } }}", "");

  // (3) <select ...> cru -> <TextField select> (processa de trás pra frente)
  const matches = [];
  let idx = 0;
  while ((idx = src.indexOf("<select", idx)) !== -1) {
    const tagEnd = findTagEnd(src, idx + 7);
    if (tagEnd === -1) break;
    const selfClose = src[tagEnd - 1] === "/";
    let closeEnd = tagEnd + 1;
    if (!selfClose) {
      const closeIdx = src.indexOf("</select>", tagEnd);
      if (closeIdx === -1) { idx = tagEnd + 1; continue; }
      closeEnd = closeIdx + "</select>".length;
    }
    matches.push({ start: idx, tagEnd, end: closeEnd, selfClose });
    idx = closeEnd;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, tagEnd, end, selfClose } = matches[i];
    const attrSrc = src.slice(start + "<select".length, tagEnd).replace(/\/$/, "");
    const attrs = parseAttrs(attrSrc);
    const inForm = attrs.some((a) => a.name === "className" && a.value === "{inputClass}");
    const open = emitTextField(attrs, { fullWidth: inForm, select: true });
    src = src.slice(0, start) + open + (selfClose ? " />" : ">" + src.slice(tagEnd + 1, end).replace(/<\/select>$/, "") + "</TextField>") + src.slice(end);
    converted++;
  }

  // (4) <input>/<textarea> className={inputClass} -> <TextField>
  for (const tag of ["input", "textarea"]) {
    const open = `<${tag}`;
    let p = 0;
    const hits = [];
    while ((p = src.indexOf(open, p)) !== -1) {
      if (!/[\s/]/.test(src[p + open.length] || " ")) { p += open.length; continue; }
      const tagEnd = findTagEnd(src, p + open.length);
      if (tagEnd === -1) break;
      const attrSrc = src.slice(p + open.length, tagEnd).replace(/\/$/, "");
      if (!attrSrc.includes("inputClass")) { p = tagEnd + 1; continue; }
      const selfClose = src[tagEnd - 1] === "/";
      let closeEnd = tagEnd + 1;
      if (!selfClose && tag === "textarea") {
        const ci = src.indexOf("</textarea>", tagEnd);
        if (ci === -1) { p = tagEnd + 1; continue; }
        closeEnd = ci + "</textarea>".length;
      }
      hits.push({ start: p, tagEnd, end: closeEnd, attrSrc, selfClose });
      p = closeEnd;
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      const attrs = parseAttrs(h.attrSrc);
      const openTag = emitTextField(attrs, { fullWidth: true, multiline: tag === "textarea" });
      if (tag === "input" || h.selfClose) {
        src = src.slice(0, h.start) + openTag + " />" + src.slice(h.end);
      } else {
        src = src.slice(0, h.start) + openTag + ">" + src.slice(h.tagEnd + 1, h.end).replace(/<\/textarea>$/, "") + "</TextField>" + src.slice(h.end);
      }
      converted++;
    }
  }

  // (2) <option> -> <MenuItem>; value={expr} -> value={String(expr)}
  src = src.replace(/<option\b([^>]*)>/g, (m, attrs) => {
    const a = attrs.replace(/value=\{(?!String\()([^}]+)\}/g, (mm, expr) => `value={String(${expr.trim()})}`);
    return `<MenuItem${a}>`;
  });
  src = src.replaceAll("</option>", "</MenuItem>");

  if (src === orig) continue;

  // (5) imports — inseridos após o último import do cabeçalho (topo do arquivo)
  const addImport = (line) => {
    const imports = [...src.matchAll(/^import .*;$/gm)];
    const last = imports.at(-1);
    const pos = last ? last.index + last[0].length : src.indexOf("\n");
    src = src.slice(0, pos) + "\n" + line + src.slice(pos);
  };
  if (src.includes("<TextField") && !src.includes("@mui/material/TextField")) {
    addImport('import TextField from "@mui/material/TextField";');
  }
  if (src.includes("<MenuItem") && !src.includes("@mui/material/MenuItem")) {
    addImport('import MenuItem from "@mui/material/MenuItem";');
  }

  writeFileSync(path, src);
  console.log(path.slice(SRC.length + 1));
}
console.log(`\n${converted} elementos convertidos em ${files.length} arquivos`);
