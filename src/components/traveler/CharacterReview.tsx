"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import { CHARACTER_CANDIDATES, CLIP_SPECS, RESIDENT_TYPES, REVIEW_ACTIONS, candidateResident, type CharacterCandidate, type ResidentType, type ReviewAction } from "@/lib/characters/manifest";
import { reviewDuration, type SceneCue } from "@/lib/characters/timeline";
import type { CharacterPlayback } from "./CharacterStage3D";
import styles from "./character-review.module.css";
import { tbilisiCountryPackV1 } from "@/content/countries/tbilisi.v1";
import { almatyCountryPackV1 } from "@/content/countries/almaty.v1";
import { StaticScene } from "@/components/scene/StaticScene";
import type { StageFrame } from "@/lib/world/stage-layout";
import type { CharacterContacts, VisualGrade } from "@/lib/world/visual-grade";
import type { QualityTier } from "@/lib/world/types";
import { gradeForHour } from "@/lib/world/time-grade";

const CharacterStage3D = dynamic(() => import("./CharacterStage3D").then(m => m.CharacterStage3D), { ssr: false });
const PixiScene = dynamic(() => import("@/components/scene/PixiScene").then(m => m.PixiScene), { ssr: false });
const noOp = () => {};
const RESIDENT_LABELS: Record<ResidentType, string> = { "resident-a": "Resident A · woman", "resident-b": "Resident B · man" };
const reviewRuntime = {
  globalActiveSeconds: 0,
  globalDistanceMetres: 0,
  paceRate: 1,
  authoritativeAt: "2026-09-09T00:00:00Z",
  walking: false,
};
const reviewCommand = { walking: false, speedFactor: 0, encounterPhase: "none" as const,
  cameraZoom: 1, cameraPan: 0, backgroundLife: 1 };

export function CharacterReview() {
  const [view,setView]=useState("front"),[background,setBackground]=useState("studio"),[npc,setNpc]=useState(false);
  const [candidate,setCandidate]=useState<CharacterCandidate>("v2");
  const [residentType,setResidentType]=useState<ResidentType>("resident-a");
  const [status,setStatus]=useState("Loading the character…");
  const [playback,setPlayback]=useState<CharacterPlayback>({action:"idle",playing:false,speed:1,seek:0,revision:0});
  const [progress,setProgress]=useState<{seconds:number;cue?:SceneCue}>({seconds:0});
  const [retry,setRetry]=useState(0);
  const [available,setAvailable]=useState(false);
  const [availableClips,setAvailableClips]=useState<ReadonlySet<string>>(()=>new Set());
  const [quality,setQuality]=useState<QualityTier>("high");
  const [studioHour,setStudioHour]=useState(12);
  const [pixiReady,setPixiReady]=useState(false);
  const [pixiFailed,setPixiFailed]=useState(false);
  const stageFrame=useRef<StageFrame | null>(null);
  const contacts=useRef<CharacterContacts>({traveler:null,resident:null});
  const grade=useRef<VisualGrade>({exposure:1,tint:{r:1,g:1,b:1}});
  useEffect(()=>{ if(background==="studio") grade.current=gradeForHour(studioHour); },[background,studioHour]);
  const worldReady=useRef(false);
  const reviewPack=useMemo(()=>{
    if(background==="studio")return null;
    const pack=background==="almaty"?almatyCountryPackV1:tbilisiCountryPackV1;
    const zone=background==="almaty"?pack.route.zones[0]:pack.route.zones.find(zone=>zone.id===background)!;
    return {...pack,route:{...pack.route,zones:[zone]}};
  },[background]);
  const publishStage=useCallback((frame:StageFrame,source:"static"|"pixi")=>{
    if(source==="pixi"||!worldReady.current)stageFrame.current=frame;
  },[]);
  const ready=useCallback(()=>{worldReady.current=true;setPixiReady(true);},[]);
  const failed=useCallback(()=>{worldReady.current=false;setPixiFailed(true);setPixiReady(false);},[]);
  const selectAction=(action:ReviewAction)=>setPlayback(p=>({...p,action,seek:0,revision:p.revision+1,
    playing:!window.matchMedia("(prefers-reduced-motion: reduce)").matches}));
  return <main className={styles.review}>
    {reviewPack&&<div className={styles.world} data-renderer={pixiReady?"pixi":"static"}>
      <StaticScene resolution={1} zone={reviewPack.route.zones[0]}
        assetVersion={reviewPack.assetVersion} active={!pixiReady} onStageFrame={publishStage} onReady={noOp} />
      {!pixiFailed&&<PixiScene key={background} pack={reviewPack} contacts={contacts} grade={grade}
        onStageFrame={publishStage} routeSeconds={0} routeRuntime={reviewRuntime} command={reviewCommand}
        reducedMotion qualityTier={quality} onZoneChange={noOp} onDiagnostics={noOp} onReady={ready} onFailure={failed} />}
    </div>}
    {!available&&
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.fallback} src="/traveler/temporary/v1/idle.webp" alt="Original traveler reference" />}
    <CharacterStage3D candidate={candidate} stageFrame={stageFrame} contacts={contacts} grade={grade}
      composition={Boolean(reviewPack)} qualityTier={quality}
      onClipAvailability={setAvailableClips}
      onAvailability={setAvailable} key={`${candidate}-${residentType}-${retry}`} residentType={residentType} view={view} showNpc={npc} playback={playback} onStatus={setStatus}
      onProgress={(seconds,cue)=>setProgress({seconds,cue})} />
    <aside className={styles.controls} aria-label="Character review controls">
      <strong>Character review · {reviewPack?.cityName??"Studio"}</strong>
      <small>Character repairs in progress — visual target not met</small>
      <label>Candidate <select aria-label="Character candidate" value={candidate} onChange={e=>{const next=e.target.value as CharacterCandidate;setAvailable(false);setAvailableClips(new Set());setCandidate(next);if(!candidateResident(next,residentType))setResidentType("resident-a");}}>
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
      <label>Setting <select aria-label="Review setting" value={background} onChange={e=>{
        stageFrame.current=null;worldReady.current=false;contacts.current={traveler:null,resident:null};
        setPixiReady(false);setPixiFailed(false);setBackground(e.target.value);
      }}>
        <option value="studio">Neutral studio</option><option value="almaty">Almaty promenade</option>
        {tbilisiCountryPackV1.route.zones.map(zone=><option key={zone.id} value={zone.id}>Tbilisi · {zone.label}</option>)}
      </select></label>
      {background==="studio"&&<label>Studio lighting <select aria-label="Studio lighting" value={studioHour} onChange={e=>setStudioHour(Number(e.target.value))}>
        <option value={12}>Daylight</option><option value={19}>Dusk</option><option value={23}>Night · warm lamp</option>
      </select></label>}
      <label>Quality <select aria-label="Review quality" value={quality} onChange={e=>setQuality(e.target.value as QualityTier)}>
        <option value="high">High · outline</option><option value="medium">Medium · outline</option><option value="low">Low · no outline</option>
      </select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={npc||playback.action==="encounter"} disabled={playback.action==="encounter"} onChange={e=>setNpc(e.target.checked)} /> Show local resident</label>
      <label>Resident <select aria-label="Resident character" value={residentType} onChange={e=>{setAvailable(false);setAvailableClips(new Set());setNpc(true);setResidentType(e.target.value as ResidentType);}}>
        {RESIDENT_TYPES.filter(type=>candidateResident(candidate,type)).map(type=><option key={type} value={type}>{RESIDENT_LABELS[type]}</option>)}
      </select></label>
      <p role="status" aria-label="Renderer status" className={styles.status}>{status}</p>
      <details open><summary>Manifest clips</summary>
        <ul className={styles.clipList} data-testid="manifest-clip-list">
          {Object.keys(CLIP_SPECS).map(name=><li key={name}>
            <code>{name}</code>
            <span data-missing={String(!availableClips.has(name))}>{availableClips.has(name)?"ready":`missing · uses ${CLIP_SPECS[name as keyof typeof CLIP_SPECS].fallback??"none"}`}</span>
          </li>)}
        </ul>
      </details>
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
