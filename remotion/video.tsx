import React from 'react';
import './style.css';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

const C = { bg: '#edf3f5', paper: '#f7fafb', tray: '#e6eef2', line: '#d5e0e5', ink: '#292524', muted: '#78716c', sky: '#8acae7', dark: '#353535' };
const scenes = [
  { start: 0, end: 240, eyebrow: 'A quieter way to keep up', title: <>Engineering moves<br/>fast. <i>Read well.</i></>, sub: 'The best ideas are already out there. Readwell brings them together.' },
  { start: 240, end: 600, eyebrow: 'One thoughtful feed', title: <>Your reading,<br/><i>in one place.</i></>, sub: 'Fresh engineering stories from the teams building what’s next.' },
  { start: 600, end: 990, eyebrow: 'Follow your curiosity', title: <>Find the signal<br/><i>that matters.</i></>, sub: 'Search, scan topics, and let your interests shape the reading.' },
  { start: 990, end: 1350, eyebrow: 'Built from the source', title: <>Ideas from the<br/><i>people behind them.</i></>, sub: 'Explore engineering blogs across the companies you follow.' },
  { start: 1350, end: 1710, eyebrow: 'A pulse on the field', title: <>See what readers<br/><i>are discovering.</i></>, sub: 'Trending brings timely stories to the surface.' },
  { start: 1710, end: 2040, eyebrow: 'Make it your own', title: <>A library that<br/><i>stays with you.</i></>, sub: 'Save stories, follow companies, and keep a record of what you read.' },
  { start: 2040, end: 2250, eyebrow: 'Less noise. Better reading.', title: <>Make room for<br/><i>good ideas.</i></>, sub: 'A calmer home for engineering stories.' },
  { start: 2250, end: 2400, eyebrow: 'Readwell', title: <>Readwell</>, sub: 'Engineering stories, thoughtfully gathered.' },
];

const articles = [
  ['Anthropic', 'Redesigning source control at Anthropic', 'PRODUCT · 8 MIN READ'],
  ['Notion', 'Building Shared Memory for AI Agents in Notion', 'AI & ML · 6 MIN READ'],
  ['Snowflake', 'Snowflake Optima Planning: From Two Hours to 30 Seconds', 'DATA · 5 MIN READ'],
];
const logos = ['anthropic.png', 'notion.ico', 'snowflake.png', 'linear.ico', 'github.svg', 'cloudflare.png', 'openai.ico', 'spotify.png'];

const DotField: React.FC = () => <div style={{ position: 'absolute', inset: 0, opacity: .54, backgroundImage: 'radial-gradient(circle at 1px 1px, #698a9e26 .65px, transparent .9px)', backgroundSize: '9px 9px' }} />;

const ArticleCard: React.FC<{ item: string[]; index: number; frame: number }> = ({ item, index, frame }) => {
  const y = interpolate(frame - 30 - index * 12, [0, 20], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame - 30 - index * 12, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <div style={{ transform: `translateY(${y}px)`, opacity, padding: '23px 25px', borderRadius: 16, border: `1px solid ${C.line}`, background: C.paper, marginBottom: 14 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: C.muted, fontSize: 14 }}><span style={{ width: 33, height: 33, display: 'grid', placeItems: 'center', borderRadius: 10, background: '#fff', border: `1px solid ${C.line}`, color: C.ink, fontFamily: 'Cal Sans' }}>{item[0][0]}</span>{item[0]}<span style={{ marginLeft: 'auto', color: C.sky }}>↗</span></div>
    <div style={{ marginTop: 17, font: '26px/1.2 Cal Sans, sans-serif', letterSpacing: '-.4px', color: C.ink }}>{item[1]}</div><div style={{ marginTop: 12, fontSize: 11, letterSpacing: 1.3, color: C.muted }}>{item[2]}</div>
  </div>;
};

const AppWindow: React.FC<{ frame: number; scene: number }> = ({ frame, scene }) => {
  const offset = scene === 2 ? 12 : scene === 4 ? 8 : 0;
  const items = scene === 4 ? [articles[1], articles[0], articles[2]] : articles;
  return <div style={{ position: 'relative', width: 720, height: 694, border: `1px solid ${C.line}`, borderRadius: 24, background: '#ffffffb8', boxShadow: '0 30px 90px #42545e12', padding: '26px 30px', overflow: 'hidden', transform: `translateY(${interpolate(frame, [0, 80], [28, 0], { extrapolateRight: 'clamp' })}px)` }}>
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.line}`, paddingBottom: 19 }}><img src={staticFile('brand/readwell-original.png')} style={{ width: 30, height: 30, objectFit: 'contain', marginRight: 9 }} /><b style={{ font: '20px Cal Sans', color: C.ink }}>Readwell</b><div style={{ marginLeft: 48, display: 'flex', gap: 25, color: C.muted, fontSize: 13 }}><span style={{ color: C.ink }}>Feed</span><span>Trending</span><span>Companies</span><span>Profile</span></div><span style={{ marginLeft: 'auto', color: C.muted }}>◐</span></div>
    <div style={{ padding: '28px 0 18px', display: 'flex', alignItems: 'end' }}><div><div style={{ fontSize: 11, letterSpacing: 1.5, color: '#66879a', textTransform: 'uppercase' }}>Your engineering reading</div><div style={{ font: '34px/1.12 Cal Sans', color: C.ink, marginTop: 9 }}>{scene === 4 ? 'Trending this week' : 'A good place to begin.'}</div></div><div style={{ marginLeft: 'auto', color: C.muted, fontSize: 12 }}>Today, in focus</div></div>
    <div style={{ display: 'flex', height: 42, border: `1px solid ${C.line}`, borderRadius: 11, background: C.paper, alignItems: 'center', padding: '0 14px', color: C.muted, fontSize: 13 }}>⌕ <span style={{ marginLeft: 9 }}>Search engineering stories</span><span style={{ marginLeft: 'auto', border: `1px solid ${C.line}`, borderRadius: 5, padding: '0 6px', fontSize: 11 }}>⌘ K</span></div>
    <div style={{ display: 'flex', gap: 8, margin: '17px 0 22px' }}>{['All stories', 'AI & ML', 'Systems', 'Product', 'Data'].map((x, i) => <div key={x} style={{ padding: '8px 13px', borderRadius: 99, background: (scene === 2 ? i === 1 : i === 0) ? C.dark : C.paper, color: (scene === 2 ? i === 1 : i === 0) ? '#fff' : C.muted, border: `1px solid ${(scene === 2 ? i === 1 : i === 0) ? C.dark : C.line}`, fontSize: 12 }}>{x}</div>)}</div>
    {items.map((item, i) => <ArticleCard key={`${scene}-${item[0]}`} item={item} index={i} frame={frame - offset} />)}
    <div style={{ position: 'absolute', bottom: 22, right: 30, fontSize: 12, color: C.muted }}>Thoughtfully gathered · Updated regularly</div>
  </div>;
};

const Companies: React.FC<{ frame: number }> = ({ frame }) => <div style={{ width: 720, minHeight: 450, padding: 38, borderRadius: 24, border: `1px solid ${C.line}`, background: C.paper, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, color: C.muted }}>A wider reading desk</div><div style={{ font: '36px Cal Sans', margin: '12px 0 34px', color: C.ink }}>Follow the teams you admire.</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22 }}>{logos.map((logo, i) => <div key={logo} style={{ height: 92, border: `1px solid ${C.line}`, borderRadius: 16, background: '#fff', display: 'grid', placeItems: 'center', opacity: interpolate(frame - 30 - i * 4, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}><Img src={staticFile(`company-logos/${logo}`)} style={{ width: 37, height: 37, objectFit: 'contain' }} /></div>)}</div><div style={{ display: 'flex', gap: 8, marginTop: 28, color: C.muted, fontSize: 13 }}><span style={{ color: C.sky }}>●</span> Anthropic <span style={{ color: C.sky }}>●</span> GitHub <span style={{ color: C.sky }}>●</span> Linear <span style={{ color: C.sky }}>●</span> Cloudflare <span style={{ color: C.sky }}>●</span> and many more</div>
</div>;

const Profile: React.FC = () => <div style={{ width: 720, padding: 36, borderRadius: 24, border: `1px solid ${C.line}`, background: C.paper }}><div style={{ fontSize: 12, letterSpacing: 1.3, color: C.muted, textTransform: 'uppercase' }}>Your library</div><div style={{ font: '36px Cal Sans', margin: '12px 0 24px' }}>Keep the stories worth keeping.</div><div style={{ display: 'flex', gap: 9, marginBottom: 22 }}>{['Bookmarks', 'Read log', 'Following', 'Interests'].map((t, i) => <div key={t} style={{ borderRadius: 99, padding: '8px 13px', border: `1px solid ${C.line}`, background: i === 0 ? C.dark : '#fff', color: i === 0 ? '#fff' : C.muted, fontSize: 12 }}>{t}</div>)}</div>{articles.slice(0, 2).map((a, i) => <div key={a[1]} style={{ padding: '18px 0', borderTop: `1px solid ${C.line}` }}><div style={{ fontSize: 12, color: C.muted }}>{a[0]} <span style={{ float: 'right', color: C.sky }}>◆ Saved</span></div><div style={{ font: '22px Cal Sans', marginTop: 9 }}>{a[1]}</div></div>)}</div>;

export const ReadwellIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneIndex = scenes.findIndex((s, i) => frame >= s.start && frame < s.end || i === scenes.length - 1 && frame >= s.start);
  const scene = scenes[Math.max(sceneIndex, 0)];
  const local = frame - scene.start;
  const fade = interpolate(Math.min(local, scene.end - frame), [0, 18, 40], [0, 1, 1], { extrapolateRight: 'clamp' });
  const sideOpacity = interpolate(local, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const progress = frame / 2400;
  return <AbsoluteFill style={{ backgroundColor: C.bg, color: C.ink, fontFamily: 'Geist, sans-serif', overflow: 'hidden' }}>
    <DotField />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #eaf2f5aa 0%, transparent 42%)' }} />
    <div style={{ position: 'absolute', left: 96, top: 82, font: '19px Cal Sans', display: 'flex', alignItems: 'center', gap: 10, opacity: .76 }}><img src={staticFile('brand/readwell-original.png')} style={{ width: 29, height: 29, objectFit: 'contain' }} /> Readwell</div>
    <div style={{ position: 'absolute', top: 90, right: 100, color: '#66879a', letterSpacing: 1.7, fontSize: 11 }}>ENGINEERING, THOUGHTFULLY READ</div>
    <div style={{ position: 'absolute', left: 115, top: 250, width: 650, opacity: sideOpacity * fade, transform: `translateY(${interpolate(local, [0, 30], [18, 0], { extrapolateRight: 'clamp' })}px)` }}>
      <div style={{ color: '#648396', letterSpacing: 2, fontSize: 13, textTransform: 'uppercase', marginBottom: 26 }}>{scene.eyebrow}</div>
      <div style={{ font: '64px/.99 Cal Sans, sans-serif', letterSpacing: '-2.5px', color: C.ink }}>{scene.title}</div>
      <div style={{ font: '20px/1.6 Geist, sans-serif', color: C.muted, maxWidth: 450, marginTop: 26 }}>{scene.sub}</div>
      {sceneIndex === 7 && <div style={{ display: 'inline-flex', marginTop: 31, padding: '12px 19px', background: C.dark, color: '#fff', borderRadius: 9, fontSize: 14 }}>Make space to read <span style={{ marginLeft: 17, color: C.sky }}>↗</span></div>}
    </div>
    <div style={{ position: 'absolute', right: 104, top: 190, opacity: sceneIndex === 3 ? 0 : sideOpacity * fade, transform: `translateX(${interpolate(local, [0, 34], [24, 0], { extrapolateRight: 'clamp' })}px) scale(${sceneIndex === 7 ? .88 : 1})`, transformOrigin: 'center right' }}>{sceneIndex === 5 ? <Profile /> : <AppWindow frame={local} scene={sceneIndex} />}</div>
    {sceneIndex === 3 && <div style={{ position: 'absolute', right: 104, top: 280, opacity: sideOpacity * fade, transform: `translateX(${interpolate(local, [0, 34], [24, 0], { extrapolateRight: 'clamp' })}px)` }}><Companies frame={local} /></div>}
    <div style={{ position: 'absolute', left: 100, right: 100, bottom: 68, height: 2, background: '#d5e0e5' }}><div style={{ width: `${progress * 100}%`, height: '100%', background: C.sky }} /></div>
    <div style={{ position: 'absolute', left: 100, bottom: 39, color: '#8b9599', fontSize: 11, letterSpacing: 1.2 }}>A BETTER WAY TO FOLLOW ENGINEERING</div>
    <div style={{ position: 'absolute', right: 100, bottom: 38, color: '#8b9599', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{String(Math.floor(frame / 30 / 60)).padStart(2, '0')}:{String(Math.floor(frame / 30 % 60)).padStart(2, '0')}</div>
  </AbsoluteFill>;
};
