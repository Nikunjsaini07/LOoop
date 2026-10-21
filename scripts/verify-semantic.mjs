// Smoke test the real cached embedding model, independently of ranking fixtures.
import assert from 'node:assert/strict';
import {pipeline,env} from '@huggingface/transformers';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
env.cacheDir=fileURLToPath(new URL('../outputs/semantic/models',import.meta.url));
const extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{
  revision:'751bff37182d3f1213fa05d7196b954e230abad9',dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1},
});
const texts=[
  'How database replicas agree on the same sequence of writes.',
  'Reaching consensus between machines after network partitions.',
  'Our office cafeteria has a new breakfast menu and coffee bar.',
];
const vectors=(await extractor(texts,{pooling:'mean',normalize:true,truncation:true,max_length:256})).tolist();
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const related=dot(vectors[0],vectors[1]),unrelated=dot(vectors[0],vectors[2]);
assert.ok(vectors.every(v=>v.length===384&&Math.abs(dot(v,v)-1)<.001));
assert.ok(related>unrelated+.15,`Expected the related concept to score higher: ${related} versus ${unrelated}`);
const report={dimensions:384,relatedSimilarity:related,unrelatedSimilarity:unrelated,passed:true};
writeFileSync(new URL('../outputs/semantic/model-verification.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
