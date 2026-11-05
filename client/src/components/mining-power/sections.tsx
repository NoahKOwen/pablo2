import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, History, Layers, RefreshCcw } from "lucide-react";
import type {
  MiningPowerActivationDTO, MiningPowerNetworkDTO,
  MiningPowerOverviewDTO, MiningPowerPage, MiningPowerRewardDTO,
} from "@shared/mining-power-view";
import { displayDecimal, utcDate, pctRatio, safeSharePercent } from "./format";

async function getJson<T>(url:string):Promise<T>{const res=await apiRequest("GET",url);return res.json() as Promise<T>;}
function Info({message}:{message:string}){
  return <div className="rounded-xl border border-dashed border-border p-6 text-sm text-foreground/75" role="status">{message}</div>;
}
function Tile({title,value,sub}:{title:string,value:string,sub:string}) {
  return <Card className="min-w-0"><CardHeader className="pb-2"><CardDescription className="text-foreground/75">{title}</CardDescription>
    <CardTitle className="break-words text-xl sm:text-2xl tabular-nums">{value}</CardTitle></CardHeader>
    <CardContent><p className="text-xs leading-relaxed text-foreground/75">{sub}</p></CardContent></Card>;
}

export function MiningPowerDashboard({overview,network}:{overview:MiningPowerOverviewDTO|null;network:MiningPowerNetworkDTO|null}) {
  if(!overview) return <Info message="Account mining statistics are unavailable. Refresh this page to retry."/>;
  const userShare=overview.latestSnapshotEffectiveMp&&network?.latestDay&&
    overview.latestSnapshotDayUtc===network.latestDay.dayUtc
      ? safeSharePercent(overview.latestSnapshotEffectiveMp,network.latestDay.qualifiedEffectiveMp) : null;
  return <div className="space-y-5" data-testid="mining-power-dashboard">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Tile title="Eligible Base Mining Power" value={`${displayDecimal(overview.eligibleBaseMp)} MP`} sub="Eligible at today's UTC boundary; not a token balance"/>
      <Tile title="Latest frozen Effective MP" value={overview.latestSnapshotEffectiveMp===null?"Not recorded":`${displayDecimal(overview.latestSnapshotEffectiveMp)} MP`} sub={overview.latestSnapshotDayUtc?`R3 snapshot: ${utcDate(overview.latestSnapshotDayUtc)}`:"No finalized reward-day snapshot yet"}/>
      <Tile title="Active activations" value={`${overview.activeCount}`} sub={`${overview.activationCount} total recorded activations`}/>
      <Tile title="Credited Mining Power rewards" value={`${displayDecimal(overview.creditedMiningPowerXnrt,9)} XNRT`} sub={`${overview.creditedAllocationCount} posted R4 ledger entries; excludes legacy mining`}/>
      <Tile title="Pending allocated rewards" value={`${displayDecimal(overview.allocatedPendingXnrt,9)} XNRT`} sub={`${overview.pendingAllocationCount} allocations awaiting credit; not spendable`}/>
      <Tile title="Historical network share" value={userShare??"Not available"} sub="Measured only when your latest snapshot and the network's latest day match"/>
    </div>
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground/75">
      Next UTC day boundary: <strong className="text-foreground">{utcDate(overview.nextUtcBoundary)}</strong>.
      This is a calendar boundary, not a promise of allocation or credit. Rewards depend on network participation and authorized emission.
    </div>
  </div>;
}

function useCursorData<T>(baseUrl:string,key:string){
  const [cursor,setCursor]=useState<string|null>(null);
  const [previous,setPrevious]=useState<(string|null)[]>([]);
  const query=useQuery<MiningPowerPage<T>>({
    queryKey:["r5",key,cursor??"first"],
    queryFn:()=>getJson<MiningPowerPage<T>>(`${baseUrl}?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`),
    staleTime:15_000,
  });
  const next=()=>{if(query.data?.nextCursor){setPrevious(v=>[...v,cursor]);setCursor(query.data.nextCursor);}};
  const back=()=>setPrevious(v=>{if(!v.length)return v;setCursor(v[v.length-1]);return v.slice(0,-1);});
  return { ...query,next,back,hasPrevious:previous.length>0 };
}
function Paginator({back,next,hasPrevious,hasNext,loading}:{back:()=>void;next:()=>void;hasPrevious:boolean;hasNext:boolean;loading:boolean}){
  return <div className="flex justify-end gap-2 pt-3">
    <Button variant="outline" size="sm" onClick={back} disabled={!hasPrevious||loading}>Previous</Button>
    <Button variant="outline" size="sm" onClick={next} disabled={!hasNext||loading}>Next</Button>
  </div>;
}
export function MiningPowerActivations({onExplorePackages}:{onExplorePackages:()=>void}){
  const page=useCursorData<MiningPowerActivationDTO>("/api/mining-power/me/activations","activations");
  const {toast}=useToast();
  const [exitTarget,setExitTarget]=useState<string|null>(null);
  const exit=useMutation({
    mutationFn:async(id:string)=>{const res=await apiRequest("POST",`/api/mining-power/activations/${encodeURIComponent(id)}/exit`,{});return res.json();},
    onSuccess:()=>{
      setExitTarget(null);
      queryClient.invalidateQueries({queryKey:["r5"]});
      toast({title:"Early exit requested",description:"Future reward participation will stop at the next eligible UTC boundary."});
    },
    onError:(e:Error)=>toast({title:"Exit request failed",description:e.message,variant:"destructive"}),
  });
  return <Card data-testid="mining-power-activations"><CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5"/> My Activations</CardTitle>
    <CardDescription className="text-foreground/75">Review your Mining Power activations, payment status, duration and expiry. The activation amount is non-refundable once approved.</CardDescription></CardHeader><CardContent className="space-y-3">
    {page.isLoading?<Info message="Loading activations…"/>:page.isError?<Info message="Unable to load activations. Retry by refreshing the page."/>:
     !page.data?.items.length?<div className="space-y-3 rounded-xl border border-dashed border-border p-5" role="status" data-testid="mining-activations-empty">
        <p className="text-sm text-foreground/75">No Mining Power activations yet. You can explore available packages while activation is in preview mode.</p>
        <Button size="sm" variant="outline" onClick={onExplorePackages}>Explore Mining Power packages</Button>
      </div>:
     page.data.items.map(a=><div key={a.id} className="rounded-xl border border-border p-4 space-y-3" data-testid="mining-power-activation-row">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-base">{a.packageName}</strong><Badge variant="secondary">{a.status.replace(/_/g," ")}</Badge></div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-foreground/75">Activation</p><strong>{displayDecimal(a.paymentAmountUsdt,2)} USDT</strong></div>
        <div><p className="text-foreground/75">Base MP</p><strong>{displayDecimal(a.baseMp)} MP</strong></div>
        <div><p className="text-foreground/75">Static weighted</p><strong>{displayDecimal(a.staticWeightedMp)} MP</strong></div>
        <div><p className="text-foreground/75">Duration</p><strong>{a.durationMonths} months</strong></div>
      </div>
      <p className="text-xs text-foreground/75">Created {utcDate(a.createdAt)} · Eligible {utcDate(a.rewardEligibleFrom)} · Expires {utcDate(a.expiresAt)}</p>
      <p className="text-xs text-foreground/75">Payment: {a.payment?.status??"Not linked"}{a.payment?.verified?" · Verified":""}{a.payment?.transactionHash?` · TX ${a.payment.transactionHash.slice(0,10)}…`:""}</p>
      {a.status==="active"&&<div className="border-t border-border pt-3">
        {a.exitRequestedAt?<p className="text-xs text-foreground/75">Early exit requested; scheduled for {utcDate(a.exitedAt)}.</p>:
        exitTarget===a.id?<div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">Non-refundable. Future rewards stop at the next UTC boundary; earned rewards remain.</p>
          <Button size="sm" variant="destructive" disabled={exit.isPending} onClick={()=>exit.mutate(a.id)}>Confirm early exit</Button>
          <Button size="sm" variant="outline" onClick={()=>setExitTarget(null)}>Cancel</Button>
        </div>:<Button size="sm" variant="outline" onClick={()=>setExitTarget(a.id)}>Request early exit</Button>}
      </div>}
     </div>)}
    <Paginator back={page.back} next={page.next} hasPrevious={page.hasPrevious} hasNext={!!page.data?.nextCursor} loading={page.isFetching}/>
  </CardContent></Card>;
}
export function MiningPowerRewards(){
  const page=useCursorData<MiningPowerRewardDTO>("/api/mining-power/me/rewards","rewards");
  return <Card data-testid="mining-power-rewards"><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/> Daily Reward History</CardTitle>
    <CardDescription className="text-foreground/75">Actual daily reward records. Pending rewards have not yet been credited; past rewards do not predict future results.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {page.isLoading?<Info message="Loading rewards…"/>:page.isError?<Info message="Unable to load rewards; try refreshing."/>:
       !page.data?.items.length?<Info message="No Mining Power rewards yet. Once eligible daily network rewards are calculated, they will appear here."/>:
       <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="mining-power-reward-table"><thead><tr className="border-b text-left text-foreground/75">
         <th className="p-2">UTC day</th><th className="p-2">Effective MP</th><th className="p-2">XNRT</th><th className="p-2">Status</th>
       </tr></thead><tbody>{page.data.items.map(x=><tr key={x.id} className="border-b border-border/50">
         <td className="p-2 whitespace-nowrap">{utcDate(x.rewardDayUtc)}</td>
         <td className="p-2 tabular-nums">{displayDecimal(x.effectiveMp)}</td>
         <td className="p-2 tabular-nums">{displayDecimal(x.rewardAmount,9)}</td>
         <td className="p-2"><Badge variant={x.status==="credited"?"default":"secondary"}>{x.status}</Badge></td>
       </tr>)}</tbody></table></div>}
      <Paginator back={page.back} next={page.next} hasPrevious={page.hasPrevious} hasNext={!!page.data?.nextCursor} loading={page.isFetching}/>
    </CardContent>
  </Card>;
}
export function MiningPowerNetwork({network}:{network:MiningPowerNetworkDTO|null}){
  if(!network) return <Info message="Network statistics are currently unavailable."/>;
  const d=network.latestDay;
  return <div className="space-y-4" data-testid="mining-power-network">
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{network.programStatus??"No emission program"}</Badge>
      <Badge variant="secondary">{network.policyStatus} tokenomics</Badge><Badge variant="secondary">UTC rewards</Badge></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile title="Emission program pool ceiling (provisional)" value={network.poolCeiling===null?"Not configured":`${displayDecimal(network.poolCeiling,2)} XNRT`} sub="Shown only when an emission program exists; not the separate draft protocol allocation"/>
      <Tile title="Network rewards reserved" value={`${displayDecimal(network.reservedTotal,9)} XNRT`} sub="Authorized for past days; not necessarily paid"/>
      <Tile title="Mining Power rewards credited" value={`${displayDecimal(network.creditedTotal,9)} XNRT`} sub="Recorded in the reward ledger"/>
      <Tile title="Unreserved program budget" value={network.remainingUnreserved===null?"Unavailable":`${displayDecimal(network.remainingUnreserved,9)} XNRT`} sub="Unreserved is not a promise of future distribution"/>
      <Tile title="Latest eligible network Base MP" value={d?`${displayDecimal(d.qualifiedBaseMp)} MP`:"No snapshot"} sub={d?utcDate(d.dayUtc):"No recorded emission day"}/>
      <Tile title="Latest reward-weighted network MP" value={d?`${displayDecimal(d.qualifiedEffectiveMp)} MP`:"No snapshot"} sub={d?`Epoch ${d.epoch} · ${d.activeActivationCount} eligible activations`:"No recorded emission day"}/>
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5"/> Emission transparency</CardTitle>
      <CardDescription className="text-foreground/75">Only recorded daily emission reservations are shown. No projected earnings or guaranteed returns.</CardDescription></CardHeader><CardContent>
        {d?<div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm"><p><span className="text-foreground/75">Epoch</span><br/><strong>{d.epoch}</strong></p>
            <p><span className="text-foreground/75">Utilization</span><br/><strong>{pctRatio(d.utilizationRatio)}</strong></p>
            <p><span className="text-foreground/75">Reserved that day</span><br/><strong>{displayDecimal(d.reservedEmission,9)} XNRT</strong></p></div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="p-2">UTC day</th><th className="p-2">Epoch</th><th className="p-2">Base MP</th><th className="p-2">Reserved XNRT</th></tr></thead>
              <tbody>{[...network.history].reverse().map(h=><tr key={h.dayUtc} className="border-b border-border/40"><td className="p-2">{h.dayUtc.slice(0,10)}</td><td className="p-2">{h.epoch}</td><td className="p-2">{displayDecimal(h.qualifiedBaseMp)}</td><td className="p-2">{displayDecimal(h.reservedEmission,9)}</td></tr>)}</tbody></table>
          </div>
        </div>:<Info message="No daily network reward records are available yet."/>}
      </CardContent></Card>
    </div>;
}
