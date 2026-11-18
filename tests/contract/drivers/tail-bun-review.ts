/** Redirect only the reviewed source to its bounded artifact copy. */
import { plugin } from 'bun';
import { readFileSync } from 'node:fs';
import { sourceReviewOverride } from './tail-node-loader.mjs';

const review = sourceReviewOverride(process.env['JAIT_SOURCE_REVIEW_OVERRIDE']);
if (review) {
  plugin({
    name: 'source-review-copy',
    setup(build) {
      const filter = new RegExp('^' + review.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
      build.onLoad({ filter }, (args) => {
        const contents = readFileSync(review.copy);
        if (contents.length > 2 * 1024 * 1024) throw new Error('Source review copy exceeds size limit');
        return { contents: contents.toString('utf8'), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    },
  });
}
