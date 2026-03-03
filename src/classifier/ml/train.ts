/**
 * =====================================================================
 * ML CLASSIFIER — TRAIN + SAVE SCRIPT
 * Uses 'natural' library's BayesClassifier (Naive Bayes)
 * Trains in ~2 seconds, no GPU needed, works on all platforms
 * 
 * Run: npx ts-node src/classifier/ml/train.ts
 * =====================================================================
 */

import * as natural from 'natural';
import * as fs from 'fs';
import * as path from 'path';
import { generateTrainingData, splitData } from './training-data-generator';
import { enrichText } from './feature-enricher';

// ============================================
// CONFIGURATION
// ============================================

const SAMPLES_PER_CATEGORY = 500;
const MODEL_DIR = path.join(__dirname, '..', '..', '..', 'ml-model');

// ============================================
// TRAINING
// ============================================

async function train() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🧠 WhatsApp Classifier — ML Model Trainer         ║');
  console.log('║  Using: Naive Bayes (natural library)               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Generate training data
  console.log('📊 Step 1/4: Generating synthetic training data...');
  const allData = generateTrainingData(SAMPLES_PER_CATEGORY);
  const { train: trainData, validation: valData } = splitData(allData, 0.85);

  const catCounts: Record<string, number> = {};
  allData.forEach(d => { catCounts[d.category] = (catCounts[d.category] || 0) + 1; });
  console.log(`   ✅ Generated ${allData.length} total examples`);
  console.log(`   📋 Train: ${trainData.length} | Validation: ${valData.length}`);
  console.log(`   📋 Categories: ${JSON.stringify(catCounts)}`);

  // Step 2: Train CATEGORY classifier
  console.log('\n🏗️  Step 2/4: Training Category classifier...');
  const startCat = Date.now();
  
  const categoryClassifier = new natural.BayesClassifier();
  
  for (const example of trainData) {
    const enriched = enrichText(example.text);
    categoryClassifier.addDocument(enriched, example.category);
  }
  
  categoryClassifier.train();
  const catTime = Date.now() - startCat;
  console.log(`   ✅ Category classifier trained in ${catTime}ms`);

  // Step 3: Train PRIORITY classifier
  console.log('\n🏗️  Step 3/4: Training Priority classifier...');
  const startPri = Date.now();
  
  const priorityClassifier = new natural.BayesClassifier();
  
  for (const example of trainData) {
    const enriched = enrichText(example.text);
    priorityClassifier.addDocument(enriched, example.priority);
  }
  
  priorityClassifier.train();
  const priTime = Date.now() - startPri;
  console.log(`   ✅ Priority classifier trained in ${priTime}ms`);

  // Step 4: Validate
  console.log('\n📊 Step 4/4: Validating...');
  
  let catCorrect = 0;
  let priCorrect = 0;
  const catConfusion: Record<string, Record<string, number>> = {};
  
  for (const example of valData) {
    const enriched = enrichText(example.text);
    const predictedCat = categoryClassifier.classify(enriched);
    const predictedPri = priorityClassifier.classify(enriched);
    
    if (predictedCat === example.category) catCorrect++;
    if (predictedPri === example.priority) priCorrect++;
    
    // Confusion matrix
    if (!catConfusion[example.category]) catConfusion[example.category] = {};
    catConfusion[example.category][predictedCat] = (catConfusion[example.category][predictedCat] || 0) + 1;
  }
  
  const catAccuracy = (catCorrect / valData.length * 100).toFixed(1);
  const priAccuracy = (priCorrect / valData.length * 100).toFixed(1);

  console.log(`\n   Category Accuracy: ${catAccuracy}% (${catCorrect}/${valData.length})`);
  console.log(`   Priority Accuracy: ${priAccuracy}% (${priCorrect}/${valData.length})`);
  
  console.log('\n   📊 Confusion Matrix (Category):');
  console.log('   ' + '-'.repeat(60));
  console.log('   Actual\\Predicted   | work  | study | personal | ignore');
  console.log('   ' + '-'.repeat(60));
  for (const actual of ['work', 'study', 'personal', 'ignore']) {
    const row = catConfusion[actual] || {};
    const cells = ['work', 'study', 'personal', 'ignore'].map(
      pred => String(row[pred] || 0).padStart(5)
    );
    console.log(`   ${actual.padEnd(20)} | ${cells.join(' | ')}`);
  }
  console.log('   ' + '-'.repeat(60));

  // Save models
  console.log('\n💾 Saving models...');
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  // Save using natural's built-in save (callback based)
  await new Promise<void>((resolve, reject) => {
    const catPath = path.join(MODEL_DIR, 'category-classifier.json');
    categoryClassifier.save(catPath, (err: any) => {
      if (err) { console.error('   ❌ Failed to save category classifier:', err); reject(err); }
      else { console.log(`   ✅ Category classifier saved`); resolve(); }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const priPath = path.join(MODEL_DIR, 'priority-classifier.json');
    priorityClassifier.save(priPath, (err: any) => {
      if (err) { console.error('   ❌ Failed to save priority classifier:', err); reject(err); }
      else { console.log(`   ✅ Priority classifier saved`); resolve(); }
    });
  });

  // Save metadata
  const metaPath = path.join(MODEL_DIR, 'model-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    trainedAt: new Date().toISOString(),
    samplesPerCategory: SAMPLES_PER_CATEGORY,
    totalTrainingSamples: trainData.length,
    validationSamples: valData.length,
    categoryAccuracy: parseFloat(catAccuracy),
    priorityAccuracy: parseFloat(priAccuracy),
    trainingTimeMs: catTime + priTime,
    method: 'naive-bayes',
    library: 'natural',
    categories: ['work', 'study', 'personal', 'ignore'],
    priorities: ['urgent', 'high', 'medium', 'low'],
  }, null, 2));

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅ TRAINING COMPLETE                                ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Category Accuracy: ${catAccuracy}%`.padEnd(55) + '║');
  console.log(`║  Priority Accuracy: ${priAccuracy}%`.padEnd(55) + '║');
  console.log(`║  Training Time: ${catTime + priTime}ms`.padEnd(55) + '║');
  console.log(`║  Model Dir: ml-model/`.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');
}

// Run training
train().catch(err => {
  console.error('❌ Training failed:', err);
  process.exit(1);
});
