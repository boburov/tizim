// Router
import { Outlet } from "react-router-dom";

// Components
import BrandMark from "@/shared/components/brand/BrandMark";

// Constants
import { APP_NAME } from "@/shared/constants/app";

const AuthLayout = () => (
  <div className="min-h-svh flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md">
      {/* Brand */}
      <div className="flex flex-col items-center text-center mb-8 animate__animated animate__fadeInUp">
        {/* Logo */}
        <BrandMark className="mb-4" />

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Tizimga kirish
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground text-balance">
          {APP_NAME} o'quv markazi tizimiga kirish
        </p>
      </div>

      {/* Content */}
      <Outlet />
    </div>
  </div>
);

export default AuthLayout;
