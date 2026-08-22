import { useState, useEffect } from "react";
import SelectField from "@/shared/components/ui/select/SelectField";
import Input from "@/shared/components/ui/input/Input";
import { cn } from "@/shared/utils/cn";

const RANGE_OPTIONS = [
  { value: "today", label: "Bugun" },
  { value: "this_week", label: "Bu hafta" },
  { value: "prev_week", label: "O'tgan hafta" },
  { value: "next_week", label: "Kelasi hafta" },
  { value: "custom", label: "Maxsus davr" }
];

export const getRangeDates = (range, customFrom, customTo) => {
  const t = new Date();
  t.setHours(0,0,0,0);
  const day = t.getDay();
  const diffToMon = t.getDate() - day + (day === 0 ? -6 : 1);
  const thisMon = new Date(t);
  thisMon.setDate(diffToMon);
  
  if (range === "today") return { from: t, to: t };
  if (range === "this_week") {
    const end = new Date(thisMon);
    end.setDate(thisMon.getDate() + 6);
    return { from: thisMon, to: end };
  }
  if (range === "prev_week") {
    const start = new Date(thisMon);
    start.setDate(thisMon.getDate() - 7);
    const end = new Date(thisMon);
    end.setDate(thisMon.getDate() - 1);
    return { from: start, to: end };
  }
  if (range === "next_week") {
    const start = new Date(thisMon);
    start.setDate(thisMon.getDate() + 7);
    const end = new Date(thisMon);
    end.setDate(thisMon.getDate() + 13);
    return { from: start, to: end };
  }
  if (range === "custom") {
    return { 
      from: customFrom ? new Date(customFrom) : undefined, 
      to: customTo ? new Date(customTo) : undefined 
    };
  }
  return {};
};

const RoomDateFilter = ({ onChange, className }) => {
  const [range, setRange] = useState("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    onChange(getRangeDates(range, customFrom, customTo));
  }, [range, customFrom, customTo]);

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="w-40">
        <SelectField
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          className="!gap-1"
        />
      </div>
      {range === "custom" && (
        <>
          <Input 
            type="date" 
            value={customFrom} 
            onChange={(e) => setCustomFrom(e.target.value)} 
            className="w-36"
          />
          <span className="text-muted-foreground">—</span>
          <Input 
            type="date" 
            value={customTo} 
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-36"
          />
        </>
      )}
    </div>
  );
};

export default RoomDateFilter;
