import type { InputHTMLAttributes, ReactNode } from "react";

type InputSize = "md" | "lg";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  invalid?: boolean;
  /** "lg" is the default form-control height (44 px). "md" is 40 px. */
  size?: InputSize;
  block?: boolean;
}

const SIZE = {
  md: "h-10 text-[13.5px] rounded-md",
  lg: "h-11 text-[14px] rounded-md",
};

export function Input({
  leadingIcon,
  trailingIcon,
  invalid,
  size = "lg",
  block = true,
  className = "",
  ...rest
}: InputProps): JSX.Element {
  const wrapperBase =
    "group relative flex items-center " +
    "border bg-paper transition-colors duration-180 ease-out-expo " +
    "focus-within:border-palm focus-within:bg-paper " +
    "focus-within:shadow-focus";
  const wrapperState = invalid
    ? "border-maroon focus-within:border-maroon focus-within:shadow-[0_0_0_3px_rgba(122,46,46,0.22)]"
    : "border-border hover:border-border-strong";

  return (
    <span
      className={`${wrapperBase} ${wrapperState} ${SIZE[size]} ${
        block ? "w-full" : ""
      } ${className}`}
    >
      {leadingIcon && (
        <span className="pointer-events-none flex h-full w-10 shrink-0 items-center justify-center text-ink-soft">
          {leadingIcon}
        </span>
      )}
      <input
        className={`h-full w-full min-w-0 bg-transparent text-ink placeholder:text-ink-soft focus:outline-none ${
          leadingIcon ? "pe-3 ps-0" : "px-3.5"
        }`}
        {...rest}
      />
      {trailingIcon && (
        <span className="flex h-full w-9 shrink-0 items-center justify-center text-ink-soft">
          {trailingIcon}
        </span>
      )}
    </span>
  );
}
