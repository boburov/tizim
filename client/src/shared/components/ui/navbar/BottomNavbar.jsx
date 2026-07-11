// Utils
import { cn } from "@/shared/utils/cn";

// Router
import { NavLink } from "react-router-dom";

// Icons
import { Home, User, Coins } from "lucide-react";

const BottomNavbar = () => {
  const navItems = [
    { path: "/dashboard", label: "Asosiy", icon: Home },
    { path: "/transactions", label: "Tangalar", icon: Coins },
    { path: "/profile", label: "Profil", icon: User },
  ];

  return (
    <div className="fixed top-auto inset-0 z-20 flex justify-center pb-4">
      <div className="container">
        <nav className="bottom-navigation flex items-center gap-1 p-1 rounded-full bg-white xs:p-1.5">
          {navItems.map((nav) => (
            <NavLink
              to={nav.path}
              key={nav.path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center relative w-full h-12 rounded-full transition-all duration-300 xs:h-14",
                  isActive
                    ? "bg-blue-100 text-blue-600"
                    : "text-gray-500 hover:bg-white/40 hover:text-gray-900",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <nav.icon
                    size={20}
                    strokeWidth={isActive ? 2 : 1.5}
                    className="size-5 mb-0.5 xs:mb-1"
                  />

                  <span
                    className={cn(
                      isActive ? "font-bold xs:font-semibold" : "font-medium",
                      "text-[10px] xs:text-xs",
                    )}
                  >
                    {nav.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default BottomNavbar;
