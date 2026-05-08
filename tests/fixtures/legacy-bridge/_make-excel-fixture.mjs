// 一次性脚本:生成 excel-test-cases.xlsx fixture(只在仓库初始化时跑一次)
// 用法:node tests/fixtures/legacy-bridge/_make-excel-fixture.mjs
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();

// Sheet 1: TestCases
const tc = wb.addWorksheet('TestCases');
tc.addRows([
  ['ID', 'Title', 'Steps', 'Expected'],
  ['TC-001', '登录成功', '输入正确账密', '跳转 dashboard'],
  ['TC-002', '登录失败', '输入错密', '提示密码错'],
  ['TC-003', '幂等支付', '同 Idempotency-Key 重复请求', '返回原响应不重复扣款'],
]);

// Sheet 2: Coverage(故意中文 sheet 名)
const cov = wb.addWorksheet('覆盖率');
cov.addRows([
  ['模块', '已覆盖用例', '未覆盖用例'],
  ['Order', '12', '2'],
  ['Payment', '20', '0'],
]);

await wb.xlsx.writeFile(join(__dirname, 'excel-test-cases.xlsx'));
console.log('✓ generated excel-test-cases.xlsx');
