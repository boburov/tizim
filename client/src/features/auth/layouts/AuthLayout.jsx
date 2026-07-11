// Router
import { Outlet } from "react-router-dom";

// Constants
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

const AuthLayout = () => (
  <div className="min-h-svh flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md">
      {/* Brand */}
      <div className="flex flex-col mb-8 animate__animated animate__fadeInUp xs:items-center">
        {/* Logo */}
        <img
          width={56}
          alt="Logo"
          height={56}
          src={APP_LOGO}
          className="size-14 mb-4"
        />

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Tizimga kirish
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {APP_NAME} o'quv markazi tizimiga kirish
        </p>
      </div>

      {/* Content */}
      <Outlet />
    </div>
  </div>
);

export default AuthLayout;
