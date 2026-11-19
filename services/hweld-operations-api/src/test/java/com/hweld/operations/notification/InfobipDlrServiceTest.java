package com.hweld.operations.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.notification.application.InfobipDlrService;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDelivery.Status;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.ObjectMapper;

/** DLR autenticado por segredo de path — lote, duplicado, fora de ordem, sem correlação. */
class InfobipDlrServiceTest {

    private static final String SECRET = "segredo-dlr";

    private NotificationDeliveryRepository deliveries;
    private IntegrationSettingsRepository settings;
    private CredentialCipher cipher;
    private InfobipDlrService service;

    @BeforeEach
    void setUp() {
        deliveries = mock(NotificationDeliveryRepository.class);
        settings = mock(IntegrationSettingsRepository.class);
        cipher = new CredentialCipher(new MockEnvironment()
                .withProperty("hweld.security.jwt-secret", "segredo-teste-com-32-caracteres!!"));
        IntegrationSettings cfg = IntegrationSettings.criar(IntegrationSettings.INFOBIP_SMS);
        cfg.definirWebhookSecret(cipher.encrypt(SECRET));
        when(settings.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(cfg));
        service = new InfobipDlrService(deliveries, settings, cipher, new ObjectMapper());
    }

    private NotificationDelivery deliveryComMessageId(String messageId) {
        NotificationDelivery d = new NotificationDelivery("sms_test", "+5541", "SMS", Map.of());
        d.asSms(null, null, null);
        d.recordSegments(1);
        d.applySmsReceipt(messageId, "bulk-1", 1);
        return d;
    }

    private String lote(String messageId, int groupId, String name) {
        return "{\"results\":[{\"bulkId\":\"b1\",\"messageId\":\"" + messageId
                + "\",\"status\":{\"groupId\":" + groupId
                + ",\"groupName\":\"G\",\"name\":\"" + name + "\"}}]}";
    }

    @Test
    void rejeitaSegredoInvalidoSemTocarEmEntregas() {
        var out = service.process(lote("m1", 3, "DELIVERED_TO_HANDSET"), "errado");
        assertThat(out.result()).isEqualTo(InfobipDlrService.Result.UNAUTHORIZED);
        verify(deliveries, never()).save(any());
    }

    @Test
    void rejeitaSemSegredoConfigurado() {
        var settingsVazio = mock(IntegrationSettingsRepository.class);
        when(settingsVazio.findById(IntegrationSettings.INFOBIP_SMS))
                .thenReturn(Optional.of(IntegrationSettings.criar(IntegrationSettings.INFOBIP_SMS)));
        var svc = new InfobipDlrService(deliveries, settingsVazio, cipher, new ObjectMapper());
        var out = svc.process(lote("m1", 3, "DELIVERED"), SECRET);
        assertThat(out.result()).isEqualTo(InfobipDlrService.Result.UNCONFIGURED);
    }

    @Test
    void deliveredAtualizaEntrega() {
        var d = deliveryComMessageId("m-1");
        when(deliveries.findByMessageId("m-1")).thenReturn(Optional.of(d));

        var out = service.process(lote("m-1", 3, "DELIVERED_TO_HANDSET"), SECRET);

        assertThat(out.result()).isEqualTo(InfobipDlrService.Result.PROCESSED);
        assertThat(out.matched()).isEqualTo(1);
        assertThat(d.getStatus()).isEqualTo(Status.DELIVERED.name());
        assertThat(d.getDeliveredAt()).isNotNull();
        assertThat(d.getDlr()).hasSize(1);
    }

    @Test
    void dlrForaDeOrdemNaoRebaixaEntregue() {
        var d = deliveryComMessageId("m-2");
        when(deliveries.findByMessageId("m-2")).thenReturn(Optional.of(d));

        service.process(lote("m-2", 3, "DELIVERED"), SECRET);
        // REJECTED tardio NÃO rebaixa DELIVERED
        var out = service.process(lote("m-2", 5, "REJECTED"), SECRET);

        assertThat(d.getStatus()).isEqualTo(Status.DELIVERED.name());
        assertThat(d.getDlr()).hasSize(2); // relatório preservado
        assertThat(out.matched()).isEqualTo(1);
    }

    @Test
    void reportSemCorrelacaoContaSemFalharLote() {
        when(deliveries.findByMessageId(any())).thenReturn(Optional.empty());
        var out = service.process(lote("desconhecido", 3, "DELIVERED"), SECRET);
        assertThat(out.result()).isEqualTo(InfobipDlrService.Result.PROCESSED);
        assertThat(out.matched()).isEqualTo(0);
        assertThat(out.unmatched()).isEqualTo(1);
    }

    @Test
    void groupIdsMapeiamCorreto() {
        var pendentes = deliveryComMessageId("p1");
        var falha = deliveryComMessageId("p2");
        var expirado = deliveryComMessageId("p3");
        when(deliveries.findByMessageId("p1")).thenReturn(Optional.of(pendentes));
        when(deliveries.findByMessageId("p2")).thenReturn(Optional.of(falha));
        when(deliveries.findByMessageId("p3")).thenReturn(Optional.of(expirado));

        service.process(lote("p1", 1, "PENDING_ACCEPTED"), SECRET);
        service.process(lote("p2", 5, "REJECTED"), SECRET);
        service.process(lote("p3", 4, "EXPIRED"), SECRET);

        assertThat(pendentes.getStatus()).isEqualTo(Status.ACCEPTED.name());
        assertThat(falha.getStatus()).isEqualTo(Status.FAILED.name());
        assertThat(expirado.getStatus()).isEqualTo(Status.EXPIRED.name());
    }
}
