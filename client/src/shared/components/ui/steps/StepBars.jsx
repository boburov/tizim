// Utils
import { cn } from "@/shared/utils/cn";

const StepBars = ({
  totalSteps = 0,
  currentStep = 1,
  activeClassName = "bg-blue-500",
  inactiveClassName = "bg-gray-100",
  className = "",
}) => {
  const currentNumber =
    typeof currentStep === "number" ? currentStep : currentStep?.number || 1;
  const steps = Math.max(Number(totalSteps) || 0, 0);

  return (
    <div className={cn("flex items-center gap-1.5 w-full h-1.5", className)}>
      {Array.from({ length: steps }).map((_, index) => (
        <div
          key={index}
          className={cn(
            index + 1 <= currentNumber ? activeClassName : inactiveClassName,
            "size-full",
          )}
        />
      ))}
    </div>
  );
};

export default StepBars;
