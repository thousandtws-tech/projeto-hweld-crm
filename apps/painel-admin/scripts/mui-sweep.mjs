// Codemod final: varredura de elementos nativos -> MUI em todas as rotas/layout.
//
// <button>   -> Button (variant por heurística de classe) | IconButton (só ícone) | Chip (pill condicional)
// <input>    -> TextField | Checkbox | Radio (hidden/file preservados)
// <table>    -> Table/TableHead/TableBody/TableRow/TableCell (align via text-right/center)
// <ul>/<ol>  -> List; <li> -> ListItem (li com ref/dnd fica nativo)
// <dl>/<dt>/<dd> -> Box/Typography
// <h1>-<h6>, <p> -> Typography (className preservado — estilo não muda)
// <label>    -> Typography component="label" | FormControlLabel (se envolve Checkbox)
//
// Uso: node scripts/mui-sweep.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(import.meta.url), "..", "..", "src");
const SKIP_DIRS = new Set(["ui", "ui-kit"]);
const HTML_ONLY = ["step", "min", "max", "minLength", "maxLength", "list", "pattern", "inputMode", "readOnly"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(p);
    } else if (name.endsWith(".tsx")) yield p;
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

// Encontra pares <tag>...</tag> (self-close incluso). Retorna [{start, tagEnd, end, attrSrc, inner, selfClose}]
function findTags(src, tag) {
  const out = [];
  let p = 0;
  const open = `<${tag}`;
  while ((p = src.indexOf(open, p)) !== -1) {
    const after = src[p + open.length];
    if (after && /[\w]/.test(after)) { p += open.length; continue; } // <tablex
    const tagEnd = findTagEnd(src, p + open.length);
    if (tagEnd === -1) break;
    const selfClose = src[tagEnd - 1] === "/";
    const attrSrc = src.slice(p + open.length, tagEnd).replace(/\/\s*$/, "");
    let end = tagEnd + 1;
    let inner = "";
    if (!selfClose) {
      const closeIdx = src.indexOf(`</${tag}>`, tagEnd);
      if (closeIdx === -1) { end = tagEnd + 1; }
      else { inner = src.slice(tagEnd + 1, closeIdx); end = closeIdx + tag.length + 3; }
    }
    out.push({ start: p, tagEnd, end, attrSrc, inner, selfClose });
    p = end;
  }
  return out;
}

function emitProps(attrs, { drop = ["className"], htmlInput = true } = {}) {
  const out = [];
  const hi = {};
  for (const a of attrs) {
    if (!/^[a-zA-Z]/.test(a.name)) continue; // spreads
    if (drop.includes(a.name)) continue;
    if (htmlInput && HTML_ONLY.includes(a.name) && a.value) {
      const v = a.value.startsWith("{") && a.value.endsWith("}") ? a.value.slice(1, -1) : a.value;
      hi[a.name] = v;
      continue;
    }
    out.push(a.value === undefined ? a.name : `${a.name}=${a.value}`);
  }
  if (Object.keys(hi).length) {
    out.push(`slotProps={{ htmlInput: { ${Object.entries(hi).map(([k, v]) => `${k}: ${v}`).join(", ")} } }}`);
  }
  return out.join(" ");
}

const getCls = (attrs) => attrs.find((a) => a.name === "className")?.value ?? "";
const stripQ = (v) => (v || "").replace(/^["'{`]|["'}`]$/g, "");

/* ---------- transforms ---------- */

function tButton(src) {
  const tags = findTags(src, "button").filter((t) => !t.selfClose);
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    const attrs = parseAttrs(t.attrSrc);
    const cls = stripQ(getCls(attrs));
    const props = emitProps(attrs, { htmlInput: false });
    const inner = t.inner.trim();

    // pill de filtro com classe condicional ${x ? -> Chip
    const clsAttr = getCls(attrs);
    const cond = clsAttr.match(/\$\{([^{}?]+)\?/)?.[1]?.trim();
    const hasText = inner.replace(/<[^>]+>/g, "").replace(/[{}]/g, "").trim().length > 0;
    if (cond && hasText && inner.length < 120) {
      src = src.slice(0, t.start) +
        `<Chip label={<>${inner}</>} size="small" variant={(${cond}) ? "filled" : "outlined"} color={(${cond}) ? "primary" : "default"} ${props} />` +
        src.slice(t.end);
      continue;
    }
    // só ícone -> IconButton
    const iconOnly = !hasText || /^<[A-Z]\w*[^>]*\/?>(\s*<[A-Z]\w*[^>]*\/>)*$/.test(inner.replace(/\{[^}]*\}/g, ""));
    if (iconOnly) {
      src = src.slice(0, t.start) + `<IconButton size="small" ${props}>${inner}</IconButton>` + src.slice(t.end);
      continue;
    }
    let variant = 'variant="text"';
    if (/bg-(lime|primary|destructive|foreground|\[#)|bg-lime/.test(cls)) {
      variant = /destructive|#D92|#d92/.test(cls) ? 'variant="contained" color="error"' : 'variant="contained"';
    } else if (/border/.test(cls)) {
      variant = /destructive/.test(cls) ? 'variant="outlined" color="error"' : 'variant="outlined"';
    }
    const small = /text-xs|py-1|h-7|h-8/.test(cls) ? " size=\"small\"" : "";
    src = src.slice(0, t.start) + `<Button ${variant}${small} ${props}>${inner}</Button>` + src.slice(t.end);
  }
  return src;
}

function tInput(src) {
  const tags = findTags(src, "input");
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    const attrs = parseAttrs(t.attrSrc);
    const type = stripQ(attrs.find((a) => a.name === "type")?.value) || "text";
    if (type === "hidden" || type === "file") continue;
    const props = emitProps(attrs, { drop: ["className", "size"] });
    if (type === "checkbox" || type === "radio") {
      const el = type === "checkbox" ? "Checkbox" : "Radio";
      src = src.slice(0, t.start) + `<${el} ${props} />` + src.slice(t.end);
    } else {
      src = src.slice(0, t.start) + `<TextField size="small" ${props} />` + src.slice(t.end);
    }
  }
  return src;
}

function tTable(src) {
  const map = { table: ["Table", 'size="small"'], thead: ["TableHead", ""], tbody: ["TableBody", ""] };
  for (const [tag, [el, extra]] of Object.entries(map)) {
    src = src.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, "g"), (m, a) => `<${el}${extra ? " " + extra : ""}${a || ""}>`);
    src = src.replaceAll(`</${tag}>`, `</${el}>`);
  }
  for (const [tag, el] of [["tr", "TableRow"], ["th", "TableCell"], ["td", "TableCell"]]) {
    const tags = findTags(src, tag);
    for (let i = tags.length - 1; i >= 0; i--) {
      const t = tags[i];
      const attrs = parseAttrs(t.attrSrc);
      const cls = stripQ(getCls(attrs));
      const props = [];
      for (const a of attrs) {
        if (!/^[a-zA-Z]/.test(a.name) || a.name === "className") continue;
        props.push(a.value === undefined ? a.name : `${a.name}=${a.value}`);
      }
      if (tag !== "tr") {
        if (/text-right/.test(cls)) props.unshift('align="right"');
        else if (/text-center/.test(cls)) props.unshift('align="center"');
      }
      if (tag === "tr") {
        if (/cursor-pointer/.test(cls)) props.push('sx={{ cursor: "pointer" }}');
        if (/hover:/.test(cls)) props.push("hover");
      }
      const body = t.selfClose ? " />" : `>${src.slice(t.tagEnd + 1, t.end).replace(new RegExp(`</${tag}>$`), "")}</${el}>`;
      src = src.slice(0, t.start) + `<${el} ${props.join(" ")}${body}` + src.slice(t.end);
    }
  }
  return src;
}

function tLists(src) {
  src = src.replace(/<ul(\s[^>]*)?>/g, () => `<List disablePadding>`);
  src = src.replaceAll("</ul>", "</List>");
  src = src.replace(/<ol(\s[^>]*)?>/g, () => `<List component="ol" disablePadding>`);
  src = src.replaceAll("</ol>", "</List>");
  const tags = findTags(src, "li");
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    if (/ref=|draggable|onDrag|data-dnd|data-rbd/.test(t.attrSrc)) continue;
    const attrs = parseAttrs(t.attrSrc);
    const cls = stripQ(getCls(attrs));
    const props = [];
    for (const a of attrs) {
      if (!/^[a-zA-Z]/.test(a.name) || a.name === "className") continue;
      props.push(a.value === undefined ? a.name : `${a.name}=${a.value}`);
    }
    if (/border-b|divide|border-t/.test(cls)) props.push("divider");
    const body = t.selfClose ? " />" : `>${src.slice(t.tagEnd + 1, t.end).replace(/<\/li>$/, "")}</ListItem>`;
    src = src.slice(0, t.start) + `<ListItem${props.length ? " " + props.join(" ") : ""}${body}` + src.slice(t.end);
  }
  return src;
}

function tDl(src) {
  const map = [
    [/\<dl(\s[^>]*)?>/g, (m, a) => `<Box component="dl"${a || ""}>`],
    [/<\/dl>/g, "</Box>"],
    [/\<dt(\s[^>]*)?>/g, (m, a) => `<Typography component="dt" variant="caption" color="text.secondary" display="block"${a || ""}>`],
    [/<\/dt>/g, "</Typography>"],
    [/\<dd(\s[^>]*)?>/g, (m, a) => `<Typography component="dd" variant="body2"${a || ""}>`],
    [/<\/dd>/g, "</Typography>"],
  ];
  for (const [re, rep] of map) src = src.replace(re, rep);
  return src;
}

const H_VARIANT = { h1: "h4", h2: "h6", h3: "subtitle1", h4: "subtitle2", h5: "subtitle2", h6: "subtitle2" };
function tText(src) {
  for (const [tag, variant] of Object.entries(H_VARIANT)) {
    const re = new RegExp(`<${tag}(\\s[^>]*)?>`, "g");
    src = src.replace(re, (m, a) => `<Typography variant="${variant}" component="${tag}"${a || ""}>`);
    src = src.replaceAll(`</${tag}>`, "</Typography>");
  }
  src = src.replace(/<p(\s[^>]*)?>/g, (m, a) => `<Typography variant="body2" component="p"${a || ""}>`);
  src = src.replaceAll("</p>", "</Typography>");
  // <label><Checkbox/>Texto</label> -> FormControlLabel
  src = src.replace(/<label[^>]*>(\s*<Checkbox[^>]*\/>)([\s\S]*?)<\/label>/g,
    (m, cb, label) => `<FormControlLabel control={${cb.trim()}} label={${JSON.stringify(label.replace(/<[^>]+>/g, "").trim())}} />`);
  src = src.replace(/<label(\s[^>]*)?>/g, (m, a) => `<Typography component="label"${a || ""}>`);
  src = src.replaceAll("</label>", "</Typography>");
  return src;
}

/* ---------- imports ---------- */

const NEED = {
  Button: "@mui/material/Button", IconButton: "@mui/material/IconButton", Chip: "@mui/material/Chip",
  Checkbox: "@mui/material/Checkbox", Radio: "@mui/material/Radio", TextField: "@mui/material/TextField",
  List: "@mui/material/List", ListItem: "@mui/material/ListItem", Typography: "@mui/material/Typography",
  Box: "@mui/material/Box", Table: "@mui/material/Table", TableHead: "@mui/material/TableHead",
  TableBody: "@mui/material/TableBody", TableRow: "@mui/material/TableRow", TableCell: "@mui/material/TableCell",
  FormControlLabel: "@mui/material/FormControlLabel",
};

let converted = 0;
for (const path of walk(SRC)) {
  let src = readFileSync(path, "utf8");
  const orig = src;
  src = tInput(src);
  src = tText(src); // label->FormControlLabel precisa do Checkbox já convertido
  src = tButton(src);
  src = tTable(src);
  src = tLists(src);
  src = tDl(src);
  if (src === orig) continue;

  const used = new Set([...src.matchAll(/<([A-Z]\w*)\b/g)].map((m) => m[1]));
  for (const [el, mod] of Object.entries(NEED)) {
    if (used.has(el) && !src.includes(mod)) {
      const imports = [...src.matchAll(/^import .*;$/gm)];
      const last = imports.at(-1);
      const pos = last ? last.index + last[0].length : 0;
      src = src.slice(0, pos) + `\nimport ${el} from "${mod}";` + src.slice(pos);
    }
  }
  writeFileSync(path, src);
  converted++;
  console.log(path.slice(SRC.length + 1));
}
console.log(`\n${converted} arquivos alterados`);
