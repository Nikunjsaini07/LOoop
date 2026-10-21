"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { TOPICS, type CustomFeed, type Profile, type Source } from "@/lib/types";

type Props = {
  topicOptions?: string[];
  open: boolean;
  onClose: () => void;
  profile: Profile;
  sources: Source[];
  onSave: (feed: CustomFeed) => boolean;
  onPreferences: (patch: Partial<Profile>) => void;
  editingFeed?: CustomFeed | null;
  onDelete?: (id: string) => boolean;
};

export default function FeedDialog(props: Props) {
  const { open, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className="feed-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    {open && <FeedForm key={props.editingFeed?.id ?? "new"} {...props} labelId={id} />}
  </dialog>;
}

function FeedForm({ onClose, profile, sources, onSave, editingFeed, onDelete, labelId: id,topicOptions=TOPICS }: Props & { labelId: string }) {
  const [name, setName] = useState(editingFeed?.name ?? "");
  const [companies, setCompanies] = useState<string[]>(editingFeed?.companies ?? []);
  const [topics, setTopics] = useState<string[]>(editingFeed?.topics ?? []);
  const [exclude, setExclude] = useState(editingFeed?.exclude.join(", ") ?? "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showCompanies, setShowCompanies] = useState(false);

  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const selectedCompanyNames = companies.map((company) => sources.find((source) => source.id === company)?.company ?? company);
  const exclusions = exclude.split(",").map((word) => word.trim()).filter(Boolean);
  const companyLabel = companies.length ? `${companies.length} selected ${companies.length === 1 ? "company" : "companies"}` : "Any company";

  return <form className="feed-dialog-form" onSubmit={(event) => {
      event.preventDefault();
      const cleanedName = name.trim();
      if (!cleanedName) { setError("Give this edition a name."); return; }
      if (profile.customFeeds.some((feed) => feed.id !== editingFeed?.id && feed.name.toLowerCase() === cleanedName.toLowerCase())) { setError("An edition already has that name. Try another."); return; }
      if (exclusions.length > 30) { setError("Use at most 30 words or phrases to leave out."); return; }
      if (exclusions.some(value => value.length > 80)) { setError("Each excluded word or phrase must be 80 characters or fewer."); return; }
      if (!editingFeed && profile.customFeeds.length >= 30) { setError("You have 30 custom feeds. Edit an existing feed or remove one first."); return; }
      const saved = onSave({ id: editingFeed?.id ?? `feed-${crypto.randomUUID()}`, name: cleanedName, companies, topics, exclude: [...new Set(exclusions)] });
      if (saved) onClose();
      else setError("This feed could not be saved. Resolve any account sync notice, then try again. Your draft is still here.");
    }}>
      <header className="feed-dialog-heading"><div><p className="eyebrow">A little more personal</p><h2 id={`${id}-title`}>{editingFeed ? "Refine your edition" : "Make your own edition"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close feed editor"><X size={19} /></button></header>
      <p id={`${id}-intro`} className="section-description">Follow a particular thread of curiosity. New articles find their way here automatically.</p>
      <label className="feed-field">Edition name<input name="feed-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Systems worth understanding" maxLength={60} required aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /></label>

      <fieldset className="feed-fieldset"><legend>Companies <span>Optional</span></legend><button className="feed-company-trigger" type="button" aria-expanded={showCompanies} aria-controls={`${id}-companies`} onClick={() => setShowCompanies(!showCompanies)}><span>{companyLabel}</span><span>{showCompanies ? "Done" : "Choose"}</span></button>
        {!!companies.length && <p className="feed-selection-summary">{selectedCompanyNames.join(" · ")}</p>}
        {showCompanies && <div className="feed-company-picker" id={`${id}-companies`}><label className="feed-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a company" aria-label="Find a company" /></label><div className="feed-company-options">{sources.filter((source) => source.company.toLowerCase().includes(query.toLowerCase())).map((source) => <label className="feed-company-option" key={source.id}><input type="checkbox" checked={companies.includes(source.id)} onChange={() => setCompanies(toggle(companies, source.id))} /><span>{source.company}</span>{companies.includes(source.id) && <Check size={14} aria-hidden="true" />}</label>)}{!sources.some((source) => source.company.toLowerCase().includes(query.toLowerCase())) && <p className="library-note">No companies found.</p>}</div></div>}
      </fieldset>

      <fieldset className="feed-fieldset"><legend>Topics <span>Optional</span></legend><div className="feed-topic-options">{topicOptions.map((topic) => <button key={topic} type="button" className={`profile-interest${topics.includes(topic) ? " is-selected" : ""}`} aria-pressed={topics.includes(topic)} onClick={() => setTopics(toggle(topics, topic))}>{topic}{topics.includes(topic) && <Check size={13} aria-hidden="true" />}</button>)}</div></fieldset>
      <label className="feed-field">Leave out <span>Optional</span><input value={exclude} onChange={(event) => setExclude(event.target.value)} placeholder="e.g. hiring, events, podcast" maxLength={300} /><small>Words or phrases separated by commas.</small></label>
      <div className="feed-rule-preview"><span>Your edition will include</span><p>Articles from {companies.length ? selectedCompanyNames.join(" or ") : "any company"}{topics.length ? ` about ${topics.join(" or ")}` : ", on any topic"}.{exclusions.length ? ` Excluding articles mentioning ${exclusions.join(", ")}.` : ""}</p><small>Company and topic selections must both match. Recommendations stay within these rules.</small></div>
      {error && <p className="feed-error" id={`${id}-error`} role="alert">{error}</p>}
      <footer className="feed-dialog-footer">{editingFeed && onDelete ? <button className="text-button feed-delete" type="button" onClick={() => { if (onDelete(editingFeed.id)) onClose(); else setError("This feed could not be deleted. Resolve your account sync notice, then try again."); }}>Delete edition</button> : <button className="text-button" type="button" onClick={onClose}>Cancel</button>}<button className="ink-button" type="submit">{editingFeed ? "Save changes" : "Create edition"}</button></footer>
    </form>;
}
