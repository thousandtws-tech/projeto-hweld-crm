package com.hweld.operations.shared.application;

/** Catálogo de tipos de evento de integração emitidos/consumidos pelo serviço. */
public final class EventTypes {

    private EventTypes() {}

    // Inbound (Rust → Java, via /api/v1/internal/events)
    public static final String ORDER_CREATED = "OrderCreated";
    public static final String PAYMENT_REQUESTED = "PaymentRequested";

    // Payment module
    public static final String PAYMENT_CONFIRMED = "PaymentConfirmed";
    public static final String PAYMENT_FAILED = "PaymentFailed";
    public static final String PAYMENT_CANCELLED = "PaymentCancelled";
    public static final String REFUND_COMPLETED = "RefundCompleted";
    public static final String PAYMENT_EXPIRED = "PaymentExpired";

    // Billing module
    public static final String INVOICE_ISSUED = "InvoiceIssued";
    public static final String INVOICE_PAID = "InvoicePaid";
    public static final String INVOICE_OVERDUE = "InvoiceOverdue";
    public static final String INVOICE_CANCELLED = "InvoiceCancelled";

    // Fiscal module
    public static final String FISCAL_DOC_REQUESTED = "FiscalDocumentRequested";
    public static final String INVOICE_AUTHORIZED = "InvoiceAuthorized";
    public static final String INVOICE_REJECTED = "InvoiceRejected";
    public static final String INVOICE_FISCAL_CANCELLED = "FiscalDocumentCancelled";

    // Notification module
    public static final String NOTIFICATION_SENT = "NotificationSent";
    public static final String NOTIFICATION_FAILED = "NotificationFailed";
}
