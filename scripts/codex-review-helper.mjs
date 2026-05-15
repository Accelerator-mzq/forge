#!/usr/bin/env node
// scripts/codex-review-helper.mjs
//
// B-full wrapper helper — harness-agnostic.
//
// 子命令:
//   build-prompt
//     --template <path>      显式模板路径(优先级最高)
//     --output <path>        输出路径(必填)
//     --user-focus <text>    替换 {{USER_FOCUS}}(可选)
//     --target-label <text>  替换 {{TARGET_LABEL}}(可选)
//     --stage <s>            阶段名(与 --mode 组合自动定位模板,可选)
//     --mode <m>             模式名(与 --stage 组合,可选)
//
//     模板解析优先级:
//       1. --template 显式传入 → 直接用
//       2. --stage + --mode → src/core/codex-review/prompts/<stage>-<mode>.md
//       3. fallback → src/core/codex-review/prompts/adversarial-default.md
//
//   run
//     --prompt-file <path>   prompt 文件路径
//     --output-log <path>    日志输出路径(可选)
//     --mode <m>             dispatch 模式(可选)
//       code-review  → spawn `codex review`(不需要 prompt-file)
//       adversarial  → spawn `codex exec` + stdin prompt(默认行为)
//       rescue       → 同 adversarial(v1 stub,同代码路径)
//       (缺省)       → 同 adversarial(向后兼容)
//     --thread-id <id>       resume session id(可选);
//       adversarial/rescue 模式下: codex exec resume <id> + stdin
//       code-review 模式下:codex review 无 resume 支持,忽略此参数(见代码注释)
//
// harness-agnostic:
//   不依赖 ${CLAUDE_PLUGIN_ROOT} / ${FORGE_PLUGIN_ROOT};所有路径通过 CLI 参数传入。
//   Repo root 从 import.meta.url 推导。
//
// Windows 兼容:spawn 加 shell:true — codex 是 .cmd wrapper,
// 不加会 ENOENT(沿 forge-repo execFileSync 同模式)。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 从 import.meta.url 推导 repo root(helper 位于 <repo>/scripts/ 下)
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// 默认 fallback 模板(B-full adversarial-default)
const DEFAULT_TEMPLATE = path.join(
  REPO_ROOT,
  'src',
  'core',
  'codex-review',
  'prompts',
  'adversarial-default.md',
);

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
  const {
    template,
    output,
    'user-focus': userFocus,
    'target-label': targetLabel,
    stage,
    mode,
  } = args;

  if (!output) {
    // --output 是必填;--template 是可选的(可用 --stage/--mode 自动推导或 fallback)
    exitWithError('build-prompt 需要 --output <path>');
  }

  // 模板解析优先级:
  // 1. --template 显式 → 直接用(向后兼容)
  // 2. --stage + --mode → <stage>-<mode>.md(若文件存在)
  // 3. fallback → adversarial-default.md
  let templatePath;
  if (template) {
    // 优先级 1:显式 --template
    templatePath = path.resolve(template);
  } else if (stage && mode) {
    // 优先级 2:stage+mode 自动定位
    const candidate = path.join(
      REPO_ROOT,
      'src',
      'core',
      'codex-review',
      'prompts',
      `${stage}-${mode}.md`,
    );
    if (fs.existsSync(candidate)) {
      templatePath = candidate;
    } else {
      // 文件不存在则降级 fallback
      process.stderr.write(
        `⚠️  模板 ${stage}-${mode}.md 不存在,fallback → adversarial-default.md\n`,
      );
      templatePath = DEFAULT_TEMPLATE;
    }
  } else {
    // 优先级 3:fallback
    // 若只给了 --stage 或只给了 --mode(未成对),提示用户避免静默 fallback
    if (stage || mode) {
      process.stderr.write(
        `⚠️  --stage / --mode 需成对提供,已忽略,fallback → adversarial-default.md\n`,
      );
    }
    templatePath = DEFAULT_TEMPLATE;
  }

  // --template 显式时,若找不到文件报错(维持原有行为)
  // fallback / auto-resolve 时,若连 default 也不存在则报错
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
  const { 'prompt-file': promptFile, 'output-log': outputLog, mode, 'thread-id': threadId } = args;

  // --mode code-review:spawn `codex review`,不需要 prompt-file
  const isCodeReview = mode === 'code-review';

  if (!isCodeReview && !promptFile) {
    exitWithError('run 需要 --prompt-file <path>');
  }

  let promptPath = null;
  let promptContent = null;

  if (!isCodeReview) {
    promptPath = path.resolve(promptFile);
    if (!fs.existsSync(promptPath)) {
      exitWithError(`prompt 文件不存在:${promptPath}`);
    }
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  }

  // 准备 output-log(tee 目标)
  let logStream = null;
  if (outputLog) {
    const logPath = path.resolve(outputLog);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logStream = fs.createWriteStream(logPath, { flags: 'w', encoding: 'utf-8' });
  }

  // codex passthrough args(除了 helper 自己消化的参数)
  const passthrough = args._ || [];

  // 构造 codex 调用参数
  // mode dispatch:
  //   code-review → codex review [passthrough]
  //   adversarial | rescue | (默认) → codex exec [resume <threadId>] [passthrough]
  //
  // thread-id resume:
  //   adversarial/rescue: codex exec resume <threadId> — 通过子命令 resume 续接 session
  //   code-review: codex review 无 resume 子命令/选项(已验证 codex review --help),
  //                忽略 --thread-id 并输出警告
  let codexArgs;
  if (isCodeReview) {
    // code-review 模式:spawn `codex review`
    codexArgs = ['review', ...passthrough];

    // codex review 不支持 resume(无 session 概念),忽略 --thread-id
    if (threadId) {
      process.stderr.write(
        `⚠️  --thread-id 在 code-review 模式下被忽略:codex review 不支持 session resume\n`,
      );
    }
  } else {
    // adversarial / rescue / 默认:spawn `codex exec` + stdin prompt
    if (threadId) {
      // codex exec resume <sessionId> — 续接指定 session,prompt 通过 stdin 传入
      codexArgs = ['exec', 'resume', threadId, ...passthrough];
    } else {
      // 无 resume:新会话
      codexArgs = ['exec', ...passthrough];
    }
  }

  process.stderr.write(`▶ spawning: codex ${codexArgs.join(' ')}\n`);
  if (promptPath) {
    process.stderr.write(`   prompt:   ${promptPath}\n`);
  }
  if (outputLog) {
    process.stderr.write(`   log:      ${path.resolve(outputLog)}\n`);
  }

  // shell: true — 跨平台兼容:Windows 下 codex 是 .cmd wrapper,
  // 不加 shell:true 会 spawn ENOENT(沿 forge-repo execFileSync 同模式)
  //
  // 用「单条已转义命令字符串 + shell:true」而非「args 数组 + shell:true」:
  //   1. Node 22+ 对「args 数组 + shell:true」会发 DEP0190 弃用警告(污染 stderr,
  //      下游 Task 5 runner 会解析 stderr)
  //   2. 每个 arg 显式加双引号并转义内部双引号,中和 threadId 等参数里
  //      可能含 shell 元字符导致的注入
  const stdinMode = isCodeReview ? 'inherit' : 'pipe';
  const quoted = codexArgs.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  const codex = spawn(`codex ${quoted}`, {
    stdio: [stdinMode, 'pipe', 'inherit'],
    shell: true,
  });

  // adversarial/rescue/默认:喂 prompt 到 stdin
  if (!isCodeReview && codex.stdin) {
    codex.stdin.write(promptContent);
    codex.stdin.end();
  }

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
codex-review-helper — stage-extensions wrapper for codex review

Usage:
  node scripts/codex-review-helper.mjs build-prompt \\
    [--template <path>] --output <path> \\
    [--stage <stage>] [--mode <mode>] \\
    [--user-focus "<text>"] [--target-label "<text>"]

  node scripts/codex-review-helper.mjs run \\
    [--prompt-file <path>] [--output-log <path>] \\
    [--mode code-review|adversarial|rescue] \\
    [--thread-id <id>] \\
    [-- codex passthrough args]

build-prompt template priority:
  1. --template <path>   explicit path (highest)
  2. --stage + --mode    auto-resolve <stage>-<mode>.md
  3. fallback            adversarial-default.md

run --mode dispatch:
  code-review  → codex review (no prompt-file needed)
  adversarial  → codex exec + stdin prompt
  rescue       → codex exec + stdin prompt (v1 stub)
  (default)    → codex exec + stdin prompt (backward compat)

Notes:
- harness-agnostic:不依赖 \${CLAUDE_PLUGIN_ROOT} / \${FORGE_PLUGIN_ROOT};
  所有路径通过 CLI 参数传入。
- --thread-id 在 code-review 模式下被忽略(codex review 不支持 resume)。
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
