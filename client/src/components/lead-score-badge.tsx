import { Badge } from "@/components/ui/badge";

interface LeadScoreBadgeProps {
  score: number | null | undefined;
  label: string | null | undefined;
  showScore?: boolean;  // whether to show the numeric score
  size?: "sm" | "default";
}

export function LeadScoreBadge({ score, label, showScore = false, size = "default" }: LeadScoreBadgeProps) {
  if (!label) return null;

  const colorMap: Record<string, string> = {
    High: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    Medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400",
    Low: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400",
  };

  const colors = colorMap[label] || colorMap.Low;
  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-0.5";

  return (
    <Badge variant="outline" className={`${colors} ${sizeClass} font-medium`}>
      {showScore ? `${label} (${score})` : label}
    </Badge>
  );
}
