import { Check, X } from "lucide-react";

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
  ];

  const strength = checks.filter((c) => c.met).length;

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              strength >= level
                ? strength <= 1
                  ? "bg-red-500"
                  : strength <= 2
                    ? "bg-orange-500"
                    : strength <= 3
                      ? "bg-yellow-500"
                      : "bg-green-500"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            {check.met ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
