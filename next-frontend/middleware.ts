export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/instances/:path*",
    "/dashboard/:path*",
    "/live-events/:path*",
    "/alerts/:path*",
    "/incidents/:path*",
    "/log-tools/:path*",
    "/system-status/:path*",
    "/cases/:path*",
    "/playbooks/:path*",
    "/threat-report/:path*",
    "/ml-analytics/:path*",
  ],
};
