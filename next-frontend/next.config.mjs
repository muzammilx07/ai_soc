/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: "memory",
      };
    }
    return config;
  },
};

export default nextConfig;