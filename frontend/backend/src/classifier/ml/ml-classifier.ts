/**
 * =====================================================================
 * ML-BASED MESSAGE CLASSIFIER
 * Uses 'natural' library's Naive Bayes classifiers
 * Fast (~1ms), free, runs offline, no API keys needed
 * =====================================================================
 */

import * as natural from 'natural';
import * as fs from 'fs';
import * as path from 'path';
import { ClassificationResult } from '../keywords';
import { enrichText } from './feature-enricher';

// ============================================
// STATE
// ============================================

const MODEL_DIR = path.join(__dirname, '..', '..', '..', 'ml-model');

let categoryClassifier: any = null;
let priorityClassifier: any = null;
let isLoaded = false;
let loadError: string | null = null;
let modelMeta: any = null;

// ============================================
// MODEL LOADING
// ============================================

/**
 * Initialize the ML classifier by loading the trained models
 * Call this once at startup
 */
export async function initMLClassifier(): Promise<boolean> {
  try {
    const catPath = path.join(MODEL_DIR, 'category-classifier.json');
    const priPath = path.join(MODEL_DIR, 'priority-classifier.json');
    const metaPath = path.join(MODEL_DIR, 'model-meta.json');

    // Check if model files exist
    if (!fs.existsSync(catPath)) {
      loadError = `Model not found. Run 'npx ts-node src/classifier/ml/train.ts' first.`;
      console.warn(`⚠️  ML Classifier: ${loadError}`);
      return false;
    }

    console.log('🧠 Loading ML classifier models...');

    // Load category classifier
    categoryClassifier = await new Promise<any>((resolve, reject) => {
      natural.BayesClassifier.load(catPath, null, (err: any, classifier: any) => {
        if (err) reject(err);
        else resolve(classifier);
      });
    });

    // Load priority classifier
    priorityClassifier = await new Promise<any>((resolve, reject) => {
      natural.BayesClassifier.load(priPath, null, (err: any, classifier: any) => {
        if (err) reject(err);
        else resolve(classifier);
      });
    });

    // Load metadata
    if (fs.existsSync(metaPath)) {
      modelMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }

    isLoaded = true;
    loadError = null;
    console.log(`✅ ML Classifier loaded (accuracy: ${modelMeta?.categoryAccuracy ?? '?'}%)`);
    return true;
  } catch (err) {
    loadError = `Failed to load ML model: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`❌ ML Classifier: ${loadError}`);
    return false;
  }
}

/**
 * Check if ML classifier is ready
 */
export function isMLClassifierReady(): boolean {
  return isLoaded && categoryClassifier !== null;
}

/**
 * Get ML classifier status
 */
export function getMLClassifierStatus(): {
  ready: boolean;
  error: string | null;
  meta: any;
} {
  return { ready: isLoaded, error: loadError, meta: modelMeta };
}

// ============================================
// CLASSIFICATION
// ============================================

export interface MLClassificationResult extends ClassificationResult {
  method: 'ml';
  ml_confidence_scores: {
    work: number;
    study: number;
    personal: number;
    ignore: number;
  };
  ml_priority_scores: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  inference_time_ms: number;
}

/**
 * Classify a message using the trained ML model
 * Returns null if model is not loaded (caller should fallback)
 */
export function classifyWithML(messageContent: string): MLClassificationResult | null {
  if (!isLoaded || !categoryClassifier || !priorityClassifier) {
    return null;
  }

  const startTime = performance.now();

  try {
    const enriched = enrichText(messageContent);

    // Get category classification with probabilities
    const catClassifications = categoryClassifier.getClassifications(enriched);
    const priClassifications = priorityClassifier.getClassifications(enriched);

    // Convert to probability-like scores (natural gives log probabilities)
    const catScores = normalizeProbabilities(catClassifications);
    const priScores = normalizeProbabilities(priClassifications);

    // Best category
    const bestCat = catClassifications[0];
    const category = bestCat.label as ClassificationResult['category'];
    const confidence = calculateConfidence(catClassifications);

    // Best priority
    const bestPri = priClassifications[0];
    const priority = bestPri.label as ClassificationResult['priority'];

    // Detect deadline/action verb from text
    const lower = messageContent.toLowerCase();
    const has_deadline = /\b(deadline|due|submit by|by today|by tomorrow|before|until|eod|eow)\b/i.test(lower);
    const has_action_verb = /\b(submit|send|review|check|complete|finish|prepare|create|build|deploy|fix|update|approve)\b/i.test(lower);

    // Extract matched keywords for display
    const keywords_matched: string[] = [];
    const keywordPatterns = [
      /\b(meeting|standup|sprint|review|demo|call|sync|project|client|deploy|jira|server)\b/gi,
      /\b(assignment|homework|exam|quiz|thesis|lecture|lab|semester|course|professor)\b/gi,
      /\b(deadline|due|submit|urgent|asap|immediately)\b/gi,
      /\b(buy|pay|book|appointment|doctor|flight|grocery|rent|bill|gym)\b/gi,
    ];
    for (const pattern of keywordPatterns) {
      const matches = messageContent.match(pattern);
      if (matches) keywords_matched.push(...matches.map(m => m.toLowerCase()));
    }

    const inferenceTime = performance.now() - startTime;

    return {
      category,
      confidence,
      keywords_matched: [...new Set(keywords_matched)],
      has_deadline,
      has_action_verb,
      priority,
      method: 'ml',
      ml_confidence_scores: {
        work: catScores['work'] || 0,
        study: catScores['study'] || 0,
        personal: catScores['personal'] || 0,
        ignore: catScores['ignore'] || 0,
      },
      ml_priority_scores: {
        urgent: priScores['urgent'] || 0,
        high: priScores['high'] || 0,
        medium: priScores['medium'] || 0,
        low: priScores['low'] || 0,
      },
      inference_time_ms: Math.round(inferenceTime * 100) / 100,
    };
  } catch (err) {
    console.error('❌ ML classification error:', err);
    return null;
  }
}

/**
 * Convert natural's raw probabilities to normalized 0-1 scores
 * Natural returns actual (very small) probabilities — just normalize to sum to 1
 */
function normalizeProbabilities(
  classifications: Array<{ label: string; value: number }>
): Record<string, number> {
  const total = classifications.reduce((sum, c) => sum + c.value, 0);
  const result: Record<string, number> = {};

  if (total === 0) {
    // Equal distribution fallback
    for (const c of classifications) {
      result[c.label] = Math.round((1 / classifications.length) * 1000) / 1000;
    }
    return result;
  }

  for (const c of classifications) {
    result[c.label] = Math.round((c.value / total) * 1000) / 1000;
  }
  return result;
}

/**
 * Calculate confidence from the ratio of best to second-best probability
 * Large ratio = high confidence, ratio of 1 = uncertain
 */
function calculateConfidence(
  classifications: Array<{ label: string; value: number }>
): number {
  if (classifications.length < 2) return 0.5;

  const best = classifications[0].value;
  const total = classifications.reduce((sum, c) => sum + c.value, 0);

  if (total === 0) return 0.5;

  // Confidence = what fraction of total probability does the best class hold
  const confidence = best / total;
  return Math.round(confidence * 1000) / 1000;
}

/**
 * Classify multiple messages in batch
 */
export function batchClassifyWithML(messages: string[]): (MLClassificationResult | null)[] {
  return messages.map(msg => classifyWithML(msg));
}
