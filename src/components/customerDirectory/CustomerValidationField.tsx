import type { CustomerFieldError, CustomerProfileSection } from "../../utils/customerDirectoryValidation";
import { CD, cdInput, cdInputInvalid } from "./customerDirectoryStyles";

export function CustomerValidationBanner({ errors }: { errors: readonly CustomerFieldError[] }) {
  const sectionErrors = errors.filter((e) => e.field === "_section");
  if (sectionErrors.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-2 rounded-lg border border-red-300/60 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
    >
      {sectionErrors.map((e) => (
        <p key={`${e.section}-${e.message}`}>{e.message}</p>
      ))}
    </div>
  );
}

export function fieldInputClass(invalid: boolean): string {
  return `w-full text-xs ${cdInput}${invalid ? ` ${cdInputInvalid}` : ""}`;
}

export function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-0.5 text-[10px] font-medium text-red-600 dark:text-red-300">{message}</p>;
}

export function SectionErrorHint({
  errors,
  section,
}: {
  errors: readonly CustomerFieldError[];
  section: CustomerProfileSection;
}) {
  const count = errors.filter((e) => e.section === section && e.field !== "_section").length;
  if (!count) return null;
  return (
    <span className={`text-[10px] font-semibold ${CD.muted} text-red-600 dark:text-red-300`}>
      {count} lỗi
    </span>
  );
}
