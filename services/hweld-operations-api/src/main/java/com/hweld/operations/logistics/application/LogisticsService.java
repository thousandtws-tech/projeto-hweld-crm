package com.hweld.operations.logistics.application;

import com.hweld.operations.logistics.application.ShippingProvider.CotacaoInput;
import com.hweld.operations.logistics.application.ShippingProvider.CotacaoServico;
import com.hweld.operations.logistics.application.ShippingProvider.ProdutoCotacao;
import com.hweld.operations.logistics.domain.LogisticsQuote;
import com.hweld.operations.logistics.domain.LogisticsQuoteRepository;
import com.hweld.operations.logistics.infrastructure.LogisticsProperties;
import com.hweld.operations.logistics.infrastructure.ShippingProviderException;
import com.hweld.operations.logistics.infrastructure.StubShippingProvider;
import com.hweld.operations.logistics.infrastructure.melhorenvio.MelhorEnvioProvider;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LogisticsService {

    private static final Logger log = LoggerFactory.getLogger(LogisticsService.class);

    private final LogisticsQuoteRepository quotes;
    private final LogisticsDataGateway gateway;
    private final IntegrationSettingsRepository settings;
    private final LogisticsProperties props;
    private final MelhorEnvioProvider melhorEnvio;
    private final StubShippingProvider stub;
    private final com.hweld.operations.shared.infrastructure.coreapi.OrderGateway orderGateway;

    public LogisticsService(LogisticsQuoteRepository quotes, LogisticsDataGateway gateway,
            IntegrationSettingsRepository settings, LogisticsProperties props,
            MelhorEnvioProvider melhorEnvio, StubShippingProvider stub,
            com.hweld.operations.shared.infrastructure.coreapi.OrderGateway orderGateway) {
        this.quotes = quotes;
        this.gateway = gateway;
        this.settings = settings;
        this.props = props;
        this.melhorEnvio = melhorEnvio;
        this.stub = stub;
        this.orderGateway = orderGateway;
    }

    public ShippingProvider resolver() {
        return switch (props.provider()) {
            case "melhorenvio" -> melhorEnvio;
            case "stub" -> stub;
            case "auto" -> melhorEnvio.configured() ? melhorEnvio : stub;
            default -> {
                log.warn("hweld.logistics.provider desconhecido '{}' — usando stub",
                        props.provider());
                yield stub;
            }
        };
    }

    @Transactional
    public Map<String, Object> cotarPedido(long pedidoId, String servicos,
            com.hweld.operations.shared.infrastructure.security.AuthPrincipal actor,
            String callerJwt) {
        if (actor != null && actor.isPortal()) {
            // A chamada repassa o JWT do contato — pedido de outra empresa
            // devolve 403/404 do core-api antes de qualquer cotação (IDOR).
            orderGateway.getOrder(pedidoId, callerJwt, true);
        }
        var dados = gateway.buscar(pedidoId);
        String cepOrigem = cepOrigem();
        String cepDestino = dados.cepDestino();
        if (cepDestino == null) {
            throw ApiException.validacao(
                    "pedido sem endereço de entrega válido — confira o cadastro");
        }
        var produtos = produtosDoPedido(dados);
        return cotar(new CotacaoInput(cepOrigem, cepDestino, produtos, servicos),
                dados.pedido().id(), dados.pedido().empresaId());
    }

    @Transactional
    public Map<String, Object> cotarManual(String cepDestino, List<ProdutoCotacao> produtos,
            String servicos) {
        String cep = validarCep(cepDestino, "cep_destino");
        return cotar(new CotacaoInput(cepOrigem(), cep, validarProdutos(produtos), servicos),
                null, null);
    }

    private Map<String, Object> cotar(CotacaoInput input, Long pedidoId, Long empresaId) {
        ShippingProvider provider = resolver();
        if (provider == stub && "auto".equals(props.provider())) {
            log.info("logistics: provider auto → stub (credenciais Melhor Envio pendentes)");
        }
        IntegrationSettings cfg = settings.findById(IntegrationSettings.MELHOR_ENVIO_FRETE)
                .orElse(null);
        if (provider == melhorEnvio && cfg != null && cfg.isEnvioPausado()) {
            throw ApiException.conflito("cotações pausadas — retome na aba da integração");
        }

        LogisticsQuote registro = quotes.save(LogisticsQuote.registrar(
                provider.name(), pedidoId, empresaId,
                input.cepOrigem(), input.cepDestino(), requestMap(input)));
        try {
            List<CotacaoServico> servicos = provider.cotar(input);
            registro.concluir(responseMap(servicos), (int) servicos.stream()
                    .filter(s -> s.erro() == null).count());
            quotes.save(registro);
            return resposta(registro, provider.name(), servicos);
        } catch (ShippingProviderException e) {
            registro.falhar(e.getMessage());
            quotes.save(registro);
            throw mapearErro(e);
        }
    }

    private ApiException mapearErro(ShippingProviderException e) {
        return switch (e.codigo()) {
            case "autenticacao" -> ApiException.proibido(
                    "credenciais Melhor Envio recusadas — revise token e ambiente no painel");
            case "rate_limit" -> ApiException.provedorIndisponivel(
                    "Melhor Envio limitou a taxa — tente em instantes");
            case "provedor_indisponivel", "transporte" -> ApiException.provedorIndisponivel(
                    e.getMessage());
            default -> ApiException.validacao(e.getMessage());
        };
    }

    private String cepOrigem() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.MELHOR_ENVIO_FRETE)
                .orElse(null);
        String cep = cfg != null ? cfg.cepOrigem() : null;
        if (cep == null) {
            throw ApiException.validacao(
                    "CEP de origem não configurado — defina na aba Configurações da integração");
        }
        return cep;
    }

    private List<ProdutoCotacao> produtosDoPedido(LogisticsDataGateway.DadosLogisticosPedido d) {
        var produtos = new ArrayList<ProdutoCotacao>();
        var faltando = new ArrayList<String>();
        int idx = 1;
        for (var i : d.itens()) {
            if (i.pesoKg() == null || i.alturaCm() == null || i.larguraCm() == null
                    || i.comprimentoCm() == null) {
                faltando.add(i.sku() != null && !i.sku().isBlank() ? i.sku() : i.descricao());
                continue;
            }
            produtos.add(new ProdutoCotacao(
                    i.sku() != null && !i.sku().isBlank() ? i.sku() : "item-" + idx,
                    i.larguraCm().intValue(),
                    i.alturaCm().intValue(),
                    i.comprimentoCm().intValue(),
                    i.pesoKg(),
                    i.valorUnitario() != null ? i.valorUnitario() : BigDecimal.ZERO,
                    i.quantidade() != null && i.quantidade().compareTo(BigDecimal.ZERO) > 0
                            ? i.quantidade().intValue() : 1));
            idx++;
        }
        if (produtos.isEmpty()) {
            throw ApiException.validacao(
                    "nenhum item do pedido tem peso/dimensões cadastrados — complete o "
                            + "cadastro dos produtos (" + String.join(", ", faltando) + ")");
        }
        if (!faltando.isEmpty()) {
            log.warn("logistics: pedido {} cotado parcialmente — sem dimensões: {}",
                    d.pedido().id(), faltando);
        }
        return validarProdutos(produtos);
    }

    private static List<ProdutoCotacao> validarProdutos(List<ProdutoCotacao> produtos) {
        if (produtos == null || produtos.isEmpty()) {
            throw ApiException.validacao("informe ao menos um produto para cotar");
        }
        for (ProdutoCotacao p : produtos) {
            if (p.width() <= 0 || p.height() <= 0 || p.length() <= 0) {
                throw ApiException.validacao(
                        "dimensões inválidas em '" + p.id() + "' — cm inteiros > 0");
            }
            if (p.weight() == null || p.weight().compareTo(new BigDecimal("0.01")) < 0) {
                throw ApiException.validacao(
                        "peso inválido em '" + p.id() + "' — mínimo 0,01 kg");
            }
            if (p.quantity() <= 0) {
                throw ApiException.validacao("quantidade inválida em '" + p.id() + "'");
            }
        }
        return produtos;
    }

    private static String validarCep(String cep, String campo) {
        String c = cep != null ? cep.replaceAll("\\D", "") : "";
        if (c.length() != 8) {
            throw ApiException.validacao(campo + " inválido — 8 dígitos");
        }
        return c;
    }

    private Map<String, Object> requestMap(CotacaoInput input) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("cep_origem", input.cepOrigem());
        m.put("cep_destino", input.cepDestino());
        if (input.servicos() != null) m.put("servicos", input.servicos());
        m.put("produtos", input.produtos().stream()
                .map(p -> Map.<String, Object>of(
                        "id", p.id(), "width", p.width(), "height", p.height(),
                        "length", p.length(), "weight", p.weight(),
                        "insurance_value", p.insuranceValue(), "quantity", p.quantity()))
                .toList());
        return m;
    }

    private Map<String, Object> responseMap(List<CotacaoServico> servicos) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("servicos", servicos.stream().map(this::servicoMap).toList());
        return m;
    }

    private Map<String, Object> resposta(LogisticsQuote q, String provider,
            List<CotacaoServico> servicos) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId().toString());
        m.put("provider", provider);
        m.put("cep_origem", q.getCepOrigem());
        m.put("cep_destino", q.getCepDestino());
        m.put("pedido_id", q.getPedidoId());
        m.put("servicos", servicos.stream().map(this::servicoMap).toList());
        m.put("criado_em", q.getCreatedAt().toString());
        return m;
    }

    private Map<String, Object> servicoMap(CotacaoServico s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("servico_id", s.serviceId());
        m.put("nome", s.nome() != null ? s.nome() : "");
        m.put("transportadora", s.transportadora() != null ? s.transportadora() : "");
        m.put("preco", s.preco());
        m.put("prazo_dias", s.prazoDias());
        if (s.erro() != null) m.put("erro", s.erro());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> historico(int limite,
            com.hweld.operations.shared.infrastructure.security.AuthPrincipal actor,
            String callerJwt) {
        var pageable = PageRequest.of(0, Math.min(Math.max(limite, 1), 100),
                org.springframework.data.domain.Sort.by("createdAt").descending());
        // Portal só vê cotações da própria empresa — o histórico carrega CEP
        // de destino, dado de terceiros não pode vazar (IDOR).
        var page = actor != null && actor.isPortal()
                ? quotes.findByEmpresaId(
                        orderGateway.getPortalProfile(callerJwt).empresaId(), pageable)
                : quotes.findAll(pageable);
        return page.map(q -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.getId().toString());
            m.put("provider", q.getProvider());
            m.put("pedido_id", q.getPedidoId());
            m.put("cep_origem", q.getCepOrigem());
            m.put("cep_destino", q.getCepDestino());
            m.put("status", q.getStatus());
            m.put("erro", q.getErro() != null ? q.getErro() : "");
            m.put("servicos_count", q.getServicosCount());
            m.put("criado_em", q.getCreatedAt().toString());
            return m;
        }).getContent();
    }
}
