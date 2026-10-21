import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function testDatabase() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const migration of ['0000_glamorous_richard_fisk.sql','0001_readzz_domain.sql','0002_engagement_totals.sql','0003_engineering_publishers.sql','0004_semantic_feed.sql','0005_semantic_generation.sql','0006_reader_reports.sql'])sql.exec(readFileSync(new URL(`../../drizzle/${migration}`,import.meta.url),'utf8'));
  let statements=0;
  const db={prepare(text){const bind=(...args)=>{
    if(args.length>100)throw new Error('D1 parameter limit exceeded');
    const runSync=()=>{statements++;const result=sql.prepare(text).run(...args);return {success:true,meta:{changes:Number(result.changes)}};};
    return {bind,runSync,async run(){return runSync();},async all(){statements++;return {results:sql.prepare(text).all(...args),success:true};},async first(){statements++;return sql.prepare(text).get(...args)??null;}};
  };return bind();},async batch(items){sql.exec('BEGIN');try{const result=items.map(item=>item.runSync());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  return {db,sql,get statements(){return statements;},close(){sql.close();}};
}
