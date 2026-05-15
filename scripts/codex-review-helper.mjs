#!/usr/bin/env node
// scripts/codex-review-helper.mjs
//
// B-full wrapper helper — harness-agnostic.
//
// 2 子命令:
//   build-prompt --template <path> --output <path> --user-focus <text> --target-label <text>
//     读模板,替换 {{USER_FOCUS}} / {{TARGET_LABEL}},写到 --output
//
//   run --prompt-file <path> --output-log <path> [codex passthrough args...]
//     spawn `codex exec --prompt-file <path>`,stdout verbatim 透传 + tee 写到 --output-log
//
// 这是 B-full 临时 wrapper;plan-stage-extensions-framework 实施时
// 此 helper 会被完整版替换(加 build-prompt 多 stage / 多 mode + run 多轮 +
// thread resume + 僵尸检测 + 收敛判定)。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// 解析 CLI 参数(轻量,不依赖 commander — 避免引入 deps)
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      // positional passthrough
      args._ = args._ || [];
      args._.push(a);
    }
  }
  return args;
}

function exitWithError(msg, code = 1) {
  process.stderr.write(`❌ codex-review-helper: ${msg}\n`);
  process.exit(code);
}

// ============================================================
// 子命令 1:build-prompt
// ============================================================
function buildPrompt(args) {
  const { template, output, 'user-focus': userFocus, 'target-label': targetLabel } = args;

  if (!template || !output) {
    exitWithError('build-prompt 需要 --template <path> 和 --output <path>');
  }

  const templatePath = path.resolve(template);
  if (!fs.existsSync(templatePath)) {
    exitWithError(`模板文件不存在:${templatePath}`);
  }

  let content = fs.readFileSync(templatePath, 'utf-8');

  // 变量替换 — 当前支持 {{USER_FOCUS}} / {{TARGET_LABEL}}
  // 未提供变量默认 (none)
  content = content.replace(/\{\{USER_FOCUS\}\}/g, userFocus || '(none provided)');
  content = content.replace(/\{\{TARGET_LABEL\}\}/g, targetLabel || 'current branch');

  // 检查未替换的 {{VAR}}(可能是模板更新但 helper 没跟上)
  const unreplaced = content.match(/\{\{[A-Z_]+\}\}/g);
  if (unreplaced) {
    process.stderr.write(
      `⚠️  未替换的变量(可能模板有新变量,helper 待更新):${unreplaced.join(', ')}\n`,
    );
  }

  // 确保 output 目录存在
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf-8');

  process.stdout.write(`✓ prompt written to ${outputPath}\n`);
}

// ============================================================
// 子命令 2:run
// ============================================================
function runCodex(args) {
  const { 'prompt-file': promptFile, 'output-log': outputLog } = args;

  if (!promptFile) {
    exitWithError('run 需要 --prompt-file <path>');
  }

  const promptPath = path.resolve(promptFile);
  if (!fs.existsSync(promptPath)) {
    exitWithError(`prompt 文件不存在:${promptPath}`);
  }

  // 准备 output-log(tee 目标)
  let logStream = null;
  if (outputLog) {
    const logPath = path.resolve(outputLog);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logStream = fs.createWriteStream(logPath, { flags: 'w', encoding: 'utf-8' });
  }

  // codex passthrough args(除了 helper 自己消化的 --prompt-file / --output-log)
  const passthrough = args._ || [];

  // 构造 codex exec 调用
  // codex exec 接受 stdin prompt 或 --prompt(text) — 没有原生 --prompt-file flag,
  // 用 stdin pipe 方式喂 prompt
  const codexArgs = ['exec', ...passthrough];

  process.stderr.write(`▶ spawning: codex ${codexArgs.join(' ')}\n`);
  process.stderr.write(`   prompt:   ${promptPath}\n`);
  if (outputLog) {
    process.stderr.write(`   log:      ${path.resolve(outputLog)}\n`);
  }

  const promptContent = fs.readFileSync(promptPath, 'utf-8');

  const codex = spawn('codex', codexArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // 喂 prompt 到 stdin
  codex.stdin.write(promptContent);
  codex.stdin.end();

  // stdout 透传 + tee
  codex.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    if (logStream) logStream.write(chunk);
  });

  codex.on('close', (code) => {
    if (logStream) logStream.end();
    process.stderr.write(`\n${code === 0 ? '✓' : '❌'} codex exited with code ${code}\n`);
    process.exit(code);
  });

  codex.on('error', (err) => {
    exitWithError(
      `spawn codex failed: ${err.message}\n  (是否装了 codex CLI?跑 \`codex --version\` 确认)`,
    );
  });
}

// ============================================================
// Main dispatcher
// ============================================================
const [subcmd, ...rest] = process.argv.slice(2);

if (!subcmd || subcmd === '--help' || subcmd === '-h') {
  process.stdout.write(`
codex-review-helper — B-full wrapper for codex adversarial review

Usage:
  node scripts/codex-review-helper.mjs build-prompt \\
    --template <path> --output <path> \\
    [--user-focus "<text>"] [--target-label "<text>"]

  node scripts/codex-review-helper.mjs run \\
    --prompt-file <path> [--output-log <path>] \\
    [-- codex passthrough args]

Notes:
- harness-agnostic:不依赖 \${CLAUDE_PLUGIN_ROOT} / \${FORGE_PLUGIN_ROOT};
  所有路径通过 CLI 参数传入。
- 临时 wrapper:plan-stage-extensions-framework 实施完成后,完整 runner
  (forge stage-extensions run)会替换本 helper。
`);
  process.exit(0);
}

const args = parseArgs(rest);

switch (subcmd) {
  case 'build-prompt':
    buildPrompt(args);
    break;
  case 'run':
    runCodex(args);
    break;
  default:
    exitWithError(`未知子命令:${subcmd}(可用:build-prompt | run)`);
}
