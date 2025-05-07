import type { NextConfig } from "next";
import TerserPlugin from "terser-webpack-plugin";

const nextConfig: NextConfig = {
  /* config options here */
  webpack(config, { isServer, dev }) {
    config.module.rules.push({
      test: /\.worker\.ts$/,
      use: {
        loader: "worker-loader",
        options: {
          filename: "static/[name].[hash].js",
        },
      },
    });

    if (!dev && isServer) {
      config.optimization.minimizer = config.optimization.minimizer || [];
      config.optimization.minimizer.push(
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // ✅ remove all console.*
            },
          },
        })
      );
    }
    return config;
  },
};

export default nextConfig;
