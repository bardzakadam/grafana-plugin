import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = (env: Record<string, any>): Configuration => ({
  mode: env.production ? 'production' : 'development',
  devtool: env.production ? 'source-map' : 'eval-source-map',
  entry: './src/module.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'module.js',
    library: {
      type: 'amd',
    },
    clean: true,
  },
  externals: [
    'react',
    'react-dom',
    '@grafana/data',
    '@grafana/ui',
    '@grafana/runtime',
    '@grafana/schema',
    'rxjs',
    function ({ request }: any, callback: any) {
      if (request && /^rxjs\/operators/.test(request)) {
        return callback(null, request);
      }
      callback();
    },
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              transform: {
                react: {
                  runtime: 'automatic',
                },
              },
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/plugin.json', to: '.' },
        { from: 'src/img', to: 'img', noErrorOnMissing: true },
      ],
    }),
  ],
});

export default config;
