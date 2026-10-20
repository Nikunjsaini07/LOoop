import type { Source } from "../types";
import { createTopicClassifier } from "../topics.ts";

export async function readSources(db:D1Database):Promise<Source[]> {
  const rows=(await db.prepare('SELECT s.*,c.name AS company FROM sources s JOIN companies c ON c.id=s.company_id ORDER BY c.name').all<Record<string,unknown>>()).results;
  return rows.map(row=>({id:String(row.company_id),company:String(row.company),mode:row.mode as Source['mode'],blog_url:String(row.blog_url),feed_urls:JSON.parse(String(row.feed_urls)),notes:'',include_url_regex:row.include_url_regex?String(row.include_url_regex):undefined,exclude_url_regex:row.exclude_url_regex?String(row.exclude_url_regex):undefined}));
}

export async function readTopicClassifier(db:D1Database) {
  const rows=(await db.prepare("SELECT t.id,t.name,t.parent_id AS parent,json_group_array(json_object('term',k.term,'weight',k.weight)) AS keywords FROM topics t JOIN topic_keywords k ON k.topic_id=t.id GROUP BY t.id,t.name,t.parent_id").all<{id:string;name:string;parent:string|null;keywords:string}>()).results;
  return createTopicClassifier(rows.map(row=>{const keywords=JSON.parse(row.keywords) as {term:string;weight:number}[];return {...row,keywords:keywords.map(k=>k.term),keywordWeights:Object.fromEntries(keywords.map(k=>[k.term,k.weight]))};}));
}
