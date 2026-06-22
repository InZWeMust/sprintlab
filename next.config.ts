import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // TF.js needs these to be empty on server side
    if (isServer) {
      config.externals = [...(config.externals ?? []), '@tensorflow/tfjs', '@tensorflow/tfjs-backend-webgl', '@tensorflow-models/pose-detection'];
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
