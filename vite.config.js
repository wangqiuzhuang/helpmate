import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

const isApp = process.env.UNI_PLATFORM === 'app';

// App 端产物是单文件 IIFE,不支持代码分割;腾讯云开发 SDK 内部有几处动态 import:
//   - Node 适配器(jsonwebtoken / signature-nodejs):App 端用不到 → 直接拒绝
//   - oauth 里的 encrypt 工具 → 改为静态引入
const cloudbaseNoDynamicImport = () => ({
  name: 'krstuast:cloudbase-no-dynamic-import',
  enforce: 'pre',
  transform(code, id) {
    if (!isApp || !/@cloudbase[\\/]/.test(id) || code.indexOf('import(') < 0) return null;
    let out = code
      .replace(/import\(\s*['"]jsonwebtoken['"]\s*\)/g, "Promise.reject(new Error('node only'))")
      .replace(/import\(\s*['"]@cloudbase\/signature-nodejs['"]\s*\)/g, "Promise.reject(new Error('node only'))");
    let n = 0;
    const hoisted = [];
    out = out.replace(/import\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g, (m, q, spec) => {
      const name = `__cb_dyn_${n++}`;
      hoisted.push(`import * as ${name} from '${spec}';`);
      return `Promise.resolve(${name})`;
    });
    return { code: hoisted.join('\n') + '\n' + out, map: null };
  },
});

export default defineConfig({
  plugins: [cloudbaseNoDynamicImport(), uni()],
});
