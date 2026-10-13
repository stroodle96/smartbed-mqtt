import { spawnSync } from 'child_process';
test('a real process survives rejected async network callbacks without restarting', () => {
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      "const ts=require('typescript');const src=require('fs').readFileSync('./src/Utils/handleRejections.ts','utf8');const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};new Function('exports',code)(m.exports);m.exports.handleRejections(); Promise.reject(new Error('simulated network outage')); setTimeout(()=>{console.log('SAME_PROCESS_ALIVE');},100);",
    ],
    { cwd: process.cwd(), timeout: 10000, encoding: 'utf8' }
  );
  expect(child.status).toBe(0);
  expect(child.stdout).toContain('SAME_PROCESS_ALIVE');
  expect(child.stderr).toContain('simulated network outage');
});
