package com.hweld.operations.notification.infrastructure;

import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.application.SmsProvider;
import com.hweld.operations.notification.infrastructure.infobip.InfobipSmsProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Component
@Primary
public class SmsProviderRouter implements SmsProvider {

    private final NotificationService.Props props;
    private final LogSmsProvider log;
    private final InfobipSmsProvider infobip;

    public SmsProviderRouter(NotificationService.Props props,
            LogSmsProvider log, InfobipSmsProvider infobip) {
        this.props = props;
        this.log = log;
        this.infobip = infobip;
    }

    private SmsProvider delegate() {
        return switch (props.smsProvider() == null ? "auto" : props.smsProvider()) {
            case "infobip" -> infobip;
            case "log" -> log;
            default -> infobip.configured() ? infobip : log; // auto
        };
    }

    @Override
    public String name() {
        return delegate().name();
    }

    @Override
    public SmsReceipt send(String to, String text) {
        return delegate().send(to, text);
    }

    @Override
    public ConnectionTest testConnection() {
        return delegate().testConnection();
    }
}
