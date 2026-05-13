// tests/core/test-reporters/junit.test.ts — plan-9g Task 2.3
import { describe, it, expect } from 'vitest';
import { parseJUnit } from '../../../src/core/test-reporters/junit.js';

describe('parseJUnit', () => {
  it('Case 1: vitest JUnit XML(testsuites 包裹)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="vitest" tests="3" failures="1">
  <testsuite name="auth.test.ts" tests="3" failures="1">
    <testcase name="login pass" classname="auth" file="src/auth.test.ts" time="0.1"/>
    <testcase name="login fail" classname="auth" file="src/auth.test.ts" time="0.2">
      <failure message="expected true to be false" type="AssertionError">stack...</failure>
    </testcase>
    <testcase name="logout" classname="auth" file="src/auth.test.ts" time="0.05">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.skipCount).toBe(1);
    expect(result.tests[1]?.failure_type).toBe('assertion');
    expect(result.tests[1]?.message).toContain('expected true to be false');
  });

  it('Case 2: jest JUnit XML(直接 testsuite)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="jest" tests="2" failures="1">
  <testcase name="t1" classname="src/a.test.js" time="0.1"/>
  <testcase name="t2" classname="src/a.test.js" time="0.2">
    <error message="ReferenceError" type="ReferenceError">stack</error>
  </testcase>
</testsuite>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(2);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.tests[1]?.failure_type).toBe('error');
  });

  it('Case 3: mocha JUnit XML(空 testsuite + 边界)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="empty"/>
</testsuites>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(0);
    expect(result.tests).toEqual([]);
  });

  it('Case 4: <failure/> + <error/> 自闭合空元素不 crash(C-1 regression)', () => {
    // fast-xml-parser 对 <failure/>/<error/> 自闭合空元素返 "" 而非 undefined/{},
    // 旧实现 Boolean("") = false → 走 else 分支 + tc.error[0] 越界 → undefined-deref TypeError
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="self-closing-edges" tests="2" failures="2">
    <testcase name="empty-failure" classname="src/a.test.ts">
      <failure/>
    </testcase>
    <testcase name="empty-error" classname="src/a.test.ts">
      <error/>
    </testcase>
  </testsuite>
</testsuites>`;
    // 不应抛错
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(2);
    expect(result.failCount).toBe(2);
    // 空元素 → 无 @_type → 走 else 兜底 'error'
    expect(result.tests[0]?.failure_type).toBe('error');
    expect(result.tests[0]?.message).toBe('');
    expect(result.tests[1]?.failure_type).toBe('error');
    expect(result.tests[1]?.message).toBe('');
  });
});
