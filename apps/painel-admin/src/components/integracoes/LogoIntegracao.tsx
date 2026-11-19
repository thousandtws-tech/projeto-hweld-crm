/** Tile de logo da integração — monograma sobre a cor de marca.
 *  Substituível por asset oficial (`<img>`) sem mudar o contrato. */
export function LogoIntegracao({
  iniciais,
  cor,
  tamanho = 44,
}: {
  iniciais: string;
  cor: string;
  tamanho?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-xl border font-semibold tracking-tight"
      style={{
        width: tamanho,
        height: tamanho,
        backgroundColor: `${cor}14`,
        borderColor: `${cor}33`,
        color: cor,
        fontSize: Math.round(tamanho * 0.34),
      }}
    >
      {iniciais}
    </span>
  );
}
