/**
 * ML Classifier Module — Public API
 */

export { initMLClassifier, classifyWithML, isMLClassifierReady, getMLClassifierStatus, batchClassifyWithML } from './ml-classifier';
export type { MLClassificationResult } from './ml-classifier';
export { enrichText } from './feature-enricher';
export { generateTrainingData, splitData } from './training-data-generator';
export type { TrainingExample } from './training-data-generator';
