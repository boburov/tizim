// Components
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/shadcn/tabs";

const TabsButtons = ({
  items = [],
  value,
  defaultValue,
  onChange,
  className = "",
  listClassName = "",
  triggerClassName = "",
  contentClassName = "",
}) => {
  if (!items.length) return null;

  const hasContent = items.some((item) => item.content !== undefined);
  const initial = defaultValue ?? items[0]?.value;

  return (
    <Tabs
      value={value}
      defaultValue={initial}
      onValueChange={onChange}
      className={className}
    >
      <TabsList className={listClassName}>
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={triggerClassName}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {hasContent &&
        items.map((item) => (
          <TabsContent
            key={item.value}
            value={item.value}
            className={contentClassName}
          >
            {item.content}
          </TabsContent>
        ))}
    </Tabs>
  );
};

export default TabsButtons;
