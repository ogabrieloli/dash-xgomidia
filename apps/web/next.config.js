/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@xgo/shared-types'],
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

module.exports = nextConfig
