/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_BACKEND_URL
    if (target && target.trim()) {
      const base = target.replace(/\/$/, '')
      return [
        {
          source: '/api/:path((?!stripe).*)',
          destination: `${base}/api/:path*`,
        },
      ]
    }
    return []
  },
}

export default nextConfig
