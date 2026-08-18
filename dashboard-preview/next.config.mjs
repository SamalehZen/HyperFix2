/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/preview",
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/mix2",
        permanent: false,
      },
      {
        source: "/mix2",
        destination: "/dashboard/mix2",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
