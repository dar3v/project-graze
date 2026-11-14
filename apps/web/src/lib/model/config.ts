/**
 * When true and the real model files fail to load, the app falls back to the
 * clearly labeled STUB predictor (stub.ts) instead of showing only an error.
 *
 * TODO(Day 12): set to false and delete stub.ts once Role 3 ships
 * public/model/model.json and public/model/model_card.json.
 */
export const ALLOW_STUB_MODEL = true

/** Where the Worker and the Model Report fetch the model files from. */
export const MODEL_BASE_PATH = 'model/'
export const MODEL_JSON = 'model.json'
export const MODEL_CARD_JSON = 'model_card.json'
