/**
 * Quick integration test for the ML classifier
 * Run: npx ts-node src/classifier/ml/test-ml.ts
 */

import { initMLClassifier, classifyWithML, isMLClassifierReady, getMLClassifierStatus } from './index';

const TEST_MESSAGES = [
  // Work messages
  { text: 'Hey, the client meeting is at 3pm tomorrow. Please prepare the presentation slides.', expected: 'work' },
  { text: 'Sprint review is on Friday. Make sure all JIRA tickets are updated.', expected: 'work' },
  { text: 'Can you deploy the hotfix to production by EOD?', expected: 'work' },
  { text: 'New project proposal needs your approval before we send to the client', expected: 'work' },
  
  // Study messages
  { text: 'Assignment 3 is due next Monday. Don\'t forget to submit on Moodle.', expected: 'study' },
  { text: 'Professor said the exam will cover chapters 5-8', expected: 'study' },
  { text: 'Can someone share the lecture notes from yesterday?', expected: 'study' },
  { text: 'Lab report submission deadline extended to Friday', expected: 'study' },
  
  // Personal messages
  { text: 'Don\'t forget to pick up groceries on your way home', expected: 'personal' },
  { text: 'Doctor appointment is at 10am Wednesday', expected: 'personal' },
  { text: 'Need to pay the electricity bill before the 15th', expected: 'personal' },
  { text: 'Book the flight tickets for our vacation next month', expected: 'personal' },
  
  // Ignore messages
  { text: 'Good morning everyone! 🌞', expected: 'ignore' },
  { text: 'lol that meme was hilarious 😂', expected: 'ignore' },
  { text: 'Happy birthday! 🎂 Have a great day!', expected: 'ignore' },
  { text: 'Thanks a lot, you\'re awesome!', expected: 'ignore' },
  { text: '🔥 MEGA SALE 80% OFF!!! Click now for exclusive deals!!!', expected: 'ignore' },
  { text: 'forwarded many times: Share this with 10 people for good luck', expected: 'ignore' },
];

async function runTest() {
  console.log('');
  console.log('🧪 ML Classifier Integration Test');
  console.log('='.repeat(70));

  // Initialize
  console.log('\n📦 Loading ML model...');
  const ok = await initMLClassifier();
  if (!ok) {
    console.error('❌ Failed to load ML model. Run train.ts first.');
    process.exit(1);
  }

  console.log(`✅ Model ready: ${isMLClassifierReady()}`);
  const status = getMLClassifierStatus();
  console.log(`📊 Model meta:`, JSON.stringify(status.meta, null, 2));

  // Test classification
  console.log('\n🔬 Running classification tests...\n');
  
  let correct = 0;
  let total = TEST_MESSAGES.length;
  const results: Array<{ text: string; expected: string; got: string; conf: number; time: number; pass: boolean }> = [];

  for (const test of TEST_MESSAGES) {
    const result = classifyWithML(test.text);
    if (!result) {
      console.error(`❌ classifyWithML returned null for: "${test.text}"`);
      continue;
    }

    const pass = result.category === test.expected;
    if (pass) correct++;

    results.push({
      text: test.text.slice(0, 55) + (test.text.length > 55 ? '...' : ''),
      expected: test.expected,
      got: result.category,
      conf: result.confidence,
      time: result.inference_time_ms,
      pass,
    });
  }

  // Print results table
  console.log('┌─────────────────────────────────────────────────────────────┬──────────┬──────────┬───────┬───────┬──────┐');
  console.log('│ Message                                                     │ Expected │ Got      │ Conf  │ Time  │ Pass │');
  console.log('├─────────────────────────────────────────────────────────────┼──────────┼──────────┼───────┼───────┼──────┤');
  
  for (const r of results) {
    const msg = r.text.padEnd(59);
    const exp = r.expected.padEnd(8);
    const got = r.got.padEnd(8);
    const conf = r.conf.toFixed(2).padStart(5);
    const time = (r.time.toFixed(1) + 'ms').padStart(5);
    const pass = r.pass ? '  ✅ ' : '  ❌ ';
    console.log(`│ ${msg} │ ${exp} │ ${got} │ ${conf} │ ${time} │${pass}│`);
  }
  
  console.log('└─────────────────────────────────────────────────────────────┴──────────┴──────────┴───────┴───────┴──────┘');

  const accuracy = (correct / total * 100).toFixed(1);
  const avgTime = (results.reduce((s, r) => s + r.time, 0) / results.length).toFixed(2);
  
  console.log(`\n📊 Results: ${correct}/${total} correct (${accuracy}% accuracy)`);
  console.log(`⏱️  Average inference time: ${avgTime}ms`);
  console.log(`\n${Number(accuracy) >= 80 ? '✅ PASS' : '❌ FAIL'} — ML classifier integration test ${Number(accuracy) >= 80 ? 'passed' : 'failed'}`);
  console.log('');
}

runTest().catch(console.error);
