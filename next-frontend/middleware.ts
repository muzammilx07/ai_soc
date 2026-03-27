export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/cases/:path*", "/alerts/:path*", "/playbooks/:path*"],
};
