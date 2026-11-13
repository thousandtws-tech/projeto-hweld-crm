import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { format, isValid, parseISO } from "date-fns";

/** Campo de data MUI — contrato de string "yyyy-MM-dd" (mesmo formato da API). */
export function DateField({
  value,
  onChange,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <DatePicker
      value={value && isValid(parseISO(value)) ? parseISO(value) : null}
      onChange={(d) => onChange(d && isValid(d) ? format(d, "yyyy-MM-dd") : "")}
      disabled={disabled}
      format="dd/MM/yyyy"
      slotProps={{
        textField: { size: "small", fullWidth: true, required },
        field: { clearable: true },
      }}
    />
  );
}

/** Data+hora MUI — contrato "yyyy-MM-dd'T'HH:mm" (formato datetime-local da API). */
export function DateTimeField({
  value,
  onChange,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <DateTimePicker
      value={value && isValid(parseISO(value)) ? parseISO(value) : null}
      onChange={(d) => onChange(d && isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : "")}
      disabled={disabled}
      format="dd/MM/yyyy HH:mm"
      ampm={false}
      slotProps={{
        textField: { size: "small", fullWidth: true, required },
        field: { clearable: true },
      }}
    />
  );
}
