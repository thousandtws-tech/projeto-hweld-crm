import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formata CNPJ no padrão brasileiro `11.222.333/0001-81`.
 * Valores sem 14 dígitos passam intactos — útil para placeholders
 * como '—' ou valores já formatados vindos do backend.
 */
@Pipe({ name: 'cnpj' })
export class CnpjPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    if (!valor) return '';
    const digitos = valor.replace(/\D/g, '');
    return digitos.length === 14
      ? digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
      : valor;
  }
}
