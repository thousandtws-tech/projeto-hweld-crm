import { describe, expect, it } from 'vitest';
import { BrlPipe, QtyPipe, StatusLabelPipe } from './pipes';

describe('pipes de formatação', () => {
  it('brl formata decimal string como moeda BRL', () => {
    const pipe = new BrlPipe();
    expect(pipe.transform('1234.56')).toContain('1.234,56');
    expect(pipe.transform('1234.56')).toContain('R$');
  });

  it('brl retorna traço para nulo/inválido sem lançar', () => {
    const pipe = new BrlPipe();
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform('abc')).toBe('—');
  });

  it('qty formata quantidade e unidade', () => {
    const pipe = new QtyPipe();
    expect(pipe.transform('1.5', 'kg')).toContain('kg');
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('statusLabel mapeia enums e faz fallback ao próprio valor', () => {
    const pipe = new StatusLabelPipe();
    expect(pipe.transform('faturado')).toBe('Faturado');
    expect(pipe.transform('status_novo')).toBe('status_novo');
    expect(pipe.transform(null)).toBe('—');
  });
});
