/**
 * 全自动全栈打包引擎 (Frontend + Tauri Backend)
 * 彻底杜绝 Windows 终端 GBK 乱码，自动产出标准的【计件管理系统.exe】
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const targetExePath = path.join(rootDir, '计件管理系统.exe');

console.log('====================================================');
console.log('🚀 开始全自动构建【碳纤维计件管理系统】全栈安装包');
console.log('====================================================\n');

// 1. 设置环境变量
const cargoBin = 'C:\\Users\\P16V\\.cargo\\bin';
if (fs.existsSync(cargoBin) && !process.env.PATH.includes(cargoBin)) {
  process.env.PATH = `${cargoBin};${process.env.PATH}`;
}

// 2. 检查并关闭正在运行的旧进程，防止 Windows 文件独占锁导致更新失败
console.log('🛡️ 正在检查并释放可能占用的运行中实例...');
try {
  execSync('taskkill /F /IM "计件管理系统.exe" /IM "piecework-system.exe"', { stdio: 'ignore' });
} catch (e) {
  // 无进程运行是正常情况，静默跳过
}

// 2. 步骤一：前端构建
console.log('📦 [1/3] 正在编译前端 TypeScript 与 Vite 静态资产打包...');
try {
  const nodeExe = process.execPath;
  const tscJs = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  const viteJs = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

  console.log('  -> 正在进行严格类型检查 (tsc --noEmit)...');
  execSync(`"${nodeExe}" "${tscJs}" --noEmit`, { cwd: rootDir, stdio: 'inherit' });

  console.log('  -> 正在生成生产级前端 Bundle (vite build)...');
  execSync(`"${nodeExe}" "${viteJs}" build`, { cwd: rootDir, stdio: 'inherit' });

  const distIndex = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('前端构建未生成 dist/index.html，请检查 Vite 配置');
  }
  console.log('  ✅ 前端静态资产构建完成并输出至 dist/ 目录！\n');
} catch (err) {
  console.error('❌ 前端构建失败:', err.message);
  process.exit(1);
}

// 3. 步骤二：后端编译
console.log('🦀 [2/3] 正在调用 MSVC 与 Rust Cargo 编译桌面端主程序...');
try {
  const vcvars = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvarsall.bat';
  const hasVcvars = fs.existsSync(vcvars);

  const cargoCmd = hasVcvars
    ? `"${vcvars}" x64 && cargo build`
    : `cargo build`;

  console.log('  -> 正在编译 Rust 后端内核...');
  execSync(cargoCmd, { cwd: srcTauriDir, stdio: 'inherit', shell: 'cmd.exe' });
  console.log('  ✅ Rust 后端内核编译成功！\n');
} catch (err) {
  console.error('❌ 后端编译失败:', err.message);
  process.exit(1);
}

// 4. 步骤三：清理乱码文件并发布最新【计件管理系统.exe】
console.log('🚚 [3/3] 正在发布与覆盖最新可执行文件...');
try {
  const builtExe = path.join(srcTauriDir, 'target', 'debug', 'piecework-system.exe');
  if (!fs.existsSync(builtExe)) {
    throw new Error(`未找到后端输出二进制: ${builtExe}`);
  }

  // 扫描根目录下所有 .exe，清理乱码旧文件
  const files = fs.readdirSync(rootDir);
  for (const f of files) {
    if (f.endsWith('.exe') && f !== '计件管理系统.exe') {
      try {
        const p = path.join(rootDir, f);
        fs.unlinkSync(p);
        console.log(`  🧹 已清除历史遗留/乱码文件: ${f}`);
      } catch (e) {
        console.warn(`  ⚠️ 无法清理历史文件 ${f}:`, e.message);
      }
    }
  }

  // 复制最新生成的 exe 到根目录
  fs.copyFileSync(builtExe, targetExePath);

  const stat = fs.statSync(targetExePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
  const mtime = stat.mtime.toLocaleString('zh-CN', { hour12: false });

  console.log('\n====================================================');
  console.log('🎉 构建全部成功完成！');
  console.log(`📌 发布文件: ${targetExePath}`);
  console.log(`📊 程序大小: ${sizeMB} MB`);
  console.log(`⏰ 更新时间: ${mtime}`);
  console.log('====================================================\n');
} catch (err) {
  console.error('❌ 复制发布二进制失败:', err.message);
  process.exit(1);
}
