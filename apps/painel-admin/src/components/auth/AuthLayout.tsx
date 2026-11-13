import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-white font-[Poppins,system-ui,sans-serif] text-[#171725]">
      {/* Painel esquerdo: formulário */}
      <section className="relative z-[1] flex flex-[0_0_44%] items-center justify-center border-r border-[#f4f5f8] bg-white px-8 py-12 lg:px-[clamp(32px,8.5vw,128px)]">
        <div className="absolute top-12 left-8 right-0 flex items-center gap-6 lg:left-[clamp(32px,8.5vw,128px)]">
          <img src="/auth/logo-hweld.png" alt="HWeld" className="h-8 w-auto" />
          <span className="h-px flex-1 bg-[#f4f5f8]" aria-hidden="true" />
        </div>

        <div className="flex w-full max-w-[403px] flex-col gap-10">
          <div>
            <h1 className="m-0 text-[30px] font-semibold tracking-[0.1px]">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-[13px] font-medium text-[#969ab8]">{subtitle}</p>
            )}
          </div>

          {children}

          <div className="text-[15px] leading-6 tracking-[0.1px] text-[#969ab8]">{footer}</div>
        </div>
      </section>

      {/* Painel direito: ilustração + citação */}
      <section className="relative hidden flex-1 overflow-hidden bg-white lg:block" aria-hidden="true">
        <img
          src="/auth/login-ilustracao.png"
          alt=""
          className="absolute inset-0 box-border h-full w-full object-contain object-[center_bottom] px-[5%] pt-[140px] pb-8"
        />
        <blockquote className="absolute top-[12.7%] right-[15.4%] left-[11%] m-0">
          <img src="/auth/quote-mark.svg" alt="" className="absolute top-0 left-0 w-[125px]" />
          <div className="ml-[4.5%] flex flex-col items-end pt-[34px]">
            <p className="m-0 w-full text-right text-[32px] font-normal leading-[44px] tracking-[-0.64px] text-[#3a424a]">
              Toda grande obra começa com uma{" "}
              <strong className="font-semibold text-[#3062d4]">boa solda</strong> — e o{" "}
              <strong className="font-semibold text-[#3062d4]">parceiro certo</strong>.
            </p>
            <cite className="mt-2 text-[24px] font-medium leading-9 tracking-[-0.48px] text-[#3a424a] not-italic">
              – Equipe HWeld
            </cite>
          </div>
        </blockquote>
      </section>
    </div>
  );
}

/** Campo no estilo do login do portal: caixa bordered com ícone à esquerda. */
export function AuthField({
  icon,
  invalid = false,
  children,
}: {
  icon: "mail" | "lock";
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-lg border-[1.6px] bg-white px-5 py-3 transition-colors focus-within:border-[#0062ff] ${
        invalid ? "border-[#dc2626]" : "border-[#e0e2e9]"
      }`}
    >
      <img
        src={icon === "mail" ? "/auth/icon-mail.svg" : "/auth/icon-lock.svg"}
        alt=""
        className={icon === "mail" ? "h-[17px] w-[21px] shrink-0" : "h-[19px] w-[19px] shrink-0"}
      />
      {children}
    </div>
  );
}

/** Classes do input nu dentro do AuthField (mesmo visual do portal). */
export const authInputClass =
  "min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium tracking-[0.1px] text-[#171725] outline-none placeholder:text-[#969ab8]";
