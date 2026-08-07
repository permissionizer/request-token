// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default [
  {
    input: 'src/main.ts',
    output: {
      esModule: true,
      file: 'dist/main.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true, extensions: ['.js', '.ts'] }),
      commonjs(),
      terser()
    ]
  },
  {
    input: 'src/post.ts',
    output: {
      esModule: true,
      file: 'dist/post.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true, extensions: ['.js', '.ts'] }),
      commonjs(),
      terser()
    ]
  }
]
