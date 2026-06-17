import type { SelectHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  leadingIcon?: ReactNode;
  invalid?: boolean;
  block?: boolean;
  /** Force LTR text direction. Useful for numeric selects (year, month, etc.). */
  forceLtr?: boolean;
}

export function Select({
  leadingIcon,
  invalid,
  block = true,
  forceLtr = false,
  className = "",
  children,
  ...rest
}: SelectProps): JSX.Element {
  const wrapperState = invalid
    ? "border-maroon focus-within:border-maroon"
    : "border-border hover:border-border-strong focus-within:border-palm focus-within:shadow-focus";

  return (
    <span
      className={`group relative flex h-11 items-center border bg-paper transition-colors duration-180 ease-out-expo ${wrapperState} ${
        block ? "w-full" : ""
      } ${className}`}
    >
      {leadingIcon && (
        <span className="pointer-events-none flex h-full w-10 shrink-0 items-center justify-center text-ink-soft">
          {leadingIcon}
        </span>
      )}
      <select
        dir={forceLtr ? "ltr" : undefined}
        className={`h-full w-full min-w-0 appearance-none bg-transparent text-center pe-9 ps-3.5 text-[14px] text-ink focus:outline-none ${
          forceLtr ? "" : "pe-9"
        } ${leadingIcon ? "" : ""}`}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 h-4 w-4 text-ink-soft"
        aria-hidden="true"
      />
    </span>
  );
}
