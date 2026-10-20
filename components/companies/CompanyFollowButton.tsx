"use client";

import { Check, Plus } from "lucide-react";

export default function CompanyFollowButton({ name, following, ready, onToggle }: {
  name: string; following: boolean; ready: boolean; onToggle: () => void;
}) {
  return <button className={`company-follow${following ? " is-following" : ""}`} disabled={!ready}
    aria-label={`${following ? "Unfollow" : "Follow"} ${name}`} aria-pressed={following} onClick={onToggle}>
    {following ? <Check size={13} /> : <Plus size={13} />}<span>{following ? "Following" : "Follow"}</span>
  </button>;
}
