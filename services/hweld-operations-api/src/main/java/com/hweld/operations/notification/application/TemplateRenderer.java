package com.hweld.operations.notification.application;

import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Render simples `{{variavel}}` — sem engine pesada; valores escapados para HTML. */
@Component
public class TemplateRenderer {

    private static final Pattern VAR = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*}}");

    public String render(String template, Map<String, Object> vars, boolean html) {
        return VAR.matcher(template).replaceAll(m -> {
            Object v = vars.get(m.group(1));
            String s = v == null ? "" : v.toString();
            return java.util.regex.Matcher.quoteReplacement(html ? escapeHtml(s) : s);
        });
    }

    private static String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
