// Tema antes do primeiro paint — evita flash claro/escuro no load.
// Arquivo externo (e não inline) porque a CSP é script-src 'self' —
// scripts inline seriam bloqueados.
(function () {
  try {
    var t = localStorage.getItem("hweld-theme") || localStorage.getItem("finpay-theme");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (t === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    }
  } catch (e) {}
})();
