import { readFile } from 'node:fs/promises';
import { build, context, transform } from 'esbuild';

const options = {
  entryPoints: ['frontend/ckeditor5.js'],
  bundle: true,
  format: 'iife',
  target: 'es2023',
  minify: true,
  outfile: 'assets/javascripts/ckeditor5.js',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  plugins: [{
    name: 'shadow-styles',
    setup(builder) {
      builder.onResolve({ filter: /\.css\?inline$/ }, async args => {
        const result = await builder.resolve(args.path.replace(/\?inline$/, ''), {
          resolveDir: args.resolveDir,
          kind: args.kind
        });
        return { ...result, namespace: 'shadow-styles' };
      });
      builder.onLoad({ filter: /./, namespace: 'shadow-styles' }, async args => {
        const css = await readFile(args.path, 'utf8');
        const { code } = await transform(css, { loader: 'css', target: 'es2023', minify: true });
        return { contents: code, loader: 'text', watchFiles: [args.path] };
      });
    }
  }]
};

if (process.argv.includes('--watch')) {
  const builder = await context(options);
  await builder.watch();
} else {
  await build(options);
}
