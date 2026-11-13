import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContaService } from '../../core/servicos';
import { MeuPerfil } from '../../core/models';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwButton } from '../../shared/ui/button';
import { CnpjPipe } from '../../shared/ui/cnpj.pipe';
import { HwContaNav } from './conta-nav';

/** S11 — Minha conta: dados cadastrais, empresa e tabela comercial. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HwSkeleton, HwContaNav, CnpjPipe, ReactiveFormsModule, HwButton],
  templateUrl: './conta.html',
  styleUrl: './conta.scss',
})
export class ContaPage implements OnInit {
  private conta = inject(ContaService);
  perfil = signal<MeuPerfil | null>(null);

  editando = signal(false);
  salvando = signal(false);
  erroSalvar = signal<string | null>(null);
  sucessoSalvar = signal(false);

  /** Cadastro rápido cria a empresa sem CNPJ — pede para completar depois. */
  empresaIncompleta = computed(() => {
    const e = this.perfil()?.empresa;
    return !!e && !e.cnpj;
  });

  form = new FormGroup({
    razaoSocial: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    nomeFantasia: new FormControl('', { nonNullable: true }),
    cnpj: new FormControl('', { nonNullable: true }),
    telefone: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
  });

  ngOnInit(): void {
    void this.conta
      .me()
      .then((p) => this.perfil.set(p))
      .catch(() => {});
  }

  iniciarEdicao(): void {
    const e = this.perfil()?.empresa;
    if (!e) return;
    this.form.reset({
      razaoSocial: e.razao_social,
      nomeFantasia: e.nome_fantasia ?? '',
      cnpj: e.cnpj ?? '',
      telefone: e.telefone ?? '',
      email: e.email ?? '',
    });
    // CNPJ preenchido é identidade fiscal — não edita pelo portal.
    if (e.cnpj) this.form.controls.cnpj.disable();
    else this.form.controls.cnpj.enable();
    this.erroSalvar.set(null);
    this.sucessoSalvar.set(false);
    this.editando.set(true);
  }

  cancelarEdicao(): void {
    this.editando.set(false);
    this.erroSalvar.set(null);
  }

  async salvarEmpresa(): Promise<void> {
    if (this.form.invalid || this.salvando()) return;
    this.salvando.set(true);
    this.erroSalvar.set(null);
    try {
      const v = this.form.getRawValue();
      const empresa = await this.conta.atualizarEmpresa({
        razao_social: v.razaoSocial.trim(),
        nome_fantasia: v.nomeFantasia.trim() || null,
        cnpj: v.cnpj.trim() || null,
        telefone: v.telefone.trim() || null,
        email: v.email.trim() || null,
      });
      const p = this.perfil();
      if (p) this.perfil.set({ ...p, empresa });
      this.sucessoSalvar.set(true);
      this.editando.set(false);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      this.erroSalvar.set(
        status === 422
          ? 'Dados inválidos — confira o CNPJ e os campos informados.'
          : status === 403
            ? 'Somente o contato principal pode editar os dados da empresa.'
            : 'Não foi possível salvar. Tente novamente.',
      );
    } finally {
      this.salvando.set(false);
    }
  }
}
