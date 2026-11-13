import { DestroyRef, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth/auth.store';
import { ToastService } from '../shared/ui/toast';
import { RealtimeService } from './realtime';

/**
 * Regressão do reconcile coalesced: uma rajada de SSE que casa com o
 * predicado deve produzir UMA chamada de refetch — antes do `reagirA`
 * cada evento disparava um reload próprio (request storms em bulk-updates).
 */
describe('RealtimeService.reagirA', () => {
  let service: RealtimeService;

  beforeEach(() => {
    vi.useFakeTimers();
    // fetch pendente para sempre → stream "conectando", sem frames nem retry.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    const authStub = {
      autenticado: signal(false),
      accessToken: () => null,
    };

    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        { provide: AuthStore, useValue: authStub },
        { provide: ToastService, useValue: { mostrar: vi.fn() } },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('coalesce uma rajada de eventos correspondentes em uma única chamada', () => {
    const fn = vi.fn();
    const injector = TestBed.inject(EnvironmentInjector);
    runInInjectionContext(injector, () =>
      service.reagirA((e) => e.tipo.startsWith('catalogo.'), fn, 300),
    );

    for (const tipo of ['catalogo.precos', 'catalogo.produtos', 'catalogo.categorias']) {
      service.ultimo.set({ tipo, dados: {} });
      TestBed.tick();
      vi.advanceTimersByTime(100);
    }

    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignora eventos fora do predicado', () => {
    const fn = vi.fn();
    runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      service.reagirA((e) => e.tipo.startsWith('catalogo.'), fn, 300),
    );

    service.ultimo.set({ tipo: 'pedido.criado', dados: {} });
    TestBed.tick();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancela a chamada pendente ao destruir o consumidor', () => {
    const fn = vi.fn();
    const injector = TestBed.inject(EnvironmentInjector);
    runInInjectionContext(injector, () =>
      service.reagirA((e) => e.tipo.startsWith('catalogo.'), fn, 300),
    );

    service.ultimo.set({ tipo: 'catalogo.precos', dados: {} });
    TestBed.tick();

    injector.get(DestroyRef).onDestroy(() => {}); // sanity: ref existe
    TestBed.resetTestingModule(); // destrói o injector → limpa o timer
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
