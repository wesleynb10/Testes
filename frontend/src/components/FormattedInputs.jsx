import React, { forwardRef, useEffect, useRef, useState } from "react";
import {
  formatIntInput,
  formatMoneyInput,
  formatPctInput,
  parseNum,
} from "@/lib/format";

/**
 * Input com máscara pt-BR. Mantém rascunho local enquanto focado
 * para não perder vírgula/zeros intermediários.
 */
function useMaskedValue(value, format) {
  const focused = useRef(false);
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, format]);

  return {
    text,
    setText,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: (commit) => {
      focused.current = false;
      const next = format(commit);
      setText(next);
      return next;
    },
  };
}

function AffixWrap({ prefix, suffix, children }) {
  return (
    <div className="relative">
      {prefix ? (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none font-mono-num"
          style={{ color: "var(--text-muted)" }}
        >
          {prefix}
        </span>
      ) : null}
      {children}
      {suffix ? (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
          style={{ color: "var(--text-muted)" }}
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function padClass(prefix, suffix, className = "") {
  return ["input-premium font-mono-num", className].filter(Boolean).join(" ");
}

// `.input-premium` usa `padding` (shorthand) no CSS, que vence as utilities
// pl-*/pr-* do Tailwind — o texto digitado ficava por cima do "R$"/"%".
// Inline style garante o espaço reservado para o afixo.
function padStyle(prefix, suffix, style) {
  const next = { ...style };
  if (prefix) next.paddingLeft = `${12 + String(prefix).length * 9 + 6}px`;
  if (suffix) next.paddingRight = `${12 + String(suffix).length * 9 + 6}px`;
  return next;
}

/** Dinheiro: exibe 10.000 / 10.000,50 · prefixo R$ */
export const MoneyInput = forwardRef(function MoneyInput(
  {
    value,
    onChange,
    onValueChange,
    prefix = "R$",
    className = "",
    style,
    ...rest
  },
  ref
) {
  const mask = useMaskedValue(value, formatMoneyInput);
  return (
    <AffixWrap prefix={prefix}>
      <input
        {...rest}
        ref={ref}
        inputMode="decimal"
        className={padClass(prefix, null, className)}
        style={padStyle(prefix, null, style)}
        value={mask.text}
        onFocus={mask.onFocus}
        onBlur={() => {
          const next = mask.onBlur(parseNum(mask.text));
          onChange?.(next);
          onValueChange?.(parseNum(next));
        }}
        onChange={(e) => {
          const next = formatMoneyInput(e.target.value);
          mask.setText(next);
          onChange?.(next);
          onValueChange?.(parseNum(next));
        }}
      />
    </AffixWrap>
  );
});

/** Percentual: 2,5 · sufixo % */
export function PctInput({
  value,
  onChange,
  onValueChange,
  suffix = "%",
  className = "",
  style,
  ...rest
}) {
  const mask = useMaskedValue(value, formatPctInput);
  return (
    <AffixWrap suffix={suffix}>
      <input
        {...rest}
        inputMode="decimal"
        className={padClass(null, suffix, className)}
        style={padStyle(null, suffix, style)}
        value={mask.text}
        onFocus={mask.onFocus}
        onBlur={() => {
          const next = mask.onBlur(parseNum(mask.text));
          onChange?.(next);
          onValueChange?.(parseNum(next));
        }}
        onChange={(e) => {
          const next = formatPctInput(e.target.value);
          mask.setText(next);
          onChange?.(next);
          onValueChange?.(parseNum(next));
        }}
      />
    </AffixWrap>
  );
}

/** Inteiro (prazo em meses, etc.) */
export function IntInput({
  value,
  onChange,
  onValueChange,
  suffix,
  className = "",
  style,
  ...rest
}) {
  const mask = useMaskedValue(value, formatIntInput);
  return (
    <AffixWrap suffix={suffix}>
      <input
        {...rest}
        inputMode="numeric"
        className={padClass(null, suffix, className)}
        style={padStyle(null, suffix, style)}
        value={mask.text}
        onFocus={mask.onFocus}
        onBlur={() => {
          const next = mask.onBlur(parseNum(mask.text));
          onChange?.(next);
          onValueChange?.(Math.max(0, Math.round(parseNum(next))));
        }}
        onChange={(e) => {
          const next = formatIntInput(e.target.value);
          mask.setText(next);
          onChange?.(next);
          onValueChange?.(Math.max(0, Math.round(parseNum(next))));
        }}
      />
    </AffixWrap>
  );
}
