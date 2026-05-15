// thread-map.ts — codex thread id 持久化 map
// plan-stage-extensions Task 2.3
// 读写 forge/changes/<changeId>/.codex-threads.yaml,管理每个 stage+extension 的 thread 状态

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** 单个 thread 记录 */
export interface ThreadMapEntry {
  /** codex session thread id;首轮可能为 null(不传 --resume) */
  thread_id: string | null;
  /** 当前轮次编号 */
  round: number;
  /** 上一轮 verdict;首轮前为 null */
  last_verdict: 'approve' | 'needs-attention' | null;
  /** 上一轮 finding 总数 */
  last_finding_count: number;
  /** 上一轮完成时间(ISO 8601) */
  last_round_at: string;
}

/**
 * YAML 文件的顶层结构:
 * threads:
 *   <stage>:
 *     <extensionName>:
 *       thread_id: ...
 *       round: ...
 *       ...
 */
interface ThreadsFile {
  threads: Record<string, Record<string, ThreadMapEntry>>;
}

/**
 * ThreadMap — 管理 codex thread id 与轮次记录。
 * 文件路径:<forgeRoot>/changes/<changeId>/.codex-threads.yaml。
 * load() 在文件不存在时返回空 map(不 throw)。
 */
export class ThreadMap {
  /** 内部存储:stage → extensionName → ThreadMapEntry */
  private map: Map<string, Map<string, ThreadMapEntry>> = new Map();

  /** YAML 文件绝对路径 */
  private readonly filePath: string;

  /**
   * @param changeId   change 目录名(如 'c1')
   * @param forgeRoot  forge 根目录;缺省为 'forge'(runner 传入 forgeRoot,测试传 tmpdir)
   * 路径约定:<forgeRoot>/changes/<changeId>/.codex-threads.yaml
   */
  constructor(changeId: string, forgeRoot = 'forge') {
    this.filePath = path.join(forgeRoot, 'changes', changeId, '.codex-threads.yaml');
  }

  /**
   * 从磁盘加载 YAML 文件。
   * 文件不存在 → 内部 map 清空(空 map,不 throw)。
   * 文件存在但解析失败 → throw(保留异常)。
   */
  async load(): Promise<void> {
    this.map = new Map();
    // 直接 readFile + 捕获 ENOENT,避免 existsSync 的 TOCTOU 竞态
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (e) {
      // 文件不存在是正常情况(首轮),返回空 map;其他错误(损坏/不可读)继续抛出
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw e;
    }
    const parsed = parseYaml(raw) as ThreadsFile | null;
    if (!parsed?.threads) {
      // 文件为空或无 threads 段 → 空 map
      return;
    }
    // 将 YAML 对象转换为 Map
    for (const [stage, byName] of Object.entries(parsed.threads)) {
      const stageMap = new Map<string, ThreadMapEntry>();
      for (const [name, entry] of Object.entries(byName)) {
        stageMap.set(name, entry);
      }
      this.map.set(stage, stageMap);
    }
  }

  /**
   * 将内部 map 写回 YAML 文件。
   * 若父目录不存在则自动创建。
   * 采用 tmp 文件写 + rename atomic(POSIX + Windows NTFS 同卷),与 forge 其他 state 文件一致。
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    // 将 Map 转换为普通对象供 yaml.stringify
    const threads: Record<string, Record<string, ThreadMapEntry>> = {};
    for (const [stage, byName] of this.map.entries()) {
      threads[stage] = {};
      for (const [name, entry] of byName.entries()) {
        threads[stage]![name] = entry;
      }
    }
    const content = stringifyYaml({ threads });

    // tmp 文件写 + rename atomic(避免半写状态)
    const tmpPath = `${this.filePath}.tmp.${process.pid}`;
    await writeFile(tmpPath, content, 'utf8');
    await rename(tmpPath, this.filePath);
  }

  /**
   * 获取指定 stage + extensionName 的 thread id。
   * 无记录时返回 null(caller 不传 --resume)。
   */
  getThreadId(stage: string, name: string): string | null {
    return this.map.get(stage)?.get(name)?.thread_id ?? null;
  }

  /**
   * 记录或更新一轮结果。
   * @param stage  stage 名称(如 'review')
   * @param name   extension name
   * @param entry  本轮完整记录
   */
  recordRound(stage: string, name: string, entry: ThreadMapEntry): void {
    if (!this.map.has(stage)) {
      this.map.set(stage, new Map());
    }
    this.map.get(stage)!.set(name, entry);
  }

  /**
   * 删除指定 stage 的全部记录。
   * 跨 stage 切换时使用,确保新 stage 使用新 thread。
   */
  resetStage(stage: string): void {
    this.map.delete(stage);
  }
}
