import BlogReader from "@/components/BlogReader";
import { selectArticles } from "./core";
import { database,loadArticles,sources } from "./store";
import { queryFeed,feedInput } from "./feed-query";
import { emptyProfile,sanitizeProfile } from "./core";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readSources } from "./catalog";

type ReaderView = "home" | "trending" | "profile";

export async function renderReader(initialView: ReaderView) {
  try {
    const db=database();
    const catalog=await readSources(db);
    const user=await getChatGPTUser();
    const stored=user?await db.prepare('SELECT data FROM profiles WHERE user_id=?').bind(user.userId).first<{data:string}>():null;
    const profile=stored?sanitizeProfile(JSON.parse(stored.data),emptyProfile(),new Set(catalog.map(s=>s.id))):emptyProfile();
    const query=new URLSearchParams({mode:initialView==='trending'?'trending':'personal'});
    const initial=await queryFeed(db,feedInput(query,profile,new Date().toISOString()),catalog,{pageSize:12,owner:user?`account:${user.userId}`:'guest'});
    return <BlogReader initialView={initialView} initial={initial}/>;
  }catch{/* Keep the public seed readable while an offline preview is being migrated. */}
  const loaded = await loadArticles();
  const snapshot = new Date().toISOString();
  const eligible = selectArticles(loaded.articles, new URLSearchParams(), snapshot);
  const articles = eligible.slice(0, 100);
  const hasMore = eligible.length > articles.length;

  return <BlogReader initialView={initialView} initial={{
    articles,
    sources,
    total: eligible.length,
    hasMore,
    nextCursor: hasMore ? String(articles.length) : null,
    snapshot,
    updatedAt: loaded.updatedAt,
  }} />;
}
