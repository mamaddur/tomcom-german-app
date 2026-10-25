// Usage: pnpm --filter @tomcom/seed generate --learners 500 --seed 7 > seed.json
// Database loading is added in build step 2, when the identity tables exist.
import { parseArgs } from 'node:util';
import { generateDataset } from './synthetic';

const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
const { values } = parseArgs({
  args,
  options: {
    seed: { type: 'string', default: '42' },
    learners: { type: 'string', default: '200' },
    batches: { type: 'string', default: '8' },
  },
});

const dataset = generateDataset({
  seed: Number(values.seed),
  learners: Number(values.learners),
  batches: Number(values.batches),
});
process.stdout.write(JSON.stringify(dataset, null, 2) + '\n');
