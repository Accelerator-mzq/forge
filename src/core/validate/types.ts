// 验证结果类型 — proposal/specs/tasks/marker 共用

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  artifact: 'proposal' | 'specs' | 'design' | 'tasks' | 'marker' | 'change';
  /** 出错的字段或路径 */
  field?: string;
  /** 描述 */
  message: string;
  /** 文件路径(可选) */
  file?: string;
  /** 行号(可选) */
  line?: number;
}

export interface ValidationWarning extends Omit<ValidationError, 'message'> {
  message: string;
}

/** 工具函数:把多个 ValidationResult 合并 */
export function mergeResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** 工具函数:给单个 error 构造合法 ValidationResult */
export function failed(error: ValidationError): ValidationResult {
  return { valid: false, errors: [error], warnings: [] };
}

/** 工具函数:成功 */
export function ok(warnings: ValidationWarning[] = []): ValidationResult {
  return { valid: true, errors: [], warnings };
}
