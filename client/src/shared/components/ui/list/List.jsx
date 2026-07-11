import { Link } from "react-router-dom";
import { cn } from "@/shared/utils/cn";

const List = ({ items = [], className = "", itemClassName = "", getKey }) => {
  return (
    <div className={cn("space-y-1", className)}>
      {items.map((item, index) => (
        <ListItem
          key={
            getKey
              ? getKey(item, index)
              : item.key || item.to || item.title || index
          }
          className={cn(
            itemClassName,
            index === 0 && "rounded-t-sm",
            index === items.length - 1 && "rounded-b-sm",
            item.className,
          )}
          title={item.title}
          description={item.description}
          icon={item.icon}
          gradientFrom={item.gradientFrom}
          gradientTo={item.gradientTo}
          iconClassName={item.iconClassName}
          to={item.to}
          onClick={item.onClick}
          disabled={item.disabled}
          trailing={item.trailing}
          subContent={item.subContent}
        />
      ))}
    </div>
  );
};

const ListItem = ({
  title,
  description,
  icon: Icon,
  to,
  onClick,
  className = "",
  gradientFrom = "from-gray-300",
  gradientTo = "to-gray-500",
  disabled = false,
  trailing,
  subContent,
}) => {
  const baseStyles =
    "flex flex-col gap-2 p-3.5 bg-white rounded-none border border-transparent transition-all xs:gap-3 xs:p-4";
  const interactiveStyles = "active:scale-[0.98]";
  const disabledStyles = "opacity-50 cursor-not-allowed";

  const content = (
    <>
      {/* Main content */}
      <div className="flex items-center gap-3.5 xs:gap-4">
        {/* Icon */}
        {Icon && (
          <div
            className={cn(
              "size-9 rounded-[2px] flex items-center justify-center flex-shrink-0 bg-gradient-to-br xs:size-12",
              gradientFrom,
              gradientTo,
            )}
          >
            <Icon
              strokeWidth={1.5}
              className={cn("size-5 text-white xs:size-6")}
            />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 line-clamp-2">{description}</p>
          )}
        </div>

        {/* Trailing */}
        {trailing && <div className="flex-shrink-0 ml-2">{trailing}</div>}
      </div>

      {/* Sub content */}
      {subContent && subContent}
    </>
  );

  // Link variant
  if (to) {
    return (
      <Link to={to} className={cn(baseStyles, interactiveStyles, className)}>
        {content}
      </Link>
    );
  }

  // Button variant
  if (onClick) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          baseStyles,
          !disabled && interactiveStyles,
          disabled && disabledStyles,
          "w-full text-left",
          className,
        )}
      >
        {content}
      </button>
    );
  }

  // Static div variant
  return <div className={cn(baseStyles, className)}>{content}</div>;
};

export { ListItem };
export default List;
