/**
 * Everything a community gets besides the ballot, as one mock community
 * page the visitor can flip through: the forum (where a thread can become a
 * vote), the library, podcasts and videos from the Media Studio, video
 * meetings, and the polls with their anonymous panel. The panes are drawn
 * with the app's own labels; they cycle on their own until the visitor picks
 * one.
 */
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarPlus,
  FileText,
  Layers,
  MessageSquare,
  Mic,
  Music,
  Pin,
  Play,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { reducedMotion } from './scroll';

export type Tool = 'forum' | 'library' | 'media' | 'meetings' | 'polls';
const TOOLS: Tool[] = ['forum', 'library', 'media', 'meetings', 'polls'];

export interface ToolsCopy {
  eyebrow: string;
  title: string;
  titleEm: string;
  lede: string;
  tools: Record<Tool, { t: string; d: string }>;
  community: string;
  members: string;
  tabs: string[];
  /** The platform's own name, for its podcasts, videos and polls. */
  platform: string;
  platformTabs: string[];
  forum: { topics: { t: string; n: string; pinned?: boolean }[]; reply: string; promote: string };
  library: { items: { t: string; kind: 'video' | 'audio' | 'doc' | 'deck'; pinned?: boolean }[]; pinned: string; note: string };
  media: { script: string; ready: string; podcast: string; teaser: string; featured: string; share: string };
  meetings: { live: string; queue: string; calendar: string; notified: string; recording: string };
  polls: { question: string; review: string; answers: [string, number, number][]; raw: string; weighted: string; tier: string; method: string };
}

const KIND_ICON = { video: Video, audio: Music, doc: FileText, deck: Layers } as const;

export default function CommunityTools({ copy }: { copy: ToolsCopy }) {
  const [tool, setTool] = useState<Tool>('forum');
  const touched = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  // Flip through the tools while the chapter is on screen, until the visitor
  // takes over.
  useEffect(() => {
    if (reducedMotion()) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 });
    if (sectionRef.current) io.observe(sectionRef.current);
    const timer = window.setInterval(() => {
      if (visible && !touched.current) setTool((t) => TOOLS[(TOOLS.indexOf(t) + 1) % TOOLS.length]);
    }, 5200);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  const pick = (t: Tool) => {
    touched.current = true;
    setTool(t);
  };

  const platform = tool === 'media' || tool === 'polls';
  // Which tab of the mock page the tool lives under; meetings open from the
  // community page itself, so no tab lights for them.
  const activeTab = { forum: 0, library: 3, meetings: -1, media: 0, polls: 2 }[tool];

  return (
    <section ref={sectionRef} className="tour-tools tour-parchment" id="t-tools" aria-labelledby="t-tools-title">
      <div className="tour-wrap tour-demo-grid">
        <div className="tour-demo-copy tour-reveal">
          <p className="tour-eyebrow"><span />{copy.eyebrow}</p>
          <h2 id="t-tools-title">
            {copy.title} <em>{copy.titleEm}</em>
          </h2>
          <p className="tour-lede">{copy.lede}</p>
          <div className="tools-list" role="tablist" aria-label={copy.eyebrow}>
            {TOOLS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tool === t} className={tool === t ? 'on' : ''} onClick={() => pick(t)}>
                <b>{copy.tools[t].t}</b>
                <span>{copy.tools[t].d}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tour-reveal">
          <div className="tools-frame" role="tabpanel" aria-label={copy.tools[tool].t}>
            <div className="tools-top">
              <div>
                <b>{platform ? copy.platform : copy.community}</b>
                {!platform && <small>{copy.members}</small>}
              </div>
              <nav aria-hidden="true">
                {(platform ? copy.platformTabs : copy.tabs).map((tab, i) => (
                  <span key={tab} className={i === activeTab ? 'on' : ''}>{tab}</span>
                ))}
              </nav>
            </div>

            <div className="tools-pane" key={tool}>
              {tool === 'forum' && (
                <div className="pane-forum">
                  {copy.forum.topics.map((tp) => (
                    <div className="topic" key={tp.t}>
                      <MessageSquare className="ic" aria-hidden="true" />
                      <div>
                        <p>
                          {tp.pinned && <Pin className="pin" aria-hidden="true" />}
                          {tp.t}
                        </p>
                        <small>{tp.n}</small>
                      </div>
                    </div>
                  ))}
                  <div className="reply">
                    <span className="av">ΕΚ</span>
                    <p>{copy.forum.reply}</p>
                  </div>
                  <span className="promote"><Sparkles aria-hidden="true" /> {copy.forum.promote}</span>
                </div>
              )}

              {tool === 'library' && (
                <div className="pane-library">
                  {copy.library.items.map((it) => {
                    const Icon = KIND_ICON[it.kind];
                    return (
                      <div className={`item k-${it.kind}`} key={it.t}>
                        <span className="thumb"><Icon aria-hidden="true" /></span>
                        <p>{it.t}</p>
                        {it.pinned && <small><Pin aria-hidden="true" /> {copy.library.pinned}</small>}
                      </div>
                    );
                  })}
                  <p className="note">{copy.library.note}</p>
                </div>
              )}

              {tool === 'media' && (
                <div className="pane-media">
                  <div className="script">
                    <Sparkles aria-hidden="true" />
                    <span>{copy.media.script}</span>
                    <em>{copy.media.ready}</em>
                  </div>
                  <div className="player">
                    <span className="play"><Mic aria-hidden="true" /></span>
                    <div>
                      <p>{copy.media.podcast}</p>
                      <div className="wave" aria-hidden="true">
                        {Array.from({ length: 36 }, (_, i) => (
                          <i key={i} style={{ height: `${22 + Math.abs(Math.sin(i * 1.7)) * 70}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="teaser">
                    <span className="vid"><Play aria-hidden="true" /></span>
                    <div>
                      <p>{copy.media.teaser}</p>
                      <small>★ {copy.media.featured}</small>
                      <small><Share2 aria-hidden="true" /> {copy.media.share}</small>
                    </div>
                  </div>
                </div>
              )}

              {tool === 'meetings' && (
                <div className="pane-meet">
                  <p className="live"><i /> {copy.meetings.live}</p>
                  <div className="tiles">
                    {['ΜΚ', 'ΝΠ', 'ΕΣ', 'ΓΔ', 'ΑΛ', 'ΘΡ'].map((n, i) => (
                      <span key={n} className={i === 0 ? 'speaking' : ''}>{n}</span>
                    ))}
                  </div>
                  <p className="queue">{copy.meetings.queue}</p>
                  <div className="acts">
                    <span><CalendarPlus aria-hidden="true" /> {copy.meetings.calendar}</span>
                    <span>{copy.meetings.notified}</span>
                  </div>
                  <p className="note">{copy.meetings.recording}</p>
                </div>
              )}

              {tool === 'polls' && (
                <div className="pane-polls">
                  <p className="q">{copy.polls.question}</p>
                  <p className="review"><ShieldCheck aria-hidden="true" /> {copy.polls.review}</p>
                  <div className="legend">
                    <span><i className="raw" /> {copy.polls.raw}</span>
                    <span><i className="wtd" /> {copy.polls.weighted}</span>
                  </div>
                  {copy.polls.answers.map(([a, raw, wtd]) => (
                    <div className="ans" key={a}>
                      <span>{a}</span>
                      <div className="bars">
                        <i className="raw" style={{ width: `${raw}%` }} />
                        <i className="wtd" style={{ width: `${wtd}%` }} />
                      </div>
                      <b>{wtd}%</b>
                    </div>
                  ))}
                  <div className="foot">
                    <span className="tier"><BarChart3 aria-hidden="true" /> {copy.polls.tier}</span>
                    <span>{copy.polls.method}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
