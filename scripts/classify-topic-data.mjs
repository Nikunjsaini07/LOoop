import { createTopicClassifier } from '../lib/topics.ts';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { catalog, articles } = JSON.parse(input);
const classify = createTopicClassifier(catalog);
process.stdout.write(JSON.stringify(articles.map(article => ({ id: article.id, topics: classify(article.title, article.summary) }))));
