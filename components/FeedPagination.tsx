import { ChevronLeft, ChevronRight } from "lucide-react";

export default function FeedPagination({ current, total, loading, onChange }: {current:number;total:number;loading:boolean;onChange:(page:number)=>void}) {
  if (total <= 1) return null;
  const visible = total <= 7 ? Array.from({length:total},(_,i)=>i+1) : [...new Set([1,...(current<=3?[2,3,4]:current>=total-2?[total-3,total-2,total-1]:[current-1,current,current+1]),total])].sort((a,b)=>a-b);
  return <nav className="feed-pagination" aria-label="Feed pages">
    <button className="pagination-arrow" aria-label="Previous page" disabled={loading||current<=1} onClick={()=>onChange(current-1)}><ChevronLeft size={16}/></button>
    {visible.flatMap((number,index)=>[
      ...(index>0 && number-visible[index-1]>1 ? [<span key={`gap-${number}`} className="pagination-gap" aria-hidden="true">…</span>] : []),
      <button key={number} aria-label={`Page ${number}`} aria-current={current===number?"page":undefined} disabled={loading} onClick={()=>onChange(number)}>{number}</button>
    ])}
    <button className="pagination-arrow" aria-label="Next page" disabled={loading||current>=total} onClick={()=>onChange(current+1)}><ChevronRight size={16}/></button>
  </nav>;
}
