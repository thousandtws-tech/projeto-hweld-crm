package com.hweld.operations.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.application.SmsNotificationEventHandler;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.infrastructure.coreapi.ContatoGateway;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Gatilhos SMS — master+por evento, telefone do payload ou via contatoId. */
class SmsEventHandlerTest {

    private NotificationService service;
    private IntegrationSettingsRepository settingsRepo;
    private NotificationDeliveryRepository deliveries;
    private ContatoGateway contatos;
    private SmsNotificationEventHandler handler;

    @BeforeEach
    void setUp() {
        service = mock(NotificationService.class);
        settingsRepo = mock(IntegrationSettingsRepository.class);
        deliveries = mock(NotificationDeliveryRepository.class);
        contatos = mock(ContatoGateway.class);
        handler = new SmsNotificationEventHandler(service, settingsRepo, deliveries, contatos);
    }

    private IntegrationSettings cfg(boolean enabled, Map<String, Boolean> events) {
        var cfg = IntegrationSettings.criar(IntegrationSettings.INFOBIP_SMS);
        cfg.atualizar(enabled, "HWeld", 3, List.of("+5541999887766"), events, "teste");
        return cfg;
    }

    private IntegrationEvent evento(String tipo, Map<String, Object> payload) {
        return IntegrationEvent.of(tipo, "agg-1", payload, "corr-1");
    }

    @Test
    void gatilhoDesligadoNaoEnfileira() {
        when(settingsRepo.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg(false, Map.of())));
        handler.handle(evento(EventTypes.PAYMENT_CONFIRMED,
                Map.of("contatoTelefone", "41999887766")));
        verify(service, never()).queueSms(any(), any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void gatilhoLigadoEnfileiraComTelefoneDoPayload() {
        when(settingsRepo.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg(true, Map.of(EventTypes.PAYMENT_CONFIRMED, true))));

        handler.handle(evento(EventTypes.PAYMENT_CONFIRMED,
                Map.of("contatoTelefone", "41999887766", "pedidoId", 10L)));

        verify(service).queueSms(eq("sms_payment_confirmed"), eq("41999887766"),
                any(), anyString(), anyString(), eq(10L), eq(3));
    }

    @Test
    void semTelefoneNoPayloadResolveViaContatoId() {
        when(settingsRepo.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg(true, Map.of(EventTypes.ORDER_CREATED, true))));
        when(contatos.getContato(42L))
                .thenReturn(new ContatoGateway.ContatoNotificacao(42L, "c@x.com", "41991234567"));

        Map<String, Object> payload = new HashMap<>();
        payload.put("contatoId", 42L);
        payload.put("pedidoId", 7L);
        handler.handle(evento(EventTypes.ORDER_CREATED, payload));

        verify(contatos).getContato(42L);
        verify(service).queueSms(eq("sms_order_created"), eq("41991234567"),
                any(), anyString(), anyString(), eq(7L), eq(3));
    }

    @Test
    void contatoSemTelefonePula() {
        when(settingsRepo.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg(true, Map.of(EventTypes.ORDER_CREATED, true))));
        when(contatos.getContato(42L))
                .thenReturn(new ContatoGateway.ContatoNotificacao(42L, "c@x.com", null));

        handler.handle(evento(EventTypes.ORDER_CREATED, Map.of("contatoId", 42L)));
        verify(service, never()).queueSms(any(), any(), any(), any(), any(), any(), anyInt());
    }

    @Test
    void pagamentoConfirmadoSuprimeCobrancaPendente() {
        when(settingsRepo.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg(false, Map.of())));
        var pendente = mock(com.hweld.operations.notification.domain.NotificationDelivery.class);
        when(deliveries.findSmsSupprimable(10L, "sms_payment_requested"))
                .thenReturn(List.of(pendente));

        handler.handle(evento(EventTypes.PAYMENT_CONFIRMED, Map.of("pedidoId", 10L)));

        verify(pendente).markSuppressed(anyString());
        verify(deliveries).save(pendente);
    }

}
