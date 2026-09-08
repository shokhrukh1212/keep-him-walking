"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import { CHARACTER_CANDIDATES, REVIEW_ACTIONS, type CharacterCandidate, type ReviewAction } from "@/lib/characters/manifest";
import { reviewDuration, type SceneCue } from "@/lib/characters/timeline";
import type { CharacterPlayback } from "./CharacterStage3D";
import styles from "./character-review.module.css";

const CharacterStage3D = dynamic(() => import("./CharacterStage3D").then(m => m.CharacterStage3D), { ssr: false });

export function CharacterReview() {
  const [view,setView]=useState("front"),[background,setBackground]=useState("studio"),[npc,setNpc]=useState(false);
  const [candidate,setCandidate]=useState<CharacterCandidate>("v2");
  const [status,setStatus]=useState("Loading the character…");
  const [playback,setPlayback]=useState<CharacterPlayback>({action:"idle",playing:false,speed:1,seek:0,revision:0});
  const [progress,setProgress]=useState<{seconds:number;cue?:SceneCue}>({seconds:0});
  const [retry,setRetry]=useState(0);
  const [available,setAvailable]=useState(false);
  const selectAction=(action:ReviewAction)=>setPlayback(p=>({...p,action,seek:0,revision:p.revision+1,
    playing:!window.matchMedia("(prefers-reduced-motion: reduce)").matches}));
  return <main className={styles.review}>
    {background === "almaty" &&
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.backdrop} src={publicAssetUrl("/scenes/almaty/v1/zones/arbat-arrival/fallback.webp")} crossOrigin="anonymous" alt="" />}
    {!available&&
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.fallback} src="/traveler/temporary/v1/idle.webp" alt="Original traveler reference" />}
    <CharacterStage3D candidate={candidate} onAvailability={setAvailable} key={`${candidate}-${retry}`} view={view} showNpc={npc} playback={playback} onStatus={setStatus}
      onProgress={(seconds,cue)=>setProgress({seconds,cue})} />
    <aside className={styles.controls} aria-label="Character review controls">
      <strong>Character review · Almaty</strong>
      <small>Character repairs in progress — visual target not met</small>
      <label>Candidate <select aria-label="Character candidate" value={candidate} onChange={e=>{setAvailable(false);setCandidate(e.target.value as CharacterCandidate);}}>
        {Object.entries(CHARACTER_CANDIDATES).map(([value,item])=><option key={value} value={value}>{item.label}</option>)}
      </select></label>
      <label>Action <select aria-label="Preview action" value={playback.action} onChange={e=>selectAction(e.target.value as ReviewAction)}>
        {REVIEW_ACTIONS.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}
      </select></label>
      <div className={styles.row}>
        <button type="button" onClick={()=>setPlayback(p=>({...p,playing:!p.playing}))}>{playback.playing?"Pause":"Play"}</button>
        <label>Speed <select aria-label="Playback speed" value={playback.speed} onChange={e=>setPlayback(p=>({...p,speed:Number(e.target.value)}))}>
          <option value={1}>Normal</option><option value={.25}>Quarter speed</option>
        </select></label>
      </div>
      <label>Timeline · {progress.seconds.toFixed(1)} / {reviewDuration(playback.action).toFixed(1)} s
        <input aria-label="Animation timeline" type="range" min={0} max={reviewDuration(playback.action)} step={.01} value={progress.seconds}
          onChange={e=>{const seek=Number(e.target.value);setProgress({seconds:seek});setPlayback(p=>({...p,seek,playing:false,revision:p.revision+1}));}} />
      </label>
      <label>View <select aria-label="Character view" disabled={playback.action==="encounter"} value={view} onChange={e=>setView(e.target.value)}>
        <option value="front">Front</option><option value="three-quarter">Three-quarter</option><option value="side">Side</option><option value="back">Back</option>
      </select></label>
      <label>Setting <select aria-label="Review setting" value={background} onChange={e=>setBackground(e.target.value)}>
        <option value="studio">Neutral studio</option><option value="almaty">Almaty promenade</option>
      </select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={npc||playback.action==="encounter"} disabled={playback.action==="encounter"} onChange={e=>setNpc(e.target.checked)} /> Show local resident</label>
      <p role="status" aria-label="Renderer status" className={styles.status}>{status}</p>
      <button type="button" onClick={()=>{setAvailable(false);setRetry(r=>r+1);}}>Reload characters</button>
      <details><summary>Original identity reference</summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/traveler/temporary/v1/idle.webp" alt="Approved original traveler" className={styles.reference} />
      </details>
      <a href={publicAssetUrl(`/characters/${candidate}/CREDITS.md`)} target="_blank" rel="noreferrer">Character asset credits</a>
      {progress.cue?.dialogue&&<p className={styles.dialogue}><strong>{progress.cue.dialogue.speaker}</strong><br />{progress.cue.dialogue.text}</p>}
    </aside>
    <output className={styles.phase}>{progress.cue?.phase??"Standing"}</output>
  </main>;
}
