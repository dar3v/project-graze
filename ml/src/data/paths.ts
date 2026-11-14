import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** ml/ package root, independent of the current working directory. */
export const ML_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const REPO_ROOT = join(ML_ROOT, '..')
/** Downloaded and derived data. Gitignored; recreated by `ml:fetch`. */
export const DATA_DIR = join(ML_ROOT, 'data')
/** Committed, human-readable outputs of every script (numbers live here first). */
export const REPORTS_DIR = join(ML_ROOT, 'reports')
export const MODEL_OUT_DIR = join(REPO_ROOT, 'apps', 'web', 'public', 'model')
export const FIXTURES_PATH = join(ML_ROOT, 'test', 'fixtures', 'inference-fixtures.json')
/** Committed lock describing the final test set (seed, size, hash). */
export const SPLIT_LOCK_PATH = join(ML_ROOT, 'splits.lock.json')
