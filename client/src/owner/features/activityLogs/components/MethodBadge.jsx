import { cn } from "@/shared/utils/cn";

const METHOD_CLASS = {
  GET: "bg-zinc-100 text-zinc-700 border-zinc-200",
  POST: "bg-green-50 text-green-700 border-green-200",
  PATCH: "bg-amber-50 text-amber-700 border-amber-200",
  PUT: "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-rose-50 text-rose-700 border-rose-200",
};

const MethodBadge = ({ method }) => (
  <span
    className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border",
      METHOD_CLASS[method] || METHOD_CLASS.GET,
    )}
  >
    {method}
  </span>
);

export default MethodBadge;
