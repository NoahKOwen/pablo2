/** Static structure assertions: does not replace browser acceptance. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (rel) => fs.readFileSync(path.join(process.cwd(),rel),'utf8');
function parse(rel) {
  const source = read(rel);
  const file = ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length,0,`${rel} parses as TSX`);
  return {file,source};
}
const a=parse('client/src/components/mining-power/activation.tsx');
const s=parse('client/src/components/mining-power/sections.tsx');
const p=parse('client/src/pages/mining-power.tsx');
parse('client/src/components/app-sidebar.tsx');
parse('client/src/components/mobile-bottom-nav.tsx');
const gates=[];
function visit(node){
  if(ts.isConditionalExpression(node)&&ts.isIdentifier(node.condition)&&node.condition.text==='enabled'&&node.whenTrue.getText(a.file).includes('mining-activation-payment'))gates.push(node);
  ts.forEachChild(node,visit);
}
visit(a.file);
assert.equal(gates.length,1,'One activation gate protects the whole payment card');
assert.equal(gates[0].whenFalse.kind,ts.SyntaxKind.NullKeyword,'Disabled protocol renders no payment form');
const body=gates[0].whenTrue.getText(a.file);
for(const term of ['mining-transaction-hash','mining-payment-proof','mining-submit-activation','confirmPayment','confirmTerms'])assert.ok(body.includes(term),`${term} is gated`);
assert.ok(a.source.includes('enabled:enabled&&!!code'), 'Server R2 quote remains gated');
assert.ok(a.source.includes('const canSend=enabled&&!!quote.data?.paymentAddress'), 'Submission checks remain gated');
assert.ok(a.source.includes('aria-pressed={code===p.code}'),'Package group uses proper button semantics');
assert.ok(!a.source.includes('role="radio"'),'No incomplete radio keyboard contract');
assert.ok(a.source.indexOf('mining-activation-payment')<a.source.indexOf('Illustrative network-share calculator'),'Calculator no longer interrupts payment steps');
assert.ok(s.source.includes('onClick={onExplorePackages}'),'Empty activation CTA wired');
assert.ok(p.source.includes('<MiningPowerActivations onExplorePackages={()=>setTab("activate")}/>'),'CTA switches to activation tab');
assert.ok(s.source.includes('Emission program pool ceiling (provisional)'),'Pool accounting source is clarified');
assert.ok(s.source.includes('No Mining Power rewards yet'),'Empty reward wording is user-facing');
assert.ok(read('client/src/components/app-sidebar.tsx').includes('Free XP Mining'));
assert.ok(read('client/src/components/mobile-bottom-nav.tsx').includes('Free XP Mining (24-hour)'));
console.log('R5-r1 UI structural tests PASS (draft payment gate, navigable empty states, terminology, TSX syntax)');
