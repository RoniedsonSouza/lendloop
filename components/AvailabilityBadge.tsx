import { Badge } from "./ui";
import { formatDay } from "@/lib/format";

type Availability = { state: "available" } | { state: "on_loan" | "overdue"; until: string };

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability.state === "available") return <Badge tone="green">Available</Badge>;
  if (availability.state === "overdue") return <Badge tone="red">Overdue since {formatDay(availability.until)}</Badge>;
  return <Badge tone="amber">On loan · back {formatDay(availability.until)}</Badge>;
}
