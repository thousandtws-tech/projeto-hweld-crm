package com.hweld.operations.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.notification.application.EmailProvider;
import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.application.SmsProvider;
import com.hweld.operations.notification.application.TemplateRenderer;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.domain.NotificationTemplate;
import com.hweld.operations.notification.domain.NotificationTemplateRepository;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class NotificationServiceTest {

    private NotificationTemplateRepository templates;
    private NotificationDeliveryRepository deliveries;
    private EmailProvider emailProvider;
    private Outbox outbox;
    private NotificationService service;
    private NotificationService.Props props;

    @BeforeEach
    void setUp() {
        templates = mock(NotificationTemplateRepository.class);
        deliveries = mock(NotificationDeliveryRepository.class);
        emailProvider = mock(EmailProvider.class);
        outbox = mock(Outbox.class);
        props = new NotificationService.Props("log", "log", 3, 1000, 0, "noreply@x", "HWeld");
        var integrations = mock(IntegrationSettingsRepository.class);
        when(integrations.findById(any())).thenReturn(Optional.empty());
        service = new NotificationService(templates, deliveries, integrations,
                new TemplateRenderer(), emailProvider, mock(SmsProvider.class),
                mock(com.hweld.operations.notification.infrastructure.zapi.ZapiWhatsAppProvider.class),
                outbox, props);
    }

    private NotificationTemplate template() {
        NotificationTemplate t = mock(NotificationTemplate.class);
        when(t.getSubject()).thenReturn("Pedido {{pedidoNumero}}");
        when(t.getBodyHtml()).thenReturn("<p>Pague R$ {{amount}} — {{pixCopyPaste}}</p>");
        when(t.getBodyText()).thenReturn("Pague {{amount}}");
        return t;
    }

    @Test
    void enfileiraComTemplateRenderizado() {
        var t = template();
        when(templates.findByCodeAndActiveTrue("payment_requested")).thenReturn(Optional.of(t));

        NotificationDelivery d = service.queue("payment_requested", "c@x.com",
                Map.of("pedidoNumero", "PV-1", "amount", "10.00", "pixCopyPaste", "<script>x</script>"));

        assertThat(d.getSubject()).isEqualTo("Pedido PV-1");
        // HTML escapado — injeção de template não passa
        assertThat((String) d.getPayload().get("html")).contains("&lt;script&gt;");
        verify(deliveries).save(d);
    }

    @Test
    void envioOkMarcaSent() {
        var t = template();
        when(templates.findByCodeAndActiveTrue("t")).thenReturn(Optional.of(t));
        NotificationDelivery d = service.queue("t", "c@x.com", Map.of("pedidoNumero", "1", "amount", "1"));
        when(deliveries.findDispatchable(any(), any())).thenReturn(List.of(d));

        service.dispatchDue();

        assertThat(d.getStatus()).isEqualTo("SENT");
        verify(emailProvider).send(any(), any(), any(), any());
    }

    @Test
    void falhaDeEnvioAgendaRetryEDepoisDead() {
        var t = template();
        when(templates.findByCodeAndActiveTrue("t")).thenReturn(Optional.of(t));
        NotificationDelivery d = service.queue("t", "c@x.com", Map.of());
        when(deliveries.findDispatchable(any(), any())).thenReturn(List.of(d));
        doThrow(new EmailProvider.EmailSendException("smtp down"))
                .when(emailProvider).send(any(), any(), any(), any());

        // 3 falhas (maxAttempts=3) → DEAD
        service.dispatchDue();
        service.dispatchDue();
        service.dispatchDue();

        assertThat(d.getStatus()).isEqualTo("DEAD");
        assertThat(d.getAttempts()).isEqualTo(3);
    }
}
