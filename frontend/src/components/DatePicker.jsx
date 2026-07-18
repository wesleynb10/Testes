import React, { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseIso(value) {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/**
 * Date picker that always opens a calendar popover.
 * Native <input type="date"> often hides the picker icon on dark themes
 * and only opens when clicking a tiny indicator — this replaces that UX.
 */
export function DatePicker({
  value = "",
  onChange,
  placeholder = "Escolher data",
  className,
  "data-testid": testId,
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn("input-premium flex items-center gap-2 text-left", className)}
          style={{ cursor: "pointer" }}
        >
          <CalendarIcon className="w-4 h-4 shrink-0" style={{ color: "var(--gold-bright)" }} />
          <span
            className="flex-1 truncate"
            style={{ color: selected ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            {selected
              ? format(selected, "dd MMM yyyy", { locale: ptBR })
              : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        style={{
          background: "var(--ink-elevated, #14121a)",
          border: "1px solid var(--ink-line)",
          color: "var(--text-primary)",
        }}
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            onChange?.(day ? format(day, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          initialFocus
          locale={ptBR}
        />
        {value ? (
          <div className="px-3 pb-3">
            <button
              type="button"
              className="text-[12px] w-full text-center py-1.5 rounded-md"
              style={{ color: "var(--text-muted)" }}
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
            >
              Limpar prazo
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
