import { cn } from "@/shared/utils/cn";

// Umumiy yuklash bloki (shimmer)
const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse rounded-md bg-muted", className)} />
);

export default Skeleton;
